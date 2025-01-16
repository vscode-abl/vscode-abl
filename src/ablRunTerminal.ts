import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { tmpdir } from 'os';
import { outputChannel } from './ablStatus';
import { create } from './OutputChannelProcess';

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

export function runTTY(filename: string, project: OpenEdgeProjectConfig) {
    checkBuilderDirectoryExists(project.rootDir);
    const currProfile = project.profiles.get(project.activeProfile);
    const terminal = vscode.window.createTerminal({ name: "TTY execution", env: {DLC: currProfile.dlc}});
    const prmFileName = path.join(tmpdir(), 'runtty-' + crypto.randomBytes(16).toString('hex') + '.json');
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

    const cmd = currProfile.getTTYExecutable() + ' ' + currProfile.extraParameters.split(' ').concat(["-clientlog", path.join(project.rootDir, ".builder", "runtty.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName]).join(' ');
    terminal.sendText(cmd.replace(/\\/g, '/'), true);
    terminal.show();
}

export function runBatch(filename: string, project: OpenEdgeProjectConfig) {
    checkBuilderDirectoryExists(project.rootDir);
    const currProfile = project.profiles.get(project.activeProfile);

    outputChannel.clear();

    const env = process.env;
    env.DLC = currProfile.dlc;

    const prmFileName = path.join(tmpdir(), 'runbatch-' + crypto.randomBytes(16).toString('hex') + '.json');
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

    create(currProfile.getTTYExecutable(), currProfile.extraParameters.split(' ').concat(["-b", "-clientlog", path.join(project.rootDir, ".builder", "runbatch.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName]), { env: env, cwd: project.rootDir, detached: true }, outputChannel);
}
