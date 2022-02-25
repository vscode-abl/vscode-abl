# OpenEdge ABL language support for Visual Studio Code (with Language Server)
This extension provides rich OpenEdge ABL language support for Visual Studio Code. Now you can write and run ABL procedures using the excellent IDE-like interface that Visual Studio Code provides.

## Features

* Syntax highlighting
* Compile on save + recompile include file references & class dependencies
* Run
* Debugger
* Auto-complete (tables, fields, methods)

![features demo](./resources/images/demo.gif "Demo")

![debugger demo](./resources/images/debug.gif "Debugger")

## Migration steps from 1.2

Since version 1.3.1, the new configuration file name is `openedge-project.json`. Multiple properties have changed or renamed, so check the configuration below:
### Prerequisites

OpenEdge runtimes have to be declared in VSCode configuration file. Open settings -> Extensions -> ABL Configuration -> Runtimes, or modify `settings.json`:
![Settings](resources/images/settings.png)

```json
{
  "version": "12.2", # Must reference an existing ABL version in Settings -> Extensions -> ABL Configuration -> Runtimes
  "graphicalMode": true, # True for prowin[32], false for _progres
  "extraParameters": "", # Extra Progress command line parameters
  "buildPath": [
    # Entries can have type 'source' or 'propath'. Path attribute is mandatory. Build attribute is optional (defaults to 'path'). Pct attribute is optional (defaults to 'build/.pct' or '.builder/srcX')
    { "type": "source", "path": "src/procedures" },
    { "type": "source", "path": "src/classes" },
    { "type": "propath", "path": "OpenEdge.net.pl" }
  ],
  "buildDirectory": "build", # Optional global build directory. 
  "dbConnections": ["-db db/sp2k -RO"], # One entry per database
  "dumpFiles": ["dump/sp2k.df"], # Required by the parser and lint rules
  "aliases": "sp2k,foo,bar", # Required by the parser and lint rules
  "numThreads": 1 # Number of OpenEdge sessions handling build
}
```

### Debugger
You can use the debugger to connect to a remote running process (assuming it is debug-ready), or run locally with debugger.

You first need to create the launch configuration in your `launch.json` file, 2 templates are available, one for launch and the other for attach).

```JSON
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Attach to process",
            "type": "abl",
            "request": "attach",
            "address": "192.168.1.100",
            "port": 3099
        }
    ]
}
```

To attach to a remote process, it needs to be [debug-ready](https://documentation.progress.com/output/ua/OpenEdge_latest/index.html#page/asaps/attaching-the-debugger-to-an-appserver-session.html).
The easiest way to achieve that is to add `-debugReady 3099` to the startup parameters (`.pf` file) of your application server.

The debugger supports basic features
- step-over, step-into, step-out, continue, suspend
- breakpoints
- display stack
- display variables
- watch/evaluate basic expressions

You can map remote path to local path (1 to 1) using `localRoot` and `remoteRoot`. This is useful when debugging a remote target, even more if it only executes r-code.
`localRoot` is usually your `${workspaceRoot}` (current directory opened in VSCode). `remoteRoot` may remains empty (or missing), in this particular case, the remote path is relative, and resolved via the `PROPATH` by the remote.


You can also map different remote path to local path via source mapping `sourceMap`. This is useful if you don't have all the source code in a unique project (ex dependencies).

### Unit tests
Based upon the ABLUnit framework (need to be installed locally), you can specify launch parameters to find and execute test files
```
{
    "test": {
        "files":[
            "tests/*.test.p"
        ],
        "beforeEach": {
            "cmd": "%ProgramFiles%\\Git\\bin\\sh.exe",
            "args": [
                "-c",
                "echo starting"
            ]
        },
        "afterEach": {
            "cmd": "%ProgramFiles%\\Git\\bin\\sh.exe",
            "args": [
                "-c",
                "echo done"
            ]
        }
    }
}
```

## Greetings
Initial plugin development done by [chriscamicas](https://github.com/chriscamicas). In turn, largely inspired by ZaphyrVonGenevese work (https://github.com/ZaphyrVonGenevese/vscode-abl).
Also inspired by vscode-go and vscode-rust extensions.

Thanks to all the contributors: mscheblein

## License
Licensed under the [MIT](LICENSE) License.
