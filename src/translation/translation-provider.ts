/**
 * Ren'Py translation dashboard provider (Pro feature).
 * Shows translation completion rates, generates missing translation stubs.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { localize } from '../language/i18n';

interface DialogueLine {
  file: string;
  line: number;
  label: string;
  speaker: string;
  text: string;
}

interface LanguageStats {
  language: string;
  translated: number;
  total: number;
  percentage: number;
  files: string[];  // relative paths of translation .rpy files
}

/** Keywords that look like dialogue but aren't (word "string" pattern) */
const NON_DIALOGUE_KEYWORDS = new Set([
  'voice', 'play', 'queue', 'stop', 'define', 'default', 'image',
  'show', 'hide', 'scene', 'call', 'jump', 'return', 'pass', 'with',
  'if', 'elif', 'else', 'while', 'for', 'init', 'python', 'screen',
  'transform', 'style', 'translate', 'label', 'menu', 'nvl', 'use',
  'has', 'add', 'on', 'action', 'at', 'as', 'behind', 'onlayer',
  'zorder', 'old', 'new',
]);

/** Snapshot of file states before stub generation, for undo. */
interface GenerationSnapshot {
  /** Map from absolute file path → original content (null = file didn't exist). */
  files: Map<string, string | null>;
}

export class TranslationProvider {
  private _panel?: vscode.WebviewPanel;
  /** Per-language snapshots for undo. */
  private _snapshots = new Map<string, GenerationSnapshot>();

  async show(): Promise<void> {
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'renpyCode.translation',
      localize('RenPy Code: Translation Dashboard', 'RenPy Code: 翻訳ダッシュボード'),
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this._panel.onDidDispose(() => { this._panel = undefined; });
    this._panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));

    await this.refresh();
  }

  private async refresh(): Promise<void> {
    if (!this._panel) return;
    const sourceDialogue = await this.collectSourceDialogue();
    const stats = await this.analyzeTranslations(sourceDialogue);
    this._panel.webview.html = this.renderHtml(stats, sourceDialogue.length);
  }

  /**
   * Collect all dialogue lines from source .rpy files.
   */
  private async collectSourceDialogue(): Promise<DialogueLine[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return [];

    const sourceFiles = await vscode.workspace.findFiles('game/**/*.rpy', '{**/tl/**,**/_mcp/**}');
    const dialogue: DialogueLine[] = [];

    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file.fsPath, 'utf-8');
        const relPath = vscode.workspace.asRelativePath(file);
        const lines = content.split(/\r?\n/);

        let currentLabel = '';
        let inPythonBlock = false;
        let pythonIndent = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const indent = line.length - line.trimStart().length;
          const trimmed = line.trimStart();

          if (trimmed === '' || trimmed.startsWith('#')) continue;

          // Track python blocks (init python:, python:)
          if (/^(init\s+(-?\d+\s+)?)?python\s*.*:/.test(trimmed)) {
            inPythonBlock = true;
            pythonIndent = indent;
            continue;
          }
          if (inPythonBlock) {
            if (indent <= pythonIndent && trimmed !== '') {
              inPythonBlock = false;
            } else {
              continue;
            }
          }

          // Track labels
          const labelMatch = trimmed.match(/^label\s+(\w+)\s*.*:/);
          if (labelMatch) {
            currentLabel = labelMatch[1];
            continue;
          }

          // Skip lines starting with $
          if (trimmed.startsWith('$')) continue;

          // Match dialogue: speaker "text" or "text"
          const dialogueMatch = trimmed.match(/^(\w+)\s+"((?:[^"\\]|\\.)*)"/);
          if (dialogueMatch) {
            const speaker = dialogueMatch[1];
            if (NON_DIALOGUE_KEYWORDS.has(speaker)) continue;
            dialogue.push({
              file: relPath,
              line: i + 1,
              label: currentLabel,
              speaker,
              text: dialogueMatch[2],
            });
            continue;
          }

          // Narrator: "text"
          const narratorMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"(\s|$)/);
          if (narratorMatch && !trimmed.endsWith(':')) {
            dialogue.push({
              file: relPath,
              line: i + 1,
              label: currentLabel,
              speaker: '',
              text: narratorMatch[1],
            });
          }
        }
      } catch { /* ignore */ }
    }

    return dialogue;
  }

  /**
   * Collect already-translated dialogue from a language's translation files.
   * Returns a Set of "speaker\0text" keys.
   */
  private async collectTranslatedDialogue(language: string): Promise<Set<string>> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return new Set();

    const langDir = path.join(workspaceFolder.uri.fsPath, 'game', 'tl', language);
    if (!fs.existsSync(langDir)) return new Set();

    const translated = new Set<string>();
    const rpyFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(langDir, '**/*.rpy'),
    );

    for (const file of rpyFiles) {
      try {
        const content = fs.readFileSync(file.fsPath, 'utf-8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trimStart();

          // Match comment lines showing original: # speaker "text" or # "text"
          const commentMatch = trimmed.match(/^#\s+(\w+)\s+"((?:[^"\\]|\\.)*)"/);
          if (commentMatch) {
            translated.add(`${commentMatch[1]}\0${commentMatch[2]}`);
            continue;
          }
          const narratorComment = trimmed.match(/^#\s+"((?:[^"\\]|\\.)*)"/);
          if (narratorComment) {
            translated.add(`\0${narratorComment[1]}`);
          }
        }
      } catch { /* ignore */ }
    }

    return translated;
  }

  /**
   * Analyze translation completeness.
   */
  private async analyzeTranslations(sourceDialogue: DialogueLine[]): Promise<LanguageStats[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return [];

    const tlDir = path.join(workspaceFolder.uri.fsPath, 'game', 'tl');
    if (!fs.existsSync(tlDir)) return [];

    const total = sourceDialogue.length || 1;
    const languages: LanguageStats[] = [];
    const entries = fs.readdirSync(tlDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'None') continue;

      const translated = await this.collectTranslatedDialogue(entry.name);
      const coveredCount = sourceDialogue.filter(d =>
        translated.has(`${d.speaker}\0${d.text}`),
      ).length;

      // Collect translation file paths
      const langDir = path.join(tlDir, entry.name);
      const tlFiles: string[] = [];
      const rpyFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(langDir, '**/*.rpy'),
      );
      for (const f of rpyFiles) {
        tlFiles.push(vscode.workspace.asRelativePath(f));
      }
      tlFiles.sort();

      languages.push({
        language: entry.name,
        translated: coveredCount,
        total: sourceDialogue.length,
        percentage: Math.round((coveredCount / total) * 100),
        files: tlFiles,
      });
    }

    return languages.sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * Generate translation stubs for missing dialogue.
   */
  private async generateStubs(language: string): Promise<number> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return 0;

    const sourceDialogue = await this.collectSourceDialogue();
    const translated = await this.collectTranslatedDialogue(language);

    const missing = sourceDialogue.filter(d =>
      !translated.has(`${d.speaker}\0${d.text}`),
    );

    if (missing.length === 0) return 0;

    // Group by source file
    const byFile = new Map<string, DialogueLine[]>();
    for (const d of missing) {
      const group = byFile.get(d.file) || [];
      group.push(d);
      byFile.set(d.file, group);
    }

    const langDir = path.join(workspaceFolder.uri.fsPath, 'game', 'tl', language);
    if (!fs.existsSync(langDir)) {
      fs.mkdirSync(langDir, { recursive: true });
    }

    // Save snapshot for undo
    const snapshot: GenerationSnapshot = { files: new Map() };
    let totalGenerated = 0;

    for (const [sourceFile, dialogues] of byFile) {
      const baseName = path.basename(sourceFile, '.rpy');
      const stubPath = path.join(langDir, `${baseName}.rpy`);

      let appendText = '';
      for (const d of dialogues) {
        const hash = crypto.createHash('md5')
          .update(`${d.speaker}\0${d.text}`)
          .digest('hex')
          .substring(0, 8);
        const blockId = d.label ? `${d.label}_${hash}` : `_${hash}`;

        appendText += `# ${sourceFile}:${d.line}\n`;
        appendText += `translate ${language} ${blockId}:\n`;
        if (d.speaker) {
          appendText += `    # ${d.speaker} "${d.text}"\n`;
          appendText += `    ${d.speaker} ""\n`;
        } else {
          appendText += `    # "${d.text}"\n`;
          appendText += `    ""\n`;
        }
        appendText += '\n';
        totalGenerated++;
      }

      if (fs.existsSync(stubPath)) {
        const existing = fs.readFileSync(stubPath, 'utf-8');
        snapshot.files.set(stubPath, existing);
        const separator = existing.endsWith('\n') ? '\n' : '\n\n';
        fs.writeFileSync(stubPath, existing + separator + appendText, 'utf-8');
      } else {
        snapshot.files.set(stubPath, null);
        const header = `# TODO: ${language} translation for ${sourceFile}\n\n`;
        fs.writeFileSync(stubPath, header + appendText, 'utf-8');
      }
    }

    if (totalGenerated > 0) {
      this._snapshots.set(language, snapshot);
    }

    return totalGenerated;
  }

  /**
   * Undo the last stub generation by restoring file snapshots.
   */
  private undoGenerate(language: string): void {
    const snapshot = this._snapshots.get(language);
    if (!snapshot) return;

    for (const [filePath, originalContent] of snapshot.files) {
      if (originalContent === null) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      } else {
        fs.writeFileSync(filePath, originalContent, 'utf-8');
      }
    }

    this._snapshots.delete(language);
  }

  private async handleMessage(msg: { command: string; language?: string; path?: string }): Promise<void> {
    if (msg.command === 'openFile' && msg.path) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, msg.path);
        await vscode.commands.executeCommand('vscode.open', fileUri);
      }
      return;
    }
    if (msg.command === 'undoGenerate' && msg.language) {
      this.undoGenerate(msg.language);
      vscode.window.showInformationMessage(
        vscode.l10n.t('Stub generation for {0} reverted.', msg.language),
      );
      await this.refresh();
      return;
    }
    if (msg.command === 'generateStubs' && msg.language) {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: vscode.l10n.t('Generating translation stubs for {0}...', msg.language),
        },
        async () => {
          const count = await this.generateStubs(msg.language!);
          if (count > 0) {
            vscode.window.showInformationMessage(
              vscode.l10n.t('{0} translation stubs generated for {1}.', count, msg.language!),
            );
          } else {
            vscode.window.showInformationMessage(
              vscode.l10n.t('No missing translations found for {0}.', msg.language!),
            );
          }
          await this.refresh();
        },
      );
    }
  }

  private renderHtml(stats: LanguageStats[], totalDialogue: number): string {
    return `<!DOCTYPE html>
<html>
<head>
<style>
  body { padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 14px; }
  .total-info { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .lang-card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; margin-bottom: 12px; }
  .lang-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .lang-name { font-weight: bold; font-size: 14px; }
  .lang-pct { font-size: 20px; font-weight: bold; color: var(--vscode-foreground); }
  .progress-bar { height: 8px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .pct-high { background: #4CAF50; }
  .pct-med { background: #FF9800; }
  .pct-low { background: #f44336; }
  .stats-row { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); align-items: center; }
  .btn { padding: 4px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; font-size: 11px; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn-undo { background: #d32f2f; color: #fff; }
  .btn-undo:hover { background: #b71c1c; }
  .file-list { margin-top: 8px; padding: 0; list-style: none; }
  .file-list li { font-size: 11px; padding: 2px 0; }
  .file-link { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; }
  .file-link:hover { text-decoration: underline; }
  .file-toggle { font-size: 11px; color: var(--vscode-textLink-foreground); cursor: pointer; background: none; border: none; padding: 0; }
  .file-toggle:hover { text-decoration: underline; }
  .no-langs { text-align: center; padding: 40px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <h2>${localize('Translation Dashboard', '翻訳ダッシュボード')}</h2>
  <div class="total-info">${localize(
    `${totalDialogue} translatable dialogue lines detected`,
    `${totalDialogue} 件の翻訳対象テキストを検出`,
  )}</div>

  ${stats.length === 0 ? `<div class="no-langs">
    <p>${localize('No translations found.', '翻訳が見つかりません。')}</p>
    <p style="font-size:12px">${localize(
      'Translations should be in <code>game/tl/&lt;language&gt;/</code>',
      '翻訳は <code>game/tl/&lt;language&gt;/</code> に配置してください',
    )}</p>
  </div>` : ''}

  ${stats.map(s => {
    const pctClass = s.percentage >= 80 ? 'pct-high' : s.percentage >= 40 ? 'pct-med' : 'pct-low';
    const missing = s.total - s.translated;
    return `<div class="lang-card">
      <div class="lang-header">
        <span class="lang-name">${s.language}</span>
        <span class="lang-pct">${s.percentage}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill ${pctClass}" style="width:${s.percentage}%"></div></div>
      <div class="stats-row">
        <span>${s.translated} / ${s.total} ${localize('strings', '件')}</span>
        ${missing > 0 ? `<span>${missing} ${localize('missing', '件不足')}</span>` : ''}
        ${this._snapshots.has(s.language)
          ? `<button class="btn btn-undo" onclick="undoGenerate('${s.language}')">${localize('Undo Generate', '生成を元に戻す')}</button>`
          : missing > 0 ? `<button class="btn" onclick="generate('${s.language}')">${localize(`Generate ${missing} Stubs`, `${missing} 件のスタブを生成`)}</button>` : ''}
      </div>
      ${s.files.length > 0 ? `<button class="file-toggle" onclick="toggleFiles('${s.language}')">${s.files.length} ${localize('translation files', '翻訳ファイル')} ▸</button>
      <ul class="file-list" id="files-${s.language}" style="display:none">
        ${s.files.map(f => {
          const basename = f.replace(/^.*[/\\]/, '');
          const escaped = f.replace(/\\/g, '/');
          return `<li><a class="file-link" onclick="openFile('${escaped}')">${basename}</a></li>`;
        }).join('\n        ')}
      </ul>` : ''}
    </div>`;
  }).join('\n')}

  <script>
    const vscode = acquireVsCodeApi();
    function generate(lang) {
      vscode.postMessage({ command: 'generateStubs', language: lang });
    }
    function undoGenerate(lang) {
      vscode.postMessage({ command: 'undoGenerate', language: lang });
    }
    function openFile(filePath) {
      vscode.postMessage({ command: 'openFile', path: filePath });
    }
    function toggleFiles(lang) {
      const list = document.getElementById('files-' + lang);
      const btn = list.previousElementSibling;
      if (list.style.display === 'none') {
        list.style.display = '';
        btn.textContent = btn.textContent.replace('▸', '▾');
      } else {
        list.style.display = 'none';
        btn.textContent = btn.textContent.replace('▾', '▸');
      }
    }
  </script>
</body>
</html>`;
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
