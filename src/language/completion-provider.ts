/**
 * Ren'Py autocompletion provider.
 * Provides context-aware completions for statements, labels, characters, screens, images, etc.
 */

import * as vscode from 'vscode';
import { ProjectIndex, LABEL_REF_COMMANDS } from '../parser/types';
import { RENPY_STATEMENTS, getStatementDescription, StatementInfo } from './renpy-database';
import { localize } from './i18n';

export class RenpyCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): vscode.CompletionItem[] {
    const lineText = document.lineAt(position.line).text;
    const textBefore = lineText.substring(0, position.character);
    const trimmed = textBefore.trimStart();

    // ── Label completion after jump/call ──
    if (/^(jump|call)\s+\w*$/.test(trimmed)) {
      return this.labelCompletions();
    }

    // ── Character completion for dialogue ──
    // At the start of an indented line with just a word typed
    if (/^\s+\w+$/.test(textBefore) && !trimmed.startsWith('$')) {
      return [...this.characterCompletions(), ...this.statementCompletions(trimmed)];
    }

    // ── Screen name completion after "show screen" / "call screen" / "use" ──
    if (/^(?:show|call)\s+screen\s+\w*$/.test(trimmed) || /^use\s+\w*$/.test(trimmed)) {
      return this.screenCompletions();
    }

    // ── Image completion after scene/show/hide ──
    if (/^(scene|show|hide)\s+[\w\s]*$/.test(trimmed)) {
      return this.imageCompletions();
    }

    // ── Transform completion after "at" ──
    if (/\bat\s+\w*$/.test(trimmed)) {
      return this.transformCompletions();
    }

    // ── Transition completion after "with" ──
    if (/^with\s+\w*$/.test(trimmed)) {
      return this.transitionCompletions();
    }

    // ── Action completion (in screen context) ──
    if (/action\s+\w*$/.test(trimmed)) {
      return this.actionCompletions();
    }

    // ── Statement completion at line start ──
    if (/^\s*\w*$/.test(textBefore)) {
      return this.statementCompletions(trimmed);
    }

    return [];
  }

  private labelCompletions(): vscode.CompletionItem[] {
    const index = this.getIndex();
    const items: vscode.CompletionItem[] = [];

    for (const [name, entries] of index.labels) {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
      const entry = entries[0];
      item.detail = `${localize('label', 'ラベル')} — ${entry.file}:${entry.node.line + 1}`;
      items.push(item);
    }

    return items;
  }

  private characterCompletions(): vscode.CompletionItem[] {
    const index = this.getIndex();
    const items: vscode.CompletionItem[] = [];

    for (const [name, entry] of index.characters) {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
      // Extract display name from Character("DisplayName", ...)
      const displayMatch = entry.node.value.match(/Character\s*\(\s*["']([^"']+)["']/);
      const displayName = displayMatch ? displayMatch[1] : name;
      item.detail = `${localize('character', 'キャラクター')}: ${displayName}`;
      item.insertText = new vscode.SnippetString(`${name} "\${1}"`)
      items.push(item);
    }

    return items;
  }

  private screenCompletions(): vscode.CompletionItem[] {
    const index = this.getIndex();
    const items: vscode.CompletionItem[] = [];

    for (const [name, entries] of index.screens) {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Struct);
      item.detail = `${localize('screen', 'スクリーン')} — ${entries[0].file}`;
      items.push(item);
    }

    return items;
  }

  private imageCompletions(): vscode.CompletionItem[] {
    const index = this.getIndex();
    const items: vscode.CompletionItem[] = [];

    for (const [name, entries] of index.images) {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Color);
      item.detail = `${localize('image', '画像')} — ${entries[0].file}`;
      items.push(item);
    }

    return items;
  }

  private transformCompletions(): vscode.CompletionItem[] {
    const index = this.getIndex();
    const items: vscode.CompletionItem[] = [];

    // Built-in transforms
    for (const name of ['center', 'left', 'right', 'truecenter', 'topleft', 'topright', 'offscreenleft', 'offscreenright']) {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
      item.detail = localize('Built-in transform', '組み込みトランスフォーム');
      items.push(item);
    }

    // User transforms
    for (const [name, entry] of index.transforms) {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function);
      item.detail = `${localize('transform', 'トランスフォーム')} — ${entry.file}`;
      items.push(item);
    }

    return items;
  }

  private transitionCompletions(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    for (const stmt of RENPY_STATEMENTS.filter(s => s.kind === 'transition')) {
      const item = new vscode.CompletionItem(stmt.name, vscode.CompletionItemKind.Constant);
      item.detail = getStatementDescription(stmt);
      item.documentation = new vscode.MarkdownString(`\`${stmt.syntax}\``);
      items.push(item);
    }

    return items;
  }

  private actionCompletions(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    for (const stmt of RENPY_STATEMENTS.filter(s => s.kind === 'action')) {
      const item = new vscode.CompletionItem(stmt.name, vscode.CompletionItemKind.Function);
      item.detail = getStatementDescription(stmt);
      item.documentation = new vscode.MarkdownString(`\`${stmt.syntax}\``);
      items.push(item);
    }

    return items;
  }

  private statementCompletions(typed: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    for (const stmt of RENPY_STATEMENTS.filter(s => s.kind === 'statement' || s.kind === 'screen')) {
      if (typed && !stmt.name.startsWith(typed)) continue;
      const item = new vscode.CompletionItem(stmt.name, vscode.CompletionItemKind.Keyword);
      item.detail = getStatementDescription(stmt);
      item.documentation = new vscode.MarkdownString(`\`${stmt.syntax}\`\n\n${getStatementDescription(stmt)}`);
      items.push(item);
    }

    return items;
  }
}
