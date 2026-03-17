/**
 * ATL animation preview provider.
 * Visualizes Ren'Py transform definitions as CSS animations in a WebView.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, TransformDefNode } from '../parser/types';
import { localize } from './i18n';

interface ATLKeyframe {
  time: number;
  properties: Record<string, string>;
}

interface ATLAnimation {
  name: string;
  parameters?: string;
  keyframes: ATLKeyframe[];
  duration: number;
  repeat: boolean;
}

export class ATLPreviewProvider {
  private _panel?: vscode.WebviewPanel;

  constructor(private getIndex: () => ProjectIndex) {}

  async showPreview(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // Find transform at cursor or let user pick
    const index = this.getIndex();
    const transforms = Array.from(index.transforms.entries());

    if (transforms.length === 0) {
      vscode.window.showInformationMessage(
        localize('No transforms found in project.', 'プロジェクト内にトランスフォームが見つかりません。'),
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(
      transforms.map(([name, entry]) => ({
        label: name,
        description: entry.node.parameters ? `(${entry.node.parameters})` : '',
        detail: `${entry.file}:${entry.node.line + 1}`,
        entry,
      })),
      { placeHolder: localize('Select a transform to preview', 'プレビューするトランスフォームを選択') },
    );

    if (!picked) return;

    const animation = this.parseATL(picked.label, picked.entry.node);
    this.showPanel(animation);
  }

  private parseATL(name: string, node: TransformDefNode): ATLAnimation {
    const keyframes: ATLKeyframe[] = [];
    let currentTime = 0;
    let currentProps: Record<string, string> = {};
    let repeat = false;
    let hasExplicitTime = false;

    // Add initial state
    keyframes.push({ time: 0, properties: {} });

    for (const child of node.children) {
      const line = child.raw.trim();

      // Skip blanks and comments
      if (!line || line.startsWith('#')) continue;

      // Check for repeat
      if (line === 'repeat') {
        repeat = true;
        continue;
      }

      // Parse time pause
      const pauseMatch = line.match(/^(?:pause\s+)?(\d+(?:\.\d+)?)\s*$/);
      if (pauseMatch) {
        // Save current state at current time
        if (Object.keys(currentProps).length > 0) {
          keyframes.push({ time: currentTime, properties: { ...currentProps } });
        }
        currentTime += parseFloat(pauseMatch[1]);
        hasExplicitTime = true;
        continue;
      }

      // Parse ATL properties
      const propMatch = line.match(/^(\w+)\s+(.+?)(?:\s*$)/);
      if (propMatch) {
        const [, prop, value] = propMatch;
        if (this.isATLProperty(prop)) {
          currentProps[prop] = value;
        }
      }
    }

    // Add final keyframe
    if (Object.keys(currentProps).length > 0) {
      keyframes.push({ time: currentTime, properties: { ...currentProps } });
    }

    const duration = hasExplicitTime ? Math.max(currentTime, 1) : 2;

    return {
      name,
      parameters: node.parameters,
      keyframes,
      duration,
      repeat,
    };
  }

  private isATLProperty(prop: string): boolean {
    return [
      'xpos', 'ypos', 'xanchor', 'yanchor',
      'xalign', 'yalign', 'xoffset', 'yoffset',
      'alpha', 'rotate', 'zoom', 'xzoom', 'yzoom',
      'crop', 'size', 'pos', 'anchor', 'align',
      'offset', 'xysize',
    ].includes(prop);
  }

  private showPanel(animation: ATLAnimation): void {
    if (this._panel) {
      this._panel.reveal();
    } else {
      this._panel = vscode.window.createWebviewPanel(
        'renpyCode.atlPreview',
        localize('ATL Preview', 'ATLプレビュー'),
        vscode.ViewColumn.Beside,
        { enableScripts: true },
      );
      this._panel.onDidDispose(() => { this._panel = undefined; });
    }

    this._panel.title = `ATL: ${animation.name}`;
    this._panel.webview.html = this.getHtml(animation);
  }

  private getHtml(anim: ATLAnimation): string {
    const cssKeyframes = this.buildCSSKeyframes(anim);
    const propsTable = anim.keyframes
      .filter(kf => Object.keys(kf.properties).length > 0)
      .map(kf => {
        const props = Object.entries(kf.properties)
          .map(([k, v]) => `<span class="prop">${k}</span> <span class="val">${v}</span>`)
          .join('<br>');
        return `<tr><td class="time">${kf.time.toFixed(1)}s</td><td>${props}</td></tr>`;
      })
      .join('');

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
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    margin: 0;
  }
  h2 {
    font-size: 1.2rem;
    margin-bottom: 8px;
    color: #cba6f7;
  }
  .info {
    font-size: 0.85rem;
    color: #6c7086;
    margin-bottom: 24px;
  }
  .stage {
    width: 400px;
    height: 300px;
    background: #313244;
    border: 1px solid #45475a;
    border-radius: 12px;
    position: relative;
    overflow: hidden;
    margin-bottom: 24px;
  }
  .sprite {
    width: 60px;
    height: 80px;
    background: linear-gradient(135deg, #cba6f7, #89b4fa);
    border-radius: 8px;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    color: #1e1e2e;
    animation: atlAnim ${anim.duration}s ${anim.repeat ? 'infinite' : 'forwards'} ease-in-out;
  }
  .controls {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }
  button {
    background: #45475a;
    color: #cdd6f4;
    border: 1px solid #585b70;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  button:hover { background: #585b70; }
  table {
    border-collapse: collapse;
    font-size: 0.85rem;
    width: 100%;
    max-width: 400px;
  }
  th, td {
    padding: 8px 12px;
    border-bottom: 1px solid #313244;
    text-align: left;
  }
  th { color: #6c7086; font-weight: 600; }
  .time { color: #a6e3a1; font-family: monospace; }
  .prop { color: #89b4fa; }
  .val { color: #f9e2af; }
  ${cssKeyframes}
</style>
</head>
<body>
  <h2>transform ${anim.name}${anim.parameters ? `(${anim.parameters})` : ''}</h2>
  <div class="info">${anim.duration.toFixed(1)}s · ${anim.repeat ? 'repeat' : 'once'} · ${anim.keyframes.length} keyframes</div>

  <div class="stage">
    <div class="sprite" id="sprite">${anim.name}</div>
  </div>

  <div class="controls">
    <button onclick="replay()">Replay</button>
    <button onclick="togglePause()">Pause / Resume</button>
  </div>

  <table>
    <tr><th>Time</th><th>Properties</th></tr>
    ${propsTable}
  </table>

  <script>
    function replay() {
      const el = document.getElementById('sprite');
      el.style.animation = 'none';
      el.offsetHeight; // trigger reflow
      el.style.animation = '';
    }
    let paused = false;
    function togglePause() {
      paused = !paused;
      document.getElementById('sprite').style.animationPlayState = paused ? 'paused' : 'running';
    }
  </script>
</body>
</html>`;
  }

  private buildCSSKeyframes(anim: ATLAnimation): string {
    if (anim.keyframes.length === 0) return '';

    const duration = anim.duration || 1;
    const frames = anim.keyframes
      .filter(kf => Object.keys(kf.properties).length > 0)
      .map(kf => {
        const pct = Math.round((kf.time / duration) * 100);
        const css = this.atlToCSS(kf.properties);
        return `  ${pct}% { ${css} }`;
      })
      .join('\n');

    return `@keyframes atlAnim {\n${frames}\n}`;
  }

  private atlToCSS(props: Record<string, string>): string {
    const parts: string[] = [];
    const transforms: string[] = [];

    for (const [key, val] of Object.entries(props)) {
      const numVal = parseFloat(val);

      switch (key) {
        case 'alpha':
          parts.push(`opacity: ${numVal}`);
          break;
        case 'rotate':
          transforms.push(`rotate(${numVal}deg)`);
          break;
        case 'zoom':
          transforms.push(`scale(${numVal})`);
          break;
        case 'xzoom':
          transforms.push(`scaleX(${numVal})`);
          break;
        case 'yzoom':
          transforms.push(`scaleY(${numVal})`);
          break;
        case 'xpos':
        case 'xalign':
          parts.push(`left: ${this.toPercent(val)}`);
          break;
        case 'ypos':
        case 'yalign':
          parts.push(`top: ${this.toPercent(val)}`);
          break;
        case 'xoffset':
          transforms.push(`translateX(${numVal}px)`);
          break;
        case 'yoffset':
          transforms.push(`translateY(${numVal}px)`);
          break;
        case 'xanchor':
          parts.push(`transform-origin: ${this.toPercent(val)} center`);
          break;
        case 'yanchor':
          parts.push(`transform-origin: center ${this.toPercent(val)}`);
          break;
      }
    }

    if (transforms.length > 0) {
      parts.push(`transform: translate(-50%, -50%) ${transforms.join(' ')}`);
    }

    return parts.join('; ');
  }

  private toPercent(val: string): string {
    const num = parseFloat(val);
    if (num >= 0 && num <= 1.0 && val.includes('.')) {
      return `${Math.round(num * 100)}%`;
    }
    return isNaN(num) ? val : `${num}px`;
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
