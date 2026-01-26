import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

type CategoryType = 'projectClasses' | 'propathClasses' | 'assemblies';

export class ClassBrowserProvider implements vscode.TreeDataProvider<ClassBrowserItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    ClassBrowserItem | undefined | void
  > = new vscode.EventEmitter<ClassBrowserItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ClassBrowserItem | undefined | void
  > = this._onDidChangeTreeData.event;
  private dataCache: Map<string, SourceCodeTypeInfo[]> = new Map();

  constructor(
    private client: LanguageClient,
    private projects: Array<any>,
  ) {}

  refresh(): void {
    // Clear all cached data
    this.dataCache.clear();
    // Fire event to reload tree from root (collapses all nodes)
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ClassBrowserItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ClassBrowserItem): Promise<ClassBrowserItem[]> {
    if (!element) {
      // Root level - show all projects
      return this._getProjectNodes();
    } else if (element.type === 'project') {
      // Project clicked - show category nodes
      return this._getCategoryNodes(element);
    } else if (element.type === 'category') {
      // Category clicked - fetch class data from language server
      return await this._getPackageNodes(element);
    } else if (element.type === 'package') {
      // Package clicked - show all classes in this package
      return this._getClassNodes(element);
    } else if (element.type === 'class') {
      // Class clicked - show methods, properties, events, etc.
      return this._getClassMemberNodes(element);
    } else {
      return [];
    }
  }

  private _getProjectNodes(): ClassBrowserItem[] {
    return this.projects
      .map((project) => {
        const projectName = project.name || project.path;
        const projectUri = project.uri?.toString() || project.path;
        return new ClassBrowserItem(
          projectName,
          'project',
          vscode.TreeItemCollapsibleState.Collapsed,
          project,
          `project:${projectUri}`,
        );
      })
      .sort((a, b) => a.label.toString().localeCompare(b.label.toString()));
  }

  private _getCategoryNodes(projectNode: ClassBrowserItem): ClassBrowserItem[] {
    const projectUri =
      projectNode.data.uri?.toString() || projectNode.data.path;
    const categories: {
      label: string;
      category: CategoryType;
      icon: string;
    }[] = [
      {
        label: 'Project Classes',
        category: 'projectClasses',
        icon: 'symbol-class',
      },
      { label: 'Propath Classes', category: 'propathClasses', icon: 'library' },
      { label: 'Assemblies', category: 'assemblies', icon: 'package' },
    ];

    return categories.map((cat) => {
      const node = new ClassBrowserItem(
        cat.label,
        'category',
        vscode.TreeItemCollapsibleState.Collapsed,
        { projectUri, category: cat.category },
        `category:${projectUri}:${cat.category}`,
      );
      node.iconPath = new vscode.ThemeIcon(cat.icon);
      return node;
    });
  }

  private async _getPackageNodes(
    categoryNode: ClassBrowserItem,
  ): Promise<ClassBrowserItem[]> {
    try {
      const projectUri = categoryNode.data.projectUri as string;
      const category = categoryNode.data.category as CategoryType;
      const cacheKey = `${category}:${projectUri}`;

      // Check cache first
      let result: SourceCodeTypeInfo[];
      if (this.dataCache.has(cacheKey)) {
        result = this.dataCache.get(cacheKey)!;
      } else {
        // Call the appropriate language server method based on category
        const requestMethod = this._getRequestMethod(category);
        result = (await this.client.sendRequest(requestMethod, {
          projectUri: projectUri,
        })) as SourceCodeTypeInfo[];

        // Cache the result
        this.dataCache.set(cacheKey, result);
      }

      // Group classes by package
      const packageMap = new Map<string, SourceCodeTypeInfo[]>();

      for (const classInfo of result) {
        const packageName = this._getPackageName(classInfo.typeName);
        if (!packageMap.has(packageName)) {
          packageMap.set(packageName, []);
        }
        packageMap.get(packageName)!.push(classInfo);
      }

      // Create package nodes
      const packageNodes: ClassBrowserItem[] = [];
      for (const [packageName, classes] of packageMap) {
        const packageNode = new ClassBrowserItem(
          packageName || '(default package)',
          'package',
          vscode.TreeItemCollapsibleState.Collapsed,
          { packageName, classes, projectUri, category },
          `package:${projectUri}:${category}:${packageName}`,
        );
        packageNode.contextValue = 'package';
        packageNode.iconPath = new vscode.ThemeIcon('symbol-namespace');
        packageNodes.push(packageNode);
      }

      return packageNodes.sort((a, b) =>
        a.label.toString().localeCompare(b.label.toString()),
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to get class information: ${error}`,
      );
      return [];
    }
  }

  private _getRequestMethod(category: CategoryType): string {
    switch (category) {
      case 'projectClasses':
        return 'proparse/sourceCodeTypeInfo';
      case 'propathClasses':
        return 'proparse/propathTypeInfo';
      case 'assemblies':
        return 'proparse/assembliesTypeInfo';
    }
  }

  private _getClassNodes(packageNode: ClassBrowserItem): ClassBrowserItem[] {
    const classes = packageNode.data.classes as SourceCodeTypeInfo[];
    const projectUri = packageNode.data.projectUri as string;
    const category = packageNode.data.category as CategoryType;
    return classes
      .map((classInfo) => {
        const className = this._getClassName(classInfo.typeName);
        const classNode = new ClassBrowserItem(
          className,
          'class',
          vscode.TreeItemCollapsibleState.Collapsed,
          { ...classInfo, projectUri, category },
          `class:${projectUri}:${category}:${classInfo.typeName}`,
        );
        classNode.contextValue = 'class';
        classNode.iconPath = this._getClassIcon(classInfo);
        classNode.tooltip = this._buildClassTooltip(classInfo);
        return classNode;
      })
      .sort((a, b) => a.label.toString().localeCompare(b.label.toString()));
  }

  private _getClassMemberNodes(
    classNode: ClassBrowserItem,
  ): ClassBrowserItem[] {
    const classInfo = classNode.data as SourceCodeTypeInfo & {
      projectUri: string;
      category: CategoryType;
    };
    const members: ClassBrowserItem[] = [];
    const classId = `${classInfo.projectUri}:${classInfo.category}:${classInfo.typeName}`;

    // Add properties
    if (classInfo.properties && classInfo.properties.length > 0) {
      for (const prop of classInfo.properties) {
        const propNode = new ClassBrowserItem(
          prop.name,
          'property',
          vscode.TreeItemCollapsibleState.None,
          prop,
          `property:${classId}:${prop.name}`,
        );
        propNode.contextValue = 'property';
        propNode.iconPath = new vscode.ThemeIcon('symbol-property');
        propNode.tooltip = this._buildPropertyTooltip(prop);
        members.push(propNode);
      }
    }

    // Add methods
    if (classInfo.methods && classInfo.methods.length > 0) {
      for (let i = 0; i < classInfo.methods.length; i++) {
        const method = classInfo.methods[i];
        const methodNode = new ClassBrowserItem(
          this._buildMethodSignature(method),
          'method',
          vscode.TreeItemCollapsibleState.None,
          method,
          `method:${classId}:${method.name}:${i}`,
        );
        methodNode.contextValue = 'method';
        methodNode.iconPath = this._getMethodIcon(method);
        methodNode.tooltip = this._buildMethodTooltip(method);
        members.push(methodNode);
      }
    }

    // Add events
    if (classInfo.events && classInfo.events.length > 0) {
      for (const event of classInfo.events) {
        const eventNode = new ClassBrowserItem(
          event.name,
          'event',
          vscode.TreeItemCollapsibleState.None,
          event,
          `event:${classId}:${event.name}`,
        );
        eventNode.contextValue = 'event';
        eventNode.iconPath = new vscode.ThemeIcon('symbol-event');
        members.push(eventNode);
      }
    }

    // Add variables
    if (classInfo.variables && classInfo.variables.length > 0) {
      for (const variable of classInfo.variables) {
        const varNode = new ClassBrowserItem(
          variable.name,
          'variable',
          vscode.TreeItemCollapsibleState.None,
          variable,
          `variable:${classId}:${variable.name}`,
        );
        varNode.contextValue = 'variable';
        varNode.iconPath = new vscode.ThemeIcon('symbol-variable');
        members.push(varNode);
      }
    }

    return members;
  }

  private _getPackageName(typeName: string): string {
    const lastDot = typeName.lastIndexOf('.');
    return lastDot > 0 ? typeName.substring(0, lastDot) : '';
  }

  private _getClassName(typeName: string): string {
    const lastDot = typeName.lastIndexOf('.');
    return lastDot > 0 ? typeName.substring(lastDot + 1) : typeName;
  }

  private _getClassIcon(classInfo: SourceCodeTypeInfo): vscode.ThemeIcon {
    if (classInfo.isInterface) {
      return new vscode.ThemeIcon('symbol-interface');
    } else if (classInfo.isAbstract) {
      return new vscode.ThemeIcon('symbol-class');
    } else {
      return new vscode.ThemeIcon('symbol-class');
    }
  }

  private _getMethodIcon(method: MethodInfo): vscode.ThemeIcon {
    if (method.isConstructor) {
      return new vscode.ThemeIcon('symbol-constructor');
    } else if (method.isStatic) {
      return new vscode.ThemeIcon('symbol-method');
    } else {
      return new vscode.ThemeIcon('symbol-method');
    }
  }

  private _buildMethodSignature(method: MethodInfo): string {
    const params = method.parameters
      .map((p) => {
        const dataType = this._getDataTypeString(p.dataType);
        return `${p.mode} ${p.name} AS ${dataType}`;
      })
      .join(', ');

    const returnType = this._getDataTypeString(method.returnType);
    const isStatic = method.isStatic ? 'STATIC ' : '';
    const isConstructor = method.isConstructor ? 'CONSTRUCTOR ' : '';

    return `${isStatic}${isConstructor}${method.name}(${params})${method.isConstructor ? '' : ': ' + returnType}`;
  }

  private _buildMethodTooltip(method: MethodInfo): string {
    const returnType = this._getDataTypeString(method.returnType);
    let tooltip = method.isConstructor
      ? 'CONSTRUCTOR'
      : `Returns: ${returnType}`;

    if (method.isStatic) {
      tooltip = 'STATIC ' + tooltip;
    }

    if (method.parameters.length > 0) {
      tooltip += '\n\nParameters:\n';
      for (const param of method.parameters) {
        const dataType = this._getDataTypeString(param.dataType);
        tooltip += `  ${param.mode} ${param.name} AS ${dataType}\n`;
      }
    }

    return tooltip;
  }

  private _buildPropertyTooltip(prop: PropertyInfo): string {
    const dataType = this._getDataTypeString(prop.dataType);
    return `Property: ${prop.name}\nType: ${dataType}`;
  }

  private _buildClassTooltip(classInfo: SourceCodeTypeInfo): string {
    let tooltip = `Class: ${classInfo.typeName}`;

    if (classInfo.parentTypeName) {
      tooltip += `\nInherits: ${classInfo.parentTypeName}`;
    }

    if (classInfo.interfaces && classInfo.interfaces.length > 0) {
      tooltip += `\nImplements: ${classInfo.interfaces.join(', ')}`;
    }

    const flags: string[] = [];
    if (classInfo.isInterface) flags.push('interface');
    if (classInfo.isAbstract) flags.push('abstract');
    if (classInfo.isFinal) flags.push('final');
    if (classInfo.isSerializable) flags.push('serializable');

    if (flags.length > 0) {
      tooltip += `\nFlags: ${flags.join(', ')}`;
    }

    return tooltip;
  }

  private _getDataTypeString(dataType: DataType): string {
    if (dataType.primitive) {
      return dataType.primitive;
    } else if (dataType.className) {
      return dataType.className;
    } else {
      return 'UNKNOWN';
    }
  }
}

export class ClassBrowserItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly type: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data: any,
    id?: string,
  ) {
    super(label, collapsibleState);
    this.id = id;
  }
}

// Interfaces matching the structure from sample.json
interface SourceCodeTypeInfo {
  typeName: string;
  parentTypeName: string;
  assemblyName: string;
  isFinal: boolean;
  isInterface: boolean;
  hasStatics: boolean;
  isBuiltIn: boolean;
  isHybrid: boolean;
  hasDotNetBase: boolean;
  isAbstract: boolean;
  isSerializable: boolean;
  isUseWidgetPool: boolean;
  interfaces: string[];
  methods: MethodInfo[];
  properties: PropertyInfo[];
  events: EventInfo[];
  variables: VariableInfo[];
  tables: any[];
  buffers: any[];
  datasets: any[];
}

interface MethodInfo {
  name: string;
  isStatic: boolean;
  isConstructor: boolean;
  extent: number;
  returnType: DataType;
  parameters: ParameterInfo[];
}

interface ParameterInfo {
  num: number;
  name: string;
  extent: number;
  mode: string;
  parameterType: string;
  dataType: DataType;
}

interface PropertyInfo {
  name: string;
  dataType: DataType;
}

interface EventInfo {
  name: string;
}

interface VariableInfo {
  name: string;
}

interface DataType {
  primitive?: string;
  className?: string;
}
