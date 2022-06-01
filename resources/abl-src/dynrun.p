USING Progress.Json.ObjectModel.JsonArray.
USING Progress.Json.ObjectModel.JsonObject.
USING Progress.Json.ObjectModel.ObjectModelParser.

ROUTINE-LEVEL ON ERROR UNDO, THROW.

DEFINE NEW SHARED VARIABLE pctVerbose AS LOGICAL NO-UNDO.
DEFINE VARIABLE noErrorOnQuit AS LOGICAL NO-UNDO.

DEFINE VARIABLE i AS INTEGER NO-UNDO INITIAL ?.

DEFINE TEMP-TABLE ttParams NO-UNDO
  FIELD key AS CHARACTER
  FIELD val AS CHARACTER.

FUNCTION getParameter RETURNS CHARACTER (k AS CHARACTER).
  FIND ttParams WHERE ttParams.key EQ k NO-LOCK NO-ERROR.
  RETURN (IF AVAILABLE ttParams THEN ttParams.val ELSE ?).
END FUNCTION.

DEFINE VARIABLE jsonParser AS CLASS ObjectModelParser NO-UNDO.
DEFINE VARIABLE configJson AS CLASS JsonObject NO-UNDO.

DEFINE VARIABLE ppEntries   AS CLASS JsonArray NO-UNDO.
DEFINE VARIABLE dbEntries   AS CLASS JsonArray NO-UNDO.
DEFINE VARIABLE prmEntries  AS CLASS JsonArray NO-UNDO.
DEFINE VARIABLE procEntries AS CLASS JsonArray NO-UNDO.
DEFINE VARIABLE procEntry   AS CLASS JsonObject NO-UNDO.
DEFINE VARIABLE dbEntry     AS CHARACTER NO-UNDO.
DEFINE VARIABLE prmEntry    AS CLASS JsonObject NO-UNDO.
DEFINE VARIABLE outprmEntries AS CLASS JsonArray NO-UNDO.
DEFINE VARIABLE zz AS INTEGER     NO-UNDO.
DEFINE VARIABLE zz2 AS INTEGER     NO-UNDO.
DEFINE VARIABLE xx AS INTEGER     NO-UNDO.
DEFINE VARIABLE yy AS CHARACTER   NO-UNDO.
DEFINE VARIABLE ww AS HANDLE      NO-UNDO.
DEFINE VARIABLE out1 AS CHARACTER   NO-UNDO.
DEFINE VARIABLE out2 AS CHARACTER   NO-UNDO.

ASSIGN jsonParser = NEW ObjectModelParser().
ASSIGN configJson = CAST(jsonParser:ParseFile(SESSION:PARAMETER), JsonObject).
OS-DELETE VALUE(SESSION:PARAMETER).

// DB connections + aliases
ASSIGN dbEntries = configJson:GetJsonArray("databases").
DO zz = 1 TO dbEntries:Length:
  ASSIGN dbEntry = dbEntries:GetCharacter(zz).
  LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("Connecting to '&1'", dbEntry)).
  CONNECT VALUE(dbEntry) NO-ERROR.
  IF ERROR-STATUS:ERROR THEN DO:
    IF (ERROR-STATUS:NUM-MESSAGES > 1) OR (ERROR-STATUS:GET-NUMBER(1) NE 1552) THEN DO:
      LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("Unable to connect to '&1'" , dbEntry )).
      DO i = 1 TO ERROR-STATUS:NUM-MESSAGES:
        LOG-MANAGER:WRITE-MESSAGE( ERROR-STATUS:GET-MESSAGE(i)).
      END.
      QUIT.
    END.
  END.
END.
ASSIGN dbEntry = configJson:GetCharacter("aliases").
DO zz = 1 TO NUM-ENTRIES(dbEntry, ';'):
  DO zz2 = 2 TO NUM-ENTRIES(ENTRY(zz, dbEntry, ';')):
    LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("Create alias '&1' for '&2'",  ENTRY(zz2, ENTRY(zz, dbEntry, ';')),     ENTRY(1, ENTRY(zz, dbEntry, ';')))).
    CREATE ALIAS VALUE(ENTRY(zz2, ENTRY(zz, dbEntry, ';'))) FOR DATABASE            VALUE(ENTRY(1, ENTRY(zz, dbEntry, ';'))).
  END.
END.

// PROPATH entries
ASSIGN ppEntries = configJson:GetJsonArray("propath").
DO zz = 1 TO ppEntries:Length:
  ASSIGN PROPATH = ppEntries:getCharacter(ppEntries:Length + 1 - zz) + "," + PROPATH.
END.
LOG-MANAGER:WRITE-MESSAGE("PROPATH: " + PROPATH).

// Input parameters
IF (configJson:has("parameters")) THEN DO:
  ASSIGN prmEntries = configJson:GetJsonArray("parameters").
  DO zz = 1 TO prmEntries:Length:
    ASSIGN prmEntry = prmEntries:GetJsonObject(zz).
    DO ON ERROR UNDO, LEAVE:
      CREATE ttParams.
      ASSIGN ttParams.key = prmEntry:getCharacter("name")
             ttParams.val = prmEntry:getCharacter("value").
    END.
  END.
END.

// Output parameters
ASSIGN outprmEntries = configJson:GetJsonArray("output").

IF configJson:getLogical("super") THEN DO:
  SESSION:ADD-SUPER-PROCEDURE(THIS-PROCEDURE).
END.

// Startup procedures
IF (configJson:has("procedures")) THEN DO:
  ASSIGN procEntries = configJson:GetJsonArray("procedures").
  DO zz = 1 to procEntries:Length:
    ASSIGN procEntry = procEntries:GetJsonObject(zz).
    DO ON ERROR UNDO, LEAVE:
      ASSIGN yy = procEntry:getCharacter("mode").
      IF (yy EQ "once") THEN DO:
        LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("RunOnce '&1'", procEntry:getCharacter("name"))).
        RUN VALUE(procEntry:getCharacter("name")).
      END.
      ELSE IF (yy EQ "persistent") THEN DO:
        LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("RunPersistent '&1'", procEntry:getCharacter("name"))).
        RUN VALUE(procEntry:getCharacter("name")) PERSISTENT.
      END.
      ELSE DO:
        LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("RunSuper '&1'", procEntry:getCharacter("name"))).
        RUN VALUE(procEntry:getCharacter("name")) PERSISTENT SET ww.
        SESSION:ADD-SUPER-PROCEDURE(ww).
      END.
    END.
  END.
END.

// Execute procedure
LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("RUN &1", configJson:getCharacter("procedure"))).
RunBlock:
DO ON QUIT UNDO, RETRY:
  IF RETRY THEN DO:
    IF noErrorOnQuit THEN i = 0. ELSE i = 66.
    LEAVE RunBlock.
  END.
  IF (outprmEntries:Length EQ 0) THEN
    RUN VALUE(configJson:getCharacter("procedure")) NO-ERROR.
  ELSE IF (outprmEntries:Length EQ 1) THEN
    RUN VALUE(configJson:getCharacter("procedure")) (OUTPUT out1) NO-ERROR.
  ELSE IF (outprmEntries:Length EQ 2) THEN
    RUN VALUE(configJson:getCharacter("procedure")) (OUTPUT out1, OUTPUT out2) NO-ERROR.
END.
IF ERROR-STATUS:ERROR THEN
  ASSIGN i = 1.
IF (i EQ ?) THEN
  ASSIGN i = INTEGER (ENTRY(1, RETURN-VALUE, " ")) NO-ERROR.
IF (i EQ ?) THEN
  ASSIGN i = 1.
RUN returnValue(i).

IF (outprmEntries:Length GE 1) THEN
  RUN writeOutputParam (out1, outprmEntries:getCharacter(1)).
IF (outprmEntries:Length GE 2) THEN
  RUN writeOutputParam (out2, outprmEntries:getCharacter(2)).

QUIT.

PROCEDURE returnValue PRIVATE.
  DEFINE INPUT PARAMETER retVal AS INTEGER NO-UNDO.

  IF configJson:getCharacter("returnValue") EQ '' THEN RETURN.
  LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("Return value : &1", retVal)).
  OUTPUT TO VALUE(configJson:getCharacter("returnValue")) CONVERT TARGET "utf-8".
  PUT UNFORMATTED retVal SKIP.
  OUTPUT CLOSE.

END PROCEDURE.

PROCEDURE writeOutputParam PRIVATE.
  DEFINE INPUT PARAMETER prm AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER outFile AS CHARACTER NO-UNDO.

  LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("OUTPUT PARAMETER : &1", prm)).
  OUTPUT TO VALUE(outFile) CONVERT TARGET "utf-8".
  PUT UNFORMATTED prm SKIP.
  OUTPUT CLOSE.

END PROCEDURE.
