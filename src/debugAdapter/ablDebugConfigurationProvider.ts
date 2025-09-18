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
        const folderPath = folder.uri.fsPath + ( process.platform === 'win32' ? '\\' : '/' );
        const cfg = this.getProject(folderPath);

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
        const refProjects: Array<String> = [];
        if (debugConfiguration.projects) {
          debugConfiguration.projects.forEach(prj => {
            const project = this.getProjectByName(prj)
            if (project)
              refProjects.push(project.rootDir)
          })
        }

        if (cfg) {
            debugConfiguration['ablsrc'] = path.join(__dirname, '../resources/abl-src');
            debugConfiguration['dlc'] = cfg.dlc;
            debugConfiguration['oeversion'] = cfg.oeversion;
            debugConfiguration['refProjects'] = refProjects
        }

        return debugConfiguration;
    }

    public getProject(path: string): OpenEdgeProjectConfig {
      const srchPath = process.platform === 'win32' ? path.toLowerCase() : path;
      return this.projects.find(project => process.platform === 'win32' ? 
          srchPath.startsWith(project.rootDir.toLowerCase()) :
          srchPath.startsWith(project.rootDir) );
    }

    public getProjectByName(name: string): OpenEdgeProjectConfig {
      return this.projects.find(project => name == project.name);
    }

}
