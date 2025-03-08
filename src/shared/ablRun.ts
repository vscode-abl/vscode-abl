import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import { ProfileConfig, OpenEdgeProjectConfig } from './openEdgeConfigFile';
import { tmpdir } from 'os';
import { outputChannel } from '../ablStatus';

const builderExists: { [rootDir: string]: boolean } = {};

function checkBuilderDirectoryExists(rootDir: string) {
    if (!builderExists[rootDir]) {
        const builderDir = path.join(rootDir, ".builder");
        if (!fs.existsSync(builderDir)) { //only check once.  restart the language server to check again
            fs.mkdirSync(builderDir);
        }
        builderExists[rootDir] = true;
    }
}

export function runGUI(filename: string, project: OpenEdgeProjectConfig) {
    checkBuilderDirectoryExists(project.rootDir);
    const currProfile = project.profiles.get(project.activeProfile);
    const env = process.env;
    env.DLC = currProfile.dlc;

    const prmFileName = path.join(tmpdir(), 'rungui-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: currProfile.dbConnections,
        propath: currProfile.propath,
        parameters: [],
        returnValue: '',
        super: true,
        output: [],
        procedure: filename
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
    const prms = ["-clientlog", path.join(project.rootDir, ".builder\\rungui.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName, "-basekey", "INI", "-ininame", path.join(__dirname, '../resources/abl-src/empty.ini')];
    const prms2 = prms.concat(currProfile.extraParameters.split(' '));

    outputChannel.info(`Run with prowin - Command line: ${currProfile.getExecutable(true)} ${prms2.join(" ")}`);
    cp.spawn(currProfile.getExecutable(true), prms2, { env: env, cwd: project.rootDir, detached: true });
}

export function openInAB(filename: string, rootDir: string, project: ProfileConfig) {
    checkBuilderDirectoryExists(rootDir);
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
    const prms2 = prms.concat(project.extraParameters.split(' '));

    outputChannel.info(`Open in AppBuilder - Command line: ${project.getExecutable(true)} ${prms2.join(" ")}`);
    cp.spawn(project.getExecutable(true), prms2, { env: env, cwd: rootDir, detached: true });
}

export function openInProcEditor(filename: string, rootDir: string, project: ProfileConfig) {
    checkBuilderDirectoryExists(rootDir);
    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'openInProcEd-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: project.dbConnections,
        propath: project.propath,
        parameters: [ {name: 'procedure', value: filename}],
        returnValue: '',
        super: true,
        output: [],
        procedures: project.procedures,
        procedure: path.join(__dirname, '../resources/abl-src/openInProcEditor.p')
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
    const prms = ["-clientlog", path.join(rootDir, ".builder\\openInProcEd.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName, "-basekey", "INI", "-ininame", path.join(__dirname, '../resources/abl-src/empty.ini')];
    const prms2 = prms.concat(project.extraParameters.split(' '));

    outputChannel.info(`Open in procedure editor - Command line: ${project.getExecutable(true)} ${prms2.join(" ")}`);
    cp.spawn(project.getExecutable(true), prms2, { env: env, cwd: rootDir, detached: true });
}
