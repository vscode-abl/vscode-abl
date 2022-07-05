import path = require('path');
import * as vscode from 'vscode';
import * as fs from 'fs';
import { openDataDictionary } from './ablDataDictionary';
import { runGUI, openInAB } from './shared/ablRun';
import { runTTY, runBatch } from './ablRunTerminal';
import { ablTest } from './ablTest';
import { AblDebugConfigurationProvider } from './debugAdapter/ablDebugConfigurationProvider';
import { initDocumentController } from './parser/documentController';
import { getTableCollection, watchDictDumpFiles } from './providers/ablCompletionProvider';
import { ABLFormattingProvider } from './providers/ablFormattingProvider';
import { loadConfigFile, OpenEdgeProjectConfig, OpenEdgeConfig, OpenEdgeMainConfig, ProfileConfig } from './shared/openEdgeConfigFile';
import { LanguageClient, LanguageClientOptions, ServerOptions, Executable } from 'vscode-languageclient/node';
import { tmpdir } from 'os';
import { outputChannel } from './ablStatus';

let errorDiagnosticCollection: vscode.DiagnosticCollection;
let warningDiagnosticCollection: vscode.DiagnosticCollection;
let client: LanguageClient;

let oeRuntimes: Array<any>;
let defaultRuntime;
let langServDebug: boolean;
let debugAdapterDebug: boolean;
let debugAdapterTrace: boolean;
const projects: Array<OpenEdgeProjectConfig> = new Array();
let defaultProject: OpenEdgeProjectConfig;
let oeStatusBarItem: vscode.StatusBarItem;

export class AblDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    public constructor(
        private startScriptPath: string,
        private env?: any
    ) { }

    async createDebugAdapterDescriptor(_session: vscode.DebugSession, _executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.DebugAdapterDescriptor> {
        const logFile = path.join(tmpdir(), 'vscode-debug-adapter.txt');
        const defaultExecOptions = [
            '-Dorg.slf4j.simpleLogger.defaultLogLevel=' + (debugAdapterDebug ? 'DEBUG' : 'INFO'),
            '-Dorg.slf4j.simpleLogger.logFile=' + logFile,
            '-jar', path.join(__dirname, '../resources/abl-dap.jar')
        ];
        const langServOptionsFromSettings = vscode.workspace.getConfiguration('abl').get('debugAdapterJavaArgs', []);
        const langServOptions = langServOptionsFromSettings.length == 0 ? defaultExecOptions : langServOptionsFromSettings;
        const langServExecutable = vscode.workspace.getConfiguration('abl').get('langServerJavaExecutable', 'java');
        outputChannel.appendLine("ABL Debug Adapter - Command line: " + langServExecutable + " " + (debugAdapterTrace ? langServOptions.concat('--trace') : langServOptions));
        return new vscode.DebugAdapterExecutable(langServExecutable, (debugAdapterTrace ? langServOptions.concat('--trace') : langServOptions), { env: this.env });
    }
}

export function activate(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('abl', new AblDebugConfigurationProvider(projects)));

    const env: any = { ...process.env };
    vscode.debug.registerDebugAdapterDescriptorFactory("abl", new AblDebugAdapterDescriptorFactory("", env));

    startDictWatcher();
    startDocumentWatcher(ctx);

    initProviders(ctx);
    registerCommands(ctx);

    oeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    oeStatusBarItem.text = 'No pending tasks';
    oeStatusBarItem.show();
    ctx.subscriptions.push(oeStatusBarItem);

    // Refresh status bar every second
    setInterval(() => { updateStatusBarItem() }, 1000);

    client = createLanguageClient();
    client.start();
}

export function getProject(p: string): OpenEdgeProjectConfig {
    const retVal = projects.find(config => p.startsWith(config.rootDir));
    return (retVal != null) ? retVal : defaultProject;
}

function createLanguageClient(): LanguageClient {
    // Add '-Xdebug' and '-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=8000,quiet=y' for debugger
    const defaultExecOptions = [
        '--add-opens=java.base/java.lang=ALL-UNNAMED',
        '--add-opens=java.base/java.math=ALL-UNNAMED',
        '--add-opens=java.base/java.util=ALL-UNNAMED',
        '--add-opens=java.base/java.util.concurrent=ALL-UNNAMED',
        '--add-opens=java.base/java.net=ALL-UNNAMED',
        '--add-opens=java.base/java.text=ALL-UNNAMED',
        '-Dorg.slf4j.simpleLogger.defaultLogLevel=' + (langServDebug ? 'DEBUG' : 'INFO'),
        '-jar', path.join(__dirname, '../resources/abl-lsp.jar')
    ];

    const langServExecutable = vscode.workspace.getConfiguration('abl').get('langServerJavaExecutable', 'java');
    const langServOptionsFromSettings = vscode.workspace.getConfiguration('abl').get('langServerJavaArgs', []);
    const langServOptions = langServOptionsFromSettings.length == 0 ? defaultExecOptions : langServOptionsFromSettings;

    outputChannel.appendLine("ABL Language Server - Command line: " + langServExecutable + " " + langServOptions);
    const serverExec: Executable = {
        command: langServExecutable,
        args: langServOptions
    };
    const serverOptions: ServerOptions = serverExec;

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        initializationOptions: {
            cablLicense: vscode.workspace.getConfiguration('abl').get('cablLicense', ''),
            upperCaseCompletion: vscode.workspace.getConfiguration('abl').get('completion.upperCase', false)
        },
        documentSelector: [{ scheme: 'file', language: 'abl' }],
        synchronize: {
            configurationSection: 'abl',
            fileEvents: vscode.workspace.createFileSystemWatcher('**/openedge-project.properties')
        }
    };

    return new LanguageClient('ablLanguageServer', 'ABL Language Server', serverOptions, clientOptions);
}

function updateStatusBarItem(): void {
    client.sendRequest("proparse/pendingTasks").then(data => {
        if (data == 0)
            oeStatusBarItem.text = `No pending tasks`;
        else
            oeStatusBarItem.text = `$(sync~spin) ${data} pending tasks`;
        oeStatusBarItem.show();
    });
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

function registerCommands(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.restart.langserv', () => {
        restartLangServer();
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.fixUpperCasing', () => {
        if (vscode.window.activeTextEditor == undefined)
            return;
        const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
        
        client.sendRequest("proparse/fixCasing", { upper: true, uri: vscode.window.activeTextEditor.document.uri.toString(), project: cfg.rootDir });
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.fixLowerCasing', () => {
        if (vscode.window.activeTextEditor == undefined)
            return;
        const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
        
        client.sendRequest("proparse/fixCasing", { upper: false, uri: vscode.window.activeTextEditor.document.uri.toString(), project: cfg.rootDir });
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.project.switch.profile', () => {
        if (projects.length == 1) {
            switchProfile(projects[0]);
        } else if (projects.length > 1) {
            const list1 = projects.map(str => str.rootDir).map(label => ({ label }));
            const quickPick = vscode.window.createQuickPick();
            quickPick.canSelectMany = false;
            quickPick.title = "Select project:";
            quickPick.items = list1;
            quickPick.onDidChangeSelection(([{ label }]) => {
                quickPick.hide();
                switchProfile(getProject(label));
            });
            quickPick.show();
        }
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.project.rebuild', () => {
        const list = projects.map(str => str.rootDir).map(label => ({ label }));
        if (list.length == 1) {
            client.sendRequest("proparse/rebuildProject", { uri: getProject(list[0].label).rootDir });
        } else {
            const quickPick = vscode.window.createQuickPick();
            quickPick.canSelectMany = false;
            quickPick.title = "Rebuild project:";
            quickPick.items = list;
            quickPick.onDidChangeSelection(([{ label }]) => {
                client.sendRequest("proparse/rebuildProject", { uri: getProject(label).rootDir });
                quickPick.hide();
            });
            quickPick.show();
        }
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dataDictionary', () => {
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
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.openInAB', () => {
        if (vscode.window.activeTextEditor == undefined)
            return;
        const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
        const cfg2 = cfg.profiles.get(cfg.activeProfile);
        openInAB(vscode.window.activeTextEditor.document.uri.fsPath, cfg.rootDir, cfg2);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.runProgres.currentFile', () => {
        if (vscode.window.activeTextEditor == undefined)
            return;
        const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
        runTTY(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.runBatch.currentFile', () => {
        if (vscode.window.activeTextEditor == undefined)
            return;
        const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
        runBatch(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.runProwin.currentFile', () => {
        if (vscode.window.activeTextEditor == undefined)
            return;
        const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
        runGUI(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.test', () => {
        const ablConfig = vscode.workspace.getConfiguration('abl');
        ablTest(null, ablConfig);
    }));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.test.currentFile', () => {
        const ablConfig = vscode.workspace.getConfiguration('abl');
        ablTest(vscode.window.activeTextEditor.document.uri.fsPath, ablConfig);
    }));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.tables', () => {
        return getTableCollection().items.map((item) => item.label);
    }));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.table', (tableName) => {
        return getTableCollection().items.find((item) => item.label === tableName);
    }));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.debug.startSession', (config) => {
        if (!config.request) { // if 'request' is missing interpret this as a missing launch.json
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.languageId !== 'abl') {
                return;
            }

            // tslint:disable: object-literal-sort-keys
            config = Object.assign(config, {
                name: 'Attach',
                type: 'abl',
                request: 'attach',
            });
        }
        vscode.commands.executeCommand('vscode.startDebug', config);
    }));

    errorDiagnosticCollection = vscode.languages.createDiagnosticCollection('abl-error');
    ctx.subscriptions.push(errorDiagnosticCollection);
    warningDiagnosticCollection = vscode.languages.createDiagnosticCollection('abl-warning');
    ctx.subscriptions.push(warningDiagnosticCollection);

    readGlobalOpenEdgeRuntimes();
    // FIXME Check if it's possible to reload only when a specific section is changed
    vscode.workspace.onDidChangeConfiguration(event => { readGlobalOpenEdgeRuntimes() });

    readWorkspaceOEConfigFiles();
    const watcher = vscode.workspace.createFileSystemWatcher('**/.openedge.json');
    watcher.onDidChange(uri => readWorkspaceOEConfigFiles());
    watcher.onDidCreate(uri => readWorkspaceOEConfigFiles());
    watcher.onDidDelete(uri => readWorkspaceOEConfigFiles());
}

function readWorkspaceOEConfigFiles() {
    vscode.workspace.findFiles('**/openedge-project.json').then(list => {
        list.forEach(uri => {
            outputChannel.appendLine("OpenEdge project config file found: " + uri.fsPath);
            loadConfigFile(uri.fsPath).then(config => {
                const prjConfig = parseOpenEdgeProjectConfig(uri, config);
                if (prjConfig.dlc != "") {
                    outputChannel.appendLine("OpenEdge project configured in " + prjConfig.rootDir + " -- DLC: " + prjConfig.dlc);
                    projects.push(prjConfig);
                }
            });
        });
    });
}

function parseOpenEdgeProjectConfig(uri: vscode.Uri, config: OpenEdgeMainConfig): OpenEdgeProjectConfig {
    const prjConfig = new OpenEdgeProjectConfig();
    prjConfig.rootDir = vscode.Uri.parse(path.dirname(uri.path)).fsPath
    prjConfig.dlc = getDlcDirectory(config.oeversion);
    prjConfig.extraParameters = config.extraParameters
    prjConfig.oeversion = config.oeversion;
    prjConfig.gui = config.graphicalMode;
    prjConfig.propath = config.buildPath.map(str => str.path.replace('${DLC}', prjConfig.dlc))
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
    langServDebug = vscode.workspace.getConfiguration('abl').get('langServerDebug');
    debugAdapterDebug = vscode.workspace.getConfiguration('abl').get('debugAdapterDebug');
    debugAdapterTrace = vscode.workspace.getConfiguration('abl').get('debugAdapterTrace');
    oeRuntimes = vscode.workspace.getConfiguration('abl.configuration').get<Array<any>>('runtimes');
    if (oeRuntimes.length == 0) {
        vscode.window.showWarningMessage('No OpenEdge runtime configured on this machine');
    }
    defaultRuntime = oeRuntimes.find(runtime => runtime.default);
    if (defaultRuntime != null) {
        defaultProject = new OpenEdgeProjectConfig();
        defaultProject.dlc = defaultRuntime.path;
        defaultProject.rootDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
        defaultProject.oeversion = defaultRuntime.name;
        defaultProject.extraParameters = '';
        defaultProject.gui = false;
        defaultProject.propath = [];
    }
}

function getDlcDirectory(version: string): string {
    let dlc: string = "";
    oeRuntimes.forEach(runtime => {
        if (runtime.name === version)
            dlc = runtime.path
    });
    return dlc;
}

function deactivate() {
    // no need for deactivation yet
}

function initProviders(context: vscode.ExtensionContext) {
    new ABLFormattingProvider(context);
}

function startDocumentWatcher(context: vscode.ExtensionContext) {
    initDocumentController(context);
}

function startDictWatcher() {
    watchDictDumpFiles();
}
