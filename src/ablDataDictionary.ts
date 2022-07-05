import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import * as crypto from 'crypto';
import { tmpdir } from 'os';

export function openDataDictionary(project: OpenEdgeProjectConfig) {
    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'datadict-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: project.dbConnections,
        propath: [],
        parameters: [],
        returnValue: '',
        super: false,
        output: [],
        procedure: '_dict.p'
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
    const prms = ["-clientlog", path.join(project.rootDir, ".builder\\dictionary.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName, "-basekey", "INI", "-ininame", path.join(__dirname, '../resources/abl-src/empty.ini')];

    cp.spawn(project.getExecutable(true), project.extraParameters.split(' ').concat(prms), { env: env, cwd: project.rootDir, detached: true });
}

