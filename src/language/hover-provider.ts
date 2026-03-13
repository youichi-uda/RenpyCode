/**
 * Ren'Py hover documentation provider.
 * Shows documentation on hover for statements, characters, labels, screens, etc.
 */

import * as vscode from 'vscode';
import { ProjectIndex } from '../parser/types';
import { getStatementInfo, getStatementDescription } from './renpy-database';
import { localize } from './i18n';

export class RenpyHoverProvider implements vscode.HoverProvider {
  constructor(private getIndex: () => ProjectIndex) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Hover | undefined {
    const range = document.getWordRangeAtPosition(position, /[\w.]+/);
    if (!range) return undefined;

    const word = document.getText(range);
    const lineText = document.lineAt(position.line).text;
    const trimmed = lineText.trimStart();

    // ── Statement hover ──
    const stmtInfo = getStatementInfo(word);
    if (stmtInfo && this.isStatementPosition(trimmed, word)) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock(stmtInfo.syntax, 'renpy');
      md.appendMarkdown('\n\n' + getStatementDescription(stmtInfo));
      return new vscode.Hover(md, range);
    }

    const index = this.getIndex();

    // ── Label hover (on jump/call targets) ──
    if (/^(jump|call)\s+/.test(trimmed)) {
      const entries = index.labels.get(word);
      if (entries && entries.length > 0) {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${localize('label', 'ラベル')}** \`${word}\`\n\n`);
        for (const entry of entries) {
          md.appendMarkdown(`- ${entry.file}:${entry.node.line + 1}\n`);
        }
        return new vscode.Hover(md, range);
      }
    }

    // ── Character hover (dialogue line) ──
    const charEntry = index.characters.get(word);
    if (charEntry) {
      const md = new vscode.MarkdownString();
      const displayMatch = charEntry.node.value.match(/Character\s*\(\s*["']([^"']+)["']/);
      const displayName = displayMatch ? displayMatch[1] : word;
      md.appendMarkdown(`**${localize('character', 'キャラクター')}** ${displayName} (\`${word}\`)\n\n`);
      md.appendCodeblock(`define ${charEntry.node.name} = ${charEntry.node.value}`, 'renpy');
      md.appendMarkdown(`\n${charEntry.file}:${charEntry.node.line + 1}`);
      return new vscode.Hover(md, range);
    }

    // ── Screen hover (on screen definitions, show/call/use screen references) ──
    const screenEntries = index.screens.get(word);
    if (screenEntries && screenEntries.length > 0
        && (/\b(show|call|use)\s+(?:screen\s+)?/.test(trimmed) || /^screen\s+/.test(trimmed))) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${localize('screen', 'スクリーン')}** \`${word}\`\n\n`);
      for (const entry of screenEntries) {
        const params = entry.node.parameters ? `(${entry.node.parameters})` : '';
        md.appendMarkdown(`- \`screen ${word}${params}:\` — ${entry.file}:${entry.node.line + 1}\n`);
      }
      return new vscode.Hover(md, range);
    }

    // ── Variable hover (define/default) ──
    const varEntry = index.variables.get(word);
    if (varEntry) {
      const md = new vscode.MarkdownString();
      const kind = varEntry.node.type === 'define' ? 'define' : 'default';
      md.appendMarkdown(`**${localize('variable', '変数')}** \`${word}\` (${kind})\n\n`);
      md.appendCodeblock(`${kind} ${varEntry.node.name} = ${varEntry.node.value}`, 'renpy');
      md.appendMarkdown(`\n${varEntry.file}:${varEntry.node.line + 1}`);
      return new vscode.Hover(md, range);
    }

    // ── Transform hover ──
    const transformEntry = index.transforms.get(word);
    if (transformEntry) {
      const md = new vscode.MarkdownString();
      const params = transformEntry.node.parameters ? `(${transformEntry.node.parameters})` : '';
      md.appendMarkdown(`**${localize('transform', 'トランスフォーム')}** \`${word}${params}\`\n\n`);
      md.appendMarkdown(`${transformEntry.file}:${transformEntry.node.line + 1}`);
      return new vscode.Hover(md, range);
    }

    // ── Image hover ──
    const imageEntries = index.images.get(word);
    if (imageEntries && imageEntries.length > 0) {
      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${localize('image', '画像')}** \`${word}\`\n\n`);
      for (const entry of imageEntries) {
        if (entry.node.value) {
          md.appendMarkdown(`- \`image ${word} = ${entry.node.value}\` — ${entry.file}:${entry.node.line + 1}\n`);
        } else {
          md.appendMarkdown(`- \`image ${word}:\` (ATL) — ${entry.file}:${entry.node.line + 1}\n`);
        }
      }
      return new vscode.Hover(md, range);
    }

    return undefined;
  }

  private isStatementPosition(trimmed: string, word: string): boolean {
    // Word is at the beginning of the statement
    return trimmed.startsWith(word);
  }
}
