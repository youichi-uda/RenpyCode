/**
 * Ren'Py document formatting provider.
 * Normalizes indentation, whitespace, and common style issues.
 */

import * as vscode from 'vscode';

export class RenpyFormattingProvider implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    _token: vscode.CancellationToken,
  ): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];
    const indent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
    let consecutiveBlanks = 0;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text;

      // Track consecutive blank lines — collapse to max 2
      if (text.trim() === '') {
        consecutiveBlanks++;
        if (consecutiveBlanks > 2) {
          edits.push(vscode.TextEdit.delete(
            new vscode.Range(i, 0, i + 1, 0),
          ));
        } else if (text !== '') {
          // Non-empty blank line (whitespace only) → make truly empty
          edits.push(vscode.TextEdit.replace(line.range, ''));
        }
        continue;
      }
      consecutiveBlanks = 0;

      let newText = text;

      // 1. Normalize indentation: tabs → spaces (or vice versa)
      const leadingWhitespace = text.match(/^(\s*)/)?.[1] || '';
      if (leadingWhitespace.length > 0) {
        if (options.insertSpaces && leadingWhitespace.includes('\t')) {
          // Replace tabs with spaces
          const normalized = leadingWhitespace.replace(/\t/g, indent);
          newText = normalized + newText.slice(leadingWhitespace.length);
        } else if (!options.insertSpaces && leadingWhitespace.includes(' ')) {
          // Replace spaces with tabs (groups of tabSize)
          const spaceCount = leadingWhitespace.replace(/\t/g, indent).length;
          const tabCount = Math.floor(spaceCount / options.tabSize);
          const remainder = spaceCount % options.tabSize;
          const normalized = '\t'.repeat(tabCount) + ' '.repeat(remainder);
          newText = normalized + newText.slice(leadingWhitespace.length);
        }
      }

      // 2. Remove trailing whitespace
      newText = newText.replace(/\s+$/, '');

      // 3. Normalize spacing around = in define/default
      if (/^\s*(define|default)\s+/.test(newText)) {
        newText = newText.replace(/\s*=\s*/, ' = ');
      }

      // 4. Remove space before colon at end of block headers
      if (/^\s*(label|screen|init|python|menu|if|elif|else|for|while|transform|style|image|testcase|translate)\b/.test(newText)) {
        newText = newText.replace(/\s+:\s*$/, ':');
      }

      // 5. Normalize spacing after keywords
      newText = newText.replace(/^(\s*)(jump|call|scene|show|hide|play|stop|queue|with|return)\s{2,}/, '$1$2 ');

      if (newText !== text) {
        edits.push(vscode.TextEdit.replace(line.range, newText));
      }
    }

    // Remove trailing blank lines at end of file (keep one)
    let lastNonBlank = document.lineCount - 1;
    while (lastNonBlank > 0 && document.lineAt(lastNonBlank).isEmptyOrWhitespace) {
      lastNonBlank--;
    }
    if (lastNonBlank < document.lineCount - 2) {
      edits.push(vscode.TextEdit.delete(
        new vscode.Range(lastNonBlank + 2, 0, document.lineCount, 0),
      ));
    }

    return edits;
  }
}
