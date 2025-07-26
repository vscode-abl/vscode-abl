import * as vscode from 'vscode';
import fetch from 'node-fetch';

export class DocumentationNodeProvider implements vscode.TreeDataProvider<DocumentationEntry> {

  private _onDidChangeTreeData: vscode.EventEmitter<DocumentationEntry | undefined | void> = new vscode.EventEmitter<DocumentationEntry | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<DocumentationEntry | undefined | void> = this._onDidChangeTreeData.event;

  // Version currently displayed -- 1 => 11.7 (not available anymore), 2 => 12.2, 3 => 12.8
  private mode: number = 3;
  private docData122: JsonDocEntry[] = [];
  private docData128: JsonDocEntry[] = [];

  // Refresh sections from OE website
  fetchData() {
    const prefix = 'https://progress-be-prod.zoominsoftware.io/api/bundle/';
    fetch(prefix + 'openedge-abl-reference-122/toc?language=enus', { method: 'GET', headers: { 'Accept': 'application/json' } }).then((response) =>
      response.text()
    ).then((text) => {
      this.docData122 = JSON.parse(text) as JsonDocEntry[];
      if (this.mode == 2) this._onDidChangeTreeData.fire();
    });
    fetch(prefix + 'abl-reference/toc?language=enus', { method: 'GET', headers: { 'Accept': 'application/json' } }).then((response) =>
      response.text()
    ).then((text) => {
      this.docData128 = JSON.parse(text) as JsonDocEntry[];
      if (this.mode == 3) this._onDidChangeTreeData.fire();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateMode(mode: number): void {
    this.mode = mode;
  }

  getTreeItem(element: DocumentationEntry): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DocumentationEntry): Thenable<DocumentationEntry[]> {
    if (element) {
      return Promise.resolve(this._getChildren(element));
    } else {
      return Promise.resolve(this._getRootChildren());
    }
  }

  private _getRootChildren(): DocumentationEntry[] {
    const docRoot = this.mode == 2 ? this.docData122 : this.docData128;
    return docRoot.map(it => new DocumentationEntry(it, { command: 'abl.openDocEntry', title: '', arguments: [it.url] }));
  }

  private _getChildren(element: DocumentationEntry): DocumentationEntry[] {
    if (element.docEntry.childEntries) {
      return element.docEntry.childEntries.map(it => new DocumentationEntry(it, { command: 'abl.openDocEntry', title: '', arguments: [it.url] }));
    } else {
      return [];
    }
  }

}

export class DocViewPanel {
  public static currentPanel: DocViewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _pageUri: string;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(page: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it.
    if (DocViewPanel.currentPanel) {
      DocViewPanel.currentPanel._pageUri = page;
      DocViewPanel.currentPanel._panel.reveal(column);
      DocViewPanel.currentPanel._update()
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel('OEDOC', 'OpenEdge Documentation',
      column || vscode.ViewColumn.One,
      { enableScripts: true, enableFindWidget: true }
    );

    DocViewPanel.currentPanel = new DocViewPanel(panel, page);
  }

  private constructor(panel: vscode.WebviewPanel, pageUri: string) {
    this._panel = panel;
    this._pageUri = pageUri;
    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.type) {
          case 'openLink':
            DocViewPanel.createOrShow(message.message.indexOf('#') > 0 ? message.message.substring(0, message.message.indexOf('#')) : message.message);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
		DocViewPanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

  private _update() {
    fetch(this._pageUri, { method: 'GET', headers: { 'Accept': 'application/json' } })
      .then((response) => response.json())
      .then((json) => {
        this._panel.webview.html = this._getHtmlForWebview(json.html)
      });
  }

  private _getHtmlForWebview(responseHtml: string) {
    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<style>
          h1 { color: blue; }
        </style>
				<script>
  				function interceptClickEvent(e) {
					var href;
					var target = e.target || e.srcElement;
					if (target.tagName === 'A') {
							href = target.getAttribute('href');
							vscode.postMessage({ type: 'openLink', message: href });
							e.preventDefault(); // doesn't work anymore :-()
							target.href = "#";
					}
					return ;
			}
			// listen for link click events at the document level
			if (document.addEventListener) {
					document.addEventListener('click', interceptClickEvent);
			} else if (document.attachEvent) {
					document.attachEvent('onclick', interceptClickEvent);
			}
			const vscode = acquireVsCodeApi(); // acquireVsCodeApi can only be invoked once

			  </script>
			</head>
			<body>${responseHtml}</body>
			</html>`;
  }
}

export class DocumentationEntry extends vscode.TreeItem {
  constructor(public readonly docEntry: JsonDocEntry, public readonly command?: vscode.Command) {
    super(docEntry.title, docEntry.childEntries && docEntry.childEntries.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
  }
  contextValue = 'documentation';
}

// Json format on Progress documentation website
interface JsonDocEntry {
  bundle_id: string;
  title: string;
  url: string;
  childEntries: JsonDocEntry[];
}
