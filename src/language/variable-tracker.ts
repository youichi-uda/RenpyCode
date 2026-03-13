/**
 * Ren'Py variable tracker (Pro feature).
 * Tree view + live monitoring of game variables via bridge.
 */

import * as vscode from 'vscode';
import { ProjectIndex, DefineNode, DefaultNode } from '../parser/types';
import { BridgeManager, BridgeState } from '../bridge/bridge-manager';
import { localize } from './i18n';

class VariableItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly value: string,
    public readonly kind: 'define' | 'default' | 'live',
    public readonly file?: string,
    public readonly line?: number,
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.tooltip = `${name} = ${value}${file ? `\n${file}:${(line ?? 0) + 1}` : ''}`;
    this.iconPath = kind === 'live'
      ? new vscode.ThemeIcon('eye')
      : kind === 'default'
        ? new vscode.ThemeIcon('symbol-variable')
        : new vscode.ThemeIcon('symbol-constant');

    if (file && line !== undefined) {
      this.command = {
        command: 'vscode.open',
        title: 'Go to Definition',
        arguments: [
          vscode.Uri.file(file),
          { selection: new vscode.Range(line, 0, line, 0) },
        ],
      };
    }
  }
}

export class VariableTrackerProvider implements vscode.TreeDataProvider<VariableItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<VariableItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _liveVariables: Record<string, unknown> = {};

  constructor(
    private getIndex: () => ProjectIndex,
    private bridge?: BridgeManager,
  ) {
    // Listen to bridge state changes
    bridge?.onStateChanged((state: BridgeState) => {
      if (state.variables) {
        this._liveVariables = state.variables;
        this.refresh();
      }
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: VariableItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: VariableItem): VariableItem[] {
    const index = this.getIndex();
    const items: VariableItem[] = [];

    // Static variables (from defines/defaults)
    for (const [name, entry] of index.variables) {
      const node = entry.node;
      const kind = node.type === 'define' ? 'define' as const : 'default' as const;
      const value = (node as DefineNode | DefaultNode).value;

      // If we have a live value, use that instead
      const liveVal = this._liveVariables[name];
      const displayValue = liveVal !== undefined ? String(liveVal) : value;

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const filePath = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder.uri, entry.file).fsPath
        : entry.file;

      items.push(new VariableItem(name, displayValue, kind, filePath, node.line));
    }

    // Live-only variables (not in define/default)
    for (const [name, value] of Object.entries(this._liveVariables)) {
      if (!index.variables.has(name)) {
        items.push(new VariableItem(name, String(value), 'live'));
      }
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Fetch live variables from bridge.
   */
  async fetchLiveVariables(): Promise<void> {
    if (!this.bridge?.isConnected()) return;

    const response = await this.bridge.getState();
    if (response?.status === 'ok' && response.variables) {
      this._liveVariables = response.variables as Record<string, unknown>;
      this.refresh();
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

/**
 * Register the variable tracker tree view.
 */
export function registerVariableTracker(
  context: vscode.ExtensionContext,
  getIndex: () => ProjectIndex,
  bridge?: BridgeManager,
): VariableTrackerProvider {
  const provider = new VariableTrackerProvider(getIndex, bridge);

  context.subscriptions.push(
    vscode.window.createTreeView('renpyCode.variablesView', {
      treeDataProvider: provider,
      showCollapseAll: true,
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('renpyCode.refreshVariables', () => {
      provider.fetchLiveVariables();
    }),
  );

  return provider;
}
