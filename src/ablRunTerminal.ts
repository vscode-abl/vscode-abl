import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { batchOutputChannel } from './ablStatus';
import { getClient } from './extension';
import { create } from './OutputChannelProcess';
import { FileInfo } from './shared/FileInfo';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';

const builderExists: { [rootDir: string]: boolean } = {};

function checkBuilderDirectoryExists(rootDir: string) {
  if (!builderExists[rootDir]) {
    const builderDir = path.join(rootDir, '.builder');
    if (!fs.existsSync(builderDir)) {
      //only check once.  restart the language server to check again
      fs.mkdirSync(builderDir);
    }
    builderExists[rootDir] = true;
  }
}

export function runTTY(filename: string, project: OpenEdgeProjectConfig) {
  checkBuilderDirectoryExists(project.rootDir);
  const currProfile = project.profiles.get(project.activeProfile);
  if (!currProfile) {
    vscode.window.showErrorMessage('No active profile found.');
    return;
  }
  const prmFileName = path.join(
    tmpdir(),
    'runtty-' + crypto.randomBytes(16).toString('hex') + '.json',
  );
  const cfgFile = {
    verbose: false,
    databases: currProfile.dbConnections,
    propath: currProfile.propath,
    parameters: [],
    returnValue: '',
    super: true,
    output: [],
    procedures: project.procedures,
    procedure: filename,
  };
  fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));

  // prettier-ignore
  const params = currProfile.extraParameters
            .split(" ")
            .filter((str) => str.length > 0)
            .concat([
                "-clientlog", path.join(project.rootDir, ".builder", "runtty.log"),
                "-p", path.join(__dirname, "../resources/abl-src/dynrun.p"),
                "-param", prmFileName,
                "-T", path.join(project.rootDir, ".builder", "tmp")
            ]);
  // Executable and arguments are passed directly to the process (no shell involved), so paths with spaces are preserved
  const terminal = vscode.window.createTerminal({
    name: 'TTY execution',
    shellPath: currProfile.getTTYExecutable(),
    shellArgs: params,
    cwd: project.rootDir,
    env: { DLC: currProfile.dlc },
  });
  terminal.show();
}

export async function runBatch(
  filename: string,
  project: OpenEdgeProjectConfig,
  debug: boolean = false,
) {
  checkBuilderDirectoryExists(project.rootDir);
  const currProfile = project.profiles.get(project.activeProfile);
  if (!currProfile) {
    vscode.window.showErrorMessage('No active profile found.');
    return;
  }

  const env = process.env;
  env.DLC = currProfile.dlc;
  env.DEBUG_MAX_WAIT = '15000';

  // When running in batch mode, we want to use the relative path of the procedure if available so breakpoints can be set on the startup procedure.
  let procedure = filename;
  try {
    const result = (await getClient().sendRequest('proparse/fileInfo', {
      fileUri: vscode.Uri.file(filename).toString(),
    })) as FileInfo;
    if (result?.relativePath) procedure = result.relativePath;
  } catch {
    // Fall back to the initial filename if the language server request fails
  }

  const prmFileName = path.join(
    tmpdir(),
    'runbatch-' + crypto.randomBytes(16).toString('hex') + '.json',
  );
  const cfgFile = {
    verbose: false,
    databases: currProfile.dbConnections,
    propath: currProfile.propath,
    parameters: [],
    returnValue: '',
    super: true,
    output: [],
    procedures: project.procedures,
    procedure: procedure,
  };
  fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));

  // prettier-ignore
  let params = currProfile.extraParameters
            .split(" ")
            .filter((str) => str.length > 0)
            .concat([
                "-b",
                "-clientlog", path.join(project.rootDir, ".builder", "runbatch.log"),
                "-p", path.join(__dirname, "../resources/abl-src/dynrun.p"),
                "-param", prmFileName,
                "-T", path.join(project.rootDir, ".builder", "tmp")
            ]);
  if (debug) {
    params = params.concat(['-debugReady', '3099']);
  }

  create(
    currProfile.getTTYExecutable(),
    params,
    { env: env, cwd: project.rootDir, detached: true },
    batchOutputChannel,
  );
}
