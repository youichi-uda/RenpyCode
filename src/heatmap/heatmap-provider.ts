/**
 * Ren'Py playtest heatmap provider (Pro feature).
 * Visualizes playtest path tracking data from the bridge.
 * Real-time updates via polling. Data persists across game restarts.
 */

import * as vscode from 'vscode';
import { BridgeManager } from '../bridge/bridge-manager';
import { ProjectIndex } from '../parser/types';
import { localize } from '../language/i18n';

interface TrackingData {
  visits: Record<string, number>;
  transitions: { from: string; to: string; time: number }[];
  start_time: number | null;
}

export class HeatmapProvider {
  private _panel?: vscode.WebviewPanel;
  private _pollTimer?: NodeJS.Timeout;
  private _isRecording = false;

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
      this._panel.onDidDispose(() => {
        this._panel = undefined;
        this.stopPolling();
      });
      this._panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    // Fetch initial state
    await this.fetchAndSendData(true);
    this.startPolling();
  }

  private startPolling(): void {
    this.stopPolling();
    this._pollTimer = setInterval(() => {
      this.fetchAndSendData(false);
    }, 2000);
  }

  private stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  private async fetchAndSendData(fullRender: boolean): Promise<void> {
    if (!this._panel) return;

    const response = await this.bridge.getTracking();
    const data = response?.data as TrackingData | undefined;
    const active = (response?.active as boolean) ?? false;
    this._isRecording = active;

    const index = this.getIndex();
    const allLabels = [...index.labels.keys()];

    if (fullRender) {
      this._panel.webview.html = this.renderHtml(data, allLabels, active);
    } else {
      this._panel.webview.postMessage({
        type: 'update',
        data: this.buildViewData(data, allLabels),
        active,
      });
    }
  }

  private buildViewData(data: TrackingData | undefined, allLabels: string[]) {
    const visits = data?.visits || {};
    const transitions = data?.transitions || [];
    const maxVisits = Math.max(1, ...Object.values(visits));

    const barData = Object.entries(visits)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: Math.round((count / maxVisits) * 100) }));

    const visited = new Set(Object.keys(visits));
    const unvisited = allLabels.filter(l => !visited.has(l));

    return {
      visitedCount: Object.keys(visits).length,
      unvisitedCount: unvisited.length,
      barData,
      unvisited,
    };
  }

  private renderHtml(
    data: TrackingData | undefined,
    allLabels: string[],
    active: boolean,
  ): string {
    const vd = this.buildViewData(data, allLabels);
    const toggleLabel = active
      ? localize('\u23F9 Recording...', '\u23F9 記録中...')
      : localize('\u23FA Start Recording', '\u23FA 記録開始');
    const toggleClass = active ? 'btn recording' : 'btn';

    return `<!DOCTYPE html>
<html>
<head>
<style>
  body { padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 14px; margin: 16px 0 8px; }
  .controls { margin-bottom: 16px; display: flex; gap: 8px; align-items: center; }
  .btn { padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.recording { background: #f44336; animation: pulse 1.5s infinite; }
  .btn.danger { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn.danger:hover { background: #f44336; color: white; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
  .bar-container { margin: 4px 0; }
  .bar-label { display: inline-block; width: 150px; overflow: hidden; text-overflow: ellipsis; font-size: 12px; white-space: nowrap; }
  .bar-wrapper { display: inline-block; width: calc(100% - 200px); height: 16px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 2px; vertical-align: middle; }
  .bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
  .bar-count { display: inline-block; width: 40px; text-align: right; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .heat-low { background: #4CAF50; }
  .heat-med { background: #FF9800; }
  .heat-high { background: #f44336; }
  .unvisited { font-size: 12px; color: var(--vscode-descriptionForeground); }
  .unvisited span { display: inline-block; margin: 2px 4px; padding: 1px 6px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; cursor: pointer; }
  .unvisited span:hover { background: var(--vscode-textLink-foreground); color: var(--vscode-editor-background); }
  .summary { display: flex; gap: 24px; margin-bottom: 16px; }
  .summary-item { text-align: center; }
  .summary-value { font-size: 24px; font-weight: bold; color: var(--vscode-textLink-foreground); }
  .summary-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .empty-msg { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <h2>${localize('Playtest Heatmap', 'プレイテストヒートマップ')}</h2>

  <div class="controls">
    <button id="toggleBtn" class="${toggleClass}" onclick="send('toggleTracking')">${toggleLabel}</button>
    <button class="btn danger" onclick="send('clearTracking')">${localize('Clear', 'クリア')}</button>
  </div>

  <div class="summary">
    <div class="summary-item"><div class="summary-value" id="visitedCount">${vd.visitedCount}</div><div class="summary-label">${localize('Labels Visited', '訪問済みラベル')}</div></div>
    <div class="summary-item"><div class="summary-value" id="unvisitedCount">${vd.unvisitedCount}</div><div class="summary-label">${localize('Unvisited', '未訪問')}</div></div>
  </div>

  <h2>${localize('Visit Frequency', '訪問頻度')}</h2>
  <div id="bars">${this.renderBars(vd.barData)}</div>

  <div id="unvisitedSection">${this.renderUnvisited(vd.unvisited)}</div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type !== 'update') return;
      const d = msg.data;

      // Update toggle button
      const btn = document.getElementById('toggleBtn');
      if (msg.active) {
        btn.className = 'btn recording';
        btn.textContent = '${localize('\\u23F9 Recording...', '\\u23F9 記録中...')}';
      } else {
        btn.className = 'btn';
        btn.textContent = '${localize('\\u23FA Start Recording', '\\u23FA 記録開始')}';
      }

      // Update summary
      document.getElementById('visitedCount').textContent = d.visitedCount;
      document.getElementById('unvisitedCount').textContent = d.unvisitedCount;

      // Update bars
      const barsEl = document.getElementById('bars');
      if (d.barData.length === 0) {
        barsEl.innerHTML = '<p class="empty-msg">${localize('No data yet. Start recording and play through the game.', 'データがありません。記録を開始してゲームをプレイしてください。')}</p>';
      } else {
        barsEl.innerHTML = d.barData.map(b => {
          const hc = b.pct > 66 ? 'heat-high' : b.pct > 33 ? 'heat-med' : 'heat-low';
          return '<div class="bar-container"><span class="bar-label">' + b.label + '</span><span class="bar-wrapper"><div class="bar-fill ' + hc + '" style="width:' + b.pct + '%"></div></span><span class="bar-count">' + b.count + '</span></div>';
        }).join('');
      }

      // Update unvisited
      const uvEl = document.getElementById('unvisitedSection');
      if (d.unvisited.length > 0) {
        uvEl.innerHTML = '<h2>${localize('Unvisited Labels', '未訪問ラベル')}</h2><div class="unvisited">' + d.unvisited.map(l => '<span onclick="goTo(\\'' + l.replace(/'/g, "\\\\'") + '\\')">' + l + '</span>').join(' ') + '</div>';
      } else {
        uvEl.innerHTML = '';
      }
    });
    function goTo(label) { vscode.postMessage({ command: 'goToLabel', label: label }); }
    document.addEventListener('click', e => {
      const span = e.target.closest('.unvisited span');
      if (span) goTo(span.textContent);
    });
  </script>
</body>
</html>`;
  }

  private renderBars(barData: { label: string; count: number; pct: number }[]): string {
    if (barData.length === 0) {
      return `<p class="empty-msg">${localize('No data yet. Start recording and play through the game.', 'データがありません。記録を開始してゲームをプレイしてください。')}</p>`;
    }
    return barData.map(d => {
      const heatClass = d.pct > 66 ? 'heat-high' : d.pct > 33 ? 'heat-med' : 'heat-low';
      return `<div class="bar-container">
        <span class="bar-label">${d.label}</span>
        <span class="bar-wrapper"><div class="bar-fill ${heatClass}" style="width:${d.pct}%"></div></span>
        <span class="bar-count">${d.count}</span>
      </div>`;
    }).join('\n');
  }

  private renderUnvisited(unvisited: string[]): string {
    if (unvisited.length === 0) return '';
    return `<h2>${localize('Unvisited Labels', '未訪問ラベル')}</h2>
    <div class="unvisited">${unvisited.map(l => `<span>${l}</span>`).join(' ')}</div>`;
    // Click handled by delegated event listener in script
  }

  private async handleMessage(msg: { command: string; label?: string }): Promise<void> {
    switch (msg.command) {
      case 'toggleTracking':
        if (this._isRecording) {
          await this.bridge.stopTracking();
          this._isRecording = false;
        } else {
          await this.bridge.startTracking();
          this._isRecording = true;
        }
        await this.fetchAndSendData(false);
        break;
      case 'clearTracking':
        await this.bridge.sendCommand({ action: 'clear_tracking' });
        await this.fetchAndSendData(false);
        break;
      case 'goToLabel':
        if (msg.label) {
          const index = this.getIndex();
          const entries = index.labels.get(msg.label);
          if (entries && entries.length > 0) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
              const uri = vscode.Uri.joinPath(workspaceFolder.uri, entries[0].file);
              await vscode.window.showTextDocument(uri, {
                selection: new vscode.Range(entries[0].node.line, 0, entries[0].node.line, 0),
                viewColumn: vscode.ViewColumn.One,
              });
            }
          }
        }
        break;
    }
  }

  dispose(): void {
    this.stopPolling();
    this._panel?.dispose();
  }
}
