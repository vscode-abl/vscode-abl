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
