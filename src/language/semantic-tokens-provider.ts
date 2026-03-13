/**
 * Ren'Py semantic tokens provider.
 * Provides semantic highlighting for labels, characters, variables, etc.
 */

import * as vscode from 'vscode';
import { ProjectIndex } from '../parser/types';
import { Parser } from '../parser/parser';

const TOKEN_TYPES = [
  'function',    // labels
  'class',       // screens
  'variable',    // characters, variables
  'property',    // transforms
  'string',      // image names
  'keyword',     // commands
  'parameter',   // parameters
  'type',        // built-in types
];

const TOKEN_MODIFIERS = [
  'declaration',
  'definition',
  'readonly',
  'defaultLibrary',
];

export const SEMANTIC_TOKENS_LEGEND = new vscode.SemanticTokensLegend(TOKEN_TYPES, TOKEN_MODIFIERS);

export class RenpySemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(SEMANTIC_TOKENS_LEGEND);
    const index = this.getIndex();
    const fileName = vscode.workspace.asRelativePath(document.uri);
    const parsed = index.files.get(fileName);
    if (!parsed) return builder.build();

    this.tokenizeNodes(parsed.nodes, builder, index);
    return builder.build();
  }

  private tokenizeNodes(
    nodes: import('../parser/types').RenpyNode[],
    builder: vscode.SemanticTokensBuilder,
    index: ProjectIndex,
  ): void {
    for (const node of nodes) {
      switch (node.type) {
        case 'label':
          builder.push(
            node.nameRange.start.line, node.nameRange.start.column,
            node.name.length, 0 /* function */, 1 /* definition */,
          );
          break;

        case 'screen':
          builder.push(
            node.nameRange.start.line, node.nameRange.start.column,
            node.name.length, 1 /* class */, 1 /* definition */,
          );
          break;

        case 'define':
        case 'default':
          builder.push(
            node.nameRange.start.line, node.nameRange.start.column,
            node.name.length, 2 /* variable */, 1 /* definition */,
          );
          break;

        case 'transform_def':
          builder.push(
            node.nameRange.start.line, node.nameRange.start.column,
            node.name.length, 3 /* property */, 1 /* definition */,
          );
          break;

        case 'image_def':
          builder.push(
            node.nameRange.start.line, node.nameRange.start.column,
            node.name.length, 4 /* string */, 1 /* definition */,
          );
          break;

        case 'command':
          if (node.target && node.targetRange) {
            if (node.command === 'jump' || node.command === 'call') {
              builder.push(
                node.targetRange.start.line, node.targetRange.start.column,
                node.target.length, 0 /* function */, 0,
              );
            }
          }
          break;

        case 'dialogue':
          // Highlight character name
          if (index.characters.has(node.character)) {
            builder.push(
              node.characterRange.start.line, node.characterRange.start.column,
              node.character.length, 2 /* variable */, 0,
            );
          }
          break;

        case 'testcase':
          builder.push(
            node.nameRange.start.line, node.nameRange.start.column,
            node.name.length, 0 /* function */, 1 /* definition */,
          );
          break;
      }

      if (node.children.length > 0) {
        this.tokenizeNodes(node.children, builder, index);
      }
    }
  }
}
