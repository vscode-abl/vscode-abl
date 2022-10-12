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
