import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { LanguageClient } from 'vscode-languageclient/node';

interface AblXrefInput {
  fileUri?: string;
  xml?: boolean;
}

interface XrefResult {
  success: boolean;
  fileName: string;
  message: string;
}

export class AblXrefTool implements vscode.LanguageModelTool<AblXrefInput> {
  constructor(private readonly client: LanguageClient) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AblXrefInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const uri = this.resolveUri(options.input.fileUri);
    const filename = uri
      ? vscode.workspace.asRelativePath(uri)
      : '(active editor)';
    return {
      invocationMessage: `Compiling ${filename}`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AblXrefInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const uri = this.resolveUri(options.input.fileUri);
    if (!uri) {
      throw new Error('No file URI provided and no active ABL editor is open.');
    }

    const rslt = await this.client.sendRequest<XrefResult>(
      options.input.xml ? 'proparse/xrefXml' : 'proparse/xref',
      {
        fileUri: uri.toString(),
      },
    );

    const text = fs.existsSync(rslt.fileName)
      ? fs.readFileSync(rslt.fileName, 'utf-8')
      : rslt.message;

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
}
