/**
 * Ren'Py save data inspector (Pro feature).
 * Reads .save files (ZIP archives) and displays metadata, screenshot, and game variables.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { localize } from './i18n';

interface SaveFileInfo {
  filename: string;
  saveName: string;
  renpyVersion: string;
  gameVersion: string;
  runtime: number;
  createdAt: Date;
  screenshotUri?: string;
  entries: string[];
  variables: Record<string, unknown>;
}

export class SaveInspector {
  private _panel?: vscode.WebviewPanel;

  constructor(private extensionUri: vscode.Uri) {}

  async showInspector(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const saveDir = path.join(workspaceFolder.uri.fsPath, 'game', 'saves');
    if (!fs.existsSync(saveDir)) {
      vscode.window.showInformationMessage(
        localize('No save directory found.', 'セーブディレクトリが見つかりません。'),
      );
      return;
    }

    const saveFiles = fs.readdirSync(saveDir).filter(f => f.endsWith('.save'));
    if (saveFiles.length === 0) {
      vscode.window.showInformationMessage(
        localize('No save files found.', 'セーブファイルが見つかりません。'),
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(
      saveFiles.map(f => ({
        label: f,
        detail: this.formatFileSize(path.join(saveDir, f)),
      })),
      { placeHolder: localize('Select a save file to inspect', 'セーブファイルを選択') },
    );

    if (!picked) return;

    const savePath = path.join(saveDir, picked.label);
    const info = await this.parseSaveFile(savePath);
    if (!info) return;

    this.showPanel(info);
  }

  private async parseSaveFile(filePath: string): Promise<SaveFileInfo | null> {
    try {
      const { readZip } = this.getZipReader();
      const entries = readZip(filePath);

      let saveName = '';
      let renpyVersion = '';
      let gameVersion = '';
      let runtime = 0;
      let createdAt = new Date();
      let screenshotUri: string | undefined;
      const entryNames: string[] = [];

      for (const entry of entries) {
        entryNames.push(`${entry.name} (${this.formatBytes(entry.size)})`);

        if (entry.name === 'json' && entry.data) {
          try {
            const json = JSON.parse(entry.data.toString('utf-8'));
            saveName = json._save_name || '';
            renpyVersion = json._renpy_version
              ? json._renpy_version.join('.')
              : '';
            gameVersion = json._version || '';
            runtime = json._game_runtime || 0;
            createdAt = json._ctime ? new Date(json._ctime * 1000) : new Date();
          } catch { /* ignore */ }
        }

        if (entry.name === 'renpy_version' && entry.data) {
          renpyVersion = renpyVersion || entry.data.toString('utf-8').trim();
        }

        if (entry.name === 'screenshot.png' && entry.data) {
          screenshotUri = `data:image/png;base64,${entry.data.toString('base64')}`;
        }
      }

      // Extract game variables via Python helper
      const variables = await this.extractVariables(filePath);

      return {
        filename: path.basename(filePath),
        saveName,
        renpyVersion,
        gameVersion,
        runtime,
        createdAt,
        screenshotUri,
        entries: entryNames,
        variables,
      };
    } catch (e) {
      vscode.window.showErrorMessage(`Failed to read save file: ${e}`);
      return null;
    }
  }

  /**
   * Extract game variables from pickle data using Python helper script.
   */
  private async extractVariables(savePath: string): Promise<Record<string, unknown>> {
    // Find the helper script (in extension's src/bridge or bridge/)
    const candidates = [
      path.join(this.extensionUri.fsPath, 'bridge', 'save-reader.py'),
      path.join(this.extensionUri.fsPath, 'src', 'bridge', 'save-reader.py'),
    ];

    let scriptPath: string | undefined;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        scriptPath = c;
        break;
      }
    }

    if (!scriptPath) return {};

    // Try to find Python: prefer SDK python, fall back to system python
    const pythonCandidates = this.getPythonCandidates();

    for (const pythonPath of pythonCandidates) {
      try {
        const result = await this.runPython(pythonPath, scriptPath, savePath);
        if (result) return result;
      } catch {
        continue;
      }
    }

    return {};
  }

  private getPythonCandidates(): string[] {
    const candidates: string[] = [];

    // SDK Python from settings
    const sdkPath = vscode.workspace.getConfiguration('renpyCode').get<string>('sdkPath', '');
    if (sdkPath) {
      const platform = process.platform;
      if (platform === 'win32') {
        candidates.push(path.join(sdkPath, 'lib', 'py3-windows-x86_64', 'python.exe'));
      } else if (platform === 'darwin') {
        candidates.push(path.join(sdkPath, 'lib', 'py3-mac-universal', 'python'));
        candidates.push(path.join(sdkPath, 'lib', 'py3-mac-universal', 'python3'));
      } else {
        candidates.push(path.join(sdkPath, 'lib', 'py3-linux-x86_64', 'python'));
        candidates.push(path.join(sdkPath, 'lib', 'py3-linux-x86_64', 'python3'));
      }
    }

    // System Python
    candidates.push('python3', 'python');

    return candidates;
  }

  private runPython(
    pythonPath: string,
    scriptPath: string,
    savePath: string,
  ): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      const proc = cp.spawn(pythonPath, [scriptPath, savePath], {
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }
        try {
          const result = JSON.parse(stdout);
          resolve(result.variables || {});
        } catch {
          resolve(null);
        }
      });

      proc.on('error', () => resolve(null));
    });
  }

  private getZipReader(): {
    readZip: (filePath: string) => { name: string; size: number; data: Buffer | null }[];
  } {
    return {
      readZip: (filePath: string) => {
        const buf = fs.readFileSync(filePath);
        const entries: { name: string; size: number; data: Buffer | null }[] = [];

        let eocdOffset = -1;
        for (let i = buf.length - 22; i >= 0; i--) {
          if (buf.readUInt32LE(i) === 0x06054b50) {
            eocdOffset = i;
            break;
          }
        }
        if (eocdOffset === -1) return entries;

        const cdOffset = buf.readUInt32LE(eocdOffset + 16);
        const cdEntries = buf.readUInt16LE(eocdOffset + 10);

        let offset = cdOffset;
        for (let i = 0; i < cdEntries; i++) {
          if (buf.readUInt32LE(offset) !== 0x02014b50) break;

          const compressionMethod = buf.readUInt16LE(offset + 10);
          const compressedSize = buf.readUInt32LE(offset + 20);
          const uncompressedSize = buf.readUInt32LE(offset + 24);
          const nameLength = buf.readUInt16LE(offset + 28);
          const extraLength = buf.readUInt16LE(offset + 30);
          const commentLength = buf.readUInt16LE(offset + 32);
          const localHeaderOffset = buf.readUInt32LE(offset + 42);
          const name = buf.toString('utf-8', offset + 46, offset + 46 + nameLength);

          let data: Buffer | null = null;
          if (buf.readUInt32LE(localHeaderOffset) === 0x04034b50) {
            const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
            const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
            const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

            if (compressionMethod === 0) {
              data = buf.subarray(dataStart, dataStart + uncompressedSize);
            } else if (compressionMethod === 8) {
              try {
                const zlib = require('zlib');
                data = zlib.inflateRawSync(buf.subarray(dataStart, dataStart + compressedSize));
              } catch { /* ignore */ }
            }
          }

          entries.push({ name, size: uncompressedSize, data });
          offset += 46 + nameLength + extraLength + commentLength;
        }

        return entries;
      },
    };
  }

  private showPanel(info: SaveFileInfo): void {
    if (this._panel) {
      this._panel.reveal();
    } else {
      this._panel = vscode.window.createWebviewPanel(
        'renpyCode.saveInspector',
        localize('Save Inspector', 'セーブインスペクター'),
        vscode.ViewColumn.Active,
        { enableScripts: true },
      );
      this._panel.onDidDispose(() => { this._panel = undefined; });
    }

    this._panel.title = `Save: ${info.filename}`;
    this._panel.webview.html = this.getHtml(info);
  }

  private getHtml(info: SaveFileInfo): string {
    const runtimeStr = this.formatRuntime(info.runtime);
    const varEntries = Object.entries(info.variables);
    const hasVars = varEntries.length > 0;

    const varsHtml = hasVars
      ? varEntries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, val]) => {
            const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
            const typeClass = typeof val === 'boolean' ? 'bool'
              : typeof val === 'number' ? 'num'
              : typeof val === 'string' ? 'str'
              : 'obj';
            return `<tr>
              <td class="var-name">${this.escapeHtml(name)}</td>
              <td class="var-val ${typeClass}">${this.escapeHtml(valStr)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="2" style="color:#6c7086">No variables extracted</td></tr>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    background: #1e1e2e;
    color: #cdd6f4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 24px;
    margin: 0;
  }
  h2 {
    font-size: 1.3rem;
    color: #cba6f7;
    margin-bottom: 20px;
  }
  .screenshot {
    max-width: 100%;
    max-height: 300px;
    border-radius: 12px;
    border: 1px solid #45475a;
    margin-bottom: 24px;
  }
  .grid {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 8px 16px;
    margin-bottom: 24px;
  }
  .label { color: #6c7086; font-size: 0.85rem; font-weight: 600; }
  .value { font-size: 0.9rem; }
  .value.mono { font-family: 'JetBrains Mono', Consolas, monospace; color: #a6e3a1; }
  h3 { font-size: 1rem; color: #89b4fa; margin: 24px 0 12px; }
  .search-box {
    width: 100%;
    padding: 8px 12px;
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 6px;
    color: #cdd6f4;
    font-size: 0.85rem;
    margin-bottom: 12px;
    box-sizing: border-box;
  }
  .search-box:focus { outline: none; border-color: #89b4fa; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th {
    text-align: left; padding: 8px 12px;
    border-bottom: 2px solid #313244;
    color: #6c7086; font-weight: 600;
  }
  td { padding: 6px 12px; border-bottom: 1px solid #313244; }
  .var-name {
    font-family: 'JetBrains Mono', Consolas, monospace;
    color: #89b4fa;
    white-space: nowrap;
  }
  .var-val {
    font-family: 'JetBrains Mono', Consolas, monospace;
    word-break: break-all;
  }
  .var-val.bool { color: #fab387; }
  .var-val.num { color: #a6e3a1; }
  .var-val.str { color: #f9e2af; }
  .var-val.obj { color: #6c7086; }
  .entries {
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 0.8rem; color: #6c7086;
    list-style: none; padding: 0;
  }
  .entries li { padding: 4px 0; border-bottom: 1px solid #313244; }
  .section { margin-bottom: 32px; }
</style>
</head>
<body>
  <h2>${this.escapeHtml(info.filename)}</h2>

  ${info.screenshotUri ? `<img class="screenshot" src="${info.screenshotUri}" alt="Save screenshot" />` : ''}

  <div class="section">
    <div class="grid">
      <div class="label">Save Name</div>
      <div class="value">${this.escapeHtml(info.saveName) || '(auto)'}</div>
      <div class="label">Game Version</div>
      <div class="value mono">${this.escapeHtml(info.gameVersion) || 'N/A'}</div>
      <div class="label">Ren'Py Version</div>
      <div class="value mono">${this.escapeHtml(info.renpyVersion)}</div>
      <div class="label">Play Time</div>
      <div class="value">${runtimeStr}</div>
      <div class="label">Created</div>
      <div class="value">${info.createdAt.toLocaleString()}</div>
    </div>
  </div>

  <div class="section">
    <h3>Game Variables (${varEntries.length})</h3>
    <input class="search-box" type="text" placeholder="Filter variables..." id="varFilter" />
    <table id="varTable">
      <tr><th>Variable</th><th>Value</th></tr>
      ${varsHtml}
    </table>
  </div>

  <div class="section">
    <h3>Archive Contents</h3>
    <ul class="entries">
      ${info.entries.map(e => `<li>${this.escapeHtml(e)}</li>`).join('')}
    </ul>
  </div>

  <script>
    const filter = document.getElementById('varFilter');
    const table = document.getElementById('varTable');
    filter.addEventListener('input', () => {
      const q = filter.value.toLowerCase();
      const rows = table.querySelectorAll('tr');
      rows.forEach((row, i) => {
        if (i === 0) return; // skip header
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
      });
    });
  </script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private formatRuntime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private formatFileSize(filePath: string): string {
    try {
      const stat = fs.statSync(filePath);
      return this.formatBytes(stat.size);
    } catch {
      return '';
    }
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
