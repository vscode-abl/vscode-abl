import path = require('path');
import * as crypto from 'crypto';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { Executable, LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import { openDataDictionary } from './ablDataDictionary';
import { runBatch, runTTY } from './ablRunTerminal';
import { lsOutputChannel, outputChannel } from './ablStatus';
import { executeGenCatalog } from './assemblyCatalog';
import { AblDebugConfigurationProvider } from './debugAdapter/ablDebugConfigurationProvider';
import { DocumentationNodeProvider, DocViewPanel } from './OpenEdgeDocumentation';
import { ClassBrowserProvider } from './ClassBrowser';
import { openInAB, openInProcEditor, runGUI } from './shared/ablRun';
import { FileInfo, ProjectInfo } from './shared/FileInfo';
import { loadConfigFile, OpenEdgeConfig, OpenEdgeMainConfig, OpenEdgeProjectConfig, ProfileConfig } from './shared/openEdgeConfigFile';

let client: LanguageClient;

const projects: Array<OpenEdgeProjectConfig> = new Array();
const docNodeProvider = new DocumentationNodeProvider();
let classBrowserProvider: ClassBrowserProvider;
let oeRuntimes: Array<any>;
let langServDebug: boolean;
let defaultProjectName: string;
let oeStatusBarItem: vscode.StatusBarItem;
let buildMode = 1;

export class AblDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    public constructor(
        private env?: any
    ) { }

    async createDebugAdapterDescriptor(_session: vscode.DebugSession, _executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.DebugAdapterDescriptor> {
        const debugAdapterDebug = vscode.workspace.getConfiguration('abl').get('debugAdapterDebug');
        const debugAdapterTrace = vscode.workspace.getConfiguration('abl').get('debugAdapterTrace');
        const defaultExecOptions = [
            '-jar', path.join(__dirname, '../resources/abl-lsda.jar'), '--debug-adapter'
        ];
        const debugAdapterOptionsFromSettings = vscode.workspace.getConfiguration('abl').get('debugAdapterJavaArgs', []);
        const extraArgs = vscode.workspace.getConfiguration('abl').get('debugAdapterExtraJavaArgs', '').trim().split(' ').filter((str) => str !== '');
        const execOptions0 = debugAdapterDebug ? defaultExecOptions.concat('--debug') : defaultExecOptions;
        const execOptions1 = debugAdapterTrace ? execOptions0.concat('--trace') : execOptions0;
        const execOptions2 = debugAdapterOptionsFromSettings.length == 0 ? extraArgs.concat(execOptions1) : debugAdapterOptionsFromSettings;

        const langServExecutable = getJavaExecutable();
        outputChannel.info(`ABL Debug Adapter - Command line: ${langServExecutable} ${execOptions2.join(" ")}`);
        return new vscode.DebugAdapterExecutable(langServExecutable, execOptions2, { env: this.env });
    }
}

export function activate(ctx: vscode.ExtensionContext) {
    readGlobalOpenEdgeRuntimes();
    readWorkspaceOEConfigFiles();

    client = createLanguageClient();

    // Show status bar
    oeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    oeStatusBarItem.text = 'No ABL Language Server';
    oeStatusBarItem.tooltip = 'ABL plugin status';
    oeStatusBarItem.show();
    oeStatusBarItem.command = 'abl.changeBuildMode';
    ctx.subscriptions.push(oeStatusBarItem);

    // Monitor configuration changes
    vscode.workspace.onDidChangeConfiguration(event => { readGlobalOpenEdgeRuntimes() });
    // Monitor changes in all openedge-project.json files
    vscode.workspace.createFileSystemWatcher('**/openedge-project.json').onDidChange(uri => readOEConfigFile(uri));

    fs.readFile(path.join(__dirname, '../resources/grammar-version.txt'), (err, data) => {
        outputChannel.info(`TextMate grammar version: ${data.toString().trim()}`)
      });
    registerCommands(ctx);
    vscode.debug.registerDebugAdapterDescriptorFactory("abl", new AblDebugAdapterDescriptorFactory({ ...process.env }));

    // Return extension entrypoints
    return {
        async getProjectInfo(uri: string) {
            return await client.sendRequest("proparse/projectInfo", { projectUri: uri});
        },
        async getFileInfo(uri: string) {
            return await client.sendRequest("proparse/fileInfo", { fileUri: uri });
        },
        async compile(uri: string) {
            return await client.sendRequest("proparse/compileFile", { fileUri: uri });
        },
        async getSchema(uri: string) {
            return await client.sendRequest("proparse/schema", { projectUri: uri});
        },
        async status() {
            return await client.sendRequest("proparse/status");
        },
        async restartLanguageServer() {
          return await restartLangServer();
        },
        runGUI(projectPath: string, procedure: string) {
          const cfg = getProject(projectPath);
          if (!cfg) {
            vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
            return;
          }
          runGUI(procedure, cfg);
        },
        runTTY(projectPath: string, procedure: string) {
          const cfg = getProject(projectPath);
          if (!cfg) {
            vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
            return;
          }
          runTTY(procedure, cfg);
        }
    };
}


export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

export function getProject(path: string): OpenEdgeProjectConfig {
    const srchPath = (process.platform === 'win32' ? path.toLowerCase() + '\\' : path + '/');
    return projects.find(project => process.platform === 'win32' ? 
        srchPath.startsWith(project.rootDir.toLowerCase()) :
        srchPath.startsWith(project.rootDir) );
}

export function getProjectByName(name: string): OpenEdgeProjectConfig {
    return projects.find(project => project.name === name);
}

function getJavaExecutable(): string {
  const userJavaExec = vscode.workspace.getConfiguration('abl').get('langServerJavaExecutable') as string;
  const extension = process.platform === "win32" ? '.exe' : '';
  const bundledJavaExec = fs.existsSync(path.join(__dirname, '../jre')) ? path.join(__dirname, '../jre/bin/java' + extension) : undefined;

  return userJavaExec ? userJavaExec : (bundledJavaExec ? bundledJavaExec : 'java');
}

function createLanguageClient(): LanguageClient {
    // For debugger: add '-Xdebug', '-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=8000,quiet=y'
    const defaultExecOptions = [
        '-jar', path.join(__dirname, '../resources/abl-lsda.jar')
    ];

    const langServOptionsFromSettings = vscode.workspace.getConfiguration('abl').get('langServerJavaArgs', []);
    const extraArgs = vscode.workspace.getConfiguration('abl').get('langServerExtraJavaArgs', '').trim().split(' ').filter((str) => str !== '');
    const execOptions0 = langServDebug ? defaultExecOptions.concat('--debug') : defaultExecOptions;
    const execOptions1 = vscode.workspace.getConfiguration('abl').get('langServerTrace') ? execOptions0.concat('--trace') : execOptions0;
    const execOptions2 = langServOptionsFromSettings.length == 0 ? extraArgs.concat(execOptions1) : langServOptionsFromSettings;
    const langServExecutable = getJavaExecutable();

    outputChannel.info(`ABL Language Server - Command line: ${langServExecutable} ${execOptions2.join(" ")}`);
    const serverExec: Executable = {
        command: langServExecutable,
        args: execOptions2
    };
    const serverOptions: ServerOptions = serverExec;

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        outputChannel: lsOutputChannel,
        initializationOptions: {
            abl: vscode.workspace.getConfiguration('abl')
        },
        documentSelector: [{ scheme: 'file', language: 'abl' }, { scheme: 'untitled', language: 'abl' }],
        synchronize: {
            configurationSection: 'abl',
            fileEvents: vscode.workspace.createFileSystemWatcher('**/openedge-project.properties')
        }
    };

    const tmp = new LanguageClient('ablLanguageServer', 'ABL Language Server', serverOptions, clientOptions);
    tmp.onNotification("proparse/status", (statusParams: any) => {
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

        oeStatusBarItem.tooltip = "Build mode: " + buildModeName(buildMode) + "\n" + statusParams.projects.join("\n")
    });

    return tmp;
}

function openDocumentationEntry(uri: string): void {
  DocViewPanel.createOrShow(uri);
}

function switchDocTo122(): void {
  docNodeProvider.updateMode(2);
  docNodeProvider.refresh();
}

function switchDocTo128(): void {
  docNodeProvider.updateMode(3);
  docNodeProvider.refresh();
}

function refreshClassBrowser(): void {
  if (classBrowserProvider) {
    classBrowserProvider.refresh();
  }
}

// Note: when called from a task, it looks like all task parameters are passed to the function as an array
// I didn't find any specification for the order of the parameters, so the first entry in reverse order which matches a directory
// is returned, or 'undefined' if none is found
function getDirectoryFromArgs(params: any[]): string {
  const copy = [].concat(params).reverse();
  const projectDir = copy.find(it => fs.existsSync(it) && fs.statSync(it).isDirectory());
  return projectDir || "";
}

function getDlcDir(params: any[]): string {
  const projectDir = getDirectoryFromArgs(params);
  if (projectDir === "") {
    vscode.window.showErrorMessage("Invalid argument passed to getDlcDir");
    return "";
  }
  const cfg = getProject(projectDir);
  if (!cfg) {
    const defaultRuntime = oeRuntimes.find(runtime => runtime.default);
    if (!defaultRuntime)
      vscode.window.showErrorMessage("No OpenEdge project found for launch configuration in " + projectDir);
    return defaultRuntime ? defaultRuntime.path : "";
  }

  return cfg.dlc;
}

async function getPropath(params: any[]): Promise<string | undefined> {
  const projectDir = getDirectoryFromArgs(params);
  if (projectDir === "") {
    vscode.window.showErrorMessage("Invalid argument passed to getPropath");
    return undefined;
  }

  const result = await client.sendRequest("proparse/projectInfo", { projectUri: vscode.Uri.file(projectDir).toString() }) as ProjectInfo;
  if (result && result.propath && result.propath != "") {
    if (process.platform === "win32")
      return result.propath;
    else
      return result.propath.replace(",", ":");
  } else {
    return ""
  }
}

async function getSourceDirs(params: string[]): Promise<string | undefined> {
  const projectDir = getDirectoryFromArgs(params);
  if (projectDir === "") {
    vscode.window.showErrorMessage("Invalid argument passed to getSourceDirs");
    return undefined;
  }

  const result = await client.sendRequest("proparse/projectInfo", { projectUri: vscode.Uri.file(projectDir).toString() }) as ProjectInfo;
  if (result && result.buildDirs && result.sourceDirs != "") {
    return result.sourceDirs;
  } else {
    return ""
  }
}

async function getBuildDirs(params: string[]): Promise<string | undefined> {
  const projectDir = getDirectoryFromArgs(params);
  if (projectDir === "") {
    vscode.window.showErrorMessage("Invalid argument passed to getBuildDirs");
    return undefined;
  }

  const result = await client.sendRequest("proparse/projectInfo", { projectUri: vscode.Uri.file(projectDir).toString() }) as ProjectInfo;
  if (result && result.buildDirs && result.buildDirs != "") {
    return result.buildDirs;
  } else {
    return ""
  }
}

async function getRelativePath(): Promise<string | undefined> {
  if (vscode.window.activeTextEditor == undefined) {
    vscode.window.showErrorMessage("getRelativePath error: no active buffer");
    return undefined;
  }

  const result = await client.sendRequest("proparse/fileInfo", { fileUri: vscode.window.activeTextEditor.document.uri.toString() }) as FileInfo;
  if (result && result.relativePath && result.relativePath != "") {
    return result.relativePath;
  } else {
    // Fall back to full path if file does not belong to any project
    return vscode.window.activeTextEditor.document.fileName;
  }
}

function setDefaultProject(): void {
    if (projects.length < 2) {
        vscode.window.showWarningMessage("Default project can only be set when multiple projects are opened");
        return;
    }

    const list = projects.map(project => ({ label: project.name, description: project.rootDir }));
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

function restartLangServer(): Promise<void> {
    outputChannel.info("Received request to restart ABL Language Server");
    return client.stop(5000)
      .then(() => {
        outputChannel.info("ABL Language Server stopped");
        client = createLanguageClient();
        outputChannel.info("Starting new ABL Language Server");
        return client.start();
      })
      .catch(caught => {
        outputChannel.info("ABL Language Server didn't stop correctly: " + caught);
        throw caught;
      });
}

function switchProfile(project: OpenEdgeProjectConfig): void {
    const list = Array.from(project.profiles.keys()).map(key => ({ label: key, description: key == "default" && project.defaultProfileDisplayName ? project.defaultProfileDisplayName : "" }));
    const quickPick = vscode.window.createQuickPick();
    quickPick.canSelectMany = false;
    quickPick.title = "Switch project to profile:";
    quickPick.items = list;
    quickPick.onDidChangeSelection(([{ label }]) => {
        quickPick.hide();
        const vsCodeDir = path.join(project.rootDir, ".vscode");
        fs.mkdirSync(vsCodeDir, { recursive: true });
        fs.writeFileSync(path.join(vsCodeDir, "profile.json"), JSON.stringify({ profile: label }));
        project.activeProfile = label;
        restartLangServer();
    });
    quickPick.show();
}

function compileBuffer() {
    if (vscode.window.activeTextEditor == undefined)
        return;

    if (projects.length == 1) {
        compileBufferInProject(projects[0], vscode.window.activeTextEditor.document.uri.toString(), vscode.window.activeTextEditor.document.getText());
    } else {
        const defPrj = getProjectByName(defaultProjectName);
        if (defPrj) {
            compileBufferInProject(defPrj, vscode.window.activeTextEditor.document.uri.toString(), vscode.window.activeTextEditor.document.getText());
        } else {
            const list = projects.map(project => ({ label: project.name, description: project.rootDir }));
            list.sort((a, b) => a.label.localeCompare(b.label));

            const quickPick = vscode.window.createQuickPick();
            quickPick.canSelectMany = false;
            quickPick.title = "Choose project to compile buffer:";
            quickPick.items = list;
            quickPick.onDidChangeSelection(args => {
                quickPick.hide();
                compileBufferInProject(getProjectByName(args[0].label), vscode.window.activeTextEditor.document.uri.toString(), vscode.window.activeTextEditor.document.getText());
            });
            quickPick.show();
        }
    }
}

function compileBufferInProject(project: OpenEdgeProjectConfig, bufferUri: string, buffer: string) {
    client.sendRequest<any>("proparse/compileBuffer", { projectUri: project.uri.toString(), bufferUri: bufferUri, buffer: buffer }).then(result => {
      if (result.success === false) {
        vscode.window.showErrorMessage("Compile buffer failed");
      } else {
        vscode.window.showInformationMessage("Syntax is correct");
      }
    });
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
        client.sendNotification("proparse/showDebugListingLine", { fileUri: vscode.window.activeTextEditor.document.uri.toString(), lineNumber: parseInt(input) });
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

    client.sendNotification("proparse/dumpFileStatus", { fileUri: vscode.window.activeTextEditor.document.uri.toString() });
}

function preprocessFile() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest("proparse/preprocess", { fileUri: vscode.window.activeTextEditor.document.uri.toString() }).then(result => {
      const anyValue = result as any;
      if (anyValue.fileName === "") {
        vscode.window.showErrorMessage("Error during preprocess: " + anyValue.message);
      } else {
        vscode.window.showTextDocument(vscode.Uri.file(anyValue.fileName));
      }
    })
}

function generateListing() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest("proparse/listing", { fileUri: vscode.window.activeTextEditor.document.uri.toString() }).then(result => {
      const anyValue = result as any;
      if (anyValue.fileName === "") {
        vscode.window.showErrorMessage("Error during listing generation: " + anyValue.message);
      } else {
        vscode.window.showTextDocument(vscode.Uri.file(anyValue.fileName));
      }
    })
}

function generateDebugListing() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest("proparse/debugListing", { fileUri: vscode.window.activeTextEditor.document.uri.toString() }).then(result => {
      const anyValue = result as any;
      if (anyValue.fileName === "") {
        vscode.window.showErrorMessage("Error during debug listing generation: " + anyValue.message);
      } else {
        vscode.window.showTextDocument(vscode.Uri.file(anyValue.fileName));
      }
    })
}

function generateXref() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }
    client.sendRequest("proparse/xref", { fileUri: vscode.window.activeTextEditor.document.uri.toString() }).then(result => {
      const anyValue = result as any;
      if (anyValue.fileName === "") {
        vscode.window.showErrorMessage("Error during XREF generation: " + anyValue.message);
      } else {
        vscode.window.showTextDocument(vscode.Uri.file(anyValue.fileName));
      }
    })
}

function generateXrefAndJumpToCurrentLine() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    const currentEditor = vscode.window.activeTextEditor;
    const currentLine = currentEditor.selection.active.line + 1; // Convert to 1-based line number
    const currentFile = currentEditor.document.uri.fsPath;
    
    client.sendRequest("proparse/xref", { fileUri: vscode.window.activeTextEditor.document.uri.toString() }).then(result => {
      const anyValue = result as any;
      if (anyValue.fileName === "") {
        vscode.window.showErrorMessage("Error during XREF generation: " + anyValue.message);
      } else {
        vscode.window.showTextDocument(vscode.Uri.file(anyValue.fileName)).then(async editor => {
            const result = await getXrefLineSelectionForSourceLine(currentFile, anyValue.fileName, currentLine);
            if (result === null) {
                vscode.window.showWarningMessage("XREF line mapping failed");
                return;
            }
            const startPosition = new vscode.Position(result.start, 0);
            const endPosition = new vscode.Position(result.start + result.count - 1, 1000);
            editor.selection = new vscode.Selection(startPosition, endPosition);
            editor.revealRange(new vscode.Range(startPosition, endPosition), vscode.TextEditorRevealType.InCenter);
        });
      }
    });
}

async function getXrefLineSelectionForSourceLine(sourceFile: string, xrefFile: string, targetSourceLineNumber: number): Promise<{ start: number; count: number } | null> {
    const sourceBasename = path.basename(path.normalize(sourceFile));
    const xrefContent = fs.readFileSync(xrefFile, 'utf8');

    if (xrefContent.at(-1) !== "\n") {
        return null;
    }
    
    let closestXrefLineNumber = -1;
    let lastSeenSourceLineNumber = -1;
    let matchCount = 1;
    const lines = xrefContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;

        // only consider xref entries for the source file, not eg includes
        const parts = line.match(`${sourceBasename} (\\d+)`);
        if (parts?.length === 2) {
            const sourceLineNumber = parseInt(parts[1]);
            if (sourceLineNumber > targetSourceLineNumber) {
                break;
            }

            if (lastSeenSourceLineNumber === sourceLineNumber) {
                matchCount++;
            } else {
                lastSeenSourceLineNumber = sourceLineNumber;
                closestXrefLineNumber = i;
                matchCount = 1;
            }
        }
    }

    if (closestXrefLineNumber === -1) {
        return null;
    }
    return {start: closestXrefLineNumber, count: matchCount};
}

function generateXmlXref() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest("proparse/xmlXref", { fileUri: vscode.window.activeTextEditor.document.uri.toString() }).then(result => {
      const anyValue = result as any;
      if (anyValue.fileName === "") {
        vscode.window.showErrorMessage("Error during XML XREF generation: " + anyValue.message);
      } else {
        vscode.window.showTextDocument(vscode.Uri.file(anyValue.fileName));
      }
    })
}

function fixUpperCasing() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }
    client.sendRequest("proparse/fixCasing", { upper: true, fileUri: vscode.window.activeTextEditor.document.uri.toString() });
}

function fixLowerCasing() {
    if (vscode.window.activeTextEditor == undefined)
        return;
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }

    client.sendRequest("proparse/fixCasing", { upper: false, fileUri: vscode.window.activeTextEditor.document.uri.toString() });
}

function generateCatalog() {
    if (projects.length == 1) {
        executeGenCatalog(projects[0]);
        vscode.window.showInformationMessage("Assembly catalog generation started. This operation can take several minutes. Check .builder/catalog.json and .builder/assemblyCatalog.log.");
    } else if (projects.length > 1) {
        const list = projects.map(project => ({ label: project.name, description: project.rootDir }));
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
        const list = projects.map(project => ({ label: project.name, description: project.rootDir }));
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
        client.sendRequest("proparse/rebuildProject", { projectUri: projects[0].uri.toString() });
    } else {
        const list = projects.map(project => ({ label: project.name, description: project.rootDir }));
        list.sort((a, b) => a.label.localeCompare(b.label));

        const quickPick = vscode.window.createQuickPick();
        quickPick.canSelectMany = false;
        quickPick.title = "Rebuild project:";
        quickPick.items = list;
        quickPick.onDidChangeSelection(args => {
            quickPick.hide();
            client.sendRequest("proparse/rebuildProject", { projectUri: getProjectByName(args[0].label).uri.toString() });
        });
        quickPick.show();
    }
}

function openDataDictionaryCmd() {
    if (projects.length == 1) {
        openDataDictionary(projects[0]);
    } else {
        const list = projects.map(project => ({ label: project.name, description: project.rootDir }));
        list.sort((a, b) => a.label.localeCompare(b.label));

        const quickPick = vscode.window.createQuickPick();
        quickPick.canSelectMany = false;
        quickPick.title = "Open Data Dictionary - Select project:";
        quickPick.items = list;
        quickPick.onDidChangeSelection(args => {
            quickPick.hide();
            openDataDictionary(getProjectByName(args[0].label));
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
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }
    const cfg2 = cfg.profiles.get(cfg.activeProfile);
    openInAB(vscode.window.activeTextEditor.document.uri.fsPath, cfg.rootDir, cfg2);

    const closeEditor = vscode.workspace.getConfiguration('abl').get('closeEditorAfterOpenExternal', true);
    if (closeEditor) {
        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
}

function openInProcedureEditor() {
    if ((vscode.window.activeTextEditor == undefined) || (vscode.window.activeTextEditor.document.languageId !== 'abl')) {
        vscode.window.showWarningMessage("Open in procedure editor: no OpenEdge procedure selected");
        return;
    }
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }
    const cfg2 = cfg.profiles.get(cfg.activeProfile);
    openInProcEditor(vscode.window.activeTextEditor.document.uri.fsPath, cfg.rootDir, cfg2);

    const closeEditor = vscode.workspace.getConfiguration('abl').get('closeEditorAfterOpenExternal', true);
    if (closeEditor) {
        vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }
}

function runCurrentFile() {
    if ((vscode.window.activeTextEditor == undefined) || (vscode.window.activeTextEditor.document.languageId !== 'abl')) {
        vscode.window.showWarningMessage("Run current file: no OpenEdge procedure selected");
        return;
    }
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }
    runTTY(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
}

function runCurrentFileBatch() {
    if ((vscode.window.activeTextEditor == undefined) || (vscode.window.activeTextEditor.document.languageId !== 'abl')) {
        vscode.window.showWarningMessage("Run current file: no OpenEdge procedure selected");
        return;
    }
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }
    runBatch(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
}

function runCurrentFileProwin() {
    if ((vscode.window.activeTextEditor == undefined) || (vscode.window.activeTextEditor.document.languageId !== 'abl')) {
        vscode.window.showWarningMessage("Run current file: no OpenEdge procedure selected");
        return;
    }
    const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
    if (!cfg) {
        vscode.window.showInformationMessage("Current buffer doesn't belong to any OpenEdge project");
        return;
    }
    runGUI(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
}

function buildModeName(val: number) {
    if (val == 1)
        return 'Build everything';
    else if (val == 2)
        return 'Classes only';
    else if (val == 3)
        return 'Modified files only';
    else if (val == 4)
        return 'No build';
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
        quickPick.hide();
        buildMode = buildModeValue(item[0].label);
        vscode.workspace.getConfiguration("abl").update("buildMode", buildModeValue(item[0].label), vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage('ABL build mode changed to ' + item[0].label);
    });
    quickPick.show();
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

    // outputChannel.info(scriptContent)

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
            labels += ":choice" + (index + 1) + ":\ncall \"" + runtime.path + "\\bin\\proenv.bat\"\ngoto stdexit\n"
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

    ctx.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('abl', new AblDebugConfigurationProvider(projects)));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.openDocEntry', openDocumentationEntry));
    ctx.subscriptions.push(vscode.commands.registerCommand('oeDoc.switchTo122', switchDocTo122));
    ctx.subscriptions.push(vscode.commands.registerCommand('oeDoc.switchTo128', switchDocTo128));
    ctx.subscriptions.push(vscode.commands.registerCommand('classBrowser.refresh', refreshClassBrowser));

    ctx.subscriptions.push(vscode.commands.registerCommand('abl.getRelativePath', getRelativePath));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.getDlcDirectory', getDlcDir));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.getPropath', getPropath));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.getSourceDirs', getSourceDirs));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.getBuildDirs', getBuildDirs));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.setDefaultProject', setDefaultProject));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dumpLangServStatus', dumpLangServStatus));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.restart.langserv', restartLangServer));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.compileBuffer', compileBuffer));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.debugListingLine', debugListingLine));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.preprocess', preprocessFile));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dumpFileStatus', dumpFileStatus));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.generateListing', generateListing));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.generateDebugListing', generateDebugListing));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.generateXref', generateXref));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.generateXmlXref', generateXmlXref));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.generateXrefAndJumpToCurrentLine', generateXrefAndJumpToCurrentLine));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.catalog', generateCatalog));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.fixUpperCasing', fixUpperCasing));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.fixLowerCasing', fixLowerCasing));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.project.switch.profile', switchProfileCmd));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.project.rebuild', rebuildProject));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.dataDictionary', openDataDictionaryCmd));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.openInAB', openInAppbuilder));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.openInProcEd', openInProcedureEditor));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.runProgres.currentFile', runCurrentFile));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.runBatch.currentFile', runCurrentFileBatch));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.runProwin.currentFile', runCurrentFileProwin));
    ctx.subscriptions.push(vscode.commands.registerCommand('abl.changeBuildMode', changeBuildModeCmd));

    vscode.window.registerTreeDataProvider('openEdgeDocumentation', docNodeProvider);
    docNodeProvider.fetchData();

    // Register Class Browser
    classBrowserProvider = new ClassBrowserProvider(client, projects);
    vscode.window.registerTreeDataProvider('classBrowser', classBrowserProvider);
}

function readOEConfigFile(uri : vscode.Uri) {
    outputChannel.info(`OpenEdge project config file found: ${uri.fsPath}`)
    const config = loadConfigFile(uri.fsPath);
    if (config) {
        const prjConfig = parseOpenEdgeProjectConfig(uri, config);
        if (prjConfig.dlc != "") {
            outputChannel.info(`OpenEdge project configured in ${prjConfig.rootDir} -- DLC: ${prjConfig.dlc}`);
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
            outputChannel.info(`Skip OpenEdge project in ${prjConfig.rootDir} -- OpenEdge install not found`)
        }
    } else {
        outputChannel.info(`--> Invalid config file`);
    }
}

function readWorkspaceOEConfigFiles() {
    vscode.workspace.findFiles('**/openedge-project.json').then(list => {
        list.forEach(uri => readOEConfigFile(uri) );
        if (projects.length > 0) {
            outputChannel.info(`Now starting ABL language server...`)
            client.start();
        } else {
            outputChannel.info(`No OpenEdge projects found in workspace`)
        }
    });
}

function parseOpenEdgeProjectConfig(uri: vscode.Uri, config: OpenEdgeMainConfig): OpenEdgeProjectConfig {
    const prjConfig = new OpenEdgeProjectConfig();
    prjConfig.uri = vscode.Uri.parse(path.dirname(uri.path))
    prjConfig.name = config.name
    prjConfig.version = config.version
    prjConfig.defaultProfileDisplayName = config.defaultProfileDisplayName
    prjConfig.rootDir = vscode.Uri.parse(path.dirname(uri.path)).fsPath + ( process.platform === 'win32' ? '\\' : '/' )
    prjConfig.dlc = getDlcDirectory(config.oeversion);
    prjConfig.extraParameters = config.extraParameters ? config.extraParameters : ""
    prjConfig.oeversion = config.oeversion;
    prjConfig.gui = config.graphicalMode;
    try {
        prjConfig.propath = config.buildPath.map(str => str.path.replace('${DLC}', prjConfig.dlc))
    } catch {
        prjConfig.propath = ['.'] // default the propath to the root of the workspace
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
            p.dlc = getDlcDirectory(p.oeversion);
            prjConfig.profiles.set(profile.name, p);
        });
    }

    // Active profile
    if (fs.existsSync(path.join(prjConfig.rootDir, ".vscode", "profile.json"))) {
        try {
            const txt = JSON.parse(fs.readFileSync(path.join(prjConfig.rootDir, ".vscode", "profile.json"), { encoding: 'utf8' }));
            const actProf = txt['profile'];
            if (prjConfig.profiles.has(actProf)) {
                prjConfig.activeProfile = actProf;
            } else {
                prjConfig.activeProfile = "default";
            }
        } catch (error) {
            console.error('Error parsing profile.json:', error);
            prjConfig.activeProfile = "default";
        }
    } else {
        prjConfig.activeProfile = "default";
    }
    return prjConfig;
}

function parseOpenEdgeConfig(cfg: OpenEdgeConfig): ProfileConfig {
    const retVal = new ProfileConfig();
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
        // Set default flag on the runtime that matches the defaultRuntime setting
        oeRuntimes.forEach(runtime => {
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
        outputChannel.info(`No OpenEdge runtime configured on this machine`);
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
    if (dlc == "" && dfltDlc != "") {
        dlc = dfltDlc;
        outputChannel.info(`OpenEdge version not configured in workspace settings, using default version (${dfltName}) in user settings.`);
    }
    return dlc;
}
