/**
 * Ren'Py screen structure tree view.
 * Shows hierarchical widget structure of screen definitions.
 */

import * as vscode from 'vscode';
import { ProjectIndex, ScreenNode, RenpyNode } from '../parser/types';

const WIDGET_ICONS: Record<string, string> = {
  // Layout
  vbox: 'layout',
  hbox: 'layout',
  grid: 'layout',
  fixed: 'layout',
  frame: 'window',
  viewport: 'preview',
  vpgrid: 'preview',
  side: 'layout',
  // Interactive
  button: 'play',
  textbutton: 'play',
  imagebutton: 'play',
  input: 'edit',
  bar: 'graph-line',
  vbar: 'graph-line',
  slider: 'settings',
  // Display
  text: 'symbol-string',
  label: 'tag',
  image: 'file-media',
  add: 'add',
  // Navigation
  use: 'references',
  // Control
  if: 'git-compare',
  elif: 'git-compare',
  else: 'git-compare',
  for: 'sync',
  on: 'zap',
  action: 'run',
  // Other
  default: 'symbol-variable',
  timer: 'watch',
  key: 'key',
  mousearea: 'target',
  has: 'arrow-right',
  null: 'circle-slash',
  hotspot: 'target',
  hotbar: 'graph-line',
};

class ScreenTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly children: ScreenTreeItem[],
    public readonly file?: string,
    public readonly line?: number,
  ) {
    super(
      label,
      children.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );

    // Extract widget name for icon
    const widgetName = label.split(/[\s(]/)[0].toLowerCase();
    const iconName = WIDGET_ICONS[widgetName] || 'symbol-misc';
    this.iconPath = new vscode.ThemeIcon(iconName);

    if (file && line !== undefined) {
      this.command = {
        command: 'vscode.open',
        title: 'Go to Definition',
        arguments: [
          vscode.Uri.file(file),
          { selection: new vscode.Range(line, 0, line, 0) },
        ],
      };
      this.tooltip = `${file}:${line + 1}`;
    }
  }
}

export class ScreenTreeProvider implements vscode.TreeDataProvider<ScreenTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ScreenTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private getIndex: () => ProjectIndex) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ScreenTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ScreenTreeItem): ScreenTreeItem[] {
    if (element) {
      return element.children;
    }

    // Root: list all screens
    const index = this.getIndex();
    const items: ScreenTreeItem[] = [];

    for (const [name, entries] of index.screens) {
      for (const entry of entries) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const filePath = workspaceFolder
          ? vscode.Uri.joinPath(workspaceFolder.uri, entry.file).fsPath
          : entry.file;

        const params = entry.node.parameters ? `(${entry.node.parameters})` : '';
        const children = this.buildChildren(entry.node.children, filePath);

        const item = new ScreenTreeItem(
          `screen ${name}${params}`,
          children,
          filePath,
          entry.node.line,
        );
        item.iconPath = new vscode.ThemeIcon('window');
        items.push(item);
      }
    }

    return items.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
  }

  private buildChildren(nodes: RenpyNode[], filePath: string): ScreenTreeItem[] {
    const items: ScreenTreeItem[] = [];

    for (const node of nodes) {
      // Skip blanks and comments
      if (node.type === 'blank' || node.type === 'comment') continue;

      const label = this.getNodeLabel(node);
      const children = node.children ? this.buildChildren(node.children, filePath) : [];

      items.push(new ScreenTreeItem(label, children, filePath, node.line));
    }

    return items;
  }

  private getNodeLabel(node: RenpyNode): string {
    switch (node.type) {
      case 'command':
        return node.target ? `${node.command} ${node.target}` : node.command;
      case 'if_block':
        return `${node.keyword} ${node.condition || ''}`.trim();
      case 'for_block':
        return `for ${node.variable} in ${node.iterable}`;
      case 'while_block':
        return `while ${node.condition}`;
      case 'python_line':
        return `$ ${node.expression}`;
      case 'dialogue':
        return `${node.character} "${node.text}"`;
      case 'narration':
        return `"${node.text}"`;
      case 'default':
        return `default ${node.name} = ${node.value}`;
      case 'define':
        return `define ${node.name} = ${node.value}`;
      default:
        return node.raw.trim();
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

export function registerScreenTree(
  context: vscode.ExtensionContext,
  getIndex: () => ProjectIndex,
): ScreenTreeProvider {
  const provider = new ScreenTreeProvider(getIndex);

  context.subscriptions.push(
    vscode.window.createTreeView('renpyCode.screensView', {
      treeDataProvider: provider,
      showCollapseAll: true,
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.refreshScreens', () => {
      provider.refresh();
    }),
  );

  return provider;
}
