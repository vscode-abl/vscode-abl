/*------------------------------------------------------------------------
    File        : NetAssemblyCatalog.p
    Purpose     : Generate Assembly catalogue
    Syntax      :

    Description : 

    Author(s)   : Clément BRODU
    Created     : 
    Notes       :
  ----------------------------------------------------------------------*/

BLOCK-LEVEL ON ERROR UNDO, THROW.

USING System.Environment FROM ASSEMBLY.

DEFINE VARIABLE wAssembly   AS System.Reflection.Assembly NO-UNDO.
DEFINE VARIABLE destFile    AS CHARACTER                  NO-UNDO.
DEFINE VARIABLE pctTools    AS CHARACTER                  NO-UNDO.
DEFINE VARIABLE currentDir  AS CHARACTER                  NO-UNDO.
DEFINE VARIABLE vAsmCatalog AS Progress.Lang.Object       NO-UNDO.
DEFINE VARIABLE vWriter     AS PCTTextWriter              NO-UNDO.

ASSIGN 
    destFile = DYNAMIC-FUNCTION('getParameter' IN SOURCE-PROCEDURE, 'destFile')
    pctTools = DYNAMIC-FUNCTION('getParameter' IN SOURCE-PROCEDURE, 'pctTools')
    .

currentDir = Environment:CurrentDirectory.
destFile = System.IO.Path:Combine(currentDir, destFile).
pctTools = System.IO.Path:Combine(currentDir, pctTools). 

LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("destFile: &1", destFile)).
LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("pctTools: &1", pctTools)).

wAssembly = System.Reflection.Assembly:LoadFrom(pctTools).

/*-------------------------------------------------*/
/*--  Initialize                                 --*/
/*-------------------------------------------------*/

vAsmCatalog = wAssembly:CreateInstance("PCTTools.AssemblyCatalog").

/**** Define Writer  ****/
vWriter = NEW PCTTextWriter().
DYNAMIC-INVOKE (vAsmCatalog, "SetWriter", vWriter).

/*-------------------------------------------------*/
/*--  Settings                                   --*/
/*-------------------------------------------------*/

/**** Use Openedge types instead of native dotnet types ****/
DYNAMIC-PROPERTY(vAsmCatalog, "UseOeTypes") = YES.

/**** return only public member ****/
/* DYNAMIC-PROPERTY(vAsmCatalog, "PublicOnly") = YES.*/

/**** each Type will contains documentation of Declared and Inherted members ****/
/* DYNAMIC-PROPERTY(vAsmCatalog, "WithInherited") = YES.*/


/*-------------------------------------------------*/
/*--  Generation                                 --*/
/*-------------------------------------------------*/

/**** Generate from a Type : ****/
/* DYNAMIC-INVOKE (vAsmCatalog, "GenerateDocumentationFromType", vTypeToScan). */

/**** Generate from  Assembly : ****/
/* DYNAMIC-INVOKE (vAsmCatalog, "GenerateDocumentationFromAssembly", vAssemblyToScan). */

/**** Generate from AppDomain : ****/
DYNAMIC-INVOKE (vAsmCatalog,"GenerateDocumentationFromAppDomain").

/**** Output to Json File ****/
DYNAMIC-INVOKE (vAsmCatalog, "ToJsonFile", destFile).

/**** Fail the build if error ****/
/*
IF DYNAMIC-PROPERTY(vAsmCatalog, "HasError") = YES THEN
    RETURN '99'.
*/

RETURN '0'.

CATCH error AS Progress.Lang.Error:
    LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("Error: &1", error:GetMessage(1))).
    LOG-MANAGER:WRITE-MESSAGE(SUBSTITUTE("Error: &1", error:CallStack)).
    UNDO, THROW error.
END CATCH.
