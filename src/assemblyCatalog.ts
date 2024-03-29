import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import * as crypto from 'crypto';
import { tmpdir } from 'os';
import { outputChannel } from './ablStatus';
import * as vscode from 'vscode';

export function executeGenCatalog(project: OpenEdgeProjectConfig) {
    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'catalog-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: [],
        propath: [ path.join(__dirname, '../resources/abl-src/OpenEdge') ],
        parameters: [
          { name: "destFile", value: ".builder/catalog.json" },
          { name: "pctTools", value: path.join(__dirname, '../resources/PCTTools.dll') }
        ],
        returnValue: '',
        super: false,
        output: [],
        procedure: 'NetAssemblyCatalog.p'
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
    const prms = ["-clientlog", path.join(project.rootDir, ".builder/assemblyCatalog.log"), "-b", "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName];
    if (project.gui)
        prms.push( "-basekey", "INI", "-ininame", path.join(__dirname, '../resources/abl-src/empty.ini'));

    outputChannel.appendLine("Assembly Catalog Generation - Command line: " + project.getExecutable() + " " + project.extraParameters.split(' ').concat(prms).join(" "));
    const ps = cp.spawn(project.getExecutable(true), project.extraParameters.split(' ').concat(prms), { env: env, cwd: project.rootDir, detached: true });
    ps.on('close', (code) => {
      outputChannel.appendLine(`Assembly Catalog Generation - Process exited with code ${code}`)
      if (code == 0) {
        vscode.window.showInformationMessage("Assembly catalog generation completed successfully");
      } else {
        vscode.window.showErrorMessage("Assembly catalog generation failed, check log output");
      }
    });
    
}

