import * as crypto from "crypto";
import * as fs from "fs";
import { tmpdir } from "os";
import * as path from "path";
import * as vscode from "vscode";
import { batchOutputChannel } from "./ablStatus";
import { create } from "./OutputChannelProcess";
import { OpenEdgeProjectConfig } from "./shared/openEdgeConfigFile";

const builderExists: { [rootDir: string]: boolean } = {};

function checkBuilderDirectoryExists(rootDir: string) {
    if (!builderExists[rootDir]) {
        const builderDir = path.join(rootDir, ".builder");
        if (!fs.existsSync(builderDir)) {
            //only check once.  restart the language server to check again
            fs.mkdirSync(builderDir);
        }
        builderExists[rootDir] = true;
    }
}

export function runTTY(filename: string, project: OpenEdgeProjectConfig) {
    checkBuilderDirectoryExists(project.rootDir);
    const currProfile = project.profiles.get(project.activeProfile);
    const terminal = vscode.window.createTerminal({ name: "TTY execution", env: { DLC: currProfile.dlc } });
    const prmFileName = path.join(tmpdir(), "runtty-" + crypto.randomBytes(16).toString("hex") + ".json");
    const cfgFile = {
        verbose: false,
        databases: currProfile.dbConnections,
        propath: currProfile.propath,
        parameters: [],
        returnValue: "",
        super: true,
        output: [],
        procedure: filename,
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));

    // prettier-ignore
    const cmd =
        currProfile.getTTYExecutable() +
        " " +
        currProfile.extraParameters
            .split(" ")
            .concat([
                "-clientlog", path.join(project.rootDir, ".builder", "runtty.log"),
                "-p", path.join(__dirname, "../resources/abl-src/dynrun.p"),
                "-param", prmFileName,
                "-T", path.join(project.rootDir, ".builder", "tmp")
            ])
            .join(" ");
    terminal.sendText(cmd.replace(/\\/g, "/"), true);
    terminal.show();
}

export function runBatch(filename: string, project: OpenEdgeProjectConfig) {
    checkBuilderDirectoryExists(project.rootDir);
    const currProfile = project.profiles.get(project.activeProfile);

    const env = process.env;
    env.DLC = currProfile.dlc;

    const prmFileName = path.join(tmpdir(), "runbatch-" + crypto.randomBytes(16).toString("hex") + ".json");
    const cfgFile = {
        verbose: false,
        databases: currProfile.dbConnections,
        propath: currProfile.propath,
        parameters: [],
        returnValue: "",
        super: true,
        output: [],
        procedure: filename,
    };
    fs.writeFileSync(prmFileName, JSON.stringify(cfgFile));

    // prettier-ignore
    create(
        currProfile.getTTYExecutable(),
        currProfile.extraParameters
            .split(" ")
            .concat([
                "-b",
                "-clientlog", path.join(project.rootDir, ".builder", "runbatch.log"),
                "-p", path.join(__dirname, "../resources/abl-src/dynrun.p"),
                "-param", prmFileName,
                "-T", path.join(project.rootDir, ".builder", "tmp")
            ]),
        { env: env, cwd: project.rootDir, detached: true },
        batchOutputChannel
    );
}
