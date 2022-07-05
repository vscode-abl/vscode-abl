import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import { ProfileConfig, OpenEdgeProjectConfig } from './openEdgeConfigFile';
import { tmpdir } from 'os';


export function debug(filename: string, project: OpenEdgeProjectConfig, executable: string): cp.ChildProcessWithoutNullStreams {
    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'debugger-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: project.dbConnections,
        propath: project.propath,
        parameters: [],
        returnValue: '',
        super: true,
        output: [],
        procedure: filename,
        debugger: true
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
    const prms = [ "-clientlog", path.join(project.rootDir, ".builder\\debugger.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName , "-debugReady", "3099"];

    return cp.spawn( executable, project.extraParameters.split(' ').concat(prms), { env: env, cwd: project.rootDir, detached: true, stdio: 'pipe' });
}

export function runGUI(filename: string, project: OpenEdgeProjectConfig) {
    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'rungui-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: project.dbConnections,
        propath: project.propath,
        parameters: [],
        returnValue: '',
        super: true,
        output: [],
        procedure: filename
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
    const prms = ["-clientlog", path.join(project.rootDir, ".builder\\rungui.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName, "-basekey", "INI", "-ininame", path.join(__dirname, '../resources/abl-src/empty.ini')];

    cp.spawn(project.getExecutable(true), project.extraParameters.split(' ').concat(prms), { env: env, cwd: project.rootDir, detached: true });
}

export function openInAB(filename: string, rootDir: string, project: ProfileConfig) {
    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'openInAB-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: project.dbConnections,
        propath: project.propath,
        parameters: [ {name: 'window', value: filename}],
        returnValue: '',
        super: true,
        output: [],
        procedures: project.procedures,
        procedure: path.join(__dirname, '../resources/abl-src/openInAB.p')
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
    const prms = ["-clientlog", path.join(rootDir, ".builder\\openInAB.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName, "-basekey", "INI", "-ininame", path.join(__dirname, '../resources/abl-src/empty.ini')];

    cp.spawn(project.getExecutable(true), prms.concat(project.extraParameters.split(' ')), { env: env, cwd: rootDir, detached: true });
}
