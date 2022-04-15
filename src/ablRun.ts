import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { ProfileConfig, OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import { outputChannel } from './ablStatus';
import { create } from './OutputChannelProcess';
import { tmpdir } from 'os';

export function runTTY(filename: string, project: OpenEdgeProjectConfig) {
    const terminal = vscode.window.createTerminal({ name: "TTY execution", env: {DLC: project.dlc}});
    const prmFileName = path.join(tmpdir(), 'runtty-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: project.dbConnections,
        aliases: project.aliases,
        propath: project.propath,
        parameters: [],
        returnValue: '',
        super: true,
        output: [],
        procedure: filename
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));

    terminal.sendText(project.getTTYExecutable() + ' ' + project.extraParameters.split(' ').concat(["-clientlog", path.join(project.rootDir, ".builder\\runtty.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName]).join(' '));
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
        aliases: project.aliases,
        propath: project.propath,
        parameters: [],
        returnValue: '',
        super: true,
        output: [],
        procedure: filename
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));

    create(project.getTTYExecutable(), project.extraParameters.split(' ').concat(["-b", "-clientlog", path.join(project.rootDir, ".builder\\runbatch.log"), "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName]), { env: env, cwd: project.rootDir, detached: true }, outputChannel);
}

export function runGUI(filename: string, project: OpenEdgeProjectConfig) {
    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'rungui-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: project.dbConnections,
        aliases: project.aliases,
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
        aliases: project.aliases,
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
