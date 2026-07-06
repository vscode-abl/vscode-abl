using Progress.Json.ObjectModel.JsonArray.
using Progress.Json.ObjectModel.JsonObject.
using Progress.Json.ObjectModel.ObjectModelParser.

&scoped-define MAJOR INTEGER(SUBSTRING(PROVERSION, 1, INDEX(PROVERSION, '.') - 1))
&scoped-define MAJOR_SZ LENGTH({&MAJOR})

&scoped-define PROVERSION_MINOR SUBSTRING(PROVERSION(1), {&MAJOR_SZ} + 2)
&scoped-define MINOR INTEGER(SUBSTRING({&PROVERSION_MINOR}, 1, INDEX({&PROVERSION_MINOR}, '.') - 1))
&scoped-define MINOR_SZ LENGTH({&MINOR})

&scoped-define PROVERSION_PATH SUBSTRING(PROVERSION(1), {&MAJOR_SZ} + {&MINOR_SZ} + 3)
&scoped-define PATCH INTEGER(SUBSTRING({&PROVERSION_PATH}, 1, INDEX({&PROVERSION_PATH}, '.') - 1))

&if ({&MAJOR} ge 11) &then
block-level on error undo, throw.
&endif

define new shared variable pctVerbose as logical no-undo.

define variable i as integer no-undo initial ?.

define temp-table ttParams no-undo
  field key as character
  field val as character.

function getParameter returns character (k as character).
  find ttParams where ttParams.key eq k no-lock no-error.
  return (if available ttParams then ttParams.val else ?).
end function.

define variable jsonParser as class ObjectModelParser no-undo.
define variable configJson as class JsonObject no-undo.

define variable ppEntries   as class JsonArray no-undo.
define variable dbEntries   as class JsonArray no-undo.
define variable prmEntries  as class JsonArray no-undo.
define variable procEntries as class JsonArray no-undo.
define variable procEntry   as class JsonObject no-undo.
define variable dbEntry     as class JsonObject no-undo.
define variable prmEntry    as class JsonObject no-undo.
define variable zz  as integer     no-undo.
define variable zz2 as integer     no-undo.
define variable yy  as character   no-undo.
define variable ww  as handle      no-undo.

assign jsonParser = new ObjectModelParser().
assign configJson = cast(jsonParser:ParseFile(session:parameter), JsonObject).
log-manager:write-message(substitute("JSON Config file: &1", session:parameter)).
os-delete value(session:parameter).

//DB connections + aliases
if configJson:has("databases") then
do:
  assign dbEntries = configJson:GetJsonArray("databases").
  do zz = 1 to dbEntries:Length:
    assign dbEntry = dbEntries:GetJsonObject(zz).
    if (dbEntry:has("name") and dbEntry:has("connect")) then do:
      log-manager:write-message(substitute("Connecting to DB '&1': '&2'", dbEntry:GetCharacter("name"), dbEntry:GetCharacter("connect"))).
      connect value(dbEntry:GetCharacter("connect")) no-error.
      if error-status:error then do:
        if (error-status:num-messages > 1) or (error-status:get-number(1) ne 1552) then do:
          log-manager:write-message(substitute("Unable to connect to '&1'" , dbEntry:GetCharacter("name"))).
          do i = 1 to error-status:num-messages:
            log-manager:write-message(error-status:get-message(i)).
          end.
          quit.
        end.
      end.
      if (dbEntry:has("aliases")) then do:
        do zz2 = 1 to dbEntry:GetJsonArray("aliases"):Length:
          log-manager:write-message(substitute("Create alias '&1' for '&2'", dbEntry:GetJsonArray("aliases"):GetCharacter(zz2), dbEntry:GetCharacter("name"))).
          create alias value(dbEntry:GetJsonArray("aliases"):GetCharacter(zz2)) for database value(dbEntry:GetCharacter("name")).
        end.
      end.
    end.
  end.
end.

run waitForDebuggerVisible.

// PROPATH entries
assign ppEntries = configJson:GetJsonArray("propath").
do zz = 1 to ppEntries:Length:
  assign propath = ppEntries:getCharacter(ppEntries:Length + 1 - zz) + "," + propath.
end.
log-manager:write-message("PROPATH: " + propath).

// Input parameters
if (configJson:has("parameters")) then do:
  assign prmEntries = configJson:GetJsonArray("parameters").
  do zz = 1 to prmEntries:Length:
    assign prmEntry = prmEntries:GetJsonObject(zz).
    do on error undo, leave:
      create ttParams.
      assign ttParams.key = prmEntry:getCharacter("name")
             ttParams.val = prmEntry:getCharacter("value").
    end.
  end.
end.

if configJson:getLogical("super") then do:
  session:add-super-procedure(this-procedure).
end.

// Startup procedures
if (configJson:has("procedures")) then do:
  assign procEntries = configJson:GetJsonArray("procedures").
  do zz = 1 to procEntries:Length:
    assign procEntry = procEntries:GetJsonObject(zz).
    do on error undo, leave:
      assign yy = procEntry:getCharacter("mode").
      if (yy eq "once") then do:
        log-manager:write-message(substitute("RunOnce '&1'", procEntry:getCharacter("name"))).
        run value(procEntry:getCharacter("name")).
      end.
      else if (yy eq "persistent") then do:
        log-manager:write-message(substitute("RunPersistent '&1'", procEntry:getCharacter("name"))).
        run value(procEntry:getCharacter("name")) persistent.
      end.
      else do:
        log-manager:write-message(substitute("RunSuper '&1'", procEntry:getCharacter("name"))).
        run value(procEntry:getCharacter("name")) persistent set ww.
        session:add-super-procedure(ww).
      end.
    end.
  end.
end.

// Execute procedure
log-manager:write-message(substitute("RUN &1", configJson:getCharacter("procedure"))).
run value(configJson:getCharacter("procedure")).
quit.

catch err as Progress.Lang.Error:
  &IF ({&MAJOR} GE 12) OR (({&MAJOR} EQ 11 ) AND ({&MINOR} EQ 7) AND ({&PATCH} GE 3)) &THEN
  session:exit-code = 1.
  &ENDIF
  message "Unexpected error(s):".
  do zz = 1 to err:NumMessages:
    message substitute(" &1", err:getMessage(zz)).
  end.
  quit.
end catch.

procedure waitForDebuggerVisible:
  define variable cnt as integer no-undo.
  define variable debugReady as logical init false no-undo.
  define variable maxWait as integer init 30000 no-undo.

  paramLoop:
  do cnt = 1 to num-entries(session:startup-parameters):
    if entry(cnt, session:startup-parameters) begins '-debugReady' then do:
      debugReady = true.
      leave paramLoop.
    end.
  end.
  if not debugReady then
    return.

  etime(yes).
  maxWait = integer(os-getenv('DEBUG_MAX_WAIT')) no-error.

  do while etime < maxWait and debugger:visible = false:
    // check if debugger is connected every 1 second
    message 'Waiting for debugger to connect... (' + string(etime) + '/' + string(maxWait) + 'ms)'.
    pause 1.
  end.

  if debugger:visible then
    message 'Debugger connected!'.
  else do:
    /* if os-getenv('ABLUNIT_TEST_RUNNER_UNIT_TESTING') = 'true' or
      os-getenv('ABLUNIT_TEST_RUNNER_UNIT_TESTING') = '1' then do:
      undo, throw new Progress.Lang.AppError("Debugger not connected - exit with code 1 to indicate unit test failure", 99).
    end. */
    message 'Debugger not connected - test execution will continue without debugging'.
  end.
end procedure.
