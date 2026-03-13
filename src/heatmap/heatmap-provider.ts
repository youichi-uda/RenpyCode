/**
 * Ren'Py playtest heatmap provider (Pro feature).
 * Visualizes playtest path tracking data from the bridge.
 * Ported from MCP web UI heatmap.
 */

import * as vscode from 'vscode';
import { BridgeManager } from '../bridge/bridge-manager';
import { ProjectIndex } from '../parser/types';
import { localize } from '../language/i18n';

export class HeatmapProvider {
  private _panel?: vscode.WebviewPanel;

  constructor(
    private bridge: BridgeManager,
    private getIndex: () => ProjectIndex,
  ) {}

  async show(): Promise<void> {
    if (this._panel) {
      this._panel.reveal();
    } else {
      this._panel = vscode.window.createWebviewPanel(
        'renpyCode.heatmap',
        localize('RenPy Code: Playtest Heatmap', 'RenPy Code: プレイテストヒートマップ'),
        vscode.ViewColumn.Beside,
        { enableScripts: true },
      );
      this._panel.onDidDispose(() => { this._panel = undefined; });
      this._panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    await this.refresh();
  }

  private async refresh(): Promise<void> {
    if (!this._panel) return;

    const response = await this.bridge.getTracking();
    const data = response?.data as { visits: Record<string, number>; transitions: { from: string; to: string; time: number }[] } | undefined;

    const index = this.getIndex();
    const labels = [...index.labels.keys()];

    this._panel.webview.html = this.renderHtml(data, labels);
  }

  private renderHtml(
    data: { visits: Record<string, number>; transitions: { from: string; to: string; time: number }[] } | undefined,
    allLabels: string[],
  ): string {
    const visits = data?.visits || {};
    const transitions = data?.transitions || [];
    const maxVisits = Math.max(1, ...Object.values(visits));

    // Build bar chart data
    const barData = Object.entries(visits)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: Math.round((count / maxVisits) * 100) }));

    // Count transitions
    const transitionCounts = new Map<string, number>();
    for (const t of transitions) {
      const key = `${t.from} → ${t.to}`;
      transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
    }
    const topTransitions = [...transitionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    // Unvisited labels
    const visited = new Set(Object.keys(visits));
    const unvisited = allLabels.filter(l => !visited.has(l));

    return `<!DOCTYPE html>
<html>
<head>
<style>
  body { padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 14px; margin: 16px 0 8px; }
  .controls { margin-bottom: 16px; display: flex; gap: 8px; }
  .btn { padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.danger { background: #f44336; }
  .bar-container { margin: 4px 0; }
  .bar-label { display: inline-block; width: 150px; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
  .bar-wrapper { display: inline-block; width: calc(100% - 200px); height: 16px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 2px; vertical-align: middle; }
  .bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
  .bar-count { display: inline-block; width: 40px; text-align: right; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .heat-low { background: #4CAF50; }
  .heat-med { background: #FF9800; }
  .heat-high { background: #f44336; }
  .transition-list { font-size: 12px; }
  .transition-item { padding: 2px 0; }
  .transition-count { color: var(--vscode-descriptionForeground); }
  .unvisited { font-size: 12px; color: var(--vscode-descriptionForeground); }
  .unvisited span { display: inline-block; margin: 2px 4px; padding: 1px 6px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; }
  .summary { display: flex; gap: 24px; margin-bottom: 16px; }
  .summary-item { text-align: center; }
  .summary-value { font-size: 24px; font-weight: bold; color: var(--vscode-textLink-foreground); }
  .summary-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <h2>Playtest Heatmap</h2>

  <div class="controls">
    <button class="btn" onclick="send('startTracking')">⏺ Start Recording</button>
    <button class="btn" onclick="send('stopTracking')">⏹ Stop</button>
    <button class="btn" onclick="send('refresh')">🔄 Refresh</button>
    <button class="btn danger" onclick="send('clearTracking')">🗑 Clear</button>
  </div>

  <div class="summary">
    <div class="summary-item">
      <div class="summary-value">${Object.keys(visits).length}</div>
      <div class="summary-label">Labels Visited</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${transitions.length}</div>
      <div class="summary-label">Transitions</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${unvisited.length}</div>
      <div class="summary-label">Unvisited</div>
    </div>
  </div>

  <h2>Visit Frequency</h2>
  ${barData.length === 0 ? '<p style="color:var(--vscode-descriptionForeground)">No data yet. Start recording and play through the game.</p>' : ''}
  ${barData.map(d => {
    const heatClass = d.pct > 66 ? 'heat-high' : d.pct > 33 ? 'heat-med' : 'heat-low';
    return `<div class="bar-container">
      <span class="bar-label">${d.label}</span>
      <span class="bar-wrapper"><div class="bar-fill ${heatClass}" style="width:${d.pct}%"></div></span>
      <span class="bar-count">${d.count}</span>
    </div>`;
  }).join('\n')}

  <h2>Top Transitions</h2>
  <div class="transition-list">
    ${topTransitions.map(([path, count]) => `<div class="transition-item">${path} <span class="transition-count">(${count}x)</span></div>`).join('\n')}
    ${topTransitions.length === 0 ? '<p style="color:var(--vscode-descriptionForeground)">No transitions recorded.</p>' : ''}
  </div>

  ${unvisited.length > 0 ? `<h2>Unvisited Labels</h2>
  <div class="unvisited">${unvisited.map(l => `<span>${l}</span>`).join(' ')}</div>` : ''}

  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
  }

  private async handleMessage(msg: { command: string }): Promise<void> {
    switch (msg.command) {
      case 'startTracking':
        await this.bridge.startTracking();
        vscode.window.showInformationMessage('Recording started');
        break;
      case 'stopTracking':
        await this.bridge.stopTracking();
        await this.refresh();
        break;
      case 'refresh':
        await this.refresh();
        break;
      case 'clearTracking':
        await this.bridge.sendCommand({ action: 'clear_tracking' });
        await this.refresh();
        break;
    }
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
