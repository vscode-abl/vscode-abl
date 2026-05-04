import * as fs from 'node:fs';
import * as cp from 'node:child_process';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { tmpdir } from 'node:os';

export function openDataDictionary(project: OpenEdgeProjectConfig) {
  const env = process.env;
  const currProfile = project.profiles.get(project.activeProfile);
  env.DLC = currProfile.dlc;
  const prmFileName = path.join(
    tmpdir(),
    'datadict-' + crypto.randomBytes(16).toString('hex') + '.json',
  );
  const cfgFile = {
    verbose: false,
    databases: currProfile.dbConnections,
    propath: [],
    parameters: [],
    returnValue: '',
    super: false,
    output: [],
    procedures: project.procedures,
    procedure: '_dict.p',
  };
  fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
  const prms = [
    '-clientlog',
    path.join(project.rootDir, '.builder\\dictionary.log'),
    '-p',
    path.join(__dirname, '../resources/abl-src/dynrun.p'),
    '-param',
    prmFileName,
    '-basekey',
    'INI',
    '-ininame',
    path.join(__dirname, '../resources/abl-src/empty.ini'),
  ];

  cp.spawn(
    currProfile.getExecutable(true),
    currProfile.extraParameters.split(' ').concat(prms),
    { env: env, cwd: project.rootDir, detached: true },
  );
}
