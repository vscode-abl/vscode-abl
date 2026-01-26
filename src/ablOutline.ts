import path = require('path');
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

export class AblOutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    OutlineItem | undefined | void
  > = new vscode.EventEmitter<OutlineItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<OutlineItem | undefined | void> =
    this._onDidChangeTreeData.event;
  private currentDocumentUri: string | undefined;
  private extensionPath: string;

  constructor(
    private client: LanguageClient,
    extensionPath: string,
  ) {
    this.extensionPath = extensionPath;
    // Listen to active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'abl') {
        this.currentDocumentUri = editor.document.uri.toString();
        this.refresh();
      }
    });

    // Listen to document changes
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === vscode.window.activeTextEditor?.document) {
        this.currentDocumentUri = event.document.uri.toString();
        this.refresh();
      }
    });

    // Set initial document if there's an active editor
    if (
      vscode.window.activeTextEditor &&
      vscode.window.activeTextEditor.document.languageId === 'abl'
    ) {
      this.currentDocumentUri =
        vscode.window.activeTextEditor.document.uri.toString();
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: OutlineItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: OutlineItem): Promise<OutlineItem[]> {
    if (!this.currentDocumentUri) {
      return [];
    }

    if (!element) {
      // Root level - request document symbols from language server
      try {
        const symbols = await this.client.sendRequest<vscode.DocumentSymbol[]>(
          'proparse/extendedDocumentSymbol',
          {
            textDocument: {
              uri: this.currentDocumentUri,
            },
          },
        );

        if (!symbols || symbols.length === 0) {
          return [];
        }

        return symbols.map((symbol) => this._createOutlineItem(symbol));
      } catch (error) {
        console.error('Error retrieving document symbols:', error);
        return [];
      }
    } else {
      // Return children of the element
      if (element.symbol.children && element.symbol.children.length > 0) {
        return element.symbol.children.map((child) =>
          this._createOutlineItem(child),
        );
      }
      return [];
    }
  }

  private _createOutlineItem(symbol: vscode.DocumentSymbol): OutlineItem {
    const hasChildren = symbol.children && symbol.children.length > 0;
    const collapsibleState = hasChildren
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    const item = new OutlineItem(symbol.name, symbol, collapsibleState);
    item.iconPath = this._getIconForSymbolKind(symbol.kind);
    if (symbol.detail) {
      item.description = symbol.detail;
    }
    item.tooltip = this._buildTooltip(symbol);
    item.command = {
      command: 'ablOutline.goToSymbol',
      title: 'Go to Symbol',
      arguments: [symbol.range],
    };

    return item;
  }

  private _getIconForSymbolKind(
    kind: vscode.SymbolKind,
  ): string | vscode.IconPath {
    switch (kind - 1) {
      case vscode.SymbolKind.File:
        return new vscode.ThemeIcon('file');
      case vscode.SymbolKind.Module:
        return new vscode.ThemeIcon('symbol-module');
      case vscode.SymbolKind.Namespace:
        return new vscode.ThemeIcon('symbol-namespace');
      case vscode.SymbolKind.Package:
        return new vscode.ThemeIcon('package');
      case vscode.SymbolKind.Class:
        return new vscode.ThemeIcon('symbol-class');
      case vscode.SymbolKind.Method:
        return new vscode.ThemeIcon('symbol-method');
      case vscode.SymbolKind.Property:
        return new vscode.ThemeIcon('symbol-property');
      case vscode.SymbolKind.Field:
        return new vscode.ThemeIcon('symbol-field');
      case vscode.SymbolKind.Constructor:
        return new vscode.ThemeIcon('symbol-constructor');
      case vscode.SymbolKind.Enum:
        return new vscode.ThemeIcon('symbol-enum');
      case vscode.SymbolKind.Interface:
        return new vscode.ThemeIcon('symbol-interface');
      case vscode.SymbolKind.Function:
        return new vscode.ThemeIcon('symbol-function');
      case vscode.SymbolKind.Variable:
        return new vscode.ThemeIcon('symbol-variable');
      case vscode.SymbolKind.Constant:
        return new vscode.ThemeIcon('symbol-constant');
      case vscode.SymbolKind.String:
        return new vscode.ThemeIcon('symbol-string');
      case vscode.SymbolKind.Number:
        return new vscode.ThemeIcon('symbol-number');
      case vscode.SymbolKind.Boolean:
        return new vscode.ThemeIcon('symbol-boolean');
      case vscode.SymbolKind.Array:
        return new vscode.ThemeIcon('symbol-array');
      case vscode.SymbolKind.Object:
        return new vscode.ThemeIcon('symbol-object');
      case vscode.SymbolKind.Key:
        return new vscode.ThemeIcon('symbol-key');
      case vscode.SymbolKind.Null:
        return new vscode.ThemeIcon('symbol-null');
      case vscode.SymbolKind.EnumMember:
        return new vscode.ThemeIcon('symbol-enum-member');
      case vscode.SymbolKind.Struct:
        return new vscode.ThemeIcon('symbol-struct');
      case vscode.SymbolKind.Event:
        return new vscode.ThemeIcon('symbol-event');
      case vscode.SymbolKind.Operator:
        return new vscode.ThemeIcon('symbol-operator');
      case vscode.SymbolKind.TypeParameter:
        return new vscode.ThemeIcon('symbol-type-parameter');
      case 26: // Dataset
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'dataset.svg',
          ),
        );
      case 27: // Temp-table
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'temp-table.svg',
          ),
        );
      case 28: // Buffer
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'buffer.svg',
          ),
        );
      case 29:
        return new vscode.ThemeIcon('symbol-misc');
      case 30: // Browse
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'browse.svg',
          ),
        );
      case 31: // Button
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'button.svg',
          ),
        );
      case 32: // Frame
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'frame.svg',
          ),
        );
      case 33: // Image
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'image.svg',
          ),
        );
      case 34: // Menu
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'menu.svg',
          ),
        );
      case 35: // MenuItem
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'menu.svg',
          ),
        );
      case 36: // Rectangle
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'rectangle.svg',
          ),
        );
      case 37: // Submenu
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'sub-menu.svg',
          ),
        );
      case 38: // Stream
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'stream.svg',
          ),
        );
      case 39: // Query
        return vscode.Uri.file(
          path.join(
            this.extensionPath,
            'resources',
            'images',
            'outline',
            'query.svg',
          ),
        );
      default:
        return new vscode.ThemeIcon('symbol-misc');
    }
  }

  private _getLabelForSymbolKind(kind: vscode.SymbolKind): string {
    switch (kind - 1) {
      case vscode.SymbolKind.File:
        return 'File';
      case vscode.SymbolKind.Module:
        return 'Module';
      case vscode.SymbolKind.Namespace:
        return 'Namespace';
      case vscode.SymbolKind.Package:
        return 'Package';
      case vscode.SymbolKind.Class:
        return 'Class';
      case vscode.SymbolKind.Method:
        return 'Method';
      case vscode.SymbolKind.Property:
        return 'Property';
      case vscode.SymbolKind.Field:
        return 'Field';
      case vscode.SymbolKind.Constructor:
        return 'Constructor';
      case vscode.SymbolKind.Enum:
        return 'Enum';
      case vscode.SymbolKind.Interface:
        return 'Interface';
      case vscode.SymbolKind.Function:
        return 'Function';
      case vscode.SymbolKind.Variable:
        return 'Variable';
      case vscode.SymbolKind.Constant:
        return 'Constant';
      case vscode.SymbolKind.String:
        return 'String';
      case vscode.SymbolKind.Number:
        return 'Number';
      case vscode.SymbolKind.Boolean:
        return 'Boolean';
      case vscode.SymbolKind.Array:
        return 'Array';
      case vscode.SymbolKind.Object:
        return 'Object';
      case vscode.SymbolKind.Key:
        return 'Key';
      case vscode.SymbolKind.Null:
        return 'Null';
      case vscode.SymbolKind.EnumMember:
        return 'Enum Member';
      case vscode.SymbolKind.Struct:
        return 'Struct';
      case vscode.SymbolKind.Event:
        return 'Event';
      case vscode.SymbolKind.Operator:
        return 'Operator';
      case vscode.SymbolKind.TypeParameter:
        return 'Type Parameter';
      case 26:
        return 'Dataset';
      case 27:
        return 'Temp-table';
      case 28:
        return 'Buffer';
      case 29:
        return 'Widget';
      case 30:
        return 'Browse';
      case 31:
        return 'Button';
      case 32:
        return 'Frame';
      case 33:
        return 'Image';
      case 34:
        return 'Menu';
      case 35:
        return 'Menu Item';
      case 36:
        return 'Rectangle';
      case 37:
        return 'Sub menu';
      case 38:
        return 'Stream';
      case 39:
        return 'Query';
      default:
        return 'Symbol';
    }
  }

  private _buildTooltip(symbol: vscode.DocumentSymbol): string {
    let tooltip = symbol.name;
    if (symbol.detail) {
      tooltip += `${symbol.detail}`;
    }
    tooltip += `\nKind: ${this._getLabelForSymbolKind(symbol.kind)}`;
    return tooltip;
  }
}

export class OutlineItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly symbol: vscode.DocumentSymbol,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
  }
}
