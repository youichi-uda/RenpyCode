/**
 * Ren'Py document link provider.
 * Makes file paths in strings clickable (e.g., "images/bg.png", "audio/music.ogg").
 */

import * as vscode from 'vscode';
import * as path from 'path';

/** Regex matching quoted file paths with common asset extensions */
const FILE_PATH_RE = /"([^"]+\.(png|jpg|jpeg|webp|ogg|mp3|wav|opus|mp4|webm|ogv|rpy))"/g;

export class RenpyLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return links;

    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text;
      FILE_PATH_RE.lastIndex = 0;
      let match;

      while ((match = FILE_PATH_RE.exec(lineText)) !== null) {
        const filePath = match[1];
        // Skip interpolated strings
        if (filePath.includes('[') || filePath.includes('{')) continue;

        const startCol = match.index + 1; // +1 for opening quote
        const endCol = startCol + filePath.length;
        const range = new vscode.Range(i, startCol, i, endCol);

        // Try resolving in game/ directory
        const gameUri = vscode.Uri.joinPath(workspaceFolder.uri, 'game', filePath);
        const link = new vscode.DocumentLink(range, gameUri);
        link.tooltip = `Open ${filePath}`;
        links.push(link);
      }
    }

    return links;
  }
}
