import * as vscode from 'vscode';
import fetch from 'node-fetch';

export class DocumentationNodeProvider implements vscode.TreeDataProvider<DocumentationEntry> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    DocumentationEntry | undefined | void
  > = new vscode.EventEmitter<DocumentationEntry | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    DocumentationEntry | undefined | void
  > = this._onDidChangeTreeData.event;

  // Version currently displayed -- 1 => 11.7 (not available anymore), 2 => 12.2, 3 => 12.8, 4 => 13.0
  private mode: number = 3;
  private docData122: JsonDocEntry[] = [];
  private docData128: JsonDocEntry[] = [];
  private docData130: JsonDocEntry[] = [];

  // Refresh sections from OE website
  fetchData() {
    const prefix = 'https://docs-be.progress.com/api/bundle/';
    // Version 12.2
    fetch(prefix + 'openedge-abl-reference-122/toc?language=enus', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then((response) => response.text())
      .then((text) => {
        this.docData122 = JSON.parse(text) as JsonDocEntry[];
        if (this.mode == 2) this._onDidChangeTreeData.fire();
      });
    // Version 12.8
    fetch(prefix + 'openedge-abl-reference-128/toc?language=enus', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then((response) => response.text())
      .then((text) => {
        this.docData128 = JSON.parse(text) as JsonDocEntry[];
        if (this.mode == 3) this._onDidChangeTreeData.fire();
      });
    // Version 13.0
    fetch(prefix + 'abl-reference/toc?language=enus', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then((response) => response.text())
      .then((text) => {
        this.docData130 = JSON.parse(text) as JsonDocEntry[];
        if (this.mode == 4) this._onDidChangeTreeData.fire();
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
    const docRoot =
      this.mode == 2
        ? this.docData122
        : this.mode == 3
          ? this.docData128
          : this.docData130;
    return docRoot.map(
      (it) =>
        new DocumentationEntry(it, {
          command: 'abl.openDocEntry',
          title: '',
          arguments: [it.url],
        }),
    );
  }

  private _getChildren(element: DocumentationEntry): DocumentationEntry[] {
    if (element.docEntry.childEntries) {
      return element.docEntry.childEntries.map(
        (it) =>
          new DocumentationEntry(it, {
            command: 'abl.openDocEntry',
            title: '',
            arguments: [it.url],
          }),
      );
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
      DocViewPanel.currentPanel._update();
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      'OEDOC',
      'OpenEdge Documentation',
      column || vscode.ViewColumn.One,
      { enableScripts: true, enableFindWidget: true },
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
      (message) => {
        switch (message.type) {
          case 'openLink':
            DocViewPanel.createOrShow(
              message.message.indexOf('#') > 0
                ? message.message.substring(0, message.message.indexOf('#'))
                : message.message,
            );
            return;
        }
      },
      null,
      this._disposables,
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
    fetch(this._pageUri, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then((response) => response.json())
      .then((json) => {
        this._panel.webview.html = this._getHtmlForWebview(json.html);
      });
  }

  private _getHtmlForWebview(responseHtml: string) {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          :root {
            --bg-primary: var(--vscode-editor-background, #1e1e1e);
            --bg-secondary: var(--vscode-sideBar-background, #252526);
            --bg-code: var(--vscode-textCodeBlock-background, #2d2d2d);
            --text-primary: var(--vscode-editor-foreground, #d4d4d4);
            --text-secondary: var(--vscode-descriptionForeground, #9d9d9d);
            --text-link: var(--vscode-textLink-foreground, #3794ff);
            --text-link-hover: var(--vscode-textLink-activeForeground, #3794ff);
            --border-color: var(--vscode-panel-border, #404040);
            --accent-color: var(--vscode-focusBorder, #007acc);
            --heading-color: var(--vscode-foreground, #e0e0e0);
            --keyword-color: #569cd6;
            --string-color: #ce9178;
            --comment-color: #6a9955;
          }

          * {
            box-sizing: border-box;
          }

          body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif);
            font-size: var(--vscode-font-size, 14px);
            line-height: 1.6;
            color: var(--text-primary);
            background-color: var(--bg-primary);
            padding: 20px 30px;
            max-width: 900px;
            margin: 0 auto;
          }

          /* Headings */
          h1, h2, h3, h4, h5, h6 {
            color: var(--heading-color);
            font-weight: 600;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            border-bottom: none;
          }

          h1 {
            font-size: 1.8em;
            border-bottom: 2px solid var(--accent-color);
            padding-bottom: 0.3em;
            margin-top: 0;
          }

          h2 {
            font-size: 1.4em;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.2em;
          }

          h3 {
            font-size: 1.2em;
          }

          /* Links */
          a {
            color: var(--text-link);
            text-decoration: none;
          }

          a:hover {
            color: var(--text-link-hover);
            text-decoration: underline;
          }

          /* Code blocks */
          pre, code {
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
            font-size: 0.95em;
          }

          code {
            background-color: var(--bg-code);
            padding: 0.15em 0.4em;
            border-radius: 4px;
          }

          pre {
            background-color: var(--bg-code);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 16px;
            overflow-x: auto;
            line-height: 1.5;
          }

          pre code {
            background: none;
            padding: 0;
            border-radius: 0;
          }

          /* Definition lists (used for parameters) */
          dl {
            margin: 1em 0;
            padding: 0;
          }

          dt {
            font-weight: 600;
            color: var(--heading-color);
            margin-top: 1em;
            padding: 0.3em 0;
          }

          dd {
            margin-left: 1.5em;
            margin-bottom: 0.5em;
            color: var(--text-primary);
          }

          /* Tables */
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 1em 0;
            font-size: 0.95em;
          }

          th, td {
            padding: 10px 12px;
            text-align: left;
            border: 1px solid var(--border-color);
          }

          th {
            background-color: var(--bg-secondary);
            font-weight: 600;
            color: var(--heading-color);
          }

          tr:nth-child(even) {
            background-color: var(--bg-secondary);
          }

          /* Lists */
          ul, ol {
            padding-left: 1.5em;
            margin: 0.5em 0;
          }

          li {
            margin: 0.3em 0;
          }

          /* Paragraphs */
          p {
            margin: 0.8em 0;
          }

          /* Blockquotes / Notes */
          blockquote {
            margin: 1em 0;
            padding: 0.5em 1em;
            border-left: 4px solid var(--accent-color);
            background-color: var(--bg-secondary);
            border-radius: 0 4px 4px 0;
          }

          blockquote p {
            margin: 0.3em 0;
          }

          /* Notes and warnings */
          .note, .warning, .tip {
            padding: 12px 16px;
            margin: 1em 0;
            border-radius: 6px;
            border-left: 4px solid;
          }

          .note {
            background-color: rgba(55, 148, 255, 0.1);
            border-left-color: #3794ff;
          }

          .warning {
            background-color: rgba(255, 204, 0, 0.1);
            border-left-color: #ffcc00;
          }

          .tip {
            background-color: rgba(78, 201, 176, 0.1);
            border-left-color: #4ec9b0;
          }

          /* Horizontal rule */
          hr {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 2em 0;
          }

          /* Images */
          img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
          }

          /* Hide navigation elements that don't work in webview */
          .breadcrumb, .navcontainer, .toc-sidebar, .related-content,
          .prev-next-nav, .comments, .feedback, nav {
            display: none;
          }

          /* Syntax highlighting hints for ABL code */
          .keyword { color: var(--keyword-color); }
          .string { color: var(--string-color); }
          .comment { color: var(--comment-color); }

          /* Scrollbar styling */
          ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }

          ::-webkit-scrollbar-track {
            background: var(--bg-secondary);
          }

          ::-webkit-scrollbar-thumb {
            background: var(--border-color);
            border-radius: 5px;
          }

          ::-webkit-scrollbar-thumb:hover {
            background: var(--text-secondary);
          }
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
  constructor(
    public readonly docEntry: JsonDocEntry,
    public readonly command?: vscode.Command,
  ) {
    super(
      docEntry.title,
      docEntry.childEntries && docEntry.childEntries.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
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
