/**
 * Ren'Py code action provider.
 * Quick fixes for diagnostics: create missing labels, define missing characters.
 */

import * as vscode from 'vscode';
import { ProjectIndex } from '../parser/types';

export class RenpyCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      const msg = diagnostic.message;

      // Quick fix: create missing label
      const labelMatch = msg.match(/(?:Undefined label|未定義のラベル) '(\w+)'/);
      if (labelMatch) {
        const labelName = labelMatch[1];
        const action = new vscode.CodeAction(
          `Create label '${labelName}'`,
          vscode.CodeActionKind.QuickFix,
        );
        action.diagnostics = [diagnostic];

        // Insert at end of file
        const lastLine = document.lineCount - 1;
        const lastLineText = document.lineAt(lastLine).text;
        const insertPos = new vscode.Position(lastLine, lastLineText.length);

        action.edit = new vscode.WorkspaceEdit();
        action.edit.insert(document.uri, insertPos, `\n\nlabel ${labelName}:\n    pass\n`);
        actions.push(action);
      }

      // Quick fix: define missing character
      const charMatch = msg.match(/(?:Undefined character|未定義のキャラクター) '(\w+)'(?:\s|$)/);
      if (charMatch) {
        const charName = charMatch[1];
        const action = new vscode.CodeAction(
          `Define character '${charName}'`,
          vscode.CodeActionKind.QuickFix,
        );
        action.diagnostics = [diagnostic];

        // Insert at the top of the file (after any existing defines)
        let insertLine = 0;
        for (let i = 0; i < document.lineCount; i++) {
          const text = document.lineAt(i).text.trimStart();
          if (text.startsWith('define ') || text.startsWith('default ') || text.startsWith('#') || text === '') {
            insertLine = i + 1;
          } else {
            break;
          }
        }

        const displayName = charName.charAt(0).toUpperCase() + charName.slice(1);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.insert(
          document.uri,
          new vscode.Position(insertLine, 0),
          `define ${charName} = Character("${displayName}")\n`,
        );
        actions.push(action);
      }
    }

    return actions;
  }
}
