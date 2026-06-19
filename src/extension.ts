import path = require('path');
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as vscode from 'vscode';
import {
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import { openDataDictionary } from './ablDataDictionary';
import { runBatch, runTTY } from './ablRunTerminal';
import { lsOutputChannel, outputChannel } from './ablStatus';
import { executeGenCatalog } from './assemblyCatalog';
import { AblDebugConfigurationProvider } from './debugAdapter/ablDebugConfigurationProvider';
import {
  DocumentationNodeProvider,
  DocViewPanel,
} from './OpenEdgeDocumentation';
import { ClassBrowserProvider } from './ClassBrowser';
import { AblOutlineProvider } from './ablOutline';
import { openInAB, openInProcEditor, runGUI } from './shared/ablRun';
import { FileInfo, ProjectInfo } from './shared/FileInfo';
import {
  loadConfigFile,
  OpenEdgeConfig,
  OpenEdgeMainConfig,
  OpenEdgeProjectConfig,
  ProfileConfig,
} from './shared/openEdgeConfigFile';
import { machineIdSync } from 'node-machine-id';
import { usernameSync } from 'username';
import { AblCompileTool } from './tools/AblCompileTool';
import { AblXrefTool } from './tools/AblXrefTool';

let client: LanguageClient;

const projects: Array<OpenEdgeProjectConfig> = new Array();
const docNodeProvider = new DocumentationNodeProvider();
let classBrowserProvider: ClassBrowserProvider;
let ablOutlineProvider: AblOutlineProvider;
let oeRuntimes: Array<any>;
let langServDebug: boolean;
let machineId = '';
let defaultProjectName: string;
let oeStatusBarItem: vscode.StatusBarItem;
let buildMode = 1;
let lastStatusAt = 0;
let statusWatchdog: ReturnType<typeof setInterval> | undefined;

interface ProjectQuickPickItem extends vscode.QuickPickItem {
  project: OpenEdgeProjectConfig;
}

export class AblDebugAdapterDescriptorFactory
  implements vscode.DebugAdapterDescriptorFactory
{
  public constructor(private readonly env?: any) {}

  async createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined,
  ): Promise<vscode.DebugAdapterDescriptor> {
    const debugAdapterDebug = vscode.workspace
      .getConfiguration('abl')
      .get('debugAdapterDebug');
    const debugAdapterTrace = vscode.workspace
      .getConfiguration('abl')
      .get('debugAdapterTrace');
    const defaultExecOptions = [
      '-jar',
      path.join(__dirname, '../resources/abl-lsda.jar'),
      '--debug-adapter',
    ];
    const debugAdapterOptionsFromSettings = vscode.workspace
      .getConfiguration('abl')
      .get('debugAdapterJavaArgs', []);
    const extraArgs = vscode.workspace
      .getConfiguration('abl')
      .get('debugAdapterExtraJavaArgs', '')
      .trim()
      .split(' ')
      .filter((str) => str !== '');
    const execOptions0 = debugAdapterDebug
      ? defaultExecOptions.concat('--debug')
      : defaultExecOptions;
    const execOptions1 = debugAdapterTrace
      ? execOptions0.concat('--trace')
      : execOptions0;
    const execOptions2 =
      debugAdapterOptionsFromSettings.length == 0
        ? extraArgs.concat(execOptions1)
        : debugAdapterOptionsFromSettings;

    const langServExecutable = getJavaExecutable();
    if (!fs.existsSync(langServExecutable)) {
      const msg = `Java executable not found: ${langServExecutable}`;
      outputChannel.error(`ABL Debug Adapter - ${msg}`);
      throw new Error(`Unable to start debug adapter, ${msg}`);
    }
    outputChannel.info(
      `ABL Debug Adapter - Command line: ${langServExecutable} ${execOptions2.join(' ')}`,
    );
    return new vscode.DebugAdapterExecutable(langServExecutable, execOptions2, {
      env: this.env,
    });
  }
}

export function activate(ctx: vscode.ExtensionContext) {
  try {
    machineId = machineIdSync(true);
  } catch {
    outputChannel.warn('Could not retrieve machine ID');
  }

  readGlobalOpenEdgeRuntimes();

  const currentVersion = ctx.extension.packageJSON.version as string;
  const lastVersion = ctx.globalState.get<string>('whatsNewVersion') || '0.0.0';
  if (currentVersion >= '1.32.0' && lastVersion < currentVersion) {
    ctx.globalState.update('whatsNewVersion', currentVersion);
    showWhatsNew(ctx, currentVersion);
  }

  readWorkspaceOEConfigFiles();

  client = createLanguageClient();

  // Show status bar
  oeStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  oeStatusBarItem.text = 'No ABL Language Server';
  oeStatusBarItem.tooltip = 'ABL plugin status';
  oeStatusBarItem.show();
  oeStatusBarItem.command = 'abl.changeBuildMode';
  ctx.subscriptions.push(oeStatusBarItem);

  // Monitor configuration changes
  vscode.workspace.onDidChangeConfiguration((event) => {
    readGlobalOpenEdgeRuntimes();
  });
  // Monitor changes in all openedge-project.json files
  vscode.workspace
    .createFileSystemWatcher('**/openedge-project.json')
    .onDidChange((uri) => readOEConfigFile(uri));

  fs.readFile(
    path.join(__dirname, '../resources/grammar-version.txt'),
    (err, data) => {
      outputChannel.info(`TextMate grammar version: ${data.toString().trim()}`);
    },
  );

  registerCommands(ctx);
  vscode.debug.registerDebugAdapterDescriptorFactory(
    'abl',
    new AblDebugAdapterDescriptorFactory({ ...process.env }),
  );

  // Return extension entrypoints
  return {
    async getProjectInfo(uri: string) {
      return await client.sendRequest('proparse/projectInfo', {
        projectUri: uri,
      });
    },
    async getFileInfo(uri: string) {
      return await client.sendRequest('proparse/fileInfo', { fileUri: uri });
    },
    async compile(uri: string) {
      return await client.sendRequest('proparse/compileFile', { fileUri: uri });
    },
    async getSchema(uri: string) {
      return await client.sendRequest('proparse/schema', { projectUri: uri });
    },
    async status() {
      return await client.sendRequest('proparse/status');
    },
    async stopLanguageServer() {
      return await stopLangServer();
    },
    async restartLanguageServer() {
      return await restartLangServer();
    },
    runGUI(projectPath: string, procedure: string) {
      const cfg = getProject(projectPath);
      if (!cfg) {
        vscode.window.showInformationMessage(
          "Current buffer doesn't belong to any OpenEdge project",
        );
        return;
      }
      runGUI(procedure, cfg);
    },
    runTTY(projectPath: string, procedure: string, batchMode?: boolean) {
      const cfg = getProject(projectPath);
      if (!cfg) {
        vscode.window.showInformationMessage(
          "Current buffer doesn't belong to any OpenEdge project",
        );
        return;
      }
      if (batchMode) runBatch(procedure, cfg);
      else runTTY(procedure, cfg);
    },
  };
}

export function deactivate(): Thenable<void> | undefined {
  if (statusWatchdog !== undefined) {
    clearInterval(statusWatchdog);
    statusWatchdog = undefined;
  }
  if (!client) {
    return undefined;
  }
  return client.stop();
}

export function getProject(path: string): OpenEdgeProjectConfig | undefined {
  const srchPath =
    process.platform === 'win32' ? path.toLowerCase() + '\\' : path + '/';
  return projects.find((project) =>
    process.platform === 'win32'
      ? srchPath.startsWith(project.rootDir.toLowerCase())
      : srchPath.startsWith(project.rootDir),
  );
}

export function getProjectByName(
  name: string,
): OpenEdgeProjectConfig | undefined {
  return projects.find((project) => project.name === name);
}

function getJavaExecutable(): string {
  const extension = process.platform === 'win32' ? '.exe' : '';
  let userJavaExec = vscode.workspace
    .getConfiguration('abl')
    .get('langServerJavaExecutable') as string;
  if (
    userJavaExec &&
    !fs.existsSync(userJavaExec) &&
    fs.existsSync(userJavaExec + extension)
  ) {
    userJavaExec += extension;
  }

  const bundledJavaExec = fs.existsSync(path.join(__dirname, '../jre'))
    ? path.join(__dirname, '../jre/bin/java' + extension)
    : undefined;

  if (userJavaExec) return userJavaExec;
  else if (bundledJavaExec) return bundledJavaExec;
  else return 'java';
}

function createLanguageClient(): LanguageClient {
  // For debugger: add '-Xdebug', '-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=8000,quiet=y'
  const defaultExecOptions = [
    '-jar',
    path.join(__dirname, '../resources/abl-lsda.jar'),
  ];

  const langServOptionsFromSettings = vscode.workspace
    .getConfiguration('abl')
    .get('langServerJavaArgs', []);
  const extraArgs = vscode.workspace
    .getConfiguration('abl')
    .get('langServerExtraJavaArgs', '')
    .trim()
    .split(' ')
    .filter((str) => str !== '');
  const execOptions0 = langServDebug
    ? defaultExecOptions.concat('--debug')
    : defaultExecOptions;
  const execOptions1 = vscode.workspace
    .getConfiguration('abl')
    .get('langServerTrace')
    ? execOptions0.concat('--trace')
    : execOptions0;
  const execOptions2 =
    langServOptionsFromSettings.length == 0
      ? extraArgs.concat(execOptions1)
      : langServOptionsFromSettings;
  const langServExecutable = getJavaExecutable();

  outputChannel.info(
    `ABL Language Server - Command line: ${langServExecutable} ${execOptions2.join(' ')}`,
  );
  const serverExec: Executable = {
    command: langServExecutable,
    args: execOptions2,
  };
  const serverOptions: ServerOptions = serverExec;

  // StructuredClone doesn't work with vscode workspace configuration objects, so we need to create a deep copy of the relevant configuration part
  const ablConfig = JSON.parse(
    JSON.stringify(vscode.workspace.getConfiguration('abl')),
  );
  ablConfig.formatter ??= {};
  ablConfig.inlayHints ??= {};

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    outputChannel: lsOutputChannel,
    initializationOptions: {
      abl: ablConfig,
      remoteName: vscode.env.remoteName,
      machineId: machineId,
      user: usernameSync(),
    },
    documentSelector: [
      { scheme: 'file', language: 'abl' },
      { scheme: 'untitled', language: 'abl' },
    ],
    synchronize: {
      configurationSection: 'abl',
      fileEvents: vscode.workspace.createFileSystemWatcher(
        '**/openedge-project.properties',
      ),
    },
    middleware: {
      provideHover: async (document, position, token, next) => {
        const hover = await next(document, position, token);
        if (hover) {
          hover.contents = hover.contents.map((content) => {
            if (content instanceof vscode.MarkdownString) {
              content.isTrusted = { enabledCommands: ['abl.openDocEntry'] };
              content.supportThemeIcons = true;
            }
            return content;
          });
        }
        return hover;
      },
    },
  };

  const tmp = new LanguageClient(
    'ablLanguageServer',
    'ABL Language Server',
    serverOptions,
    clientOptions,
  );
  tmp.onNotification('proparse/status', (statusParams: any) => {
    lastStatusAt = Date.now();
    oeStatusBarItem.backgroundColor = undefined;
    const numProjects = statusParams.projects.length;
    let str = '';
    if (numProjects == 0) str = 'No projects found';
    else if (numProjects > statusParams.numInitializedProjects)
      str =
        'Project init: ' +
        statusParams.numInitializedProjects +
        '/' +
        numProjects;
    else str = numProjects + ' project(s)';
    str += ' • ' + statusParams.pendingTasks + ' task(s)';
    oeStatusBarItem.text = str;

    oeStatusBarItem.tooltip =
      'Build mode: ' +
      buildModeName(buildMode) +
      '\n' +
      statusParams.projects.join('\n');
  });

  statusWatchdog = setInterval(() => {
    if (lastStatusAt > 0 && Date.now() - lastStatusAt > 10_000) {
      oeStatusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground',
      );
      oeStatusBarItem.text =
        '$(warning) ABL LS';
    }
  }, 5_000);
  tmp.onRequest('proparse/identifier', (requestParams: any) => {
    return machineIdSync(true);
  });

  return tmp;
}

function openDocumentationEntry(uri: string): void {
  DocViewPanel.createOrShow(uri);
}

function switchDocTo122(): void {
  docNodeProvider.updateMode(2);
  docNodeProvider.refresh();
  vscode.commands.executeCommand('setContext', 'oeDoc.mode', 2);
}

function switchDocTo128(): void {
  docNodeProvider.updateMode(3);
  docNodeProvider.refresh();
  vscode.commands.executeCommand('setContext', 'oeDoc.mode', 3);
}

function switchDocTo130(): void {
  docNodeProvider.updateMode(4);
  docNodeProvider.refresh();
  vscode.commands.executeCommand('setContext', 'oeDoc.mode', 4);
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
  const copy = [params].flat().reverse();
  const projectDir = copy.find(
    (it) => fs.existsSync(it) && fs.statSync(it).isDirectory(),
  );
  return projectDir || '';
}

function getDlcDir(params: any[]): string {
  const projectDir = getDirectoryFromArgs(params);
  if (projectDir === '') {
    vscode.window.showErrorMessage('Invalid argument passed to getDlcDir');
    return '';
  }
  const cfg = getProject(projectDir);
  if (!cfg) {
    const defaultRuntime = oeRuntimes.find((runtime) => runtime.default);
    if (!defaultRuntime)
      vscode.window.showErrorMessage(
        'No OpenEdge project found for launch configuration in ' + projectDir,
      );
    return defaultRuntime ? defaultRuntime.path : '';
  }

  return cfg.dlc;
}

async function getPropath(params: any[]): Promise<string | undefined> {
  const projectDir = getDirectoryFromArgs(params);
  if (projectDir === '') {
    vscode.window.showErrorMessage('Invalid argument passed to getPropath');
    return undefined;
  }

  const result = (await client.sendRequest('proparse/projectInfo', {
    projectUri: vscode.Uri.file(projectDir).toString(),
  })) as ProjectInfo;
  if (result?.propath && result.propath != '') {
    if (process.platform === 'win32') return result.propath;
    else return result.propath.replace(',', ':');
  } else {
    return '';
  }
}

async function getSourceDirs(params: string[]): Promise<string | undefined> {
  const projectDir = getDirectoryFromArgs(params);
  if (projectDir === '') {
    vscode.window.showErrorMessage('Invalid argument passed to getSourceDirs');
    return undefined;
  }

  const result = (await client.sendRequest('proparse/projectInfo', {
    projectUri: vscode.Uri.file(projectDir).toString(),
  })) as ProjectInfo;
  if (result?.buildDirs && result.sourceDirs != '') {
    return result.sourceDirs;
  } else {
    return '';
  }
}

async function getBuildDirs(params: string[]): Promise<string | undefined> {
  const projectDir = getDirectoryFromArgs(params);
  if (projectDir === '') {
    vscode.window.showErrorMessage('Invalid argument passed to getBuildDirs');
    return undefined;
  }

  const result = (await client.sendRequest('proparse/projectInfo', {
    projectUri: vscode.Uri.file(projectDir).toString(),
  })) as ProjectInfo;
  if (result?.buildDirs && result.buildDirs != '') {
    return result.buildDirs;
  } else {
    return '';
  }
}

async function getRelativePath(): Promise<string | undefined> {
  if (vscode.window.activeTextEditor == undefined) {
    vscode.window.showErrorMessage('getRelativePath error: no active buffer');
    return undefined;
  }

  const result = (await client.sendRequest('proparse/fileInfo', {
    fileUri: vscode.window.activeTextEditor.document.uri.toString(),
  })) as FileInfo;
  if (result?.relativePath && result.relativePath != '') {
    return result.relativePath;
  } else {
    // Fall back to full path if file does not belong to any project
    return vscode.window.activeTextEditor.document.fileName;
  }
}

function setDefaultProject(): void {
  if (projects.length < 2) {
    vscode.window.showWarningMessage(
      'Default project can only be set when multiple projects are opened',
    );
    return;
  }

  const list = projects.map((project) => ({
    label: project.name,
    description: project.rootDir,
    project: project,
  }));
  list.sort((a, b) => a.label.localeCompare(b.label));
  const quickPick = vscode.window.createQuickPick();
  quickPick.canSelectMany = false;
  quickPick.title = 'Choose default project:';
  quickPick.items = list;
  quickPick.onDidAccept(() => {
    quickPick.hide();
    vscode.workspace
      .getConfiguration('abl')
      .update(
        'defaultProject',
        quickPick.selectedItems[0].label,
        vscode.ConfigurationTarget.Workspace,
      );
  });
  quickPick.show();
}

function dumpLangServStatus(): void {
  client.sendNotification('proparse/dumpStatus', {});
}

function stopLangServer(): Promise<void> {
  outputChannel.info('Received request to stop ABL Language Server');
  return client.stop(5000).then(() => {
    oeStatusBarItem.text = 'No ABL Language Server';
    oeStatusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground',
    );
  });
}

function restartLangServer(): Promise<void> {
  outputChannel.info('Received request to restart ABL Language Server');
  const fn = () => {
    client = createLanguageClient();
    outputChannel.info('Starting new ABL Language Server');
    return client.start();
  };

  if (client.isRunning()) {
    return client
      .stop(5000)
      .then(() => {
        outputChannel.info('ABL Language Server stopped');
        oeStatusBarItem.text = 'No ABL Language Server';
        oeStatusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground',
        );
      })
      .then(fn)
      .catch((error_) => {
        outputChannel.info(
          "ABL Language Server didn't stop correctly: " + error_,
        );
        throw error_;
      });
  } else {
    return fn();
  }
}

function switchProfile(project: OpenEdgeProjectConfig): void {
  const list = Array.from(project.profiles.keys()).map((key) => ({
    label: key,
    description:
      key == 'default' && project.defaultProfileDisplayName
        ? project.defaultProfileDisplayName
        : '',
  }));
  const quickPick = vscode.window.createQuickPick();
  quickPick.canSelectMany = false;
  quickPick.title = 'Switch project to profile:';
  quickPick.items = list;
  quickPick.onDidChangeSelection(([{ label }]) => {
    quickPick.hide();
    const vsCodeDir = path.join(project.rootDir, '.vscode');
    fs.mkdirSync(vsCodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vsCodeDir, 'profile.json'),
      JSON.stringify({ profile: label }),
    );
    project.activeProfile = label;
    restartLangServer();
  });
  quickPick.show();
}

function compileBuffer() {
  if (vscode.window.activeTextEditor == undefined) return;

  client
    .sendRequest<any>('proparse/compileBuffer', {
      bufferUri: vscode.window.activeTextEditor.document.uri.toString(),
      buffer: vscode.window.activeTextEditor.document.getText(),
    })
    .then((result) => {
      if (result.success === false) {
        vscode.window.showErrorMessage('Compile buffer failed');
      } else {
        vscode.window.showInformationMessage('Syntax is correct');
      }
    });
}

function debugListingLine() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }

  vscode.window
    .showInputBox({
      title: 'Enter debug listing line number:',
      prompt: 'Go To Source Line',
    })
    .then((input) => {
      if (input && vscode.window.activeTextEditor)
        client.sendNotification('proparse/showDebugListingLine', {
          fileUri: vscode.window.activeTextEditor.document.uri.toString(),
          lineNumber: Number.parseInt(input),
        });
    });
}

function dumpFileStatus() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }

  client.sendNotification('proparse/dumpFileStatus', {
    fileUri: vscode.window.activeTextEditor.document.uri.toString(),
  });
}

function preprocessFile() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }

  client
    .sendRequest('proparse/preprocess', {
      fileUri: vscode.window.activeTextEditor.document.uri.toString(),
    })
    .then((result: any) => {
      if (result.fileName === '')
        vscode.window.showErrorMessage(
          'Error during preprocess: ' + result.message,
        );
      else {
        vscode.window.showTextDocument(vscode.Uri.file(result.fileName));
        if (!result.success)
          vscode.window.showWarningMessage(
            "COMPILE ... PREPROCESS didn't succeed, preprocessed file is probably invalid: " +
              result.message,
          );
      }
    });
}

function generateListing() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }

  client
    .sendRequest('proparse/listing', {
      fileUri: vscode.window.activeTextEditor.document.uri.toString(),
    })
    .then((result: any) => {
      if (result.fileName === '')
        vscode.window.showErrorMessage(
          'Error during listing generation: ' + result.message,
        );
      else {
        vscode.window.showTextDocument(vscode.Uri.file(result.fileName));
        if (!result.success)
          vscode.window.showWarningMessage(
            "COMPILE ... LISTING didn't succeed, listing file is probably invalid: " +
              result.message,
          );
      }
    });
}

function generateDebugListing() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }

  client
    .sendRequest('proparse/debugListing', {
      fileUri: vscode.window.activeTextEditor.document.uri.toString(),
    })
    .then((result: any) => {
      if (result.fileName === '')
        vscode.window.showErrorMessage(
          'Error during debuglisting generation: ' + result.message,
        );
      else {
        vscode.window.showTextDocument(vscode.Uri.file(result.fileName));
        if (!result.success)
          vscode.window.showWarningMessage(
            "COMPILE ... DEBUG-LISTING didn't succeed, debug listing file is probably invalid: " +
              result.message,
          );
      }
    });
}

function generateXref() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }
  client
    .sendRequest('proparse/xref', {
      fileUri: vscode.window.activeTextEditor.document.uri.toString(),
    })
    .then((result: any) => {
      if (result.fileName === '')
        vscode.window.showErrorMessage(
          'Error during XREF generation: ' + result.message,
        );
      else {
        vscode.window.showTextDocument(vscode.Uri.file(result.fileName));
        if (!result.success)
          vscode.window.showWarningMessage(
            "COMPILE ... XREF didn't succeed, xref file is probably invalid: " +
              result.message,
          );
      }
    });
}

function generateXrefAndJumpToCurrentLine() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }

  const currentEditor = vscode.window.activeTextEditor;
  const currentLine = currentEditor.selection.active.line + 1; // Convert to 1-based line number
  const currentFile = currentEditor.document.uri.fsPath;

  client
    .sendRequest('proparse/xref', {
      fileUri: vscode.window.activeTextEditor.document.uri.toString(),
    })
    .then((anyValue: any) => {
      if (anyValue.fileName === '') {
        vscode.window.showErrorMessage(
          'Error during XREF generation: ' + anyValue.message,
        );
      } else {
        if (!anyValue.success)
          vscode.window.showWarningMessage(
            "COMPILE ... XREF didn't succeed, xref file is probably invalid: " +
              anyValue.message,
          );
        vscode.window
          .showTextDocument(vscode.Uri.file(anyValue.fileName))
          .then(async (editor) => {
            const result = await getXrefLineSelectionForSourceLine(
              currentFile,
              anyValue.fileName,
              currentLine,
            );
            if (result === null) {
              vscode.window.showWarningMessage('XREF line mapping failed');
              return;
            }
            const startPosition = new vscode.Position(result.start, 0);
            const endPosition = new vscode.Position(
              result.start + result.count - 1,
              1000,
            );
            editor.selection = new vscode.Selection(startPosition, endPosition);
            editor.revealRange(
              new vscode.Range(startPosition, endPosition),
              vscode.TextEditorRevealType.InCenter,
            );
          });
      }
    });
}

async function getXrefLineSelectionForSourceLine(
  sourceFile: string,
  xrefFile: string,
  targetSourceLineNumber: number,
): Promise<{ start: number; count: number } | null> {
  const sourceBasename = path.basename(path.normalize(sourceFile));
  const xrefContent = fs.readFileSync(xrefFile, 'utf8');

  if (xrefContent.at(-1) !== '\n') {
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
      const sourceLineNumber = Number.parseInt(parts[1]);
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
  return { start: closestXrefLineNumber, count: matchCount };
}

function generateXmlXref() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }

  client
    .sendRequest('proparse/xmlXref', {
      fileUri: vscode.window.activeTextEditor.document.uri.toString(),
    })
    .then((result: any) => {
      if (result.fileName === '')
        vscode.window.showErrorMessage(
          'Error during XML XREF generation: ' + result.message,
        );
      else {
        vscode.window.showTextDocument(vscode.Uri.file(result.fileName));
        if (!result.success)
          vscode.window.showWarningMessage(
            "COMPILE ... XML XREF didn't succeed, xml xref file is probably invalid: " +
              result.message,
          );
      }
    });
}

function fixUpperCasing() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }
  client.sendRequest('proparse/fixCasing', {
    upper: true,
    fileUri: vscode.window.activeTextEditor.document.uri.toString(),
  });
}

function fixLowerCasing() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }

  client.sendRequest('proparse/fixCasing', {
    upper: false,
    fileUri: vscode.window.activeTextEditor.document.uri.toString(),
  });
}

function expandKeywords() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }
  client.sendRequest('proparse/expandKeywords', {
    fileUri: vscode.window.activeTextEditor.document.uri.toString(),
  });
}

function organizeUsings() {
  if (vscode.window.activeTextEditor == undefined) return;
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }

  client.sendRequest('proparse/organizeUsing', {
    fileUri: vscode.window.activeTextEditor.document.uri.toString(),
  });
}

function generateCatalog() {
  if (projects.length == 1) {
    executeGenCatalog(projects[0]);
    vscode.window.showInformationMessage(
      'Assembly catalog generation started. This operation can take several minutes. Check .builder/catalog.json and .builder/assemblyCatalog.log.',
    );
  } else if (projects.length > 1) {
    const list = projects.map((project) => ({
      label: project.name,
      description: project.rootDir,
      project: project,
    }));
    list.sort((a, b) => a.label.localeCompare(b.label));

    const quickPick = vscode.window.createQuickPick<ProjectQuickPickItem>();
    quickPick.canSelectMany = false;
    quickPick.title = 'Generate assembly catalog - Select project:';
    quickPick.items = list;
    quickPick.onDidAccept(() => {
      quickPick.hide();
      executeGenCatalog(quickPick.selectedItems[0].project);
      vscode.window.showInformationMessage(
        'Assembly catalog generation started. This operation can take several minutes. Check .builder/catalog.json and .builder/assemblyCatalog.log.',
      );
    });
    quickPick.show();
  }
}

function switchProfileCmd() {
  if (projects.length == 1) {
    switchProfile(projects[0]);
  } else if (projects.length > 1) {
    const list = projects.map((project) => ({
      label: project.name,
      description: project.rootDir,
      project: project,
    }));
    list.sort((a, b) => a.label.localeCompare(b.label));

    const quickPick = vscode.window.createQuickPick<ProjectQuickPickItem>();
    quickPick.canSelectMany = false;
    quickPick.title = 'Select project:';
    quickPick.items = list;
    quickPick.onDidAccept(() => {
      quickPick.hide();
      switchProfile(quickPick.selectedItems[0].project);
    });
    quickPick.show();
  }
}

function rebuildProject() {
  if (projects.length == 1) {
    client.sendRequest('proparse/rebuildProject', {
      projectUri: projects[0].uri.toString(),
    });
  } else {
    const list = projects.map((project) => ({
      label: project.name,
      description: project.rootDir,
      project: project,
    }));
    list.sort((a, b) => a.label.localeCompare(b.label));

    const quickPick = vscode.window.createQuickPick<ProjectQuickPickItem>();
    quickPick.canSelectMany = false;
    quickPick.title = 'Rebuild project:';
    quickPick.items = list;
    quickPick.onDidAccept(() => {
      quickPick.hide();
      client.sendRequest('proparse/rebuildProject', {
        projectUri: quickPick.selectedItems[0].project.uri.toString(),
      });
    });
    quickPick.show();
  }
}

function openDataDictionaryCmd() {
  if (projects.length == 1) {
    openDataDictionary(projects[0]);
  } else {
    const list = projects.map((project) => ({
      label: project.name,
      description: project.rootDir,
      project: project,
    }));
    list.sort((a, b) => a.label.localeCompare(b.label));

    const quickPick = vscode.window.createQuickPick<ProjectQuickPickItem>();
    quickPick.canSelectMany = false;
    quickPick.title = 'Open Data Dictionary - Select project:';
    quickPick.items = list;
    quickPick.onDidAccept(() => {
      quickPick.hide();
      openDataDictionary(quickPick.selectedItems[0].project);
    });
    quickPick.show();
  }
}

function openInAppbuilder() {
  if (vscode.window.activeTextEditor?.document.languageId !== 'abl') {
    vscode.window.showWarningMessage(
      'Open in AppBuilder: no OpenEdge procedure selected',
    );
    return;
  }
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }
  const cfg2 = cfg.profiles.get(cfg.activeProfile);
  if (!cfg2) {
    vscode.window.showInformationMessage(
      "Current buffer's project doesn't have an active profile",
    );
    return;
  }
  openInAB(
    vscode.window.activeTextEditor.document.uri.fsPath,
    cfg.rootDir,
    cfg2,
  );

  const closeEditor = vscode.workspace
    .getConfiguration('abl')
    .get('closeEditorAfterOpenExternal', true);
  if (closeEditor) {
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }
}

function openInProcedureEditor() {
  if (vscode.window.activeTextEditor?.document.languageId !== 'abl') {
    vscode.window.showWarningMessage(
      'Open in procedure editor: no OpenEdge procedure selected',
    );
    return;
  }
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }
  const cfg2 = cfg.profiles.get(cfg.activeProfile);
  if (!cfg2) {
    vscode.window.showInformationMessage(
      "Current buffer's project doesn't have an active profile",
    );
    return;
  }
  openInProcEditor(
    vscode.window.activeTextEditor.document.uri.fsPath,
    cfg.rootDir,
    cfg2,
  );

  const closeEditor = vscode.workspace
    .getConfiguration('abl')
    .get('closeEditorAfterOpenExternal', true);
  if (closeEditor) {
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }
}

function runCurrentFile() {
  if (vscode.window.activeTextEditor?.document.languageId !== 'abl') {
    vscode.window.showWarningMessage(
      'Run current file: no OpenEdge procedure selected',
    );
    return;
  }
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }
  runTTY(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
}

function runCurrentFileBatch() {
  if (vscode.window.activeTextEditor?.document.languageId !== 'abl') {
    vscode.window.showWarningMessage(
      'Run current file: no OpenEdge procedure selected',
    );
    return;
  }
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }
  runBatch(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
}

function runCurrentFileProwin() {
  if (vscode.window.activeTextEditor?.document.languageId !== 'abl') {
    vscode.window.showWarningMessage(
      'Run current file: no OpenEdge procedure selected',
    );
    return;
  }
  const cfg = getProject(vscode.window.activeTextEditor.document.uri.fsPath);
  if (!cfg) {
    vscode.window.showInformationMessage(
      "Current buffer doesn't belong to any OpenEdge project",
    );
    return;
  }
  runGUI(vscode.window.activeTextEditor.document.uri.fsPath, cfg);
}

function buildModeName(val: number) {
  if (val == 1) return 'Build everything';
  else if (val == 2) return 'Classes only';
  else if (val == 3) return 'Modified files only';
  else if (val == 4) return 'No build';
}

function changeBuildModeCmd() {
  interface BuildModeQuickPick extends vscode.QuickPickItem {
    value: number;
  }
  const quickPick = vscode.window.createQuickPick<BuildModeQuickPick>();
  quickPick.canSelectMany = false;
  quickPick.title = 'Choose build mode:';
  quickPick.items = [
    {
      label: 'Build everything',
      description:
        'Scan all source code at startup, build if not up to date, and build when any source changed',
      value: 1,
    },
    {
      label: 'Classes only',
      description:
        'Scan all source code at startup, build only classes if not up to date, and build when any source changed',
      value: 2,
    },
    {
      label: 'Modified files only',
      description:
        "Scan all source code at startup, don't rebuild anything, build only when any source changed",
      value: 3,
    },
    {
      label: 'No build',
      description: 'Scan all source code at startup, never build anything',
      value: 4,
    },
  ];
  const currentItem = quickPick.items.find((item) => item.value === buildMode);
  if (currentItem) {
    quickPick.activeItems = [currentItem];
  }

  quickPick.onDidAccept(() => {
    quickPick.hide();
    buildMode = quickPick.selectedItems[0].value;
    vscode.workspace
      .getConfiguration('abl')
      .update(
        'buildMode',
        quickPick.selectedItems[0].value,
        vscode.ConfigurationTarget.Workspace,
      );
    vscode.window.showInformationMessage(
      'ABL build mode changed to ' + quickPick.selectedItems[0].label,
    );
  });
  quickPick.show();
}

function generateProenvStartUnix(path: string) {
  let scriptContent = '#!/bin/sh\n\n';
  if (projects.length > 1) {
    // Multiple projects, one entry per project
    scriptContent += 'echo Choose project:\n';
    scriptContent += 'echo ===============\n';

    let responseHandler = '';
    projects.forEach((prj, index) => {
      scriptContent +=
        'echo   "* ' + (index + 1) + ' => ' + prj.rootDir + '"\n';
      const cfg = prj.profiles.get(prj.activeProfile);
      const x2 = cfg.dlc + '/bin/proenv';
      responseHandler +=
        (index == 0 ? 'if' : 'elif') +
        ' [ "${answer}" = "' +
        (index + 1) +
        '" ] ; then ( cd "' +
        prj.rootDir +
        '" && source "' +
        x2 +
        '" ) ; \n';
    });
    responseHandler += 'else ( echo Invalid choice ) ; fi \n';
    scriptContent += 'echo \n';
    scriptContent += "read -p 'Your choice: ' answer\n";
    scriptContent += responseHandler;
  } else if (projects.length == 1) {
    // One project, go directly to proenv
    const cfg = projects[0].profiles.get(projects[0].activeProfile);
    const x2 = cfg.dlc + '/bin/proenv';
    scriptContent += x2 + '\n';
  } else {
    // No OE projects, just offer all proenv
    let responseHandler = '';
    scriptContent += 'echo No projects configured, choose OE version:\n';
    scriptContent += 'echo ==========================================\n';
    oeRuntimes.forEach((runtime, index) => {
      scriptContent +=
        'echo "* ' + (index + 1) + ' => ' + runtime.path + '" \n';
      responseHandler +=
        (index == 0 ? 'if' : 'elif') +
        ' [ "${answer}" = "' +
        (index + 1) +
        '" ] ; then ( "' +
        runtime.path +
        '/bin/proenv" ) ; \n';
    });
    responseHandler += 'else ( echo Invalid choice ) ; fi \n';
    scriptContent += 'echo \n';
    scriptContent += "read -p 'Your choice: ' answer\n";
    scriptContent += responseHandler;
  }
  scriptContent += 'exit 0\n';

  // outputChannel.info(scriptContent)

  fs.writeFileSync(path, scriptContent, { mode: 0o700 });
}

function generateProenvStartWindows(path: string) {
  let scriptContent = '@echo off & setlocal\r\n';
  if (projects.length > 1) {
    // Multiple projects, one entry per project
    scriptContent += 'echo Choose project:\r\n';
    scriptContent += 'echo ===============\r\n';

    let responseHandler = '';
    let labels = 'echo Invalid choice\r\ngoto stdexit\r\n';
    projects.forEach((prj, index) => {
      scriptContent +=
        'echo   ^* ' + (index + 1) + ' =^> ' + prj.rootDir + '\r\n';
      const cfg = prj.profiles.get(prj.activeProfile);
      const x2 = cfg.dlc + '\\bin\\proenv.bat';
      responseHandler +=
        'if /i "%answer%" == "' +
        (index + 1) +
        '" goto choice' +
        (index + 1) +
        '\r\n';
      labels +=
        ':choice' +
        (index + 1) +
        ':\r\npushd "' +
        prj.rootDir +
        '" && call "' +
        x2 +
        '" && popd\ngoto stdexit\r\n';
    });
    scriptContent += 'echo.\r\n';
    scriptContent += 'set /P answer=Your choice: \r\n';
    scriptContent += responseHandler;
    scriptContent += labels;
  } else if (projects.length == 1) {
    // One project, go directly to proenv
    const cfg = projects[0].profiles.get(projects[0].activeProfile);
    const x2 = cfg.dlc + '\\bin\\proenv.bat';
    scriptContent += 'call ' + x2 + ' && goto stdexit \r\n';
  } else {
    // No OE projects, just offer all proenv
    scriptContent += 'echo No projects configured, choose OE version:\r\n';
    scriptContent += 'echo ==========================================\r\n';

    let responseHandler = '';
    const labels = 'echo Invalid choice\r\ngoto stdexit\r\n';
    oeRuntimes.forEach((runtime, index) => {
      scriptContent +=
        'echo ^* ' + (index + 1) + ' =^> ' + runtime.path + ' \r\n';
      responseHandler +=
        'if /i "%answer%" == "' +
        (index + 1) +
        '" ( call "' +
        runtime.path +
        '\\bin\\proenv.bat" && goto stdexit )\r\n';
    });
    scriptContent += 'echo.\r\n';
    scriptContent += 'set /P answer=Your choice: \r\n';
    scriptContent += responseHandler;
    scriptContent += labels;
  }
  scriptContent += ':stdexit\r\n';
  scriptContent += 'pause\r\nexit /b 0\r\n';

  fs.writeFileSync(path, scriptContent);
}

function compileFromExplorer(uri: vscode.Uri, uris?: vscode.Uri[]) {
  const targets = uris && uris.length > 0 ? uris : [uri];
  for (const uri of targets) {
    client.sendRequest('proparse/buildResource', {
      uri: uri.toString(),
      forceBuild: false,
    });
  }
}

function stripAppbuilderMarkup(uri: vscode.Uri, uris?: vscode.Uri[]) {
  if (uri) {
    const targets = uris && uris.length > 0 ? uris : [uri];
    for (const target of targets) {
      client.sendRequest('proparse/stripAppBuilderMarkup', {
        fileUri: target.toString(),
      });
    }
  } else {
    if (vscode.window.activeTextEditor == undefined) return;
    client.sendRequest('proparse/stripAppBuilderMarkup', {
      fileUri: vscode.window.activeTextEditor.document.uri.toString(),
    });
  }
}

async function toggleLineComment() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const doc = editor.document;
  const selectedLines = new Set<number>();
  for (const sel of editor.selections) {
    const startLine = sel.start.line;
    const endLine =
      !sel.isEmpty && sel.end.character === 0 && sel.end.line > sel.start.line
        ? sel.end.line - 1
        : sel.end.line;
    for (let i = startLine; i <= endLine; i++) selectedLines.add(i);
  }

  const nonEmptyLines = Array.from(selectedLines).filter(
    (ln) => doc.lineAt(ln).text.trim().length > 0,
  );
  const allBlockComments =
    nonEmptyLines.length > 0 &&
    nonEmptyLines.every((ln) => {
      const trimmed = doc.lineAt(ln).text.trim();
      return trimmed.startsWith('/*') && trimmed.endsWith('*/');
    });

  if (allBlockComments) {
    await editor.edit((editBuilder) => {
      for (const ln of selectedLines) {
        const line = doc.lineAt(ln);
        if (line.text.trim().length === 0) continue;
        const text = line.text;
        const startIdx = text.indexOf('/*');
        const endIdx = text.lastIndexOf('*/');
        const indentation = text.slice(0, startIdx);
        const inner = text.slice(startIdx + 2, endIdx).trim();
        editBuilder.replace(line.range, (indentation + inner).trimEnd());
      }
    });
  } else {
    await vscode.commands.executeCommand('editor.action.commentLine');
  }
}

function registerCommands(ctx: vscode.ExtensionContext) {
  vscode.window.registerTerminalProfileProvider('proenv.terminal-profile', {
    provideTerminalProfile(): vscode.ProviderResult<vscode.TerminalProfile> {
      if (process.platform === 'win32') {
        const prmFileName = path.join(
          tmpdir(),
          'proenv-' + crypto.randomBytes(16).toString('hex') + '.bat',
        );
        generateProenvStartUnix(prmFileName);
        generateProenvStartWindows(prmFileName);
        return { options: { name: 'Proenv', shellPath: prmFileName } };
      } else {
        const prmFileName = path.join(
          tmpdir(),
          'proenv-' + crypto.randomBytes(16).toString('hex') + '.sh',
        );
        generateProenvStartUnix(prmFileName);
        return { options: { name: 'Proenv', shellPath: prmFileName } };
      }
    },
  });

  ctx.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      'abl',
      new AblDebugConfigurationProvider(projects),
    ),
  );

  const commands = [
    vscode.commands.registerCommand('abl.openDocEntry', openDocumentationEntry),
    vscode.commands.registerCommand('abl.docBack', () => DocViewPanel.goBack()),
    vscode.commands.registerCommand('abl.docForward', () =>
      DocViewPanel.goForward(),
    ),
    vscode.commands.registerCommand('abl.switchDocTo122', switchDocTo122),
    vscode.commands.registerCommand('abl.switchDocTo128', switchDocTo128),
    vscode.commands.registerCommand('abl.switchDocTo130', switchDocTo130),
    vscode.commands.registerCommand(
      'classBrowser.refresh',
      refreshClassBrowser,
    ),
    vscode.commands.registerCommand('abl.getRelativePath', getRelativePath),
    vscode.commands.registerCommand('abl.getDlcDirectory', getDlcDir),
    vscode.commands.registerCommand('abl.getPropath', getPropath),
    vscode.commands.registerCommand('abl.getSourceDirs', getSourceDirs),
    vscode.commands.registerCommand('abl.getBuildDirs', getBuildDirs),
    vscode.commands.registerCommand('abl.setDefaultProject', setDefaultProject),
    vscode.commands.registerCommand(
      'abl.dumpLangServStatus',
      dumpLangServStatus,
    ),
    vscode.commands.registerCommand('abl.stop.langserv', stopLangServer),
    vscode.commands.registerCommand('abl.restart.langserv', restartLangServer),
    vscode.commands.registerCommand('abl.compileBuffer', compileBuffer),
    vscode.commands.registerCommand('abl.debugListingLine', debugListingLine),
    vscode.commands.registerCommand('abl.preprocess', preprocessFile),
    vscode.commands.registerCommand('abl.dumpFileStatus', dumpFileStatus),
    vscode.commands.registerCommand('abl.generateListing', generateListing),
    vscode.commands.registerCommand(
      'abl.generateDebugListing',
      generateDebugListing,
    ),
    vscode.commands.registerCommand('abl.generateXref', generateXref),
    vscode.commands.registerCommand('abl.generateXmlXref', generateXmlXref),
    vscode.commands.registerCommand(
      'abl.generateXrefAndJumpToCurrentLine',
      generateXrefAndJumpToCurrentLine,
    ),
    vscode.commands.registerCommand('abl.catalog', generateCatalog),
    vscode.commands.registerCommand('abl.fixUpperCasing', fixUpperCasing),
    vscode.commands.registerCommand('abl.fixLowerCasing', fixLowerCasing),
    vscode.commands.registerCommand('abl.expandKeywords', expandKeywords),
    vscode.commands.registerCommand('abl.organizeUsings', organizeUsings),
    vscode.commands.registerCommand(
      'abl.project.switch.profile',
      switchProfileCmd,
    ),
    vscode.commands.registerCommand('abl.project.rebuild', rebuildProject),
    vscode.commands.registerCommand(
      'abl.dataDictionary',
      openDataDictionaryCmd,
    ),
    vscode.commands.registerCommand('abl.openInAB', openInAppbuilder),
    vscode.commands.registerCommand('abl.openInProcEd', openInProcedureEditor),
    vscode.commands.registerCommand(
      'abl.runProgres.currentFile',
      runCurrentFile,
    ),
    vscode.commands.registerCommand(
      'abl.runBatch.currentFile',
      runCurrentFileBatch,
    ),
    vscode.commands.registerCommand(
      'abl.runProwin.currentFile',
      runCurrentFileProwin,
    ),
    vscode.commands.registerCommand('abl.changeBuildMode', changeBuildModeCmd),
    vscode.commands.registerCommand(
      'abl.explorer.compile',
      compileFromExplorer,
    ),
    vscode.commands.registerCommand('abl.stripMarkup', stripAppbuilderMarkup),
    vscode.commands.registerCommand(
      'ablOutline.goToSymbol',
      async (range: vscode.Range, uri?: string) => {
        if (uri) {
          // Open the document at the specified URI
          const document = await vscode.workspace.openTextDocument(
            vscode.Uri.parse(uri),
          );
          const editor = await vscode.window.showTextDocument(document);
          editor.selection = new vscode.Selection(range.start, range.start);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        } else if (vscode.window.activeTextEditor) {
          vscode.window.activeTextEditor.selection = new vscode.Selection(
            range.start,
            range.start,
          );
          vscode.window.activeTextEditor.revealRange(
            range,
            vscode.TextEditorRevealType.InCenter,
          );
        }
      },
    ),
    vscode.commands.registerCommand('abl.toggleLineComment', toggleLineComment),
  ];
  ctx.subscriptions.push(...commands);

  vscode.window.registerTreeDataProvider(
    'openEdgeDocumentation',
    docNodeProvider,
  );
  vscode.commands.executeCommand('setContext', 'oeDoc.mode', 3);
  docNodeProvider.fetchData();

  ctx.subscriptions.push(
    vscode.lm.registerTool('abl_compile', new AblCompileTool(client)),
    vscode.lm.registerTool('abl_xref', new AblXrefTool(client)),
  );

  // Register Class Browser
  classBrowserProvider = new ClassBrowserProvider(client, projects);
  vscode.window.registerTreeDataProvider('classBrowser', classBrowserProvider);

  // Register Custom Outline
  ablOutlineProvider = new AblOutlineProvider(
    client,
    ctx.extensionPath,
    ctx.globalStorageUri.fsPath,
  );
  vscode.window.registerTreeDataProvider('ablOutline', ablOutlineProvider);
}

function readOEConfigFile(uri: vscode.Uri) {
  outputChannel.info(`OpenEdge project config file found: ${uri.fsPath}`);
  const config = loadConfigFile(uri.fsPath);
  if (config) {
    const prjConfig = parseOpenEdgeProjectConfig(uri, config);
    if (prjConfig.dlc != '') {
      outputChannel.info(
        `OpenEdge project configured in ${prjConfig.rootDir} -- DLC: ${prjConfig.dlc}`,
      );
      const idx = projects.findIndex(
        (element) =>
          element.name == prjConfig.name &&
          element.version == prjConfig.version,
      );
      if (idx > -1) {
        if (projects[idx].rootDir == prjConfig.rootDir)
          projects[idx] = prjConfig;
        else {
          vscode.window.showErrorMessage(
            'Duplicate project ' +
              prjConfig.name +
              ' name in ' +
              prjConfig.rootDir +
              ' and ' +
              projects[idx].rootDir,
          );
        }
      } else {
        projects.push(prjConfig);
      }
    } else {
      outputChannel.info(
        `Skip OpenEdge project in ${prjConfig.rootDir} -- OpenEdge install not found`,
      );
    }
  } else {
    outputChannel.info(`--> Invalid config file`);
  }
}

function readWorkspaceOEConfigFiles() {
  vscode.workspace.findFiles('**/openedge-project.json').then((list) => {
    list.forEach((uri) => readOEConfigFile(uri));
    if (projects.length > 0) {
      vscode.commands.executeCommand('setContext', 'abl.isABLProject', true);
      outputChannel.info(`Now starting ABL language server...`);
      client.start();
    } else {
      outputChannel.info(`No OpenEdge projects found in workspace`);
    }
  });
}

function parseOpenEdgeProjectConfig(
  uri: vscode.Uri,
  config: OpenEdgeMainConfig,
): OpenEdgeProjectConfig {
  const prjConfig = new OpenEdgeProjectConfig();
  prjConfig.uri = vscode.Uri.parse(path.dirname(uri.path));
  prjConfig.name = config.artifactId ?? config.name ?? '';
  prjConfig.version = config.version;
  prjConfig.defaultProfileDisplayName = config.defaultProfileDisplayName;
  prjConfig.rootDir =
    vscode.Uri.parse(path.dirname(uri.path)).fsPath +
    (process.platform === 'win32' ? '\\' : '/');
  prjConfig.dlc = getDlcDirectory(config.oeversion);
  prjConfig.extraParameters = config.extraParameters
    ? config.extraParameters
    : '';
  prjConfig.oeversion = config.oeversion;
  prjConfig.gui = config.graphicalMode;
  try {
    prjConfig.propath = config.buildPath.map((str) =>
      str.path.replace('${DLC}', prjConfig.dlc),
    );
  } catch {
    prjConfig.propath = ['.']; // default the propath to the root of the workspace
  }
  prjConfig.propathMode = 'append';
  prjConfig.startupProc = '';
  prjConfig.parameterFiles = [];
  prjConfig.dbDictionary = [];
  prjConfig.dbConnections = config.dbConnections;
  prjConfig.procedures = config.procedures;

  prjConfig.profiles.set('default', prjConfig);
  if (config.profiles) {
    config.profiles.forEach((profile) => {
      const p = parseOpenEdgeConfig(profile.value);
      if (profile.inherits && prjConfig.profiles.get(profile.inherits)) {
        p.overwriteValues(prjConfig.profiles.get(profile.inherits));
      }
      p.dlc = getDlcDirectory(p.oeversion);
      prjConfig.profiles.set(profile.name, p);
    });
  }

  // Active profile
  if (fs.existsSync(path.join(prjConfig.rootDir, '.vscode', 'profile.json'))) {
    try {
      const txt = JSON.parse(
        fs.readFileSync(
          path.join(prjConfig.rootDir, '.vscode', 'profile.json'),
          { encoding: 'utf8' },
        ),
      );
      const actProf = txt['profile'];
      if (prjConfig.profiles.has(actProf)) {
        prjConfig.activeProfile = actProf;
      } else {
        prjConfig.activeProfile = 'default';
      }
    } catch (error) {
      console.error('Error parsing profile.json:', error);
      prjConfig.activeProfile = 'default';
    }
  } else {
    prjConfig.activeProfile = 'default';
  }
  return prjConfig;
}

function parseOpenEdgeConfig(cfg: OpenEdgeConfig): ProfileConfig {
  const retVal = new ProfileConfig();
  retVal.extraParameters = cfg.extraParameters;
  retVal.oeversion = cfg.oeversion;
  retVal.gui = cfg.graphicalMode;
  if (cfg.buildPath)
    retVal.propath = cfg.buildPath.map((str) =>
      str.path.replace('${DLC}', retVal.dlc),
    );
  retVal.propathMode = 'append';
  retVal.startupProc = '';
  retVal.parameterFiles = [];
  retVal.dbDictionary = [];
  retVal.dbConnections = cfg.dbConnections;
  retVal.procedures = cfg.procedures;

  return retVal;
}

function readGlobalOpenEdgeRuntimes() {
  buildMode = vscode.workspace.getConfiguration('abl').get('buildMode', 1);
  defaultProjectName = vscode.workspace
    .getConfiguration('abl')
    .get('defaultProject');
  langServDebug = vscode.workspace
    .getConfiguration('abl')
    .get('langServerDebug');
  oeRuntimes = vscode.workspace
    .getConfiguration('abl.configuration')
    .get<Array<any>>('runtimes');

  const oeRuntimesDefault = vscode.workspace
    .getConfiguration('abl')
    .get('configuration.defaultRuntime');
  if (oeRuntimesDefault != '') {
    // Set default flag on the runtime that matches the defaultRuntime setting
    oeRuntimes.forEach((runtime) => {
      //we have a default set, so ignore the default in the array
      if (runtime.name === oeRuntimesDefault) {
        runtime.default = true;
      } else {
        runtime.default = false;
      }
    });
  }

  if (oeRuntimes.length == 0) {
    vscode.window.showWarningMessage(
      'No OpenEdge runtime configured on this machine',
    );
    outputChannel.info(`No OpenEdge runtime configured on this machine`);
  }
}

function showWhatsNew(ctx: vscode.ExtensionContext, version: string): void {
  const htmlPath = path.join(ctx.extensionPath, 'resources', 'whats-new.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const panel = vscode.window.createWebviewPanel(
    'ablWhatsNew',
    `What's New in the ABL Extension 1.32.0`,
    vscode.ViewColumn.One,
    { enableScripts: false },
  );
  panel.webview.html = html;
}

function getDlcDirectory(version: string): string {
  let dlc: string = '';
  let dfltDlc: string = '';
  let dfltName: string = '';
  oeRuntimes.forEach((runtime) => {
    if (runtime.name === version) {
      dlc = runtime.path;
    }
    if (runtime.default === true) {
      dfltDlc = runtime.path;
      dfltName = runtime.name;
    }
  });
  if (dlc == '' && dfltDlc != '') {
    dlc = dfltDlc;
    outputChannel.info(
      `OpenEdge version not configured in workspace settings, using default version (${dfltName}) in user settings.`,
    );
  }
  return dlc;
}
