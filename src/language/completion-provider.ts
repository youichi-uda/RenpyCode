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
  ): vscode.CompletionList {
    const lineText = document.lineAt(position.line).text;
    const textBefore = lineText.substring(0, position.character);
    const trimmed = textBefore.trimStart();
    const isIndented = /^\s+/.test(textBefore);

    // ── Label completion after jump/call ──
    if (/^(jump|call)\s+\w*$/.test(trimmed)) {
      return this.makeList(this.labelCompletions());
    }

    // ── Screen name completion after "show screen" / "call screen" / "use" ──
    if (/^(?:show|call)\s+screen(\s+\w*)?$/.test(trimmed) || /^use\s+\w*$/.test(trimmed)) {
      return this.makeList(this.screenCompletions());
    }

    // ── Transform completion after "at" (must be before image check) ──
    if (/\bat\s+\w*$/.test(trimmed)) {
      return this.makeList(this.transformCompletions());
    }

    // ── Transition completion after "with" ──
    if (/^with\s+\w*$/.test(trimmed)) {
      return this.makeList(this.transitionCompletions());
    }

    // ── Image completion after scene/show/hide ──
    if (/^(scene|show|hide)\s+[\w\s]*$/.test(trimmed)) {
      const items = this.imageCompletions();
      // Add "screen" keyword after "show"/"call" for "show screen <name>" syntax
      if (/^(show|call)\s/.test(trimmed)) {
        const screenKw = new vscode.CompletionItem('screen', vscode.CompletionItemKind.Keyword);
        screenKw.detail = localize('Show a named screen', '名前付きスクリーンを表示');
        items.push(screenKw);
      }
      return this.makeList(items);
    }

    // ── Action completion (in screen context) ──
    if (/action\s+\w*$/.test(trimmed)) {
      return this.makeList(this.actionCompletions());
    }

    // ── Class/constructor completion after "=" or "(" ──
    if (/[=(]\s*\w*$/.test(trimmed)) {
      return this.makeList(this.classCompletions());
    }

    // ── Statement + character + ATL completion at line start ──
    if (/^\s*\w*$/.test(textBefore)) {
      const items = this.statementCompletions(trimmed);
      if (isIndented) {
        items.push(...this.characterCompletions());
        items.push(...this.atlCompletions());
      }
      return this.makeList(items);
    }

    return this.makeList([]);
  }

  private makeList(items: vscode.CompletionItem[]): vscode.CompletionList {
    return new vscode.CompletionList(items, /* isIncomplete */ true);
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
      // Extract display name from Character("Name", ...) or Character(_("Name"), ...)
      const displayMatch = entry.node.value.match(/Character\s*\(\s*(?:_\s*\(\s*)?["']([^"']+)["']/);
      const displayName = displayMatch ? displayMatch[1] : name;
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
      item.detail = `${localize('character', 'キャラクター')}: ${displayName}`;
      item.sortText = `!${name}`;
      item.insertText = new vscode.SnippetString(`${name} "\${1}"`);
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

  private classCompletions(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    const snippets: Record<string, string> = {
      'Character': 'Character(_("${1:Name}")${2:, color="${3:#c8c8c8}"})',
      'DynamicCharacter': 'DynamicCharacter(${1:name_expr})',
      'ADVCharacter': 'ADVCharacter(_("${1:Name}")${2:, color="${3:#c8c8c8}"})',
      'NVLCharacter': 'NVLCharacter(_("${1:Name}")${2:, color="${3:#c8c8c8}"})',
    };

    for (const stmt of RENPY_STATEMENTS.filter(s => s.kind === 'class')) {
      const item = new vscode.CompletionItem(stmt.name, vscode.CompletionItemKind.Class);
      item.detail = getStatementDescription(stmt);
      item.documentation = new vscode.MarkdownString(`\`${stmt.syntax}\`\n\n${getStatementDescription(stmt)}`);
      if (snippets[stmt.name]) {
        item.insertText = new vscode.SnippetString(snippets[stmt.name]);
      }
      items.push(item);
    }

    return items;
  }

  private atlCompletions(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    for (const stmt of RENPY_STATEMENTS.filter(s => s.kind === 'atl')) {
      const item = new vscode.CompletionItem(stmt.name, vscode.CompletionItemKind.Event);
      item.detail = getStatementDescription(stmt);
      item.documentation = new vscode.MarkdownString(`\`${stmt.syntax}\`\n\n${getStatementDescription(stmt)}`);
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
