/**
 * Ren'Py call hierarchy provider.
 * Shows incoming/outgoing calls for labels (jump/call relationships).
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, LABEL_REF_COMMANDS } from '../parser/types';

export class RenpyCallHierarchyProvider implements vscode.CallHierarchyProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  prepareCallHierarchy(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.CallHierarchyItem | undefined {
    const range = document.getWordRangeAtPosition(position, /\w+/);
    if (!range) return undefined;

    const word = document.getText(range);
    const index = this.getIndex();

    // Check if word is a label
    const entries = index.labels.get(word);
    if (!entries || entries.length === 0) return undefined;

    const entry = entries[0];
    return new vscode.CallHierarchyItem(
      vscode.SymbolKind.Function,
      word,
      `label ${word}`,
      this.resolveUri(entry.file),
      new vscode.Range(entry.node.line, 0, entry.node.line, entry.node.raw.length),
      new vscode.Range(
        entry.node.nameRange.start.line, entry.node.nameRange.start.column,
        entry.node.nameRange.end.line, entry.node.nameRange.end.column,
      ),
    );
  }

  provideCallHierarchyIncomingCalls(
    item: vscode.CallHierarchyItem,
    _token: vscode.CancellationToken,
  ): vscode.CallHierarchyIncomingCall[] {
    const labelName = item.name;
    const index = this.getIndex();
    const calls: vscode.CallHierarchyIncomingCall[] = [];

    for (const [filePath, parsed] of index.files) {
      this.findIncomingCalls(parsed.nodes, labelName, filePath, index, calls);
    }

    return calls;
  }

  provideCallHierarchyOutgoingCalls(
    item: vscode.CallHierarchyItem,
    _token: vscode.CancellationToken,
  ): vscode.CallHierarchyOutgoingCall[] {
    const labelName = item.name;
    const index = this.getIndex();
    const entries = index.labels.get(labelName);
    if (!entries || entries.length === 0) return [];

    const calls: vscode.CallHierarchyOutgoingCall[] = [];
    const entry = entries[0];

    this.findOutgoingCalls(entry.node.children, entry.file, index, calls);

    return calls;
  }

  private findIncomingCalls(
    nodes: RenpyNode[],
    targetLabel: string,
    file: string,
    index: ProjectIndex,
    calls: vscode.CallHierarchyIncomingCall[],
  ): void {
    for (const node of nodes) {
      if (node.type === 'command' && LABEL_REF_COMMANDS.has(node.command) && node.target === targetLabel) {
        // Find which label this call is inside
        const containingLabel = this.findContainingLabel(node.line, file, index);
        if (containingLabel) {
          const fromItem = new vscode.CallHierarchyItem(
            vscode.SymbolKind.Function,
            containingLabel.name,
            `label ${containingLabel.name}`,
            this.resolveUri(file),
            new vscode.Range(containingLabel.line, 0, containingLabel.line, containingLabel.raw.length),
            new vscode.Range(
              containingLabel.nameRange.start.line, containingLabel.nameRange.start.column,
              containingLabel.nameRange.end.line, containingLabel.nameRange.end.column,
            ),
          );

          const fromRange = new vscode.Range(node.line, 0, node.line, node.raw.length);
          calls.push(new vscode.CallHierarchyIncomingCall(fromItem, [fromRange]));
        }
      }

      if (node.children.length > 0) {
        this.findIncomingCalls(node.children, targetLabel, file, index, calls);
      }
    }
  }

  private findOutgoingCalls(
    nodes: RenpyNode[],
    file: string,
    index: ProjectIndex,
    calls: vscode.CallHierarchyOutgoingCall[],
  ): void {
    for (const node of nodes) {
      if (node.type === 'command' && LABEL_REF_COMMANDS.has(node.command) && node.target) {
        const targetEntries = index.labels.get(node.target);
        if (targetEntries && targetEntries.length > 0) {
          const targetEntry = targetEntries[0];
          const toItem = new vscode.CallHierarchyItem(
            vscode.SymbolKind.Function,
            node.target,
            `label ${node.target}`,
            this.resolveUri(targetEntry.file),
            new vscode.Range(targetEntry.node.line, 0, targetEntry.node.line, targetEntry.node.raw.length),
            new vscode.Range(
              targetEntry.node.nameRange.start.line, targetEntry.node.nameRange.start.column,
              targetEntry.node.nameRange.end.line, targetEntry.node.nameRange.end.column,
            ),
          );

          const fromRange = new vscode.Range(node.line, 0, node.line, node.raw.length);
          calls.push(new vscode.CallHierarchyOutgoingCall(toItem, [fromRange]));
        }
      }

      if (node.children.length > 0) {
        this.findOutgoingCalls(node.children, file, index, calls);
      }
    }
  }

  private findContainingLabel(
    line: number,
    file: string,
    index: ProjectIndex,
  ): import('../parser/types').LabelNode | undefined {
    const parsed = index.files.get(file);
    if (!parsed) return undefined;

    let bestLabel: import('../parser/types').LabelNode | undefined;
    for (const [, labelNode] of parsed.labels) {
      if (labelNode.line <= line) {
        if (!bestLabel || labelNode.line > bestLabel.line) {
          bestLabel = labelNode;
        }
      }
    }
    return bestLabel;
  }

  private resolveUri(file: string): vscode.Uri {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, file)
      : vscode.Uri.file(file);
  }
}
