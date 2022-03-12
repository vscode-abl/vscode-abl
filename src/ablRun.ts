import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { outputChannel } from './ablStatus';
import { create } from './OutputChannelProcess';
import { tmpdir } from 'os';

export function runTTY(filename: string, project: OpenEdgeProjectConfig) {
    outputChannel.clear();

    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'runtty-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: project.dbConnections.map(str => { const obj = {}; obj["connect"] = str; obj["aliases"] = []; return obj; }),
        propath: project.propath,
        parameters: [],
        returnValue: '',
        super: false,
        output: [],
        procedure: filename
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));

    create(project.getTTYExecutable(), project.extraParameters.split(' ').concat(["-b", "-clientlog", path.join(project.rootDir, ".builder\\runtty.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName]), { env: env, cwd: project.rootDir, detached: true }, outputChannel);
}

export function runGUI(filename: string, project: OpenEdgeProjectConfig) {
    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'rungui-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: project.dbConnections.map(str => { const obj = {}; obj["connect"] = str; obj["aliases"] = []; return obj; }),
        propath: project.propath,
        parameters: [],
        returnValue: '',
        super: false,
        output: [],
        procedure: filename
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
    const prms = ["-clientlog", path.join(project.rootDir, ".builder\\rungui.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName, "-basekey", "INI", "-ininame", path.join(__dirname, '../resources/abl-src/empty.ini')];

    cp.spawn(project.getExecutable(true), prms, { env: env, cwd: project.rootDir, detached: true });
}
