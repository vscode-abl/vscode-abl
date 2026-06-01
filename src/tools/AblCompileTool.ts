import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

interface AblCompileInput {
  fileUri?: string;
}

export class AblCompileTool implements vscode.LanguageModelTool<AblCompileInput> {
  constructor(private readonly client: LanguageClient) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AblCompileInput>,
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
    options: vscode.LanguageModelToolInvocationOptions<AblCompileInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const uri = this.resolveUri(options.input.fileUri);
    if (!uri) {
      throw new Error('No file URI provided and no active ABL editor is open.');
    }

    await this.client.sendRequest('proparse/buildResource', {
      uri: uri.toString(),
      forceBuild: false,
    });

    const diagnostics = vscode.languages
      .getDiagnostics(uri)
      .filter(
        (d) =>
          d.severity === vscode.DiagnosticSeverity.Error ||
          d.severity === vscode.DiagnosticSeverity.Warning,
      );

    const text = this.formatDiagnostics(uri, diagnostics);
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

  private formatDiagnostics(
    uri: vscode.Uri,
    diagnostics: vscode.Diagnostic[],
  ): string {
    const filename = vscode.workspace.asRelativePath(uri);

    if (diagnostics.length === 0) {
      return `Compilation of ${filename} succeeded with no errors or warnings.`;
    }

    const errors = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error,
    );
    const warnings = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Warning,
    );

    const lines: string[] = [
      `Compilation of ${filename}: ${errors.length} error(s), ${warnings.length} warning(s).`,
      '',
    ];

    for (const d of diagnostics) {
      const severity =
        d.severity === vscode.DiagnosticSeverity.Error ? 'ERROR' : 'WARNING';
      const line = d.range.start.line + 1;
      const col = d.range.start.character + 1;
      lines.push(`[${severity}] line ${line}, col ${col}: ${d.message}`);
    }

    return lines.join('\n');
  }
}
