import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { outputChannel } from './ablStatus';

import { stripAppBuilderMarkup } from './ablStripMarkupCore';

/**
 * Handles in-place modifications of the open active text editor buffer.
 */
export async function stripMarkupActiveEditor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor to strip markup from.');
    return;
  }

  if (editor.document.languageId !== 'abl') {
    vscode.window.showWarningMessage('Active file is not an OpenEdge ABL file.');
    return;
  }

  const document = editor.document;
  const rawText = document.getText();
  const cleanedText = stripAppBuilderMarkup(rawText);

  if (rawText === cleanedText) {
    vscode.window.showInformationMessage('No AppBuilder markup found to strip.');
    return;
  }

  const firstLine = document.lineAt(0);
  const lastLine = document.lineAt(document.lineCount - 1);
  const fullRange = new vscode.Range(firstLine.range.start, lastLine.range.end);

  const success = await editor.edit((editBuilder) => {
    editBuilder.replace(fullRange, cleanedText);
  });

  if (success) {
    vscode.window.showInformationMessage('AppBuilder layout markup stripped successfully.');
  } else {
    vscode.window.showErrorMessage('Failed to apply edits to the active document.');
  }
}

/**
 * Handles batch processing of files and directories from the File Explorer Sidebar.
 */
export async function stripMarkupExplorer(uri: vscode.Uri, uris?: vscode.Uri[]) {
  const targets = uris && uris.length > 0 ? uris : [uri];
  if (targets.length === 0) {
    return;
  }

  let filesToProcess: string[] = [];
  for (const target of targets) {
    if (target.scheme !== 'file') {
      continue;
    }
    const fsPath = target.fsPath;
    try {
      const stat = fs.statSync(fsPath);
      if (stat.isDirectory()) {
        const dirFiles = await getAblFilesRecursively(fsPath);
        filesToProcess = filesToProcess.concat(dirFiles);
      } else {
        const ext = path.extname(fsPath).toLowerCase();
        if (['.w', '.p', '.i'].includes(ext)) {
          filesToProcess.push(fsPath);
        }
      }
    } catch (err: any) {
      outputChannel.error(`Failed to inspect path ${fsPath}: ${err.message}`);
    }
  }

  if (filesToProcess.length === 0) {
    vscode.window.showWarningMessage('No OpenEdge ABL files found to process.');
    return;
  }

  let successCount = 0;
  let modifiedCount = 0;

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Stripping AppBuilder Markup...',
    cancellable: false
  }, async (progress) => {
    const total = filesToProcess.length;
    for (let i = 0; i < total; i++) {
      const filePath = filesToProcess[i];
      progress.report({
        message: `Processing file ${i + 1}/${total}: ${path.basename(filePath)}`,
        increment: (1 / total) * 100
      });
      try {
        const rawText = fs.readFileSync(filePath, 'utf8');
        const cleanedText = stripAppBuilderMarkup(rawText);
        if (rawText !== cleanedText) {
          fs.writeFileSync(filePath, cleanedText, 'utf8');
          modifiedCount++;
        }
        successCount++;
      } catch (err: any) {
        outputChannel.error(`Failed processing ${filePath}: ${err.message}`);
      }
    }
  });

  vscode.window.showInformationMessage(
    `Stripping complete. Processed ${successCount} files. Modified ${modifiedCount} file(s).`
  );
}

/**
 * Recursively scans directories to retrieve all valid ABL extension files.
 */
async function getAblFilesRecursively(dirPath: string): Promise<string[]> {
  let files: string[] = [];
  try {
    const list = fs.readdirSync(dirPath);
    for (const item of list) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files = files.concat(await getAblFilesRecursively(fullPath));
      } else {
        const ext = path.extname(item).toLowerCase();
        if (['.w', '.p', '.i'].includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (err: any) {
    outputChannel.error(`Failed listing directory ${dirPath}: ${err.message}`);
  }
  return files;
}
