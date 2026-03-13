/**
 * Ren'Py folding range provider.
 * Indent-based folding: any line ending with ':' that has indented children is foldable.
 * Also handles comment blocks and label sections.
 */

import * as vscode from 'vscode';

export class RenpyFoldingProvider implements vscode.FoldingRangeProvider {

  provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    _token: vscode.CancellationToken,
  ): vscode.FoldingRange[] {
    const ranges: vscode.FoldingRange[] = [];
    const lineCount = document.lineCount;

    // Track block starters (lines ending with ':')
    for (let i = 0; i < lineCount; i++) {
      const line = document.lineAt(i);
      const trimmed = line.text.trimStart();

      if (trimmed === '' || trimmed.startsWith('#')) continue;

      // Block starter (line ending with ':')
      if (trimmed.endsWith(':')) {
        const indent = line.firstNonWhitespaceCharacterIndex;
        const endLine = this.findBlockEnd(document, i, indent);
        if (endLine > i) {
          ranges.push(new vscode.FoldingRange(i, endLine));
        }
      }
    }

    // Comment blocks (consecutive # lines)
    let commentStart = -1;
    for (let i = 0; i < lineCount; i++) {
      const trimmed = document.lineAt(i).text.trimStart();
      if (trimmed.startsWith('#')) {
        if (commentStart === -1) commentStart = i;
      } else {
        if (commentStart !== -1 && i - commentStart > 1) {
          ranges.push(new vscode.FoldingRange(commentStart, i - 1, vscode.FoldingRangeKind.Comment));
        }
        commentStart = -1;
      }
    }
    // Handle trailing comment block
    if (commentStart !== -1 && lineCount - commentStart > 1) {
      ranges.push(new vscode.FoldingRange(commentStart, lineCount - 1, vscode.FoldingRangeKind.Comment));
    }

    return ranges;
  }

  /**
   * Find the last line of a block that starts at startLine with the given indent.
   */
  private findBlockEnd(document: vscode.TextDocument, startLine: number, blockIndent: number): number {
    let lastContentLine = startLine;

    for (let i = startLine + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const trimmed = line.text.trimStart();

      // Skip blank lines
      if (trimmed === '') continue;

      // If we encounter a line with indent <= block indent, the block is over
      const indent = line.firstNonWhitespaceCharacterIndex;
      if (indent <= blockIndent) break;

      lastContentLine = i;
    }

    return lastContentLine;
  }
}
