/**
 * Ren'Py asset manager provider (Pro feature).
 * Visual browser for images, audio, and video assets.
 * Detects unused assets. Ported from MCP find_unused_assets + asset_manager UI.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectIndex } from '../parser/types';
import { localize } from '../language/i18n';

interface AssetInfo {
  path: string;
  name: string;
  type: 'image' | 'audio' | 'video';
  sizeKb: number;
  used: boolean;
}

export class AssetProvider {
  private _panel?: vscode.WebviewPanel;
  private _watcher?: vscode.FileSystemWatcher;
  private _refreshTimer?: NodeJS.Timeout;

  constructor(private getIndex: () => ProjectIndex) {}

  async show(): Promise<void> {
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'renpyCode.assets',
      localize('RenPy Code: Asset Manager', 'RenPy Code: アセットマネージャ'),
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this._panel.onDidDispose(() => {
      this._panel = undefined;
      this._watcher?.dispose();
      this._watcher = undefined;
    });
    this._panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));

    // Watch for asset file changes
    this.startWatching();

    await this.refresh();
  }

  private async refresh(): Promise<void> {
    if (!this._panel) return;
    const assets = await this.scanAssets();
    this._panel.webview.html = this.renderHtml(assets);
  }

  private startWatching(): void {
    this._watcher?.dispose();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    this._watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(path.join(workspaceFolder.uri.fsPath, 'game'), '**/*.{png,jpg,jpeg,webp,ogg,mp3,wav,opus,mp4,webm,ogv}'),
    );

    const scheduleRefresh = () => {
      // Debounce to avoid rapid re-scans
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => this.refresh(), 500);
    };

    this._watcher.onDidCreate(scheduleRefresh);
    this._watcher.onDidDelete(scheduleRefresh);
  }

  /**
   * Find unused assets in the project.
   */
  async findUnused(): Promise<AssetInfo[]> {
    const assets = await this.scanAssets();
    return assets.filter(a => !a.used);
  }

  private async scanAssets(): Promise<AssetInfo[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return [];

    const gameDir = path.join(workspaceFolder.uri.fsPath, 'game');
    if (!fs.existsSync(gameDir)) return [];

    const index = this.getIndex();
    const assets: AssetInfo[] = [];

    // Collect all referenced file names from script
    const referenced = new Set<string>();
    for (const [, parsed] of index.files) {
      for (const node of this.flattenNodes(parsed.nodes)) {
        if (node.raw) {
          // Extract quoted file paths
          const matches = node.raw.matchAll(/"([^"]+\.(png|jpg|jpeg|webp|ogg|mp3|wav|opus|mp4|webm|ogv))"/g);
          for (const m of matches) {
            referenced.add(m[1]);
            referenced.add(path.basename(m[1]));
          }
        }
      }
    }

    // Also add image names
    for (const name of index.images.keys()) {
      referenced.add(name);
      referenced.add(name.replace(/\s+/g, '_'));
    }

    // Scan asset files
    const assetPatterns = ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.webp', '**/*.ogg', '**/*.mp3', '**/*.wav', '**/*.opus', '**/*.mp4', '**/*.webm', '**/*.ogv'];

    for (const pattern of assetPatterns) {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(gameDir, pattern),
        '{**/_mcp/**,**/.git/**,**/*.rpe.py}',
      );

      for (const file of files) {
        const relPath = vscode.workspace.asRelativePath(file);
        const basename = path.basename(file.fsPath);
        const nameNoExt = path.parse(basename).name;
        const ext = path.extname(basename).toLowerCase();

        let type: 'image' | 'audio' | 'video' = 'image';
        if (['.ogg', '.mp3', '.wav', '.opus'].includes(ext)) type = 'audio';
        if (['.mp4', '.webm', '.ogv'].includes(ext)) type = 'video';

        let sizeKb = 0;
        try {
          const stat = fs.statSync(file.fsPath);
          sizeKb = Math.round(stat.size / 1024);
        } catch { /* ignore */ }

        const used = referenced.has(basename) ||
                     referenced.has(nameNoExt) ||
                     referenced.has(relPath.replace(/^game[/\\]/, ''));

        assets.push({ path: relPath, name: basename, type, sizeKb, used });
      }
    }

    return assets.sort((a, b) => a.name.localeCompare(b.name));
  }

  private flattenNodes(nodes: import('../parser/types').RenpyNode[]): import('../parser/types').RenpyNode[] {
    const result: import('../parser/types').RenpyNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.children.length > 0) {
        result.push(...this.flattenNodes(node.children));
      }
    }
    return result;
  }

  private renderHtml(assets: AssetInfo[]): string {
    const images = assets.filter(a => a.type === 'image');
    const audio = assets.filter(a => a.type === 'audio');
    const video = assets.filter(a => a.type === 'video');
    const unused = assets.filter(a => !a.used);
    const totalSize = assets.reduce((s, a) => s + a.sizeKb, 0);

    return `<!DOCTYPE html>
<html>
<head>
<style>
  body { padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 14px; }
  .summary { display: flex; gap: 24px; margin-bottom: 16px; }
  .summary-item { text-align: center; }
  .summary-value { font-size: 24px; font-weight: bold; color: var(--vscode-textLink-foreground); }
  .summary-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .filter { margin-bottom: 12px; display: flex; gap: 8px; }
  .filter button { padding: 4px 12px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
  .filter button.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 6px 8px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; user-select: none; }
  th:hover { color: var(--vscode-textLink-foreground); }
  th .sort-arrow { font-size: 10px; margin-left: 4px; opacity: 0.5; }
  th .sort-arrow.active { opacity: 1; }
  td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  tr.unused { background: rgba(244, 67, 54, 0.1); }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--vscode-list-hoverBackground); }
  .type-badge { padding: 1px 6px; border-radius: 3px; font-size: 10px; }
  .type-image { background: #2196F3; color: white; }
  .type-audio { background: #4CAF50; color: white; }
  .type-video { background: #9C27B0; color: white; }
  .status-used { color: #4CAF50; }
  .status-unused { color: #f44336; font-weight: bold; }
</style>
</head>
<body>
  <h2>${localize('Asset Manager', 'アセットマネージャ')}</h2>
  <div class="summary">
    <div class="summary-item"><div class="summary-value">${images.length}</div><div class="summary-label">${localize('Images', '画像')}</div></div>
    <div class="summary-item"><div class="summary-value">${audio.length}</div><div class="summary-label">${localize('Audio', '音声')}</div></div>
    <div class="summary-item"><div class="summary-value">${video.length}</div><div class="summary-label">${localize('Video', '動画')}</div></div>
    <div class="summary-item"><div class="summary-value">${unused.length}</div><div class="summary-label">${localize('Unused', '未使用')}</div></div>
    <div class="summary-item"><div class="summary-value">${Math.round(totalSize / 1024)}MB</div><div class="summary-label">${localize('Total Size', '合計サイズ')}</div></div>
  </div>

  <div class="filter">
    <button class="active" onclick="filterAssets('all', this)">${localize('All', 'すべて')} (${assets.length})</button>
    <button onclick="filterAssets('image', this)">${localize('Images', '画像')} (${images.length})</button>
    <button onclick="filterAssets('audio', this)">${localize('Audio', '音声')} (${audio.length})</button>
    <button onclick="filterAssets('video', this)">${localize('Video', '動画')} (${video.length})</button>
    <button onclick="filterAssets('unused', this)">${localize('Unused', '未使用')} (${unused.length})</button>
  </div>

  <table id="assetTable">
    <thead><tr>
      <th data-col="0" onclick="sortTable(0)">${localize('Name', '名前')}<span class="sort-arrow active">▲</span></th>
      <th data-col="1" onclick="sortTable(1)">${localize('Type', '種類')}<span class="sort-arrow"></span></th>
      <th data-col="2" onclick="sortTable(2)">${localize('Size', 'サイズ')}<span class="sort-arrow"></span></th>
      <th data-col="3" onclick="sortTable(3)">${localize('Status', '状態')}<span class="sort-arrow"></span></th>
      <th data-col="4" onclick="sortTable(4)">${localize('Path', 'パス')}<span class="sort-arrow"></span></th>
    </tr></thead>
    <tbody>
      ${assets.map(a => `<tr class="${a.used ? '' : 'unused'}" data-type="${a.type}" data-used="${a.used}" data-path="${a.path}">
        <td>${a.name}</td>
        <td><span class="type-badge type-${a.type}">${a.type}</span></td>
        <td data-sort="${a.sizeKb}">${a.sizeKb}KB</td>
        <td class="${a.used ? 'status-used' : 'status-unused'}" data-sort="${a.used ? '0' : '1'}">${a.used ? localize('✓ Used', '✓ 使用中') : localize('✗ Unused', '✗ 未使用')}</td>
        <td style="font-size:10px;color:var(--vscode-descriptionForeground)">${a.path}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>

  <script>
    const vscode = acquireVsCodeApi();
    let currentSort = { col: 0, asc: true };

    function sortTable(col) {
      const tbody = document.querySelector('#assetTable tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const asc = currentSort.col === col ? !currentSort.asc : true;
      currentSort = { col, asc };

      rows.sort((a, b) => {
        const cellA = a.children[col];
        const cellB = b.children[col];
        const valA = cellA.dataset.sort !== undefined ? cellA.dataset.sort : cellA.textContent;
        const valB = cellB.dataset.sort !== undefined ? cellB.dataset.sort : cellB.textContent;
        const numA = Number(valA), numB = Number(valB);
        let cmp = (!isNaN(numA) && !isNaN(numB)) ? numA - numB : String(valA).localeCompare(String(valB));
        return asc ? cmp : -cmp;
      });

      rows.forEach(r => tbody.appendChild(r));

      document.querySelectorAll('#assetTable th .sort-arrow').forEach((arrow, i) => {
        arrow.className = 'sort-arrow' + (i === col ? ' active' : '');
        arrow.textContent = i === col ? (asc ? '\\u25B2' : '\\u25BC') : '';
      });
    }

    function filterAssets(type, btn) {
      document.querySelectorAll('.filter button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('#assetTable tbody tr').forEach(tr => {
        if (type === 'all') { tr.style.display = ''; return; }
        if (type === 'unused') { tr.style.display = tr.dataset.used === 'false' ? '' : 'none'; return; }
        tr.style.display = tr.dataset.type === type ? '' : 'none';
      });
    }

    document.querySelectorAll('#assetTable tbody tr').forEach(tr => {
      tr.addEventListener('click', () => {
        vscode.postMessage({ command: 'openFile', path: tr.dataset.path });
      });
    });
  </script>
</body>
</html>`;
  }

  private async handleMessage(msg: { command: string; path?: string }): Promise<void> {
    if (msg.command === 'openFile' && msg.path) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, msg.path);
        await vscode.commands.executeCommand('vscode.open', fileUri);
      }
    }
  }

  dispose(): void {
    this._watcher?.dispose();
    this._panel?.dispose();
  }
}
