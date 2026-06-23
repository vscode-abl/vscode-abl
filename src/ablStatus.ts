/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

// Orphan file, not used for now (or ever)

'use strict';

import * as vscode from 'vscode';
import { ABL_MODE } from './ablMode';

export const outputChannel = vscode.window.createOutputChannel('ABL', {
  log: true,
});
export const batchOutputChannel = vscode.window.createOutputChannel(
  'ABL Batch',
  { log: true },
);
function createRawOutputChannel(name: string): vscode.LogOutputChannel {
  const ch = vscode.window.createOutputChannel(name);
  const emitter = new vscode.EventEmitter<vscode.LogLevel>();
  return Object.assign(ch, {
    logLevel: vscode.LogLevel.Info,
    onDidChangeLogLevel: emitter.event,
    trace: (message: string) => ch.appendLine(message),
    debug: (message: string) => ch.appendLine(message),
    info: (message: string) => ch.appendLine(message),
    warn: (message: string) => ch.appendLine(message),
    error: (message: string | Error) => ch.appendLine(message instanceof Error ? message.message : message),
  }) as vscode.LogOutputChannel;
}

export const lsOutputChannel = createRawOutputChannel('ABL Language Server');

let statusBarEntry: vscode.StatusBarItem;

export function showHideStatus() {
  if (!statusBarEntry) {
    return;
  }
  if (!vscode.window.activeTextEditor) {
    statusBarEntry.hide();
    return;
  }
  if (
    vscode.languages.match(ABL_MODE, vscode.window.activeTextEditor.document)
  ) {
    statusBarEntry.show();
    return;
  }
  statusBarEntry.hide();
}

export function hideAblStatus() {
  if (statusBarEntry) {
    statusBarEntry.dispose();
  }
}

export function showAblStatus(
  message: string,
  command: string,
  tooltip?: string,
) {
  statusBarEntry = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    Number.MIN_VALUE,
  );
  statusBarEntry.text = message;
  statusBarEntry.command = command;
  statusBarEntry.color = 'yellow';
  statusBarEntry.tooltip = tooltip;
  statusBarEntry.show();
}
