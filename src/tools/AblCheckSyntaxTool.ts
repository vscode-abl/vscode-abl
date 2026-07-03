import * as vscode from 'vscode';
import { getClient } from '../extension';

interface AblCheckSyntaxInput {
  fileUri?: string;
}

interface CompileBufferMessage {
  message?: string;
  line?: number;
  column?: number;
  [key: string]: unknown;
}

interface CompileBufferResult {
  success: boolean;
  messages: (CompileBufferMessage | string)[];
}

export class AblCheckSyntaxTool implements vscode.LanguageModelTool<AblCheckSyntaxInput> {

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AblCheckSyntaxInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const uri = this.resolveUri(options.input.fileUri);
    const filename = uri
      ? vscode.workspace.asRelativePath(uri)
      : '(active editor)';
    return {
      invocationMessage: `Checking syntax of ${filename}`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AblCheckSyntaxInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const uri = this.resolveUri(options.input.fileUri);
    if (!uri) {
      throw new Error('No file URI provided and no active ABL editor is open.');
    }

    const document = await vscode.workspace.openTextDocument(uri);

    const result = await getClient().sendRequest<CompileBufferResult>(
      'proparse/compileBuffer',
      {
        bufferUri: uri.toString(),
        buffer: document.getText(),
      },
    );

    const text = this.formatResult(uri, result);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(text),
    ]);
  }

  private resolveUri(fileUri?: string): vscode.Uri | undefined {
    if (fileUri) {
      return vscode.Uri.parse(fileUri);
    }
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'abl') {
      return editor.document.uri;
    }
    return undefined;
  }

  private formatResult(uri: vscode.Uri, result: CompileBufferResult): string {
    const filename = vscode.workspace.asRelativePath(uri);

    if (result.success) {
      return `Syntax check of ${filename} succeeded with no errors.`;
    }

    const messages = result.messages ?? [];
    const lines: string[] = [
      `Syntax check of ${filename} failed with ${messages.length} error(s).`,
      '',
    ];

    for (const msg of messages) {
      if (typeof msg === 'string') {
        lines.push(msg);
        continue;
      }
      const location =
        msg.line !== undefined
          ? `line ${msg.line}${msg.column !== undefined ? `, col ${msg.column}` : ''}: `
          : '';
      lines.push(`${location}${msg.message ?? JSON.stringify(msg)}`);
    }

    return lines.join('\n');
  }
}
