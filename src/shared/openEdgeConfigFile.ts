import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import { outputChannel } from '../ablStatus';

export interface TestConfig {
  files?: string[];
  beforeAll?: Command;
  afterAll?: Command;
  beforeEach?: Command;
  afterEach?: Command;
}

export interface Command {
  cmd: string;
  args?: string[];
  env?: string[];
  cwd?: string;
}

export interface OpenEdgeConfig {
  // Content of a profile section in openedge-project.json
  oeversion?: string;
  numThreads: number;
  graphicalMode?: boolean;
  extraParameters?: string;
  buildPath?: BuildPathEntry[];
  buildDirectory?: string;
  dbConnections: DatabaseConnection[];
  procedures: Procedure[];
}

export interface DatabaseConnection {
  name: string;
  schemaFile: string;
  connect: string;
  aliases: string[];
}

export interface OpenEdgeMainConfig extends OpenEdgeConfig {
  // JSON mapping of openedge-project.json
  groupId?: string;
  artifactId?: string;
  name?: string;
  version: string;
  defaultProfileDisplayName?: string;
  profiles?: OEProfile[];
}

export interface BuildPathEntry {
  type: string;
  path: string;
}

export interface Procedure {
  name: string;
  mode: string;
}
export interface OEProfile {
  name: string;
  inherits: string;
  value: OpenEdgeConfig;
}

export class ProfileConfig {
  name: string;
  version: string;
  oeversion: string;
  extraParameters: string;
  gui: Boolean;
  dlc: string;
  propath: string[];
  propathMode: 'append' | 'overwrite' | 'prepend'; // Deprecated
  startupProc: string; // Deprecated
  parameterFiles: string[]; // Deprecated
  dbDictionary?: string[]; // Deprecated
  test?: TestConfig; // Deprecated
  dbConnections?: DatabaseConnection[];
  procedures: Procedure[];

  public overwriteValues(parent: ProfileConfig) {
    if (!this.oeversion) {
      this.oeversion = parent.oeversion;
      this.dlc = parent.dlc;
    }
    if (!this.extraParameters) this.extraParameters = parent.extraParameters;
    if (!this.gui) this.gui = parent.gui;
    if (!this.propath) this.propath = parent.propath;
    if (!this.dbConnections) this.dbConnections = parent.dbConnections;
    if (!this.procedures) this.procedures = parent.procedures;
  }

  getTTYExecutable(): string {
    if (fs.existsSync(path.join(this.dlc, 'bin', '_progres.exe')))
      return path.join(this.dlc, 'bin', '_progres.exe');
    else return path.join(this.dlc, 'bin', '_progres');
  }

  getExecutable(gui?: boolean): string {
    if (gui || this.gui) {
      if (fs.existsSync(path.join(this.dlc, 'bin', 'prowin.exe')))
        return path.join(this.dlc, 'bin', 'prowin.exe');
      else return path.join(this.dlc, 'bin', 'prowin32.exe');
    } else {
      if (fs.existsSync(path.join(this.dlc, 'bin', '_progres.exe')))
        return path.join(this.dlc, 'bin', '_progres.exe');
      else return path.join(this.dlc, 'bin', '_progres');
    }
  }
}

export class OpenEdgeProjectConfig extends ProfileConfig {
  activeProfile: string;
  uri: vscode.Uri;
  rootDir: string;
  defaultProfileDisplayName: string;
  profiles: Map<string, ProfileConfig> = new Map<string, ProfileConfig>();
}

export function loadConfigFile(filename: string): OpenEdgeMainConfig {
  const raw = fs.readFileSync(filename, 'utf-8');
  const errors: jsonc.ParseError[] = [];
  const out = jsonc.parse(raw, errors);

  if (errors.length > 0) {
    vscode.window.showErrorMessage("Errors detected while reading OpenEdge configuration file", 'Open File')
      .then(action => {
        if (action === 'Open File') {
          vscode.window.showTextDocument(vscode.Uri.file(filename));
          vscode.commands.executeCommand('workbench.panel.markers.view.focus');
        }
      });
    return null;
  }

  return out;
}
