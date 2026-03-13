/**
 * Ren'Py refactoring commands (Pro feature).
 * Extracted route export, insert dialogue.
 * Ported from MCP extract_route / insert_dialogue.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, LABEL_REF_COMMANDS } from '../parser/types';
import { localize } from '../language/i18n';

export class RefactorProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  /**
   * Extract a route (all reachable labels from a starting label) into a new file.
   * BFS traversal following jumps/calls.
   */
  async extractRoute(): Promise<void> {
    const index = this.getIndex();
    const labels = [...index.labels.keys()];

    const startLabel = await vscode.window.showQuickPick(labels, {
      placeHolder: localize('Select starting label for route extraction', 'ルート抽出の開始ラベルを選択'),
    });

    if (!startLabel) return;

    // BFS to find all reachable labels
    const visited = new Set<string>();
    const queue = [startLabel];
    const routeLabels: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      routeLabels.push(current);

      const entries = index.labels.get(current);
      if (!entries) continue;

      for (const entry of entries) {
        this.findJumpTargets(entry.node.children, queue, visited);
      }
    }

    // Build the extracted content
    const lines: string[] = [];
    lines.push(`# Route extracted from label: ${startLabel}`);
    lines.push(`# Labels: ${routeLabels.join(', ')}`);
    lines.push('');

    for (const labelName of routeLabels) {
      const entries = index.labels.get(labelName);
      if (!entries) continue;

      const entry = entries[0];
      const parsed = index.files.get(entry.file);
      if (!parsed) continue;

      // Find the label node and include its raw content
      lines.push(`label ${labelName}:`);
      for (const child of entry.node.children) {
        lines.push(child.raw);
      }
      lines.push('');
    }

    // Show as a new untitled document
    const doc = await vscode.workspace.openTextDocument({
      content: lines.join('\n'),
      language: 'renpy',
    });
    await vscode.window.showTextDocument(doc);
  }

  /**
   * Insert dialogue at the current cursor position.
   */
  async insertDialogue(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'renpy') return;

    const index = this.getIndex();
    const characters = [...index.characters.entries()];

    if (characters.length === 0) {
      // Insert narration
      const text = await vscode.window.showInputBox({
        prompt: localize('Enter narration text', 'ナレーションテキストを入力'),
      });
      if (!text) return;

      const line = editor.selection.active.line;
      const indent = '    ';
      await editor.edit(editBuilder => {
        editBuilder.insert(
          new vscode.Position(line + 1, 0),
          `${indent}"${text}"\n`,
        );
      });
      return;
    }

    // Pick character
    const items = characters.map(([name, entry]) => {
      const displayMatch = entry.node.value.match(/Character\s*\(\s*["']([^"']+)["']/);
      const displayName = displayMatch ? displayMatch[1] : name;
      return { label: name, description: displayName };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: localize('Select character', 'キャラクターを選択'),
    });

    if (!selected) return;

    const text = await vscode.window.showInputBox({
      prompt: localize('Enter dialogue text', 'ダイアログテキストを入力'),
    });

    if (!text) return;

    const line = editor.selection.active.line;
    const indent = '    ';
    await editor.edit(editBuilder => {
      editBuilder.insert(
        new vscode.Position(line + 1, 0),
        `${indent}${selected.label} "${text}"\n`,
      );
    });
  }

  private findJumpTargets(nodes: RenpyNode[], queue: string[], visited: Set<string>): void {
    for (const node of nodes) {
      if (node.type === 'command' && LABEL_REF_COMMANDS.has(node.command) && node.target) {
        if (!visited.has(node.target)) {
          queue.push(node.target);
        }
      }
      if (node.children.length > 0) {
        this.findJumpTargets(node.children, queue, visited);
      }
    }
  }

  dispose(): void {}
}
