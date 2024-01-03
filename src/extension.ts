import path = require('path');
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { openDataDictionary } from './ablDataDictionary';
import { executeGenCatalog } from './assemblyCatalog';
import { runGUI, openInAB } from './shared/ablRun';
import { runTTY, runBatch } from './ablRunTerminal';
import { AblDebugConfigurationProvider } from './debugAdapter/ablDebugConfigurationProvider';
import { loadConfigFile, OpenEdgeProjectConfig, OpenEdgeConfig, OpenEdgeMainConfig, ProfileConfig } from './shared/openEdgeConfigFile';
import { LanguageClient, LanguageClientOptions, ServerOptions, Executable } from 'vscode-languageclient/node';
import { tmpdir } from 'os';
import { outputChannel } from './ablStatus';

let client: LanguageClient;

const projects: Array<OpenEdgeProjectConfig> = new Array();
let oeRuntimes: Array<any>;
let langServDebug: boolean;
let defaultProjectName: string;
let oeStatusBarItem: vscode.StatusBarItem;
let buildMode = 1;

export class AblDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    public constructor(
        private startScriptPath: string,
        private env?: any
    ) { }

    async createDebugAdapterDescriptor(_session: vscode.DebugSession, _executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.DebugAdapterDescriptor> {
        const logFile = path.join(tmpdir(), 'vscode-debug-adapter.txt');
        const debugAdapterDebug = vscode.workspace.getConfiguration('abl').get('debugAdapterDebug');
        const debugAdapterTrace = vscode.workspace.getConfiguration('abl').get('debugAdapterTrace');
        const defaultExecOptions = [
            '-Dorg.slf4j.simpleLogger.defaultLogLevel=' + (debugAdapterDebug ? 'DEBUG' : 'INFO'),
            '-Dorg.slf4j.simpleLogger.logFile=' + logFile,
            '-jar', path.join(__dirname, '../resources/abl-dap.jar')
        ];
        const defaultExecOptions2 = debugAdapterTrace ? defaultExecOptions.concat('--trace') : defaultExecOptions;
        const debugAdapterExecutable = vscode.workspace.getConfiguration('abl').get('langServerJavaExecutable', 'java');
        const debugAdapterOptionsFromSettings = vscode.workspace.getConfiguration('abl').get('debugAdapterJavaArgs', []);
        const extraArgs = vscode.workspace.getConfiguration('abl').get('debugAdapterExtraJavaArgs', '').trim();
        const debugAdapterOptions = debugAdapterOptionsFromSettings.length == 0 ? (extraArgs.length > 0 ? extraArgs.split(' ').concat(defaultExecOptions2) : defaultExecOptions2) : debugAdapterOptionsFromSettings;

        outputChannel.appendLine("ABL Debug Adapter - Command line: " + debugAdapterExecutable + " " + debugAdapterOptions.join(" "));
        return new vscode.DebugAdapterExecutable(debugAdapterExecutable, debugAdapterOptions, { env: this.env });
    }
}

export function activate(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('abl', new AblDebugConfigurationProvider(projects)));

    const env: any = { ...process.env };
    vscode.debug.registerDebugAdapterDescriptorFactory("abl", new AblDebugAdapterDescriptorFactory("", env));

    registerCommands(ctx);

    oeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    oeStatusBarItem.text = 'No ABL Language Server';
    oeStatusBarItem.tooltip = 'ABL plugin status';
    oeStatusBarItem.show();
    oeStatusBarItem.command = 'abl.changeBuildMode';
    ctx.subscriptions.push(oeStatusBarItem);

    client = createLanguageClient();
    client.start();
}


export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

export function getProject(path: string): OpenEdgeProjectConfig {
    return projects.find(project => path.startsWith(project.rootDir));
}

export function getProjectByName(name: string): OpenEdgeProjectConfig {
    return projects.find(project => project.name === name);
}

function createLanguageClient(): LanguageClient {
    // For debugger: add '-Xdebug', '-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=8000,quiet=y'
    const defaultExecOptions = [
        '-Dorg.slf4j.simpleLogger.showLogName=false',
        '-Dorg.slf4j.simpleLogger.log.eu.rssw.openedge.ls.lint.SonarLintLogger=WARN',
        '-Dorg.slf4j.simpleLogger.defaultLogLevel=' + (langServDebug ? 'DEBUG' : 'INFO'),
        '-Deu.rssw.openedge.ls.pluginsDir=' + path.join(__dirname, '../resources'),
        '-jar', path.join(__dirname, '../resources/abl-lsp.jar')
    ];

    const langServTrace = vscode.workspace.getConfiguration('abl').get('langServerTrace')
    const langServExecutable = vscode.workspace.getConfiguration('abl').get('langServerJavaExecutable', 'java');
    const langServOptionsFromSettings = vscode.workspace.getConfiguration('abl').get('langServerJavaArgs', []);
    const extraArgs = vscode.workspace.getConfiguration('abl').get('langServerExtraJavaArgs', '').trim();
    const defaultExecOptions2 = langServTrace ? defaultExecOptions.concat('--trace') : defaultExecOptions;
    const langServOptions = langServOptionsFromSettings.length == 0 ? (extraArgs.length > 0 ? extraArgs.split(' ').concat(defaultExecOptions2) : defaultExecOptions2) : langServOptionsFromSettings;

    outputChannel.appendLine("ABL Language Server - Command line: " + langServExecutable + " " + langServOptions.join(" "));
    const serverExec: Executable = {
        command: langServExecutable,
        args: langServOptions
    };
    const serverOptions: ServerOptions = serverExec;

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // TODO Use pull model
        initializationOptions: {
            cablLicense: vscode.workspace.getConfiguration('abl').get('cablLicense', ''),
            upperCaseCompletion: vscode.workspace.getConfiguration('abl').get('completion.upperCase', false),
            buildMode: vscode.workspace.getConfiguration('abl').get('buildMode', 1),
            outlineShowIncludeFiles: vscode.workspace.getConfiguration('abl').get('outline.showIncludeFiles', false),
            outlineShowContentInIncludeFiles: vscode.workspace.getConfiguration('abl').get('outline.showContentInIncludeFiles', false),
            sonarLintRules: vscode.workspace.getConfiguration('abl').get('sonarlint.rules', [])
        },
        documentSelector: [{ scheme: 'file', language: 'abl' }],
        synchronize: {
            // TODO Use pull model
            configurationSection: 'abl',
            fileEvents: vscode.workspace.createFileSystemWatcher('**/openedge-project.properties')
        }
    };

    const tmp = new LanguageClient('ablLanguageServer', 'ABL Language Server', serverOptions, clientOptions);
    tmp.onReady().then(() => {
        client.onNotification("proparse/status", (statusParams: any) => {
            const numProjects = statusParams.projects.length;
            let str = "";
            if (numProjects == 0)
                str = "No projects found";
            else if (numProjects > statusParams.numInitializedProjects)
                str = "Project init: " + statusParams.numInitializedProjects + "/" + numProjects;
            else
                str = numProjects + " project(s)";
            str += " • " + statusParams.pendingTasks + " task(s)";
            oeStatusBarItem.text = str;

            oeStatusBarItem.tooltip = statusParams.projects.join("\n")
        });
    });

    return tmp;
}

function getBuildModeLabel(): string {
    switch (buildMode) {
        case 1:
            return "Build everything";
        case 2:
            return "Build only classes";
        case 3:
            return "Build only modified files";
        case 4:
            return "No build";
        default:
            return "Unknown build mode";
    }
}

function setDefaultProject(): void {
    if (projects.length < 2) {
        vscode.window.showWarningMessage("Default project can only be set when multiple projects are opened");
        return;
    }

    const list = projects.map(project => ({ label: project.name, description: project.rootDir}));
    list.sort((a, b) => a.label.localeCompare(b.label));
    const quickPick = vscode.window.createQuickPick();
    quickPick.canSelectMany = false;
    quickPick.title = "Choose default project:";
    quickPick.items = list;
    quickPick.onDidChangeSelection(args => {
        quickPick.hide();
        vscode.workspace.getConfiguration("abl").update("defaultProject", args[0].label, vscode.ConfigurationTarget.Workspace);
    });
    quickPick.show();
}

function dumpLangServStatus(): void {
    client.sendNotification("proparse/dumpStatus", {});
}

function restartLangServer(): void {
    client.stop();
    client = createLanguageClient();
    client.start();
}

function switchProfile(project: OpenEdgeProjectConfig): void {
    const list = Array.from(project.profiles.keys()).map(label => ({ label }));
    const quickPick = vscode.window.createQuickPick();
    quickPick.canSelectMany = false;
    quickPick.title = "Switch project to profile:";
    quickPick.items = list;
    quickPick.onDidChangeSelection(([{ label }]) => {
        quickPick.hide();
        const vsCodeDir = path.join(project.rootDir, ".vscode");
        fs.mkdirSync(vsCodeDir, { recursive: true });
        fs.writeFileSync(path.join(vsCodeDir, "profile.json"), JSON.stringify({ profile: label }));
        restartLangServer();
    });
    quickPick.show();
}

function debugListingLine() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    vscode.window.showInputBox({ title: "Enter debug listing line number:", prompt: "Go To Source Line" }).then(input => {
        client.sendNotification("proparse/showDebugListingLine", { fileUri: vscode.window.activeTextEditor.document.uri.toString(), projectUri: cfg.rootDir, lineNumber: parseInt(input) });
    });
}

function preprocessFile() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest<string>("proparse/preprocess", { fileUri: vscode.window.activeTextEditor.document.uri.toString(), projectUri: cfg.rootDir }).then(fName => {
        // TODO Improve error mgmt
        const openPath = vscode.Uri.file(fName);
        vscode.window.showTextDocument(openPath);
    });
}

function dumpFileStatus() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendNotification("proparse/dumpFileStatus", { fileUri: vscode.window.activeTextEditor.document.uri.toString(), projectUri: cfg.rootDir });
}

function generateListing() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest<string>("proparse/listing", { fileUri: vscode.window.activeTextEditor.document.uri.toString(), projectUri: cfg.rootDir }).then(fName => {
        // TODO Improve error mgmt
        const openPath = vscode.Uri.file(fName);
        vscode.window.showTextDocument(openPath);
    });
}

function generateDebugListing() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest<string>("proparse/debugListing", { fileUri: vscode.window.activeTextEditor.document.uri.toString(), projectUri: cfg.rootDir }).then(fName => {
        // TODO Improve error mgmt
        const openPath = vscode.Uri.file(fName);
        vscode.window.showTextDocument(openPath);
    });
}

function generateXref() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest<string>("proparse/xref", { fileUri: vscode.window.activeTextEditor.document.uri.toString(), projectUri: cfg.rootDir }).then(fName => {
        // TODO Improve error mgmt
        const openPath = vscode.Uri.file(fName);
        vscode.window.showTextDocument(openPath);
    });
}

function generateXmlXref() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest<string>("proparse/xmlXref", { fileUri: vscode.window.activeTextEditor.document.uri.toString(), projectUri: cfg.rootDir }).then(fName => {
        // TODO Improve error mgmt
        const openPath = vscode.Uri.file(fName);
        vscode.window.showTextDocument(openPath);
    });
}

function fixUpperCasing() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }
    client.sendRequest("proparse/fixCasing", { upper: true, fileUri: vscode.window.activeTextEditor.document.uri.toString(), projectUri: cfg.rootDir });
}

function fixLowerCasing() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest("proparse/fixCasing", { upper: false, fileUri: vscode.window.activeTextEditor.document.uri.toString(), projectUri: cfg.rootDir });
}

function generateCatalog() {
    if (projects.length == 1) {
        executeGenCatalog(projects[0]);
        vscode.window.showInformationMessage("Assembly catalog generation started. This operation can take several minutes. Check .builder/catalog.json and .builder/assemblyCatalog.log.");
    } else if (projects.length > 1) {
        const list = projects.map(project => ({ label: project.name, description: project.rootDir}));
        list.sort((a, b) => a.label.localeCompare(b.label));
    
        const quickPick = vscode.window.createQuickPick();
        quickPick.canSelectMany = false;
        quickPick.title = "Generate assembly catalog - Select project:";
        quickPick.items = list;
        quickPick.onDidChangeSelection(args => {
            quickPick.hide();
            executeGenCatalog(getProjectByName(args[0].label));
            vscode.window.showInformationMessage("Assembly catalog generation started. This operation can take several minutes. Check .builder/catalog.json and .builder/assemblyCatalog.log.");
        });
        quickPick.show();
    }
}


function switchProfileCmd() {
    if (projects.length == 1) {
        switchProfile(projects[0]);
    } else if (projects.length > 1) {
        const list = projects.map(project => ({ label: project.name, description: project.rootDir}));
        list.sort((a, b) => a.label.localeCompare(b.label));

        const quickPick = vscode.window.createQuickPick();
        quickPick.canSelectMany = false;
        quickPick.title = "Select project:";
        quickPick.items = list;
        quickPick.onDidChangeSelection(args => {
            quickPick.hide();
            switchProfile(getProjectByName(args[0].label));
        });
        quickPick.show();
    }
}

function rebuildProject() {
    if (projects.length == 1) {
        client.sendRequest("proparse/rebuildProject", { projectUri: projects[0].rootDir });
    } else {
        const list = projects.map(project => ({ label: project.name, description: project.rootDir}));
        list.sort((a, b) => a.label.localeCompare(b.label));

        const quickPick = vscode.window.createQuickPick();
        quickPick.canSelectMany = false;
        quickPick.title = "Rebuild project:";
        quickPick.items = list;
        quickPick.onDidChangeSelection(args => {
            quickPick.hide();
            client.sendRequest("proparse/rebuildProject", { projectUri: getProjectByName(args[0].label).rootDir });
        });
        quickPick.show();
    }
}

function openDataDictionaryCmd() {
    if (vscode.window.activeTextEditor != undefined) {
        openDataDictionary(getProject(vscode.window.activeTextEditor.document.uri.fsPath));
    } else {
        const list = projects.map(str => str.rootDir).map(label => ({ label }));
        const quickPick = vscode.window.createQuickPick();
        quickPick.canSelectMany = false;
        quickPick.title = "Open Data Dictionary - Select project:";
        quickPick.items = list;
        quickPick.onDidChangeSelection(([{ label }]) => {
            openDataDictionary(getProject(label));
            quickPick.hide();
        });
        quickPick.show();
    }
}

function openInAppbuilder() {
    if ((vscode.window.activeTextEditor == undefined) || (vscode.window.activeTextEditor.document.languageId !== 'abl')) {
        vscode.window.showWarningMessage("Open in AppBuilder: no OpenEdge procedure selected");
        return;
    }
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    const cfg2 = cfg.profiles.get(cfg.activeProfile);
    openInAB(vscode.window.activeTextEditor.document.uri.fsPath, cfg.rootDir, cfg2);
}

function runCurrentFile() {
    if ((vscode.window.activeTextEditor == undefined) || (vscode.window.activeTextEditor.document.languageId !== 'abl')) {
        vscode.window.showWarningMessage("Run current file: no OpenEdge procedure selected");
        return;
    }
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    runTTY(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
}

function runCurrentFileBatch() {
    if ((vscode.window.activeTextEditor == undefined) || (vscode.window.activeTextEditor.document.languageId !== 'abl')) {
        vscode.window.showWarningMessage("Run current file: no OpenEdge procedure selected");
        return;
    }
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    runBatch(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
}

function runCurrentFileProwin() {
    if ((vscode.window.activeTextEditor == undefined) || (vscode.window.activeTextEditor.document.languageId !== 'abl')) {
        vscode.window.showWarningMessage("Run current file: no OpenEdge procedure selected");
        return;
    }
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    runGUI(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
}

function changeBuildModeCmd() {
    const quickPick = vscode.window.createQuickPick();
    quickPick.canSelectMany = false;
    quickPick.title = "Choose build mode:";
    quickPick.items = [
        { label: 'Build everything', description: 'Scan all source code at startup, build if not up to date, and build when any source changed' },
        { label: 'Classes only', description: 'Scan all source code at startup, build only classes if not up to date, and build when any source changed' },
        { label: 'Modified files only', description: 'Scan all source code at startup, don\'t rebuild anything, build only when any source changed' },
        { label: 'No build', description: 'Scan all source code at startup, never build anything' }]
    quickPick.onDidChangeSelection(item => {
        buildMode = buildModeValue(item[0].label);
        // Not saved to settings
        // vscode.workspace.getConfiguration().update('abl.buildMode', buildModeValue(item[0].label));
        vscode.window.showInformationMessage('Build mode changed, restarting language server...');
        restartLangServer();
    });
    quickPick.show();
}

function buildModeValue(str: string) {
    if (str == 'Build everything')
        return 1;
    else if (str == 'Classes only')
        return 2;
    else if (str == 'Modified files only')
        return 3;
    else if (str == 'No build')
        return 4;
}

function generateProenvStartUnix(path: string) {
    let scriptContent = "#!/bin/sh\n\n";
    if (projects.length > 1) {
        // Multiple projects, one entry per project
        scriptContent += "echo Choose project:\n"
        scriptContent += "echo ===============\n"

        let responseHandler = "";
        projects.forEach((prj, index) => {
            scriptContent += "echo   \"* " + (index + 1) + " => " + prj.rootDir + "\"\n";
            const cfg = prj.profiles.get(prj.activeProfile);
            const x2 = cfg.dlc + "/bin/proenv";
            responseHandler += (index == 0 ? "if" : "elif") + " [ \"${answer}\" = \"" + (index + 1) + "\" ] ; then ( cd \"" + prj.rootDir + "\" && source \"" + x2 + "\" ) ; \n"
        });
        responseHandler += "else ( echo Invalid choice ) ; fi \n"
        scriptContent += "echo \n"
        scriptContent += "read -p 'Your choice: ' answer\n"
        scriptContent += responseHandler
    } else if (projects.length == 1) {
        // One project, go directly to proenv
        const cfg = projects[0].profiles.get(projects[0].activeProfile);
        const x2 = cfg.dlc + "/bin/proenv";
        scriptContent += x2 + "\n"
    } else {
        // No OE projects, just offer all proenv
        let responseHandler = "";
        scriptContent += "echo No projects configured, choose OE version:\n"
        scriptContent += "echo ==========================================\n"
        oeRuntimes.forEach((runtime, index) => {
            scriptContent += "echo \"* " + (index + 1) + " => " + runtime.path + "\" \n";
            responseHandler += (index == 0 ? "if" : "elif") + " [ \"${answer}\" = \"" + (index + 1) + "\" ] ; then ( \"" + runtime.path + "/bin/proenv\" ) ; \n"
        });
        responseHandler += "else ( echo Invalid choice ) ; fi \n"
        scriptContent += "echo \n"
        scriptContent += "read -p 'Your choice: ' answer\n"
        scriptContent += responseHandler
    }
    scriptContent += "exit 0\n"

    outputChannel.appendLine(scriptContent)

    fs.writeFileSync(path, scriptContent, { mode: 0o700 });
}

function generateProenvStartWindows(path: string) {
    let scriptContent = "@echo off & setlocal\n";
    if (projects.length > 1) {
        // Multiple projects, one entry per project
        scriptContent += "echo Choose project:\n"
        scriptContent += "echo ===============\n"

        let responseHandler = ""
        let labels = "echo Invalid choice\ngoto stdexit\n"
        projects.forEach((prj, index) => {
            scriptContent += "echo   ^* " + (index + 1) + " =^> " + prj.rootDir + "\n";
            const cfg = prj.profiles.get(prj.activeProfile);
            const x2 = cfg.dlc + "\\bin\\proenv.bat";
            responseHandler += "if /i \"%answer%\" == \"" + (index + 1) + "\" goto choice" + (index + 1) + "\n"
            labels += ":choice" + (index + 1) + ":\npushd \"" + prj.rootDir + "\" && call \"" + x2 + "\" && popd\ngoto stdexit\n"
        });
        scriptContent += "echo.\n"
        scriptContent += "set /P answer=Your choice: \n"
        scriptContent += responseHandler
        scriptContent += labels
    } else if (projects.length == 1) {
        // One project, go directly to proenv
        const cfg = projects[0].profiles.get(projects[0].activeProfile);
        const x2 = cfg.dlc + "\\bin\\proenv.bat";
        scriptContent += "call " + x2 + " && goto stdexit \n"
    } else {
        // No OE projects, just offer all proenv
        scriptContent += "echo No projects configured, choose OE version:\n"
        scriptContent += "echo ==========================================\n"

        let responseHandler = "";
        let labels = "echo Invalid choice\ngoto stdexit\n"
        oeRuntimes.forEach((runtime, index) => {
            scriptContent += "echo ^* " + (index + 1) + " =^> " + runtime.path + " \n";
            responseHandler += "if /i \"%answer%\" == \"" + (index + 1) + "\" goto choice" + (index + 1) + "\n"
            labels += ":choice" + (index + 1) + ":\ncall \"" + runtime.path + "\\bin\proenv.bat\"\ngoto stdexit\n"
            responseHandler += "if /i \"%answer%\" == \"" + (index + 1) + "\" ( call \"" + runtime.path + "\\bin\\proenv.bat\" && goto stdexit )\n"
        });
        scriptContent += "echo.\n"
        scriptContent += "set /P answer=Your choice: \n"
        scriptContent += responseHandler
        scriptContent += labels
    }
    scriptContent += ":stdexit\n"
    scriptContent += "pause\nexit /b 0\n"

    fs.writeFileSync(path, scriptContent);
}

function registerCommands(ctx: vscode.ExtensionContext) {
    vscode.window.registerTerminalProfileProvider('proenv.terminal-profile', {
        provideTerminalProfile(): vscode.ProviderResult<vscode.TerminalProfile> {
            if (process.platform === "win32") {
                const prmFileName = path.join(tmpdir(), 'proenv-' + crypto.randomBytes(16).toString('hex') + '.bat');
                generateProenvStartUnix(prmFileName);
                generateProenvStartWindows(prmFileName);
                return { options: { name: 'Proenv', shellPath: prmFileName } };
            } else {
                const prmFileName = path.join(tmpdir(), 'proenv-' + crypto.randomBytes(16).toString('hex') + '.sh');
                generateProenvStartUnix(prmFileName);
                return { options: { name: 'Proenv', shellPath: prmFileName } };
            }
        }
    });

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.setDefaultProject', setDefaultProject));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dumpLangServStatus', dumpLangServStatus));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.restart.langserv', restartLangServer));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.debugListingLine', debugListingLine));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.preprocess', preprocessFile));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dumpFileStatus', dumpFileStatus));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.generateListing', generateListing));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.generateDebugListing', generateDebugListing));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.generateXref', generateXref));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.generateXmlXref', generateXmlXref));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.catalog', generateCatalog));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.fixUpperCasing', fixUpperCasing));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.fixLowerCasing', fixLowerCasing));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.project.switch.profile', switchProfileCmd));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.project.rebuild', rebuildProject));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dataDictionary', openDataDictionaryCmd));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.openInAB', openInAppbuilder));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.runProgres.currentFile', runCurrentFile));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.runBatch.currentFile', runCurrentFileBatch));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.runProwin.currentFile', runCurrentFileProwin));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.changeBuildMode', changeBuildModeCmd));
    // ctx.subscriptions.push(vscode.commands.registerCommand('abl.debug.startSession', startDebugSession));
    // ctx.subscriptions.push(vscode.commands.registerCommand('abl.test', () => {
    //     const ablConfig = vscode.workspace.getConfiguration('abl');
    //     ablTest(null, ablConfig);
    // }));
    // ctx.subscriptions.push(vscode.commands.registerCommand('abl.test.currentFile', () => {
    //     const ablConfig = vscode.workspace.getConfiguration('abl');
    //     ablTest(vscode.window.activeTextEditor.document.uri.fsPath, ablConfig);
    // }));
    // ctx.subscriptions.push(vscode.commands.registerCommand('abl.tables', () => {
    //     return getTableCollection().items.map((item) => item.label);
    // }));
    // ctx.subscriptions.push(vscode.commands.registerCommand('abl.table', (tableName) => {
    //     return getTableCollection().items.find((item) => item.label === tableName);
    // }));

    readGlobalOpenEdgeRuntimes();
    // FIXME Check if it's possible to reload only when a specific section is changed
    vscode.workspace.onDidChangeConfiguration(event => { readGlobalOpenEdgeRuntimes() });

    readWorkspaceOEConfigFiles();
    // Monitor changes in all openedge-project.json files
    vscode.workspace.createFileSystemWatcher('**/openedge-project.json').onDidChange(uri => readOEConfigFile(uri));
}

function readOEConfigFile(uri) {
    outputChannel.appendLine("OpenEdge project config file found: " + uri.fsPath);
    loadConfigFile(uri.fsPath).then(config => {
        const prjConfig = parseOpenEdgeProjectConfig(uri, config);
        if (prjConfig.dlc != "") {
            outputChannel.appendLine("OpenEdge project configured in " + prjConfig.rootDir + " -- DLC: " + prjConfig.dlc);
            const idx = projects.findIndex(element => (element.name == prjConfig.name) && (element.version == prjConfig.version))
            if (idx > -1) {
                if (projects[idx].rootDir == prjConfig.rootDir)
                    projects[idx] = prjConfig;
                else {
                    vscode.window.showErrorMessage("Duplicate project " + prjConfig.name + " name in " + prjConfig.rootDir + " and " + projects[idx].rootDir);
                }
            } else {
                projects.push(prjConfig);
            }
        } else {
            outputChannel.appendLine("Skip OpenEdge project in " + prjConfig.rootDir + " -- OpenEdge install not found")
        }
    });
}

function readWorkspaceOEConfigFiles() {
    vscode.workspace.findFiles('**/openedge-project.json').then(list => {
        list.forEach(uri => { readOEConfigFile(uri); });
    });
}

function parseOpenEdgeProjectConfig(uri: vscode.Uri, config: OpenEdgeMainConfig): OpenEdgeProjectConfig {
    const prjConfig = new OpenEdgeProjectConfig();
    prjConfig.name = config.name
    prjConfig.version = config.version
    prjConfig.rootDir = vscode.Uri.parse(path.dirname(uri.path)).fsPath
    prjConfig.dlc = getDlcDirectory(config.oeversion);
    prjConfig.extraParameters = config.extraParameters ? config.extraParameters : ""
    prjConfig.oeversion = config.oeversion;
    prjConfig.gui = config.graphicalMode;
    try { 
        prjConfig.propath = config.buildPath.map(str => str.path.replace('${DLC}', prjConfig.dlc)) 
    } catch {
        prjConfig.propath = [ '.' ] // default the propath to the root of the workspace
    }
    prjConfig.propathMode = 'append';
    prjConfig.startupProc = ''
    prjConfig.parameterFiles = []
    prjConfig.dbDictionary = []
    prjConfig.dbConnections = config.dbConnections
    prjConfig.procedures = config.procedures

    prjConfig.profiles.set("default", prjConfig);
    if (config.profiles) {
        config.profiles.forEach(profile => {
            const p = parseOpenEdgeConfig(profile.value);
            if (profile.inherits && prjConfig.profiles.get(profile.inherits)) {
                p.overwriteValues(prjConfig.profiles.get(profile.inherits));
            }
            prjConfig.profiles.set(profile.name, p);
        });
    }

    // Active profile
    if (fs.existsSync(path.join(prjConfig.rootDir, ".vscode", "profile.json"))) {
        const txt = JSON.parse(fs.readFileSync(path.join(prjConfig.rootDir, ".vscode", "profile.json"), { encoding: 'utf8' }));
        const actProf = txt['profile'];
        if (prjConfig.profiles.has(actProf)) {
            prjConfig.activeProfile = actProf;
        } else {
            prjConfig.activeProfile = "default";
        }
    } else {
        prjConfig.activeProfile = "default";
    }
    return prjConfig;
}

function parseOpenEdgeConfig(cfg: OpenEdgeConfig): ProfileConfig {
    const retVal = new ProfileConfig();
    retVal.dlc = getDlcDirectory(cfg.oeversion);
    retVal.extraParameters = cfg.extraParameters
    retVal.oeversion = cfg.oeversion;
    retVal.gui = cfg.graphicalMode;
    if (cfg.buildPath)
        retVal.propath = cfg.buildPath.map(str => str.path.replace('${DLC}', retVal.dlc))
    retVal.propathMode = 'append';
    retVal.startupProc = ''
    retVal.parameterFiles = []
    retVal.dbDictionary = []
    retVal.dbConnections = cfg.dbConnections
    retVal.procedures = cfg.procedures;

    return retVal;
}

function readGlobalOpenEdgeRuntimes() {
    buildMode = vscode.workspace.getConfiguration('abl').get('buildMode', 1);
    defaultProjectName = vscode.workspace.getConfiguration('abl').get('defaultProject');
    langServDebug = vscode.workspace.getConfiguration('abl').get('langServerDebug');
    oeRuntimes = vscode.workspace.getConfiguration('abl.configuration').get<Array<any>>('runtimes');

    const oeRuntimesDefault = vscode.workspace.getConfiguration('abl').get('configuration.defaultRuntime');
    if (oeRuntimesDefault != "") {
        //set default flag on the runtime that matches the defaultRuntime setting
        oeRuntimes.find(runtime => {
            //we have a default set, so ignore the default in the array
            if (runtime.name === oeRuntimesDefault) {
                runtime.default = true;
            } else {
                runtime.default = false;
            }
        });
    }

    if (oeRuntimes.length == 0) {
        vscode.window.showWarningMessage('No OpenEdge runtime configured on this machine');
        outputChannel.appendLine('No OpenEdge runtime configured on this machine');
    }
}

function getDlcDirectory(version: string): string {
    let dlc: string = "";
    let dfltDlc: string = "";
    let dfltName: string = "";
    oeRuntimes.forEach(runtime => {
        if (runtime.name === version) {
            dlc = runtime.path;
        }
        if (runtime.default === true) {
            dfltDlc = runtime.path;
            dfltName = runtime.name;
        }
    });
    if ( dlc == "" && dfltDlc != "" ) {
        dlc = dfltDlc;
        outputChannel.appendLine("OpenEdge version not configured in workspace settings, using default version (" + dfltName + ") in user settings.");
    }
    return dlc;
}
