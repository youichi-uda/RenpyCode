/**
 * Ren'Py diagnostics provider.
 * Real-time linting for undefined labels, characters, invalid jumps, mixed indentation.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, CommandNode, DialogueNode, NodeType, LABEL_REF_COMMANDS } from '../parser/types';
import { Parser } from '../parser/parser';
import { localize } from './i18n';

export interface DiagnosticsConfig {
  enable: boolean;
  undefinedLabel: boolean;
  undefinedCharacter: boolean;
  invalidJump: boolean;
  indentation: boolean;
}

export class RenpyDiagnosticsProvider {
  readonly collection: vscode.DiagnosticCollection;
  private parser: Parser;

  constructor(
    private getIndex: () => ProjectIndex,
    private getConfig: () => DiagnosticsConfig,
  ) {
    this.collection = vscode.languages.createDiagnosticCollection('renpy');
    this.parser = new Parser('');
  }

  /**
   * Analyze a document and publish diagnostics.
   */
  analyzeDocument(document: vscode.TextDocument): void {
    const config = this.getConfig();
    if (!config.enable) {
      this.collection.delete(document.uri);
      return;
    }

    const fileName = vscode.workspace.asRelativePath(document.uri);
    this.parser = new Parser(fileName);
    const parsed = this.parser.parse(document.getText());
    const index = this.getIndex();
    const diagnostics: vscode.Diagnostic[] = [];

    // Report parse errors (filter indentation warnings if disabled)
    for (const error of parsed.errors) {
      if (!config.indentation && error.message.includes('indentation')) continue;

      const range = new vscode.Range(
        error.range.start.line, error.range.start.column,
        error.range.end.line, error.range.end.column,
      );
      const severity = error.severity === 'error' ? vscode.DiagnosticSeverity.Error
        : error.severity === 'warning' ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;
      diagnostics.push(new vscode.Diagnostic(range, error.message, severity));
    }

    // Walk AST for semantic diagnostics
    this.checkNodes(parsed.nodes, index, config, diagnostics, false);

    this.collection.set(document.uri, diagnostics);
  }

  /** Node types where dialogue-like lines are actually properties/commands, not real dialogue. */
  private static readonly NON_DIALOGUE_CONTEXTS: ReadonlySet<NodeType> = new Set([
    'screen', 'style_def', 'testcase', 'init_block', 'python_block', 'transform_def', 'image_def',
  ]);

  /** Names that should never trigger an undefined-character warning (built-in narrators & keywords). */
  private static readonly SKIP_CHAR_NAMES: ReadonlySet<string> = new Set([
    'narrator', 'extend', 'centered', 'nvl_narrator', 'voice_sustain',
    'if', 'elif', 'else', 'for', 'while', 'pass', 'return',
    'menu', 'jump', 'call', 'show', 'scene', 'hide', 'with',
    'play', 'stop', 'queue', 'python', 'init', 'define', 'default',
    'label', 'screen', 'image', 'transform', 'style', 'translate',
    'window', 'voice', 'testcase',
  ]);

  private checkNodes(
    nodes: RenpyNode[],
    index: ProjectIndex,
    config: DiagnosticsConfig,
    diagnostics: vscode.Diagnostic[],
    inNonDialogueContext: boolean,
  ): void {
    for (const node of nodes) {
      // ── Undefined label (jump/call to non-existent label) ──
      if (config.undefinedLabel && node.type === 'command' && LABEL_REF_COMMANDS.has(node.command)) {
        const target = node.target;
        if (target && !target.includes('expression') && !index.labels.has(target)) {
          const range = node.targetRange
            ? new vscode.Range(
                node.targetRange.start.line, node.targetRange.start.column,
                node.targetRange.end.line, node.targetRange.end.column,
              )
            : new vscode.Range(node.line, 0, node.line, node.raw.length);

          diagnostics.push(new vscode.Diagnostic(
            range,
            localize(
              `Undefined label '${target}'`,
              `未定義のラベル '${target}'`,
            ),
            vscode.DiagnosticSeverity.Warning,
          ));
        }
      }

      // ── Undefined character (dialogue with unknown variable) ──
      // Skip inside screens, styles, testcases, etc. where "word string" is a property, not dialogue
      if (config.undefinedCharacter && node.type === 'dialogue' && !inNonDialogueContext) {
        const char = node.character;
        if (!index.characters.has(char) && !index.variables.has(char)
            && !RenpyDiagnosticsProvider.SKIP_CHAR_NAMES.has(char)) {
          diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(
              node.characterRange.start.line, node.characterRange.start.column,
              node.characterRange.end.line, node.characterRange.end.column,
            ),
            localize(
              `Undefined character '${char}' — did you forget to define it?`,
              `未定義のキャラクター '${char}' — defineを忘れていませんか？`,
            ),
            vscode.DiagnosticSeverity.Warning,
          ));
        }
      }

      // Recurse into children — once inside a non-dialogue context, stay in it
      if (node.children.length > 0) {
        const childContext = inNonDialogueContext || RenpyDiagnosticsProvider.NON_DIALOGUE_CONTEXTS.has(node.type);
        this.checkNodes(node.children, index, config, diagnostics, childContext);
      }
    }
  }

  dispose(): void {
    this.collection.dispose();
  }
}
