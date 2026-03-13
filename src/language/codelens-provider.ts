/**
 * Ren'Py CodeLens provider.
 * Shows reference counts above label definitions.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, LABEL_REF_COMMANDS } from '../parser/types';
import { Parser } from '../parser/parser';
import { localize } from './i18n';

export class RenpyCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private getIndex: () => ProjectIndex) {}

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const fileName = vscode.workspace.asRelativePath(document.uri);
    const index = this.getIndex();
    const parsed = index.files.get(fileName);
    if (!parsed) return [];

    const lenses: vscode.CodeLens[] = [];

    // Labels
    for (const [name, node] of parsed.labels) {
      const count = this.countLabelReferences(name, index);
      const range = new vscode.Range(node.line, 0, node.line, 0);
      const title = vscode.l10n.t('{0} references', count);
      const lens = new vscode.CodeLens(range, {
        title,
        command: 'editor.action.findReferences',
        arguments: [document.uri, new vscode.Position(node.nameRange.start.line, node.nameRange.start.column)],
      });
      lenses.push(lens);
    }

    // Screens
    for (const [name, node] of parsed.screens) {
      const count = this.countScreenReferences(name, index);
      const range = new vscode.Range(node.line, 0, node.line, 0);
      const title = vscode.l10n.t('{0} references', count);
      const lens = new vscode.CodeLens(range, {
        title,
        command: 'editor.action.findReferences',
        arguments: [document.uri, new vscode.Position(node.nameRange.start.line, node.nameRange.start.column)],
      });
      lenses.push(lens);
    }

    return lenses;
  }

  private countLabelReferences(name: string, index: ProjectIndex): number {
    let count = 0;
    for (const [, parsed] of index.files) {
      count += this.countInNodes(parsed.nodes, name, 'label');
    }
    return count;
  }

  private countScreenReferences(name: string, index: ProjectIndex): number {
    let count = 0;
    for (const [, parsed] of index.files) {
      count += this.countInNodes(parsed.nodes, name, 'screen');
    }
    return count;
  }

  private countInNodes(nodes: RenpyNode[], name: string, refType: 'label' | 'screen'): number {
    let count = 0;

    for (const node of nodes) {
      if (refType === 'label' && node.type === 'command' && LABEL_REF_COMMANDS.has(node.command) && node.target === name) {
        count++;
      }

      // Count screen references in raw text (show screen X, call screen X, use X)
      if (refType === 'screen' && node.type === 'command') {
        if (node.target && node.raw.includes('screen') && node.target === name) {
          count++;
        }
      }
      if (refType === 'screen' && node.type === 'unknown') {
        const trimmed = node.raw.trimStart();
        if (trimmed.startsWith('use ') && trimmed.substring(4).trim().startsWith(name)) {
          count++;
        }
      }

      if (node.children.length > 0) {
        count += this.countInNodes(node.children, name, refType);
      }
    }

    return count;
  }
}
