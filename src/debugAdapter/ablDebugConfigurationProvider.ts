import { OpenEdgeProjectConfig } from '../shared/openEdgeConfigFile';
import * as vscode from 'vscode';
import * as path from 'path';

export class AblDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    // Reference to the list of projects
    projects: Array<OpenEdgeProjectConfig>;

    public constructor(prjs: Array<OpenEdgeProjectConfig>) {
        this.projects = prjs;
    }

    public resolveDebugConfiguration?(folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration, _token?: vscode.CancellationToken): vscode.DebugConfiguration {
        const cfg = this.getProject(folder.uri.fsPath);

        if (!debugConfiguration || !debugConfiguration.request) { // if 'request' is missing interpret this as a missing launch.json
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.languageId !== 'abl') {
                return;
            }

            return {
                name: 'Launch',
                type: 'abl',
                request: 'launch',
                program: '${file}'
            };
        }
        if (cfg) {
            debugConfiguration['ablsrc'] = path.join(__dirname, '../resources/abl-src');
            debugConfiguration['dlc'] = cfg.dlc;
            debugConfiguration['oeversion'] = cfg.oeversion;
        }

        return debugConfiguration;
    }

    public getProject(uri: string): OpenEdgeProjectConfig {
        return this.projects.find(config => uri.startsWith(config.rootDir));
    }
}
