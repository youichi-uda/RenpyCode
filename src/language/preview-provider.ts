/**
 * Ren'Py scene preview provider (Pro feature).
 * Shows screenshots of scenes via bridge or warp+capture.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BridgeManager } from '../bridge/bridge-manager';
import { localize } from './i18n';

export class PreviewProvider {
  private _panel?: vscode.WebviewPanel;
  private _screenshots: { label: string; path: string }[] = [];

  constructor(
    private bridge: BridgeManager,
    private extensionUri: vscode.Uri,
  ) {}

  /**
   * Show live preview panel.
   */
  async showPreview(): Promise<void> {
    if (this._panel) {
      this._panel.reveal();
    } else {
      this._panel = vscode.window.createWebviewPanel(
        'renpyCode.preview',
        localize('RenPy Code: Live Preview', 'RenPy Code: ライブプレビュー'),
        vscode.ViewColumn.Beside,
        { enableScripts: true },
      );

      this._panel.onDidDispose(() => { this._panel = undefined; });
      this._panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    }

    await this.captureAndShow();
  }

  /**
   * Capture a screenshot from the running game.
   */
  async captureAndShow(): Promise<void> {
    if (!this.bridge.isConnected()) {
      this.showError(localize(
        'Bridge not connected. Launch the game first.',
        'ブリッジが接続されていません。先にゲームを起動してください。',
      ));
      return;
    }

    const screenshotPath = await this.bridge.screenshot();
    if (screenshotPath && fs.existsSync(screenshotPath)) {
      this.updatePanel(screenshotPath);
    } else {
      this.showError(localize('Failed to capture screenshot.', 'スクリーンショットの取得に失敗しました。'));
    }
  }

  /**
   * Show screenshot gallery for multiple scenes.
   */
  async showGallery(scenes: { label: string; warpTarget: string }[]): Promise<void> {
    this._screenshots = [];

    for (const scene of scenes) {
      const response = await this.bridge.jumpToLabel(scene.label);
      if (response?.status === 'ok') {
        await new Promise(r => setTimeout(r, 1000)); // Wait for scene to render
        const ssPath = await this.bridge.screenshot();
        if (ssPath) {
          this._screenshots.push({ label: scene.label, path: ssPath });
        }
      }
    }

    this.updateGallery();
  }

  private updatePanel(screenshotPath: string): void {
    if (!this._panel) return;

    const imageData = fs.readFileSync(screenshotPath);
    const base64 = imageData.toString('base64');
    const mimeType = screenshotPath.endsWith('.jpg') || screenshotPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';

    this._panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; padding: 16px; background: var(--vscode-editor-background); display: flex; flex-direction: column; align-items: center; }
  img { max-width: 100%; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
  .controls { margin: 12px 0; display: flex; gap: 8px; }
  .btn { padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; }
  .timestamp { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 8px; }
</style>
</head>
<body>
  <div class="controls">
    <button class="btn" onclick="vscode.postMessage({command:'refresh'})">Refresh</button>
  </div>
  <img src="data:${mimeType};base64,${base64}" alt="Game Screenshot" />
  <div class="timestamp">Captured: ${new Date().toLocaleTimeString()}</div>
  <script>const vscode = acquireVsCodeApi();</script>
</body>
</html>`;
  }

  private updateGallery(): void {
    if (!this._panel) return;

    const images = this._screenshots.map(ss => {
      const data = fs.readFileSync(ss.path);
      const base64 = data.toString('base64');
      return `<div class="gallery-item">
        <img src="data:image/png;base64,${base64}" alt="${ss.label}" />
        <div class="label">${ss.label}</div>
      </div>`;
    }).join('\n');

    this._panel.webview.html = `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; padding: 16px; background: var(--vscode-editor-background); }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .gallery-item { text-align: center; }
  .gallery-item img { max-width: 100%; border: 1px solid var(--vscode-panel-border); border-radius: 4px; cursor: pointer; }
  .gallery-item .label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
</style>
</head>
<body>
  <h2>Scene Gallery (${this._screenshots.length} scenes)</h2>
  <div class="gallery">${images}</div>
</body>
</html>`;
  }

  private showError(message: string): void {
    if (!this._panel) return;
    this._panel.webview.html = `<!DOCTYPE html>
<html><body style="padding:20px;color:var(--vscode-errorForeground);">${message}</body></html>`;
  }

  private async handleMessage(msg: { command: string }): Promise<void> {
    if (msg.command === 'refresh') {
      await this.captureAndShow();
    }
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
