import * as vscode from 'vscode';

interface AblLanguageServerToolConfig {
  command: string;
  invocationMessage: string;
  resultMessage: string;
}

export const START_LANGUAGE_SERVER: AblLanguageServerToolConfig = {
  command: 'abl.restart.langserv',
  invocationMessage: 'Starting ABL Language Server',
  resultMessage: 'ABL Language Server started',
};

export const STOP_LANGUAGE_SERVER: AblLanguageServerToolConfig = {
  command: 'abl.stop.langserv',
  invocationMessage: 'Stopping ABL Language Server',
  resultMessage: 'ABL Language Server stopped',
};

export const RESTART_LANGUAGE_SERVER: AblLanguageServerToolConfig = {
  command: 'abl.restart.langserv',
  invocationMessage: 'Restarting ABL Language Server',
  resultMessage: 'ABL Language Server restarted',
};

export class AblLanguageServerTool implements vscode.LanguageModelTool<object> {
  constructor(private readonly config: AblLanguageServerToolConfig) {}

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<object>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: this.config.invocationMessage };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<object>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    await vscode.commands.executeCommand(this.config.command);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(this.config.resultMessage),
    ]);
  }
}
