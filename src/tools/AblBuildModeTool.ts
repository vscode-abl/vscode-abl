import * as vscode from 'vscode';
import { setBuildMode } from '../extension';

type BuildModeName = 'everything' | 'classes' | 'modified' | 'none';

interface AblBuildModeInput {
  mode: BuildModeName;
  restart?: boolean;
}

const MODES: Record<BuildModeName, number> = {
  everything: 1,
  classes: 2,
  modified: 3,
  none: 4,
};

export class AblBuildModeTool implements vscode.LanguageModelTool<AblBuildModeInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AblBuildModeInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Changing ABL build mode to ${options.input.mode}`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AblBuildModeInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const value = MODES[options.input.mode];
    if (value === undefined) {
      throw new Error(
        `Unknown build mode '${options.input.mode}'. Expected one of: ${Object.keys(MODES).join(', ')}`,
      );
    }

    const name = setBuildMode(value);
    let text = `ABL build mode changed to ${name}`;
    if (options.input.restart) {
      await vscode.commands.executeCommand('abl.restart.langserv');
      text += '. ABL Language Server restarted';
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(text),
    ]);
  }
}
