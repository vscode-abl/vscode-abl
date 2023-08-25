import * as fs from 'fs';
import * as cp from 'child_process';
import * as path from 'path';
import { OpenEdgeProjectConfig } from './shared/openEdgeConfigFile';
import * as crypto from 'crypto';
import { tmpdir } from 'os';

export function executeGenCatalog(project: OpenEdgeProjectConfig) {
    const env = process.env;
    env.DLC = project.dlc;

    const prmFileName = path.join(tmpdir(), 'catalog-' + crypto.randomBytes(16).toString('hex') + '.json');
    const cfgFile = {
        verbose: false,
        databases: [],
        propath: [ ".builder/ls" ],
        parameters: [ { name: "fileName", value: ".builder/catalog.json" }],
        returnValue: '',
        super: false,
        output: [],
        procedure: 'assembliesCatalog.p'
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));
    const prms = ["-clientlog", path.join(project.rootDir, ".builder/assemblyCatalog.log"), "-b", "-p", path.join(__dirname, '../resources/abl-src/dynrun.p'), "-param", prmFileName];
    if (project.gui)
        prms.push( "-basekey", "INI", "-ininame", path.join(__dirname, '../resources/abl-src/empty.ini'));

    cp.spawn(project.getExecutable(), project.extraParameters.split(' ').concat(prms), { env: env, cwd: project.rootDir, detached: true });
}

