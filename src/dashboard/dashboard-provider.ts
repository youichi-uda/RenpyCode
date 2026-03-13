/**
 * Ren'Py Code dashboard WebView provider.
 * Sidebar showing project stats, bridge status, and quick actions.
 */

import * as vscode from 'vscode';
import { localize } from '../language/i18n';

export class DashboardProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'renpyCode.dashboard';

  private _view?: vscode.WebviewView;
  private _stats = { files: 0, labels: 0, characters: 0, variables: 0 };
  private _isProLicensed = false;
  private _bridgeConnected = false;
  private _currentLabel = '';

  constructor(private extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'launchGame':
          vscode.commands.executeCommand('renpyCode.launchGame');
          break;
        case 'runLint':
          vscode.commands.executeCommand('renpyCode.lint');
          break;
        case 'showFlowGraph':
          vscode.commands.executeCommand('renpyCode.showFlowGraph');
          break;
        case 'analyzeProject':
          vscode.commands.executeCommand('renpyCode.analyzeProject');
          break;
        case 'activateLicense':
          vscode.commands.executeCommand('renpyCode.activateLicense');
          break;
        case 'warpToLabel':
          vscode.commands.executeCommand('renpyCode.warpToLabel');
          break;
      }
    });
  }

  updateStats(files: number, labels: number, characters: number, variables: number): void {
    this._stats = { files, labels, characters, variables };
    this.postMessage({ type: 'stats', ...this._stats });
  }

  updateLicense(isProLicensed: boolean): void {
    this._isProLicensed = isProLicensed;
    this.postMessage({ type: 'license', isProLicensed });
  }

  updateBridge(connected: boolean, currentLabel: string): void {
    this._bridgeConnected = connected;
    this._currentLabel = currentLabel;
    this.postMessage({ type: 'bridge', connected, currentLabel });
  }

  private postMessage(msg: Record<string, unknown>): void {
    this._view?.webview.postMessage(msg);
  }

  private getHtml(): string {
    const proLabel = this._isProLicensed ? 'Pro' : 'Free';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { padding: 12px; font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); }
  h2 { font-size: 14px; margin: 12px 0 6px 0; color: var(--vscode-sideBarTitle-foreground); }
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
  .stat { background: var(--vscode-editor-background); border-radius: 4px; padding: 8px; text-align: center; }
  .stat .value { font-size: 20px; font-weight: bold; color: var(--vscode-textLink-foreground); }
  .stat .label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .btn { display: block; width: 100%; padding: 6px; margin: 4px 0; text-align: center; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .license-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; }
  .license-badge.pro { background: #4CAF50; color: white; }
  .license-badge.free { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .bridge-status { display: flex; align-items: center; gap: 6px; margin: 8px 0; }
  .bridge-dot { width: 8px; height: 8px; border-radius: 50%; }
  .bridge-dot.connected { background: #4CAF50; }
  .bridge-dot.disconnected { background: #f44336; }
  .section { margin-bottom: 16px; }
</style>
</head>
<body>
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
    <strong>RenPy Code</strong>
    <span id="licenseBadge" class="license-badge ${this._isProLicensed ? 'pro' : 'free'}">${proLabel}</span>
  </div>

  <div class="section">
    <h2>${localize('Project', 'プロジェクト')}</h2>
    <div class="stat-grid">
      <div class="stat"><div class="value" id="statFiles">${this._stats.files}</div><div class="label">${localize('Files', 'ファイル')}</div></div>
      <div class="stat"><div class="value" id="statLabels">${this._stats.labels}</div><div class="label">${localize('Labels', 'ラベル')}</div></div>
      <div class="stat"><div class="value" id="statCharacters">${this._stats.characters}</div><div class="label">${localize('Characters', 'キャラ')}</div></div>
      <div class="stat"><div class="value" id="statVariables">${this._stats.variables}</div><div class="label">${localize('Variables', '変数')}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>${localize('Actions', 'アクション')}</h2>
    <button class="btn" onclick="send('launchGame')">▶ ${localize('Launch Game', 'ゲーム起動')}</button>
    <button class="btn secondary" onclick="send('runLint')">🔍 ${localize('Run Lint', 'Lint実行')}</button>
    <button class="btn secondary" onclick="send('warpToLabel')">⚡ ${localize('Warp to Label', 'ラベルにワープ')}</button>
    <button class="btn secondary" onclick="send('analyzeProject')">📊 ${localize('Analyze Project', 'プロジェクト分析')}</button>
    <button class="btn secondary" onclick="send('showFlowGraph')">🗺 ${localize('Flow Graph', 'フローグラフ')} (Pro)</button>
  </div>

  <div class="section">
    <h2>${localize('Bridge', 'ブリッジ')}</h2>
    <div class="bridge-status">
      <div id="bridgeDot" class="bridge-dot disconnected"></div>
      <span id="bridgeText">${localize('Disconnected', '未接続')}</span>
    </div>
    <div id="currentLabel" style="font-size: 11px; color: var(--vscode-descriptionForeground);"></div>
  </div>

  <div class="section" id="licenseSection" style="${this._isProLicensed ? 'display:none' : ''}">
    <button class="btn" onclick="send('activateLicense')">🔑 ${localize('Activate Pro License', 'Proライセンスを有効化')}</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'stats') {
        document.getElementById('statFiles').textContent = msg.files;
        document.getElementById('statLabels').textContent = msg.labels;
        document.getElementById('statCharacters').textContent = msg.characters;
        document.getElementById('statVariables').textContent = msg.variables;
      } else if (msg.type === 'license') {
        const badge = document.getElementById('licenseBadge');
        badge.className = 'license-badge ' + (msg.isProLicensed ? 'pro' : 'free');
        badge.textContent = msg.isProLicensed ? 'Pro' : 'Free';
        document.getElementById('licenseSection').style.display = msg.isProLicensed ? 'none' : '';
      } else if (msg.type === 'bridge') {
        const dot = document.getElementById('bridgeDot');
        dot.className = 'bridge-dot ' + (msg.connected ? 'connected' : 'disconnected');
        document.getElementById('bridgeText').textContent = msg.connected ? '${localize('Connected', '接続済み')}' : '${localize('Disconnected', '未接続')}';
        document.getElementById('currentLabel').textContent = msg.currentLabel ? 'Label: ' + msg.currentLabel : '';
      }
    });
  </script>
</body>
</html>`;
  }
}
