/*------------------------------------------------------------------------
    File        : PCTTextWriter
    Purpose     : This file is used to redirect trace from .NET to Openedge
    Syntax      : 
    Description : 
    Author(s)   : Clément BRODU
    Created     : 
    Notes       : 
  ----------------------------------------------------------------------*/

BLOCK-LEVEL ON ERROR UNDO, THROW.


CLASS PCTTextWriter 
    INHERITS System.IO.TextWriter: 

    DEFINE PUBLIC OVERRIDE PROPERTY Encoding AS System.Text.Encoding NO-UNDO
    GET:
        RETURN System.Text.Encoding:UTF8.
    END GET.

    METHOD PUBLIC OVERRIDE VOID Write (pcCharacter AS CHARACTER):
        LOG-MANAGER:WRITE-MESSAGE(pcCharacter). /* will do a WriteLine */
    END METHOD.

    METHOD PUBLIC OVERRIDE VOID WriteLine ():
        LOG-MANAGER:WRITE-MESSAGE("").
    END METHOD.
    
    METHOD PUBLIC OVERRIDE VOID WriteLine (pcCharacter AS CHARACTER):
        LOG-MANAGER:WRITE-MESSAGE(pcCharacter).
    END METHOD.

    METHOD PUBLIC OVERRIDE VOID WriteLine (poObject AS System.Object):
        IF VALID-OBJECT(poObject) THEN
            LOG-MANAGER:WRITE-MESSAGE(poObject:ToString()).
        ELSE
            LOG-MANAGER:WRITE-MESSAGE("[null object]").
    END METHOD.

END CLASS.