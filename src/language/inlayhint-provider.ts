/**
 * Ren'Py inlay hints provider.
 * Shows inline hints for:
 * - Character display names next to variable names in dialogue
 * - Label reference targets for jump/call
 * - Dialogue word counts
 */

import * as vscode from 'vscode';
import { ProjectIndex } from '../parser/types';
import { Parser } from '../parser/parser';

export class RenpyInlayHintsProvider implements vscode.InlayHintsProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    _token: vscode.CancellationToken,
  ): vscode.InlayHint[] {
    const hints: vscode.InlayHint[] = [];
    const index = this.getIndex();
    const fileName = vscode.workspace.asRelativePath(document.uri);
    const parsed = index.files.get(fileName);
    if (!parsed) return hints;

    this.collectHints(parsed.nodes, index, hints, range);
    return hints;
  }

  private collectHints(
    nodes: import('../parser/types').RenpyNode[],
    index: ProjectIndex,
    hints: vscode.InlayHint[],
    range: vscode.Range,
  ): void {
    for (const node of nodes) {
      if (node.line < range.start.line || node.line > range.end.line) {
        // Still check children (they might be in range)
        if (node.children.length > 0) {
          this.collectHints(node.children, index, hints, range);
        }
        continue;
      }

      // Show character display name next to variable name in dialogue
      if (node.type === 'dialogue') {
        const charEntry = index.characters.get(node.character);
        if (charEntry) {
          const displayMatch = charEntry.node.value.match(/Character\s*\(\s*(?:_\s*\(\s*)?["']([^"']+)["']/);
          if (displayMatch) {
            const displayName = displayMatch[1];
            const hint = new vscode.InlayHint(
              new vscode.Position(node.characterRange.end.line, node.characterRange.end.column),
              ` (${displayName})`,
              vscode.InlayHintKind.Type,
            );
            hint.paddingLeft = false;
            hints.push(hint);
          }
        }
      }

      // Show file location for jump/call targets
      if (node.type === 'command' && (node.command === 'jump' || node.command === 'call') && node.target && node.targetRange) {
        const entries = index.labels.get(node.target);
        if (entries && entries.length > 0) {
          const entry = entries[0];
          const hint = new vscode.InlayHint(
            new vscode.Position(node.targetRange.end.line, node.targetRange.end.column),
            ` → ${entry.file}:${entry.node.line + 1}`,
            vscode.InlayHintKind.Parameter,
          );
          hint.paddingLeft = true;
          hints.push(hint);
        }
      }

      if (node.children.length > 0) {
        this.collectHints(node.children, index, hints, range);
      }
    }
  }
}
