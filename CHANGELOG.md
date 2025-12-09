1.25.x
======

* 🐛 Fix excessive memory consumption when new code is created in source directories while language server is online
* ✨ Builtin classes attributes and method signatures now depend on the OE version used in the project (11.7, 12.2, 12.8 and 13.0)
* ✨ Builtin classes documentation per OE version in hover and code completion
* ✨ Hover and code completion on system handles
* ✨ Hover on builtin functions
* ⬆️ ABL-LS 1.23.0-SNAPSHOT
* ⬆️ CABL 3.6.0-SNAPSHOT

1.24.1 (November 28th, 2025)
============================

* ✨ Removed support for multiple projects in the debugger (unstable)

1.24.0 (November 24th, 2025)
============================

* 🐛 `compileBuffer` now return false if compilation failed
* 🐛 Fix code completion issue #407, #415
* 🐛 Fix show debug listing line when rcode not present (#392)
* 🐛 Fix bug in SourceWatcher on excluded files
* 🐛 NPE when starting debugger if oeversion attribute is not specified
* 🐛 Fix NPE on unnamed buffers (#424)
* ✨ Improved support for hover and code completion for .NET classes (#389)
* ✨ Support for APL files (#753)
* ✨ Add `compile` entry point (#403)
* ✨ Support for multiple projects in the debugger (work in progress)
* ✨ Add `abl.closeEditorAfterOpenExternal` (#339) and `abl.methodSignature.perspective` properties
* ✨ Generate XREF and jump to current source line action (#421) (by Matthew Marcus)
* 🔨 Compile with Node 24
* ⬆️ ABL-LS 1.22.0
* ⬆️ CABL 3.5.0
* ⬆️ TextMate Grammar 1.3.16
* ⬆️ Java 21.0.9+10

1.22.2 (October 14th, 2025)
===========================

* 🐛 Fix getFileInfo entry point (#397)
* ⬆️ ABL-LS 1.21.2

1.22.1 (October 9th, 2025)
==========================

* 🐛 Compiler messages at line 0 break error reporting (#399)
* 🐛 Fix problem when starting sessions with -ininame parameter (#398)
* ⬆️ ABL-LS 1.21.1

1.22.0 (October 7th, 2025)
==========================

* ✨ Separate output for `Run with _progres -b` action
* ✨ Fix `getDlcDirectory` command when called with multiple parameters (#353)
* ✨ Show content of array variables in object instances (#372) 
* ✨ Add `defaultProfileDisplayName` attribute (#368) 
* ✨ Add `status`, `projectInfo`, `getSchema` and `restartLanguageServer` entry points
* ✨ Add `abl.compileLog` setting
* ✨ Add `abl.getRelativePath` command (can be used as the `-p` parameter in tasks)
* ✨ Add `abl.getPropath` command (comma-separated list on Windows, colon-separated string on Linux) (#290)
* ✨ Add `abl.getSourceDirs` command (comma-separated list of relative directory names) (#290)
* ✨ Add `abl.getBuildDirs` command (comma-separated list of absolute directory names) (#290)
* 🐛 Include variables from parent scope when caret is in internal procedure/function (#357)
* 🐛 Compiler error 196 not always shown (#381)
* 🐛 Code completion when at the beginning of a statement always showed datatypes first
* 🐛 Hover/outline/definition not always available immediately after opening file (#281)
* 🐛 Fix multiple LS and OE issues with directory names having spaces, accents, etc.
* ⬆️ TextMate Grammar 1.3.15
* ⬆️ Java 21
* ⬆️ CABL 3.4.0
* ⬆️ ABL-LS 1.21.0

1.20.1 (July 26th, 2025)
========================

* 📝 Remove (broken) links to OpenEdge 11.7 documentation (#360)

1.20.0 (June 23rd, 2025)
========================

* 🚀 Extension now sponsored by Progress!
* ✨ `HideAVMWindow` on OpenEdge 11.x
* ✨ Compilation diagnostics now have location of include files
* ✨ Don't stop Language Server when propath entries can't be read
* ✨ Hover improvements (extent information, static properties / methods, constructors, ...)
* ✨ Code completion improvements (functions, references to static classes, interface properties, ...)
* ✨ ABL log output can be part of compound log
* ✨ Improved debugger startup time
* ✨ Don't specify SAVE INTO directory if identical to source directory (#310)
* ✨ Documentation moved to its own view container
* 🐛 Include files created during the session were not offered in code completion
* 🐛 Fix documentSymbol total failure with incomplete code
* 🐛 Fix LS startup failure when includeFile or excludeFile is empty
* 🐛 Fix PASOE `cont` messages
* 🐛 Recompile classes referenced by interface with changes in property definition
* 🐛 Better error handling when receiving compilation messages + structured error handling in thread.p
* ⬆️ TextMate Grammar 1.3.13
* ⬆️ CABL 3.1.0
* ⬆️ LSP4J 0.24.0
* ⬆️ ABL-LS 1.20.0
* 🚧 Changed single-line comments to multi-lines comments in `thread.p` (pre-11.7 compatibility)

1.18.2 (April 7th, 2025)
========================

* 🎨 Non-technical changes

1.18.1 (January 25th, 2025)
===========================

* 🐛 Fix another code completion regression introduced in 1.16.0 (no items offered in some cases)

1.18.0 (January 16th, 2025)
===========================

* 🐛 Use correct profile when starting OE sessions (#168)
* 🐛 Fix "Change to uppercase/lowercase" regression introduced in 1.16.0
* 🐛 Fix code completion regression introduced in 1.16.0 (no items offered in some cases)
* ✨ Hover and definition (F12) improvements (class properties, method calls, include files, preprocessor variables, ...)
* ➖ Merge Language Server / Debug Adapter into a single artifact (reducing extension size by 25Mb)

1.16.1 (December 15th, 2024)
============================

* 🐛 Solved issue with case-insensitive pattern matching on Linux

1.16.0 (December 7th, 2024)
===========================

* 🐛 Log output not generated by Debug Adapter since 1.14.0
* 🐛 Fix "Open Data Dictionary" and project profiles
* 🐛 Fix AVM startup issue with OpenEdge 11.7.2 and before
* ✨ Code completion improvements (*-lock after `for` / `find`, clean up datatypes, types with prefix, package names, `THIS-PROCEDUERE`/`THIS-OBJECT`, `ENTERED` removal, major performance improvement on large input, ...)
* ✨ Better error reporting during Debug Adapter startup
* ⬆️ TextMate Grammar 1.3.8
* 💥 File patterns in openedge-project.json (`includes`, `excludes`, `includeFileExtensions`) are now case-insensitive on Windows, and case-sensitive on any other OS

1.14.0 (November 12th, 2024)
============================

* Add support for `${command:abl.getDlcDirectory}` in VS Code tasks
* Code completion after VAR statement
* Fix regression introduced in 1.12: typeInfo caches not regenerated, leading to missing or outdated rcode info in SonarLint
* Clean exit of LS process in SSH remote sessions
* Projects can be added and removed from workspace without restarting the language server
* Changing build mode doesn't require restarting the language server
* Various bugfixes

1.12.0 (September 29th, 2024)
=============================

* Added `preprocessor` section in openedge-project.json
* `-checkdbe` option can now be added without having AVM complain about thread.p
* Initial support for classes with static methods in code completion
* Remove bundled CABL implementation, sonarlint extension is now required 

1.10.0 (August 22nd, 2024)
==========================

* Go to definition improvements (table & buffer definition, more to come...)
* Extension entry point (in order to fetch project config from SonarLint extension)
* Fix "Compile current buffer" action on classes
* Debug Adapter: watchpoints support
* Open in procedure editor action
* Fix code completion on triggers
* Prevent resource exhaustion when recompiling dependencies (no full parse + no duplicates in action queue)
* Faster project initialization (non-blocking typeInfo cache read)
* Pass catalog.json location to SonarLint
* Recompilation class hierarchy only if signature changed (and don't automatically trigger SonarLint)
* Fix language server restart (synchronization issue)
* Clear diagnostics when files are deleted / moved
* TextMate improvements
* [SonarLint](https://github.com/Riverside-Software/sonarlint-vscode/releases/latest): lint rules execution moved to CABL SonarLint extension
  * Rules can still be executed by the ABL Language Server (specify `abl.cablLicense` property), but only as a workaround. Feature will be removed entirely in a future version.

1.8.1
=====

* Add pauseOnAttach property in the debug adapter
* PASOE Debugger
* Variable values can now be changed in debugger (AVM and PASOE)
* OpenEdge documentation view
* New .Net Catalog entry point (thanks to Clément Brodu)
* JVM bundled in VSIX, no need to specify path to Java
* Renamed dumpFile to schemaFile in project config file
* File extensions now case-insensitive

1.6.0
=====

* New `Compile current buffer` action. On untitled buffers, this requires the language to be switched to `ABL` (Ctrl + K, M). Shortcut can be set to Shift + F2 for those willing to mimic procedure editor.
* Fix changeBuildMode action (issue #116)
* New sonarlintProperties attribute in openedge-project.json
* Support for OE 12.8
* Very first version of semantic highlighting (disabled by default)

1.4.25
======

* New 'init' mode for procedures started with the language server AVM runtime
* Improved ProEnv menu
* Snippets are not part of the plugin anymore
* New project property: includeFileExtensions
* New source directory properties: excludesFile and deployment
* Fixed NPE when using InputFile#contents()
* Various code completion / hover improvements

1.4.23
======
* Comments allowed in openedge-project.json + oeversion, graphicalMode, buildPath and dbConnections are not required anymore (Ken Herring)
* New abl.sonarlint.rules setting in order to execute custom Sonar rules
* Various LS improvements (code completion, hover, ...)

1.4.21
======
* Fixed Debug Adapter startup issue

1.4.19
======
* Execute default CABL rules when no license configured in VS Code settings

1.4.17
======

* IMPORTANT: the .builder/storage directory of your projects has to be deleted after upgrade. Content will be automatically regenerated.
* New assembly catalog command ; improved .Net code completion
* Various code completion / hover / definition improvements in LS
* MaxThreads implementation (#58)
* Javadoc & deprecated methods (#97)

1.4.15
======

* All class symbols now available in SonarLint ; result of the analysis should now be on par with Sonar Scanner
  * Code will be backported to SonarLint Eclipse (if possible)
* Skip rcode scan of procedures during project startup (scan only classes)
* Fix mapping of include file names to parse units (issue #91)

1.4.13
======

* SonarLint integration in Language Server (standalone mode only, connected mode available soon)
  * Change required in `.vscode/cabl.json`, see README.md
* Improved code completion

1.4.11 & 1.4.12
===============

* Upgrade CABL rules to 2.21.1 (note that if you have a valid CABL subscription, you can execute the CABL rules in VSCode, open the license management website to get your key)
* OpenEdge 12.7 support in configuration files

1.4.10
======

* Allow INI file to be overriden when running procedures with prowin

1.4.9
=====

* Fix deactivate entry point (stop LS locally and on remote workspaces)
* Code completion improvements
* Report errors on duplicate project names
* Report errors in VSCode UI when OE sessions can't be started

1.4.8
=====

* Proenv entry in Terminal view
* Code completion improvements

1.4.7
=====

* Syntax highlight (minor improvements)
* Code outline view improvements

1.4.6
=====

* New status bar, and faster feedback when loading large projects
* Fix issue when setting breakpoints (which were never set correctly under specific circumstances)

1.4.5
=====

* Fix major regression in all commands (nothing executed + Java stack trace displayed in LS output)

1.4.4
=====

* Alt+L shortcut: show source code of debug listing line
* Code completion on static methods (work in progress)
* Improved status bar

1.4.3
=====

* JVM extra arguments can now be configured in settings

1.4.2
=====

* Build output directory can now be an absolute directory

1.4.0
=====

* Add `documentation` attribute in `buildPath` entries (use JsonDocumentation task from PCT to generate those files)
  * Deprecated methods will be highlighted in source code
* New actions: generate XREF and XML-XREF
* New option to hide/display objects from include files in outline view
* Various code completion improvements
* Multiple minor bugfixes (don't hesitate to report them!)

1.3.11
======

* Support for 32 bits Progress install
* Fixed Debug Adapter startup
* Fixed session startup issues when extraParameters attribute wasn't found
* Fixed InvalidRCodeException when parsing lots of rcode
* Removed error message when parsing windows-* DF file footer
* Upgraded bundled CABL rules

1.3.10
======

* CABL rules upgrade (now match parser version number)
* Code completion improvements on classes

1.3.9
=====

* Fixed major performance regression in 1.3.8
* Fixed handling of code completion of THIS-OBJECT and SUPER

1.3.8
=====

* New actions: preprocess code + generate debug listing
* Monitor openedge-project.json for changes (DB connection, propath, ...)
* New "Build mode" setting: compile files (or not) depending on the value
* BETA: New "documentation" attribute in propath entries: use [PCT JsonDocumentation task](https://wiki.rssw.eu/pct/JsonDocumentation.md)
* Improved code completion engine
* Declaration of class variables automatically add a 'USING' statement

1.3.x
=====
- Extension overhaul, lots of functionalities moved to ABL Language Server

1.1
=====
- Code completion and Outline pane

1.0
=====
- You can now specify a startup procedure

0.9
=====
- New definition provider: the outline pane is now filled with the definitions found in the current document

0.8
=====
- You can now define the dlc value from the config file (optional)

0.5
=====

## What's new
- `proPath` and `proPathMode` supports in `.openedge.json` config file

0.4.2
=====

## What's new
- Better syntax highlighting (define stream scope)

0.4.1
=====

## Bug fixes
- full primitive type (ex: character) matches only abbrev (ex: char)

0.4.0
=====

## What's new
- Better syntax highlighting (parameter vs variable)
