/**
 * Ren'Py translation dashboard provider (Pro feature).
 * Shows translation completion rates, finds untranslated strings.
 * Ported from MCP translation tools.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { localize } from '../language/i18n';

interface LanguageStats {
  language: string;
  translated: number;
  total: number;
  percentage: number;
  missingLabels: string[];
}

export class TranslationProvider {
  private _panel?: vscode.WebviewPanel;

  async show(): Promise<void> {
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'renpyCode.translation',
      localize('RenPy Code: Translation Dashboard', 'RenPy Code: 翻訳ダッシュボード'),
      vscode.ViewColumn.One,
      { enableScripts: true },
    );

    this._panel.onDidDispose(() => { this._panel = undefined; });

    const stats = await this.analyzeTranslations();
    this._panel.webview.html = this.renderHtml(stats);
  }

  /**
   * Analyze translation completeness across all languages.
   */
  async analyzeTranslations(): Promise<LanguageStats[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return [];

    const tlDir = path.join(workspaceFolder.uri.fsPath, 'game', 'tl');
    if (!fs.existsSync(tlDir)) return [];

    // Count total translatable strings from source files
    const sourceFiles = await vscode.workspace.findFiles('game/**/*.rpy', '{**/tl/**,**/_mcp/**}');
    let totalStrings = 0;
    const sourceLabels = new Set<string>();

    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file.fsPath, 'utf-8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trimStart();
          // Count dialogue lines
          if (/^\w+\s+"/.test(trimmed) || /^"/.test(trimmed)) {
            totalStrings++;
          }
          // Track labels for translation blocks
          const labelMatch = trimmed.match(/^label\s+(\w+)\s*:/);
          if (labelMatch) {
            sourceLabels.add(labelMatch[1]);
          }
        }
      } catch { /* ignore */ }
    }

    if (totalStrings === 0) totalStrings = 1; // Avoid division by zero

    // Scan each language directory
    const languages: LanguageStats[] = [];
    const entries = fs.readdirSync(tlDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'None') continue;

      const langDir = path.join(tlDir, entry.name);
      let translated = 0;
      const translatedLabels = new Set<string>();

      const rpyFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(langDir, '**/*.rpy'),
      );

      for (const file of rpyFiles) {
        try {
          const content = fs.readFileSync(file.fsPath, 'utf-8');
          const lines = content.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trimStart();

            // Count translated dialogue (lines with quotes inside translate blocks)
            if (/^\w+\s+"/.test(trimmed) || (/^"/.test(trimmed) && !trimmed.startsWith('# '))) {
              translated++;
            }

            // Track translated labels
            const transMatch = trimmed.match(/^translate\s+\w+\s+(\w+)\s*:/);
            if (transMatch) {
              translatedLabels.add(transMatch[1]);
            }
          }
        } catch { /* ignore */ }
      }

      const percentage = Math.round((translated / totalStrings) * 100);
      const missingLabels = [...sourceLabels].filter(l => !translatedLabels.has(l));

      languages.push({
        language: entry.name,
        translated,
        total: totalStrings,
        percentage: Math.min(percentage, 100),
        missingLabels,
      });
    }

    return languages.sort((a, b) => b.percentage - a.percentage);
  }

  private renderHtml(stats: LanguageStats[]): string {
    return `<!DOCTYPE html>
<html>
<head>
<style>
  body { padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 14px; }
  .lang-card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 12px; margin-bottom: 12px; }
  .lang-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .lang-name { font-weight: bold; font-size: 14px; }
  .lang-pct { font-size: 20px; font-weight: bold; }
  .progress-bar { height: 8px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .pct-high { background: #4CAF50; color: #4CAF50; }
  .pct-med { background: #FF9800; color: #FF9800; }
  .pct-low { background: #f44336; color: #f44336; }
  .stats-row { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .missing { margin-top: 8px; font-size: 11px; }
  .missing-label { display: inline-block; margin: 2px 4px; padding: 1px 6px; background: rgba(244,67,54,0.1); color: #f44336; border-radius: 3px; font-size: 10px; }
  .no-langs { text-align: center; padding: 40px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <h2>Translation Dashboard</h2>

  ${stats.length === 0 ? `<div class="no-langs">
    <p>No translations found.</p>
    <p style="font-size:12px">Translations should be in <code>game/tl/&lt;language&gt;/</code></p>
  </div>` : ''}

  ${stats.map(s => {
    const pctClass = s.percentage >= 80 ? 'pct-high' : s.percentage >= 40 ? 'pct-med' : 'pct-low';
    return `<div class="lang-card">
      <div class="lang-header">
        <span class="lang-name">${s.language}</span>
        <span class="lang-pct ${pctClass}">${s.percentage}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill ${pctClass}" style="width:${s.percentage}%"></div></div>
      <div class="stats-row">
        <span>${s.translated} / ${s.total} strings</span>
        <span>${s.missingLabels.length} missing blocks</span>
      </div>
      ${s.missingLabels.length > 0 && s.missingLabels.length <= 10 ? `<div class="missing">
        Missing: ${s.missingLabels.map(l => `<span class="missing-label">${l}</span>`).join(' ')}
      </div>` : ''}
    </div>`;
  }).join('\n')}
</body>
</html>`;
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
