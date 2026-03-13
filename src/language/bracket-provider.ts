/**
 * Ren'Py bracket highlight provider.
 * Highlights matching if/elif/else blocks, label sections, and menu choices.
 */

import * as vscode from 'vscode';
import { Parser } from '../parser/parser';
import { RenpyNode } from '../parser/types';

export class RenpyBracketHighlightProvider implements vscode.DocumentHighlightProvider {
  provideDocumentHighlights(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.DocumentHighlight[] {
    const line = document.lineAt(position.line);
    const trimmed = line.text.trimStart();
    const highlights: vscode.DocumentHighlight[] = [];

    // Highlight matching if/elif/else blocks
    if (/^(if|elif|else)\b/.test(trimmed)) {
      const indent = line.firstNonWhitespaceCharacterIndex;
      this.findIfChain(document, position.line, indent, highlights);
    }

    // Highlight matching menu choices
    if (trimmed.startsWith('menu')) {
      const indent = line.firstNonWhitespaceCharacterIndex;
      this.findMenuBlock(document, position.line, indent, highlights);
    }

    return highlights;
  }

  private findIfChain(
    document: vscode.TextDocument,
    startLine: number,
    indent: number,
    highlights: vscode.DocumentHighlight[],
  ): void {
    // Search backwards for the 'if' start
    let ifStart = startLine;
    for (let i = startLine - 1; i >= 0; i--) {
      const line = document.lineAt(i);
      const trimmed = line.text.trimStart();
      if (trimmed === '') continue;
      const lineIndent = line.firstNonWhitespaceCharacterIndex;
      if (lineIndent === indent) {
        if (trimmed.startsWith('if ') || trimmed.startsWith('if\t')) {
          ifStart = i;
          break;
        } else if (trimmed.startsWith('elif ') || trimmed.startsWith('else')) {
          continue;
        } else {
          break;
        }
      } else if (lineIndent < indent) {
        break;
      }
    }

    // Search forward from ifStart to find all branches
    for (let i = ifStart; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const trimmed = line.text.trimStart();
      if (trimmed === '') continue;
      const lineIndent = line.firstNonWhitespaceCharacterIndex;
      if (lineIndent < indent) break;
      if (lineIndent === indent) {
        if (/^(if|elif|else)\b/.test(trimmed)) {
          const keywordLen = trimmed.match(/^(if|elif|else)/)![0].length;
          highlights.push(new vscode.DocumentHighlight(
            new vscode.Range(i, indent, i, indent + keywordLen),
            vscode.DocumentHighlightKind.Text,
          ));
        } else if (i > ifStart) {
          break;
        }
      }
    }
  }

  private findMenuBlock(
    document: vscode.TextDocument,
    menuLine: number,
    indent: number,
    highlights: vscode.DocumentHighlight[],
  ): void {
    highlights.push(new vscode.DocumentHighlight(
      new vscode.Range(menuLine, indent, menuLine, indent + 4),
      vscode.DocumentHighlightKind.Text,
    ));

    // Find all choice lines (strings ending with ':')
    for (let i = menuLine + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const trimmed = line.text.trimStart();
      if (trimmed === '') continue;
      const lineIndent = line.firstNonWhitespaceCharacterIndex;
      if (lineIndent <= indent) break;
      if (/^"[^"]*"\s*(?:if\s+.+)?\s*:$/.test(trimmed)) {
        highlights.push(new vscode.DocumentHighlight(
          new vscode.Range(i, lineIndent, i, lineIndent + trimmed.length),
          vscode.DocumentHighlightKind.Text,
        ));
      }
    }
  }
}
