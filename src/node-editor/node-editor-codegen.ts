/**
 * Code generation for node editor operations.
 * Translates graph operations into .rpy file edits.
 */

import * as vscode from 'vscode';
import { ProjectIndex } from '../parser/types';

export class NodeEditorCodegen {
  constructor(private getIndex: () => ProjectIndex) {}

  /**
   * Create a new label in the project.
   */
  async createLabel(name: string, afterLabel?: string): Promise<boolean> {
    const index = this.getIndex();
    const edit = new vscode.WorkspaceEdit();

    // Determine target file and position
    let targetUri: vscode.Uri;
    let insertLine: number;

    if (afterLabel) {
      const entries = index.labels.get(afterLabel);
      if (entries && entries.length > 0) {
        const entry = entries[0];
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return false;
        targetUri = vscode.Uri.joinPath(ws.uri, entry.file);
        insertLine = this.findLabelEnd(entry.file, entry.node.line, index);
      } else {
        return false;
      }
    } else {
      // Append to the first .rpy file that has labels, or script.rpy
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) return false;

      let targetFile = 'game/script.rpy';
      for (const [, entries] of index.labels) {
        if (entries.length > 0) {
          targetFile = entries[0].file;
          break;
        }
      }
      targetUri = vscode.Uri.joinPath(ws.uri, targetFile);
      const doc = await vscode.workspace.openTextDocument(targetUri);
      insertLine = doc.lineCount;
    }

    const code = `\nlabel ${name}:\n    pass\n`;
    edit.insert(targetUri, new vscode.Position(insertLine, 0), code);

    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Create a menu under a label.
   */
  async createMenu(parentLabel: string, choices: string[]): Promise<boolean> {
    const index = this.getIndex();
    const entries = index.labels.get(parentLabel);
    if (!entries || entries.length === 0) return false;

    const entry = entries[0];
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return false;

    const targetUri = vscode.Uri.joinPath(ws.uri, entry.file);
    const insertLine = this.findInsertPoint(entry.file, entry.node.line, index);

    const menuLines = ['    menu:\n'];
    for (const choice of choices) {
      menuLines.push(`        "${choice}":\n`);
      menuLines.push(`            pass\n`);
    }

    const edit = new vscode.WorkspaceEdit();
    edit.insert(targetUri, new vscode.Position(insertLine, 0), menuLines.join(''));

    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Connect two labels with a jump or call.
   */
  async connect(from: string, to: string, edgeType: 'jump' | 'call'): Promise<boolean> {
    const index = this.getIndex();
    const entries = index.labels.get(from);
    if (!entries || entries.length === 0) return false;

    const entry = entries[0];
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return false;

    const targetUri = vscode.Uri.joinPath(ws.uri, entry.file);
    const insertLine = this.findInsertPoint(entry.file, entry.node.line, index);

    // Check if there's already a jump/return at the end — replace it
    const doc = await vscode.workspace.openTextDocument(targetUri);
    const prevLine = doc.lineAt(Math.max(0, insertLine - 1));
    const prevTrimmed = prevLine.text.trim();

    const edit = new vscode.WorkspaceEdit();
    if (prevTrimmed === 'pass') {
      // Replace 'pass' with the connection
      edit.replace(targetUri, prevLine.range, `    ${edgeType} ${to}`);
    } else if (prevTrimmed.startsWith('jump ') || prevTrimmed.startsWith('call ')) {
      // Replace existing jump/call
      edit.replace(targetUri, prevLine.range, `    ${edgeType} ${to}`);
    } else {
      // Append
      edit.insert(targetUri, new vscode.Position(insertLine, 0), `    ${edgeType} ${to}\n`);
    }

    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Disconnect two labels (remove jump/call).
   */
  async disconnect(from: string, to: string): Promise<boolean> {
    const index = this.getIndex();
    const parsedFile = this.findParsedFile(from, index);
    if (!parsedFile) return false;

    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return false;

    const entries = index.labels.get(from);
    if (!entries || entries.length === 0) return false;

    const targetUri = vscode.Uri.joinPath(ws.uri, entries[0].file);
    const doc = await vscode.workspace.openTextDocument(targetUri);

    // Find the jump/call line targeting 'to' within the label block
    const labelNode = entries[0].node;
    const endLine = this.findLabelEnd(entries[0].file, labelNode.line, index);

    const edit = new vscode.WorkspaceEdit();
    for (let i = labelNode.line + 1; i < endLine; i++) {
      const line = doc.lineAt(i);
      const trimmed = line.text.trim();
      if (trimmed === `jump ${to}` || trimmed === `call ${to}`) {
        edit.delete(targetUri, new vscode.Range(i, 0, i + 1, 0));
        break;
      }
    }

    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Delete a label and all its content.
   */
  async deleteNode(nodeId: string): Promise<boolean> {
    const index = this.getIndex();
    const entries = index.labels.get(nodeId);
    if (!entries || entries.length === 0) return false;

    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return false;

    const entry = entries[0];
    const targetUri = vscode.Uri.joinPath(ws.uri, entry.file);
    const startLine = entry.node.line;
    const endLine = this.findLabelEnd(entry.file, startLine, index);

    const edit = new vscode.WorkspaceEdit();
    edit.delete(targetUri, new vscode.Range(startLine, 0, endLine, 0));

    // Also remove all references to this label in other labels
    for (const [labelName, labelEntries] of index.labels) {
      if (labelName === nodeId) continue;
      const le = labelEntries[0];
      const leUri = vscode.Uri.joinPath(ws.uri, le.file);
      const doc = await vscode.workspace.openTextDocument(leUri);
      const leEnd = this.findLabelEnd(le.file, le.node.line, index);

      for (let i = le.node.line + 1; i < leEnd; i++) {
        const trimmed = doc.lineAt(i).text.trim();
        if (trimmed === `jump ${nodeId}` || trimmed === `call ${nodeId}`) {
          edit.delete(leUri, new vscode.Range(i, 0, i + 1, 0));
        }
      }
    }

    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Edit dialogue lines within a label.
   */
  async editDialogue(nodeId: string, lines: string[]): Promise<boolean> {
    const index = this.getIndex();
    const entries = index.labels.get(nodeId);
    if (!entries || entries.length === 0) return false;

    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return false;

    const entry = entries[0];
    const targetUri = vscode.Uri.joinPath(ws.uri, entry.file);

    // Find existing dialogue/narration lines and replace them
    const labelNode = entry.node;
    const doc = await vscode.workspace.openTextDocument(targetUri);
    const endLine = this.findLabelEnd(entry.file, labelNode.line, index);

    // Find first and last dialogue lines
    let firstDialogue = -1;
    let lastDialogue = -1;
    for (let i = labelNode.line + 1; i < endLine; i++) {
      const trimmed = doc.lineAt(i).text.trim();
      if (trimmed.startsWith('"') || /^\w+\s+"/.test(trimmed)) {
        if (firstDialogue === -1) firstDialogue = i;
        lastDialogue = i;
      }
    }

    const edit = new vscode.WorkspaceEdit();
    const newContent = lines.map(l => `    ${l}`).join('\n') + '\n';

    if (firstDialogue >= 0) {
      edit.replace(targetUri, new vscode.Range(firstDialogue, 0, lastDialogue + 1, 0), newContent);
    } else {
      // No existing dialogue — insert after label line
      edit.insert(targetUri, new vscode.Position(labelNode.line + 1, 0), newContent);
    }

    return vscode.workspace.applyEdit(edit);
  }

  /**
   * Find the end line of a label block (exclusive).
   */
  private findLabelEnd(file: string, labelLine: number, index: ProjectIndex): number {
    const parsed = index.files.get(file);
    if (!parsed) return labelLine + 1;

    // Find next top-level node after this label
    let endLine = parsed.nodes.length > 0
      ? parsed.nodes[parsed.nodes.length - 1].line + 1
      : labelLine + 2;

    for (const node of parsed.nodes) {
      if (node.line > labelLine && node.indent === 0) {
        endLine = node.line;
        break;
      }
    }

    return endLine;
  }

  /**
   * Find the best insertion point within a label (before final jump/return).
   */
  private findInsertPoint(file: string, labelLine: number, index: ProjectIndex): number {
    const endLine = this.findLabelEnd(file, labelLine, index);
    const parsed = index.files.get(file);
    if (!parsed) return endLine;

    // Walk backwards from end to find if there's a jump/return
    const labelNode = Array.from(index.labels.values())
      .flat()
      .find(e => e.file === file && e.node.line === labelLine);

    if (labelNode) {
      const children = labelNode.node.children;
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (child.type === 'blank' || child.type === 'comment') continue;
        if (child.type === 'command' && (child.command === 'jump' || child.command === 'call' || child.command === 'return')) {
          return child.line;
        }
        break;
      }
    }

    return endLine;
  }

  private findParsedFile(labelName: string, index: ProjectIndex) {
    const entries = index.labels.get(labelName);
    if (!entries || entries.length === 0) return null;
    return index.files.get(entries[0].file);
  }
}
