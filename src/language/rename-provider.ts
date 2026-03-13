/**
 * Ren'Py rename provider (Pro feature).
 * Safely renames labels, characters, and screens across the project.
 * Ported from MCP rename_character / rename_label.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, LABEL_REF_COMMANDS } from '../parser/types';
import { LicenseManager } from '../license/license-manager';

export class RenpyRenameProvider implements vscode.RenameProvider {
  constructor(
    private getIndex: () => ProjectIndex,
    private licenseManager: LicenseManager,
  ) {}

  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Range | { range: vscode.Range; placeholder: string } | undefined {
    const range = document.getWordRangeAtPosition(position, /\w+/);
    if (!range) return undefined;

    const word = document.getText(range);
    const index = this.getIndex();

    // Only allow renaming labels, characters, screens
    if (index.labels.has(word) || index.characters.has(word) || index.screens.has(word)) {
      return { range, placeholder: word };
    }

    return undefined;
  }

  async provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    _token: vscode.CancellationToken,
  ): Promise<vscode.WorkspaceEdit | undefined> {
    // Pro feature gate
    if (!(await this.licenseManager.requirePro('refactoring'))) {
      return undefined;
    }

    const range = document.getWordRangeAtPosition(position, /\w+/);
    if (!range) return undefined;

    const oldName = document.getText(range);
    const index = this.getIndex();
    const edit = new vscode.WorkspaceEdit();

    // ── Rename label ──
    if (index.labels.has(oldName)) {
      this.renameLabelAll(oldName, newName, index, edit);
      return edit;
    }

    // ── Rename character ──
    if (index.characters.has(oldName)) {
      this.renameCharacterAll(oldName, newName, index, edit);
      return edit;
    }

    // ── Rename screen ──
    if (index.screens.has(oldName)) {
      this.renameScreenAll(oldName, newName, index, edit);
      return edit;
    }

    return undefined;
  }

  private renameLabelAll(oldName: string, newName: string, index: ProjectIndex, edit: vscode.WorkspaceEdit): void {
    for (const [filePath, parsed] of index.files) {
      const uri = this.resolveUri(filePath);
      const text = this.getFileText(parsed.nodes);

      // Rename label definitions
      if (parsed.labels.has(oldName)) {
        const labelNode = parsed.labels.get(oldName)!;
        edit.replace(uri, new vscode.Range(
          labelNode.nameRange.start.line, labelNode.nameRange.start.column,
          labelNode.nameRange.end.line, labelNode.nameRange.end.column,
        ), newName);
      }

      // Rename jump/call references
      this.renameInNodes(parsed.nodes, uri, edit, (node) => {
        if (node.type === 'command' && LABEL_REF_COMMANDS.has(node.command) && node.target === oldName && node.targetRange) {
          return { range: node.targetRange, newText: newName };
        }
        return undefined;
      });
    }
  }

  private renameCharacterAll(oldName: string, newName: string, index: ProjectIndex, edit: vscode.WorkspaceEdit): void {
    for (const [filePath, parsed] of index.files) {
      const uri = this.resolveUri(filePath);

      // Rename define statement
      if (parsed.characters.has(oldName)) {
        const defNode = parsed.characters.get(oldName)!;
        edit.replace(uri, new vscode.Range(
          defNode.nameRange.start.line, defNode.nameRange.start.column,
          defNode.nameRange.end.line, defNode.nameRange.end.column,
        ), newName);
      }

      // Rename dialogue references
      this.renameInNodes(parsed.nodes, uri, edit, (node) => {
        if (node.type === 'dialogue' && node.character === oldName) {
          return { range: node.characterRange, newText: newName };
        }
        return undefined;
      });
    }
  }

  private renameScreenAll(oldName: string, newName: string, index: ProjectIndex, edit: vscode.WorkspaceEdit): void {
    for (const [filePath, parsed] of index.files) {
      const uri = this.resolveUri(filePath);

      // Rename screen definitions
      if (parsed.screens.has(oldName)) {
        const screenNode = parsed.screens.get(oldName)!;
        edit.replace(uri, new vscode.Range(
          screenNode.nameRange.start.line, screenNode.nameRange.start.column,
          screenNode.nameRange.end.line, screenNode.nameRange.end.column,
        ), newName);
      }

      // Rename "use screen" / "show screen" / "call screen" references in raw text
      for (let i = 0; i < parsed.nodes.length; i++) {
        this.renameScreenRefInNodes(parsed.nodes, oldName, newName, uri, edit);
      }
    }
  }

  private renameScreenRefInNodes(
    nodes: RenpyNode[],
    oldName: string,
    newName: string,
    uri: vscode.Uri,
    edit: vscode.WorkspaceEdit,
  ): void {
    for (const node of nodes) {
      const trimmed = node.raw.trimStart();
      const indent = node.raw.length - trimmed.length;

      // "use oldName" or "show screen oldName" or "call screen oldName"
      const patterns = [
        { prefix: 'use ', offset: 4 },
        { prefix: 'show screen ', offset: 12 },
        { prefix: 'call screen ', offset: 12 },
      ];

      for (const { prefix, offset } of patterns) {
        if (trimmed.startsWith(prefix + oldName)) {
          const col = indent + offset;
          edit.replace(uri, new vscode.Range(
            node.line, col,
            node.line, col + oldName.length,
          ), newName);
        }
      }

      if (node.children.length > 0) {
        this.renameScreenRefInNodes(node.children, oldName, newName, uri, edit);
      }
    }
  }

  private renameInNodes(
    nodes: RenpyNode[],
    uri: vscode.Uri,
    edit: vscode.WorkspaceEdit,
    matcher: (node: RenpyNode) => { range: import('../parser/types').Range; newText: string } | undefined,
  ): void {
    for (const node of nodes) {
      const result = matcher(node);
      if (result) {
        edit.replace(uri, new vscode.Range(
          result.range.start.line, result.range.start.column,
          result.range.end.line, result.range.end.column,
        ), result.newText);
      }
      if (node.children.length > 0) {
        this.renameInNodes(node.children, uri, edit, matcher);
      }
    }
  }

  private resolveUri(file: string): vscode.Uri {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return workspaceFolder
      ? vscode.Uri.joinPath(workspaceFolder.uri, file)
      : vscode.Uri.file(file);
  }

  private getFileText(nodes: RenpyNode[]): string {
    return nodes.map(n => n.raw).join('\n');
  }
}
