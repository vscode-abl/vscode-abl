import path = require('path');
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { outputChannel } from './ablStatus';

const ABL_TAG_PRIVATE = 2;
const ABL_TAG_PROTECTED = 4;
const ABL_TAG_PUBLIC = 5;
const ABL_TAG_FINAL = 10;
const ABL_TAG_CONSTRUCTOR = 27;
const ABL_TAG_DESTRUCTOR = 28;
const ABL_TAG_SHARED = 34;
const ABL_TAG_DB_REQUIRED = 36;
const ABL_TAG_PACKAGE_PRIVATE = 38;
const ABL_TAG_PACKAGE_PROTECTED = 39;

const VISIBILITY_DOT_COLORS: Partial<Record<number, string>> = {
  [ABL_TAG_PUBLIC]: '#2CBF4E',
  [ABL_TAG_PACKAGE_PROTECTED]: '#faf62a',
  [ABL_TAG_PROTECTED]: '#E8A838',
  [ABL_TAG_PACKAGE_PRIVATE]: '#e06838',
  [ABL_TAG_PRIVATE]: '#E03838',
};

// Extended DocumentSymbol with optional URI for symbols defined in other files
interface ExtendedDocumentSymbol extends vscode.DocumentSymbol {
  uri?: string;
  fileId: number;
  children: ExtendedDocumentSymbol[];
}

export class AblOutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
  private readonly _onDidChangeTreeData: vscode.EventEmitter<
    OutlineItem | undefined | void
  > = new vscode.EventEmitter<OutlineItem | undefined | void>();

  readonly onDidChangeTreeData: vscode.Event<OutlineItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private currentDocumentUri: string | undefined;
  private readonly extensionPath: string;
  private readonly iconCacheDir: string;
  private readonly iconPathCache = new Map<string, string>();

  constructor(
    private readonly client: LanguageClient,
    extensionPath: string,
    globalStoragePath: string,
  ) {
    this.extensionPath = extensionPath;
    this.iconCacheDir = path.join(globalStoragePath, 'abl-icon-cache');
    fs.mkdirSync(this.iconCacheDir, { recursive: true });
    // Listen to active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      outputChannel.appendLine(
        'onDidChangeActiveTextEditor: ' + editor?.document.uri.toString(),
      );
      if (editor?.document.languageId === 'abl') {
        this.currentDocumentUri = editor.document.uri.toString();
        this.refresh();
      }
    });

    // Listen to document changes
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        event.document === vscode.window.activeTextEditor?.document &&
        vscode.window.activeTextEditor?.document.languageId === 'abl'
      ) {
        outputChannel.appendLine(
          'Document changed: ' + event.document.uri.toString(),
        );
        this.currentDocumentUri = event.document.uri.toString();
        this.refresh();
      }
    });

    // Set initial document if there's an active editor
    if (vscode.window.activeTextEditor?.document.languageId === 'abl') {
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

    if (element) {
      // Return children of the element
      if (element.symbol.children && element.symbol.children.length > 0) {
        return element.symbol.children.map((child) =>
          this._createOutlineItem(child, element.symbolUri),
        );
      }
      return [];
    } else {
      // Root level - request document symbols from language server
      try {
        const symbols = await this.client.sendRequest<ExtendedDocumentSymbol[]>(
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

        return symbols.map((symbol) =>
          this._createOutlineItem(symbol, this.currentDocumentUri),
        );
      } catch (error) {
        console.error('Error retrieving document symbols:', error);
        return [];
      }
    }
  }

  private _getIconDecorators(
    tags: readonly vscode.SymbolTag[] | undefined,
  ): string {
    if (!tags) return "";
    let decoration = "";
    for (const tag of tags) {
      if (tag.valueOf() === ABL_TAG_PUBLIC)
        decoration += `<circle cx="13" cy="13" r="3" fill="${VISIBILITY_DOT_COLORS[ABL_TAG_PUBLIC]}"/>`;
      else if (tag.valueOf() === ABL_TAG_PACKAGE_PROTECTED)
        decoration += `<circle cx="13" cy="13" r="3" fill="${VISIBILITY_DOT_COLORS[ABL_TAG_PACKAGE_PROTECTED]}"/>`;
      else if (tag.valueOf() === ABL_TAG_PROTECTED)
        decoration += `<circle cx="13" cy="13" r="3" fill="${VISIBILITY_DOT_COLORS[ABL_TAG_PROTECTED]}"/>`;
      else if (tag.valueOf() === ABL_TAG_PACKAGE_PRIVATE)
        decoration += `<circle cx="13" cy="13" r="3" fill="${VISIBILITY_DOT_COLORS[ABL_TAG_PACKAGE_PRIVATE]}"/>`;
      else if (tag.valueOf() === ABL_TAG_PRIVATE)
        decoration += `<circle cx="13" cy="13" r="3" fill="${VISIBILITY_DOT_COLORS[ABL_TAG_PRIVATE]}"/>`;
      else if (tag.valueOf() === ABL_TAG_FINAL)
        decoration += `<text x="0" y="16" font-family="monospace" font-size="12" font-weight="bolder" fill="#E03838">F</text>`;
      else if (tag.valueOf() === ABL_TAG_CONSTRUCTOR)
        decoration += `<text x="0" y="16" font-family="monospace" font-size="12" font-weight="bolder" fill="#E03838">C</text>`;
      else if (tag.valueOf() === ABL_TAG_DESTRUCTOR)
        decoration += `<text x="0" y="16" font-family="monospace" font-size="12" font-weight="bolder" fill="#E03838">D</text>`;
      else if (tag.valueOf() === ABL_TAG_SHARED)
        decoration += `<text x="0" y="16" font-family="monospace" font-size="12" font-weight="bolder" fill="#E03838">S</text>`;
      else if (tag.valueOf() === ABL_TAG_DB_REQUIRED)
        decoration += `<text x="0" y="8" font-family="monospace" font-size="10" font-weight="bolder" fill="#5080FF">DB</text>`;
    }
    return decoration;
  }

  private _getVisibilityDotColor(
    tags: readonly vscode.SymbolTag[] | undefined,
  ): string | undefined {
    if (!tags) return undefined;
    for (const tag of tags) {
      const color = VISIBILITY_DOT_COLORS[tag];
      if (color) return color;
    }
    return undefined;
  }

  private _getCompositeIconUri(
    baseIconPath: string,
    tags: readonly vscode.SymbolTag[] | undefined,
    decoration: string,
  ): vscode.Uri {
    const tagKey = tags ? tags.map((t) => t.valueOf()).sort((a, b) => a - b).join('-') : '';
    const cacheKey = baseIconPath + ':v1:' + tagKey;
    const cached = this.iconPathCache.get(cacheKey);
    if (cached) return vscode.Uri.file(cached);

    const hash = crypto.createHash('md5').update(cacheKey).digest('hex');
    const cachePath = path.join(this.iconCacheDir, hash + '.svg');

    if (!fs.existsSync(cachePath)) {
      try {
        const baseSvg = fs.readFileSync(baseIconPath, 'utf8');
        fs.writeFileSync(
          cachePath,
          baseSvg.replace('</svg>', `${decoration}</svg>`),
          'utf8',
        );
      } catch (err) {
        outputChannel.appendLine(`Failed to generate composite icon: ${err}`);
        return vscode.Uri.file(baseIconPath);
      }
    }

    this.iconPathCache.set(cacheKey, cachePath);
    return vscode.Uri.file(cachePath);
  }

  private _createOutlineItem(
    symbol: ExtendedDocumentSymbol,
    parentUri?: string,
  ): OutlineItem {
    const hasChildren = symbol.children && symbol.children.length > 0;
    const collapsibleState = hasChildren
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    // Use symbol's own URI if available, otherwise use parent URI
    const symbolUri = symbol.uri || parentUri;

    const item = new OutlineItem(
      symbol.name,
      symbol,
      collapsibleState,
      symbolUri,
    );
    const baseIcon = this._getIconForSymbolKind(symbol.kind);
    const dotColor = this._getVisibilityDotColor(symbol.tags);
    const decoration = this._getIconDecorators(symbol.tags);
    if (dotColor && baseIcon instanceof vscode.Uri) {
      item.iconPath = this._getCompositeIconUri(baseIcon.fsPath, symbol.tags, decoration);
    } else {
      item.iconPath = baseIcon;
    }
    item.resourceUri = vscode.Uri.parse('abl-outline:/' + symbol.kind);
    if (symbol.detail) {
      item.description = symbol.detail;
    }
    item.tooltip = this._buildTooltip(symbol);
    item.command = {
      command: 'ablOutline.goToSymbol',
      title: 'Go to Symbol',
      arguments: [symbol.range, symbolUri],
    };

    return item;
  }

  private _getIconForSymbolKind(
    kind: vscode.SymbolKind,
  ): vscode.Uri | vscode.ThemeIcon {
    const svg = (name: string) =>
      vscode.Uri.file(
        path.join(
          this.extensionPath,
          'resources',
          'images',
          'outline',
          `${name}.svg`,
        ),
      );

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
        return svg('symbol-method');
      case vscode.SymbolKind.Property:
        return svg('symbol-property');
      case vscode.SymbolKind.Field:
        return svg('symbol-field');
      case vscode.SymbolKind.Constructor:
        return svg('symbol-method');
      case vscode.SymbolKind.Enum:
        return new vscode.ThemeIcon('symbol-enum');
      case vscode.SymbolKind.Interface:
        return new vscode.ThemeIcon('symbol-interface');
      case vscode.SymbolKind.Function:
        return svg('symbol-method');
      case vscode.SymbolKind.Variable:
        return svg('symbol-variable');
      case vscode.SymbolKind.Constant:
        return svg('symbol-constant');
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
      case 26:
        return svg('dataset');
      case 27:
        return svg('temp-table');
      case 28:
        return svg('buffer');
      case 29:
        return new vscode.ThemeIcon('symbol-misc');
      case 30:
        return svg('browse');
      case 31:
        return svg('button');
      case 32:
        return svg('frame');
      case 33:
        return svg('image');
      case 34: // Menu
      case 35:
        return svg('menu'); // MenuItem
      case 36:
        return svg('rectangle');
      case 37:
        return svg('sub-menu');
      case 38:
        return svg('stream');
      case 39:
        return svg('query');
      case 40:
        return svg('procedure');
      case 41:
        return svg('function-prototype');
      case 42:
        return svg('trigger');
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
      case 40:
        return 'Procedure';
      case 41:
        return 'FunctionPrototype';
      case 42:
        return 'Trigger';
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
    public readonly symbol: ExtendedDocumentSymbol,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly symbolUri?: string,
  ) {
    super(label, collapsibleState);
  }
}
