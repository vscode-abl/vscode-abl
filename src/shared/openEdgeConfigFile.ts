import * as jsonminify from 'jsonminify';
import * as path from 'path';
import * as fs from 'fs';
import { OpenEdgeFormatOptions } from '../misc/OpenEdgeFormatOptions';

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
  dumpFile: string;
  connect: string;
  aliases: string[];
}

export interface OpenEdgeMainConfig extends OpenEdgeConfig {
  // JSON mapping of openedge-project.json
  name: string;
  version: string;
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
  propath: string[]
  propathMode: 'append' | 'overwrite' | 'prepend'; // Deprecated
  startupProc: string // Deprecated
  parameterFiles: string[] // Deprecated
  dbDictionary?: string[]; // Deprecated
  test?: TestConfig; // Deprecated
  format?: OpenEdgeFormatOptions; // Deprecated
  dbConnections?: DatabaseConnection[];
  procedures: Procedure[];

  public overwriteValues(parent: ProfileConfig) {
    if (!this.oeversion) {
      this.oeversion = parent.oeversion;
      this.dlc = parent.dlc;
    }
    if (!this.extraParameters)
      this.extraParameters = parent.extraParameters;
    if (!this.gui)
      this.gui = parent.gui;
    if (!this.propath)
      this.propath = parent.propath;
    if (!this.dbConnections)
      this.dbConnections = parent.dbConnections;
    if (!this.procedures)
      this.procedures = parent.procedures;
  }

  getTTYExecutable(): string {
    if (fs.existsSync(path.join(this.dlc, 'bin', '_progres.exe')))
      return path.join(this.dlc, 'bin', '_progres.exe');
    else
      return path.join(this.dlc, 'bin', '_progres')
  }

  getExecutable(gui?: boolean): string {
    if (gui || this.gui) {
      if (fs.existsSync(path.join(this.dlc, 'bin', 'prowin.exe')))
        return path.join(this.dlc, 'bin', 'prowin.exe');
      else
        return path.join(this.dlc, 'bin', 'prowin32.exe')
    } else {
      if (fs.existsSync(path.join(this.dlc, 'bin', '_progres.exe')))
        return path.join(this.dlc, 'bin', '_progres.exe');
      else
        return path.join(this.dlc, 'bin', '_progres')
    }
  }

}

export class OpenEdgeProjectConfig extends ProfileConfig {
  activeProfile: string;
  rootDir: string;
  profiles: Map<string, ProfileConfig> = new Map<string, ProfileConfig>();

}

export async function loadConfigFile(filename: string): Promise<OpenEdgeMainConfig> {
  if (!filename) {
    return Promise.reject();
  }
  try {
    return JSON.parse(jsonminify(fs.readFileSync(filename, { encoding: 'utf8' })));
  } catch (caught) {
    return Promise.reject();
  }
}
