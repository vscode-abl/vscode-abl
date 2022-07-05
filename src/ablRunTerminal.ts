import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { tmpdir } from 'os';
import { outputChannel } from './ablStatus';
import { create } from './OutputChannelProcess';

export function runTTY(filename: string, project: OpenEdgeProjectConfig) {
    const terminal = vscode.window.createTerminal({ name: "TTY execution", env: {DLC: project.dlc}});
    const prmFileName = path.join(tmpdir(), 'runtty-' + crypto.randomBytes(16).toString('hex') + '.json');
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

    terminal.sendText(project.getTTYExecutable() + ' ' + project.extraParameters.split(' ').concat(["-clientlog", path.join(project.rootDir, ".builder", "runtty.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName]).join(' '));
    terminal.show();
}

export function runBatch(filename: string, project: OpenEdgeProjectConfig) {
    outputChannel.clear();

    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'runbatch-' + crypto.randomBytes(16).toString('hex') + '.json');
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

    create(project.getTTYExecutable(), project.extraParameters.split(' ').concat(["-b", "-clientlog", path.join(project.rootDir, ".builder", "runbatch.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName]), { env: env, cwd: project.rootDir, detached: true }, outputChannel);
}
