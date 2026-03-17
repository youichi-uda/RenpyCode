/**
 * Ren'Py hover documentation provider.
 * Shows documentation on hover for statements, characters, labels, screens, etc.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectIndex } from '../parser/types';
import { getStatementInfo, getStatementDescription } from './renpy-database';
import { localize } from './i18n';

const RE_SCENE = /^scene\s+([\w\s]+?)(?:\s+(?:at|behind|onlayer|as|zorder|with)\s+.+)?$/;
const RE_SHOW = /^show\s+([\w\s]+?)(?:\s+(?:at|behind|onlayer|as|zorder|with)\s+.+)?$/;
const RE_HIDE = /^hide\s+([\w\s]+?)(?:\s+(?:at|behind|onlayer|as|with)\s+.+)?$/;
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

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

    // ── Image preview on scene/show/hide ──
    if (/^(scene|show|hide)\s+/.test(trimmed) && !/^(show|hide)\s+screen\s+/.test(trimmed)) {
      const imageInfo = this.getImageNameAtPosition(lineText, position);
      if (imageInfo) {
        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.isTrusted = true;
        md.appendMarkdown(`**${localize('image', '画像')}** \`${imageInfo.name}\`\n\n`);

        const imageUri = this.resolveImageFile(imageInfo.name, index);
        if (imageUri) {
          md.appendMarkdown(`<img src="${imageUri}" width="300" />\n\n`);
          md.appendMarkdown(`${localize('File', 'ファイル')}: \`${vscode.workspace.asRelativePath(imageUri)}\``);
        }

        // Show image definition if available
        const entries = index.images.get(imageInfo.name);
        if (entries && entries.length > 0) {
          md.appendMarkdown('\n\n');
          for (const entry of entries) {
            if (entry.node.value) {
              md.appendMarkdown(`- \`image ${imageInfo.name} = ${entry.node.value}\` — ${entry.file}:${entry.node.line + 1}\n`);
            } else {
              md.appendMarkdown(`- \`image ${imageInfo.name}:\` (ATL) — ${entry.file}:${entry.node.line + 1}\n`);
            }
          }
        }

        return new vscode.Hover(md, imageInfo.range);
      }
    }

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

    // ── Image hover (on image definitions) ──
    const imageEntries = index.images.get(word);
    if (imageEntries && imageEntries.length > 0) {
      const md = new vscode.MarkdownString();
      md.supportHtml = true;
      md.isTrusted = true;
      md.appendMarkdown(`**${localize('image', '画像')}** \`${word}\`\n\n`);

      const imageUri = this.resolveImageFile(word, index);
      if (imageUri) {
        md.appendMarkdown(`<img src="${imageUri}" width="300" />\n\n`);
      }

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
    return trimmed.startsWith(word);
  }

  /**
   * Extract multi-word image name from scene/show/hide line and check if position is within it.
   */
  private getImageNameAtPosition(
    lineText: string,
    position: vscode.Position,
  ): { name: string; range: vscode.Range } | undefined {
    const trimmed = lineText.trimStart();
    const indent = lineText.length - trimmed.length;

    let match: RegExpMatchArray | null = null;
    let keyword = '';

    if ((match = trimmed.match(RE_SCENE))) { keyword = 'scene'; }
    else if ((match = trimmed.match(RE_SHOW))) { keyword = 'show'; }
    else if ((match = trimmed.match(RE_HIDE))) { keyword = 'hide'; }

    if (!match || !keyword) return undefined;

    const imageName = match[1].trim();
    if (!imageName) return undefined;

    // Calculate the range of the image name on the line
    const nameStart = indent + keyword.length + 1; // +1 for space after keyword
    const nameEnd = nameStart + imageName.length;

    // Check if cursor is within the image name
    if (position.character < nameStart || position.character > nameEnd) return undefined;

    return {
      name: imageName,
      range: new vscode.Range(position.line, nameStart, position.line, nameEnd),
    };
  }

  /**
   * Resolve an image name to a file URI using index data and Ren'Py naming conventions.
   */
  private resolveImageFile(imageName: string, index: ProjectIndex): vscode.Uri | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return undefined;

    // 1. Check explicit image definitions with file paths
    const entries = index.images.get(imageName);
    if (entries) {
      for (const entry of entries) {
        if (entry.node.value) {
          const m = entry.node.value.match(/["']([^"']+\.(png|jpg|jpeg|webp))["']/i);
          if (m) {
            for (const prefix of ['', 'game/']) {
              const candidate = prefix + m[1];
              if (index.assetFiles.has(candidate)) {
                return vscode.Uri.joinPath(workspaceFolder.uri, candidate);
              }
            }
          }
        }
      }
    }

    // 2. Auto-detect from images/ directory using Ren'Py naming conventions
    const parts = imageName.split(/\s+/);
    // Normalize for case-insensitive matching on Windows
    const assetArray = Array.from(index.assetFiles);

    for (const ext of IMAGE_EXTS) {
      const candidates = [
        `game/images/${imageName}${ext}`,
        `game/images/${parts.join('_')}${ext}`,
        `game/images/${parts.join('/')}${ext}`,
      ];
      if (parts.length > 1) {
        candidates.push(`game/images/${parts[0]}/${parts.slice(1).join(' ')}${ext}`);
        candidates.push(`game/images/${parts[0]}/${parts.slice(1).join('_')}${ext}`);
      }

      for (const candidate of candidates) {
        // Case-insensitive match
        const found = assetArray.find(a => a.toLowerCase() === candidate.toLowerCase());
        if (found) {
          return vscode.Uri.joinPath(workspaceFolder.uri, found);
        }
      }
    }

    // 3. Partial match: find any file whose name starts with the image tag
    const tag = parts[0].toLowerCase();
    for (const asset of assetArray) {
      const assetLower = asset.toLowerCase();
      if (!assetLower.startsWith('game/images/')) continue;
      const basename = path.basename(assetLower, path.extname(assetLower));
      if (basename === imageName.toLowerCase().replace(/\s+/g, '_')
          || basename === imageName.toLowerCase().replace(/\s+/g, ' ')
          || basename === parts.join('_').toLowerCase()) {
        return vscode.Uri.joinPath(workspaceFolder.uri, asset);
      }
    }

    return undefined;
  }
}
