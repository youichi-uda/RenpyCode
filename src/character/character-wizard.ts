/**
 * Character Wizard — visual character definition & expression management (Pro feature).
 * Lets users create, edit, and preview characters with their expression images.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectIndex, DefineNode } from '../parser/types';
import { localize } from '../language/i18n';

interface CharacterInfo {
  /** Variable name (e.g. "e", "s") */
  variable: string;
  /** Display name (e.g. "Eileen", "Sylvie") */
  displayName: string;
  /** Name color (e.g. "#c8ffc8") */
  color?: string;
  /** Image tag (e.g. "eileen") */
  imageTag?: string;
  /** Who-color */
  whoColor?: string;
  /** What-color */
  whatColor?: string;
  /** Callback parameter */
  callback?: string;
  /** Source file */
  file: string;
  /** Line number (0-based) */
  line: number;
  /** Raw define statement */
  raw: string;
  /** Expression images found for this character */
  expressions: ExpressionInfo[];
}

interface ExpressionInfo {
  /** Expression name (e.g. "happy", "sad") */
  name: string;
  /** Full image tag (e.g. "eileen happy") */
  imageTag: string;
  /** File path relative to game/ */
  filePath?: string;
  /** Whether defined via `image` statement */
  definedInScript: boolean;
}

export class CharacterWizard {
  private _panel?: vscode.WebviewPanel;

  constructor(private getIndex: () => ProjectIndex) {}

  async show(): Promise<void> {
    if (this._panel) {
      this._panel.reveal();
      await this.refresh();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'renpyCode.characterWizard',
      localize('RenPy Code: Character Wizard', 'RenPy Code: キャラクターウィザード'),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.getLocalResourceRoots(),
      },
    );

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });
    this._panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));

    await this.refresh();
  }

  private getLocalResourceRoots(): vscode.Uri[] {
    const roots: vscode.Uri[] = [];
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      roots.push(vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'game')));
    }
    return roots;
  }

  private async refresh(): Promise<void> {
    if (!this._panel) return;
    const characters = this.gatherCharacters();
    this._panel.webview.html = this.renderHtml(characters);
  }

  /**
   * Parse all character definitions from the project index and find their expressions.
   */
  private gatherCharacters(): CharacterInfo[] {
    const index = this.getIndex();
    const characters: CharacterInfo[] = [];

    for (const [variable, entry] of index.characters) {
      const node = entry.node;
      const info = this.parseCharacterDefine(variable, node, entry.file);
      if (info) {
        info.expressions = this.findExpressions(info, index);
        characters.push(info);
      }
    }

    return characters.sort((a, b) => a.variable.localeCompare(b.variable));
  }

  /**
   * Extract character properties from a define node's value string.
   */
  private parseCharacterDefine(variable: string, node: DefineNode, file: string): CharacterInfo | null {
    const value = node.value;
    if (!value.match(/^Character\s*\(/)) return null;

    // Extract display name
    const nameMatch = value.match(/Character\s*\(\s*(?:_\s*\(\s*)?["']([^"']+)["']/);
    const displayName = nameMatch ? nameMatch[1] : variable;

    // Extract color
    const colorMatch = value.match(/color\s*=\s*["']([^"']+)["']/);
    const color = colorMatch ? colorMatch[1] : undefined;

    // Extract image tag
    const imageMatch = value.match(/image\s*=\s*["']([^"']+)["']/);
    const imageTag = imageMatch ? imageMatch[1] : undefined;

    // Extract who_color
    const whoColorMatch = value.match(/who_color\s*=\s*["']([^"']+)["']/);
    const whoColor = whoColorMatch ? whoColorMatch[1] : undefined;

    // Extract what_color
    const whatColorMatch = value.match(/what_color\s*=\s*["']([^"']+)["']/);
    const whatColor = whatColorMatch ? whatColorMatch[1] : undefined;

    // Extract callback
    const callbackMatch = value.match(/callback\s*=\s*(\w+)/);
    const callback = callbackMatch ? callbackMatch[1] : undefined;

    return {
      variable,
      displayName,
      color,
      imageTag,
      whoColor,
      whatColor,
      callback,
      file,
      line: node.line,
      raw: node.raw,
      expressions: [],
    };
  }

  /**
   * Find expression images for a character by checking:
   * 1. Image definitions in the script (e.g. `image eileen happy = ...`)
   * 2. Image files on disk matching the character's image tag
   */
  private findExpressions(char: CharacterInfo, index: ProjectIndex): ExpressionInfo[] {
    const tag = char.imageTag || char.variable;
    const expressions: ExpressionInfo[] = [];
    const seen = new Set<string>();

    // 1. From image definitions in scripts
    for (const [imageName] of index.images) {
      if (imageName === tag || imageName.startsWith(tag + ' ')) {
        const exprName = imageName === tag ? 'default' : imageName.substring(tag.length + 1);
        if (!seen.has(exprName)) {
          seen.add(exprName);
          expressions.push({
            name: exprName,
            imageTag: imageName,
            definedInScript: true,
          });
        }
      }
    }

    // 2. From image files on disk (auto-detected by Ren'Py naming convention)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const gameDir = path.join(workspaceFolder.uri.fsPath, 'game');
      if (fs.existsSync(gameDir)) {
        this.scanExpressionFiles(gameDir, gameDir, tag, expressions, seen);
      }
    }

    return expressions.sort((a, b) => {
      if (a.name === 'default') return -1;
      if (b.name === 'default') return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Recursively scan for image files matching the character's image tag.
   * Ren'Py convention: `images/eileen happy.png` or `images/eileen/happy.png`
   */
  private scanExpressionFiles(dir: string, gameDir: string, tag: string, expressions: ExpressionInfo[], seen: Set<string>): void {
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp'];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          this.scanExpressionFiles(fullPath, gameDir, tag, expressions, seen);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!imageExts.includes(ext)) continue;

          const nameNoExt = path.parse(entry.name).name;
          const relPath = path.relative(gameDir, fullPath).replace(/\\/g, '/');

          // Match: "tag expression.png" or "tag_expression.png"
          if (nameNoExt === tag) {
            if (!seen.has('default')) {
              seen.add('default');
              expressions.push({
                name: 'default',
                imageTag: tag,
                filePath: relPath,
                definedInScript: false,
              });
            } else {
              // Update existing with file path
              const existing = expressions.find(e => e.name === 'default');
              if (existing && !existing.filePath) existing.filePath = relPath;
            }
          } else if (nameNoExt.startsWith(tag + ' ') || nameNoExt.startsWith(tag + '_')) {
            const separator = nameNoExt[tag.length];
            const exprName = nameNoExt.substring(tag.length + 1).replace(/_/g, ' ');
            if (!seen.has(exprName)) {
              seen.add(exprName);
              expressions.push({
                name: exprName,
                imageTag: `${tag} ${exprName}`,
                filePath: relPath,
                definedInScript: false,
              });
            } else {
              const existing = expressions.find(e => e.name === exprName);
              if (existing && !existing.filePath) existing.filePath = relPath;
            }
          }
        }
      }
    } catch { /* ignore permission errors */ }
  }

  private renderHtml(characters: CharacterInfo[]): string {
    const webview = this._panel!.webview;

    return `<!DOCTYPE html>
<html>
<head>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 14px; margin-bottom: 12px; }

  .toolbar { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; }
  .toolbar button { padding: 6px 14px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
  .toolbar button:hover { background: var(--vscode-button-hoverBackground); }
  .toolbar .count { font-size: 12px; color: var(--vscode-descriptionForeground); margin-left: auto; }

  .character-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 20px; }

  .character-card {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 12px;
    cursor: pointer;
    transition: border-color 0.15s;
    background: var(--vscode-editor-background);
  }
  .character-card:hover { border-color: var(--vscode-focusBorder); }
  .character-card.selected { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); }

  .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .card-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: bold; color: #fff;
    flex-shrink: 0;
  }
  .card-name { font-size: 13px; font-weight: bold; }
  .card-variable { font-size: 11px; color: var(--vscode-descriptionForeground); font-family: monospace; }

  .card-meta { font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; gap: 12px; flex-wrap: wrap; }
  .card-meta span { display: flex; align-items: center; gap: 3px; }
  .color-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; border: 1px solid var(--vscode-panel-border); }

  /* Detail panel */
  .detail-panel {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 20px;
    display: none;
  }
  .detail-panel.visible { display: block; }
  .detail-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .detail-header h3 { font-size: 14px; }
  .detail-close { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-size: 16px; padding: 4px; }

  .detail-props { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 12px; margin-bottom: 16px; }
  .detail-props dt { color: var(--vscode-descriptionForeground); }
  .detail-props dd { font-family: monospace; }

  .detail-actions { display: flex; gap: 8px; margin-bottom: 16px; }
  .detail-actions button { padding: 4px 10px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 3px; cursor: pointer; font-size: 11px; }
  .detail-actions button:hover { background: var(--vscode-button-secondaryHoverBackground); }

  .expressions-title { font-size: 12px; font-weight: bold; margin-bottom: 8px; }
  .expression-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
  .expression-item {
    text-align: center; padding: 8px; border: 1px solid var(--vscode-panel-border);
    border-radius: 4px; font-size: 11px; cursor: pointer;
    transition: border-color 0.15s;
  }
  .expression-item:hover { border-color: var(--vscode-focusBorder); }
  .expression-img {
    width: 80px; height: 80px; object-fit: contain;
    display: block; margin: 0 auto 4px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 3px;
  }
  .expression-placeholder {
    width: 80px; height: 80px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 4px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 3px;
    font-size: 24px; color: var(--vscode-descriptionForeground);
  }
  .expression-name { color: var(--vscode-foreground); }
  .expression-source { font-size: 9px; color: var(--vscode-descriptionForeground); }
  .no-expressions { font-size: 12px; color: var(--vscode-descriptionForeground); font-style: italic; padding: 12px; }

  /* Create form */
  .create-form {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 20px;
    display: none;
  }
  .create-form.visible { display: block; }
  .create-form h3 { font-size: 14px; margin-bottom: 12px; }
  .form-row { display: flex; gap: 12px; margin-bottom: 8px; align-items: center; }
  .form-row label { font-size: 12px; min-width: 100px; color: var(--vscode-descriptionForeground); }
  .form-row input { flex: 1; padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px; font-size: 12px; font-family: var(--vscode-font-family); }
  .form-row input[type="color"] { width: 40px; height: 28px; padding: 2px; cursor: pointer; }
  .form-row .color-group { display: flex; align-items: center; gap: 6px; flex: 1; }
  .form-row .color-group input[type="text"] { flex: 1; }
  .form-actions { display: flex; gap: 8px; margin-top: 12px; }
  .form-actions button { padding: 6px 14px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
  .form-actions .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .form-actions .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .form-actions .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }

  .preview-code { margin-top: 12px; padding: 8px; background: var(--vscode-textBlockQuote-background); border-radius: 3px; font-family: monospace; font-size: 12px; white-space: pre; }
</style>
</head>
<body>
  <h2>${localize('Character Wizard', 'キャラクターウィザード')}</h2>

  <div class="toolbar">
    <button onclick="toggleCreateForm()">${localize('+ New Character', '+ 新規キャラクター')}</button>
    <span class="count">${localize(`${characters.length} characters`, `${characters.length}キャラクター`)}</span>
  </div>

  <!-- Create form -->
  <div class="create-form" id="createForm">
    <h3>${localize('Define New Character', '新規キャラクター定義')}</h3>
    <div class="form-row">
      <label>${localize('Variable Name', '変数名')}</label>
      <input type="text" id="newVar" placeholder="e.g. e, sylvie" spellcheck="false" />
    </div>
    <div class="form-row">
      <label>${localize('Display Name', '表示名')}</label>
      <input type="text" id="newName" placeholder="e.g. Eileen, Sylvie" />
    </div>
    <div class="form-row">
      <label>${localize('Name Color', '名前の色')}</label>
      <div class="color-group">
        <input type="color" id="newColorPicker" value="#c8ffc8" oninput="document.getElementById('newColor').value=this.value" />
        <input type="text" id="newColor" placeholder="#c8ffc8" value="#c8ffc8" oninput="document.getElementById('newColorPicker').value=this.value" />
      </div>
    </div>
    <div class="form-row">
      <label>${localize('Image Tag', '画像タグ')}</label>
      <input type="text" id="newImage" placeholder="${localize('(auto: same as variable)', '(自動: 変数名と同じ)')}" spellcheck="false" />
    </div>
    <div id="previewCode" class="preview-code" style="display:none"></div>
    <div class="form-actions">
      <button class="btn-primary" onclick="createCharacter()">${localize('Insert Definition', '定義を挿入')}</button>
      <button class="btn-secondary" onclick="previewDefinition()">${localize('Preview', 'プレビュー')}</button>
      <button class="btn-secondary" onclick="toggleCreateForm()">${localize('Cancel', 'キャンセル')}</button>
    </div>
  </div>

  <!-- Detail panel -->
  <div class="detail-panel" id="detailPanel">
    <div class="detail-header">
      <h3 id="detailTitle"></h3>
      <button class="detail-close" onclick="closeDetail()">✕</button>
    </div>
    <dl class="detail-props" id="detailProps"></dl>
    <div class="detail-actions">
      <button onclick="goToDefinition()">${localize('Go to Definition', '定義に移動')}</button>
      <button onclick="copyDefinition()">${localize('Copy Define Statement', 'define文をコピー')}</button>
    </div>
    <div class="expressions-title" id="expressionsTitle"></div>
    <div id="expressionsContainer"></div>
  </div>

  <!-- Character grid -->
  <div class="character-grid">
    ${characters.map(c => this.renderCharacterCard(c, webview)).join('\n')}
  </div>

  ${characters.length === 0 ? `<div class="no-expressions">${localize(
    'No characters defined yet. Click "+ New Character" to create one, or define characters in your .rpy files with: define e = Character("Eileen")',
    'キャラクターがまだ定義されていません。「+ 新規キャラクター」をクリックして作成するか、.rpyファイルで define e = Character("Eileen") と定義してください。',
  )}</div>` : ''}

  <script>
    const vscode = acquireVsCodeApi();
    const characters = ${JSON.stringify(characters.map(c => ({
      variable: c.variable,
      displayName: c.displayName,
      color: c.color,
      imageTag: c.imageTag,
      whoColor: c.whoColor,
      whatColor: c.whatColor,
      callback: c.callback,
      file: c.file,
      line: c.line,
      raw: c.raw,
      expressions: c.expressions.map(e => ({ name: e.name, imageTag: e.imageTag, definedInScript: e.definedInScript, filePath: e.filePath })),
    })))};

    let selectedChar = null;

    function selectCharacter(variable) {
      const char = characters.find(c => c.variable === variable);
      if (!char) return;
      selectedChar = char;

      // Highlight card
      document.querySelectorAll('.character-card').forEach(el => el.classList.remove('selected'));
      const card = document.querySelector('[data-var="' + variable + '"]');
      if (card) card.classList.add('selected');

      // Update detail panel
      const panel = document.getElementById('detailPanel');
      panel.classList.add('visible');
      document.getElementById('detailTitle').textContent = char.displayName + ' (' + char.variable + ')';

      const props = document.getElementById('detailProps');
      let propsHtml = '';
      propsHtml += '<dt>${localize('Variable', '変数')}</dt><dd>' + char.variable + '</dd>';
      propsHtml += '<dt>${localize('Display Name', '表示名')}</dt><dd>' + char.displayName + '</dd>';
      if (char.color) propsHtml += '<dt>${localize('Color', '色')}</dt><dd><span class="color-swatch" style="background:' + char.color + '"></span> ' + char.color + '</dd>';
      if (char.imageTag) propsHtml += '<dt>${localize('Image Tag', '画像タグ')}</dt><dd>' + char.imageTag + '</dd>';
      if (char.whoColor) propsHtml += '<dt>who_color</dt><dd><span class="color-swatch" style="background:' + char.whoColor + '"></span> ' + char.whoColor + '</dd>';
      if (char.whatColor) propsHtml += '<dt>what_color</dt><dd><span class="color-swatch" style="background:' + char.whatColor + '"></span> ' + char.whatColor + '</dd>';
      if (char.callback) propsHtml += '<dt>callback</dt><dd>' + char.callback + '</dd>';
      propsHtml += '<dt>${localize('File', 'ファイル')}</dt><dd>' + char.file + ':' + (char.line + 1) + '</dd>';
      props.innerHTML = propsHtml;

      // Expressions
      const title = document.getElementById('expressionsTitle');
      title.textContent = '${localize('Expressions', '表情')} (' + char.expressions.length + ')';
      const container = document.getElementById('expressionsContainer');
      if (char.expressions.length === 0) {
        container.innerHTML = '<div class="no-expressions">${localize('No expression images found.', '表情画像が見つかりません。')}</div>';
      } else {
        container.innerHTML = '<div class="expression-grid">' + char.expressions.map(e => {
          const imgHtml = e.filePath
            ? '<img class="expression-img" src="' + e.webviewUri + '" alt="' + e.name + '" />'
            : '<div class="expression-placeholder">?</div>';
          const source = e.definedInScript
            ? '${localize('script', 'スクリプト')}'
            : '${localize('file', 'ファイル')}';
          return '<div class="expression-item" onclick="openExpression(\\'' + (e.filePath || '').replace(/'/g, "\\\\'") + '\\')">'
            + imgHtml
            + '<div class="expression-name">' + e.name + '</div>'
            + '<div class="expression-source">' + source + '</div>'
            + '</div>';
        }).join('') + '</div>';
      }
    }

    function closeDetail() {
      document.getElementById('detailPanel').classList.remove('visible');
      document.querySelectorAll('.character-card').forEach(el => el.classList.remove('selected'));
      selectedChar = null;
    }

    function goToDefinition() {
      if (!selectedChar) return;
      vscode.postMessage({ command: 'goToDefinition', file: selectedChar.file, line: selectedChar.line });
    }

    function copyDefinition() {
      if (!selectedChar) return;
      vscode.postMessage({ command: 'copyDefinition', raw: selectedChar.raw });
    }

    function openExpression(filePath) {
      if (filePath) {
        vscode.postMessage({ command: 'openFile', path: 'game/' + filePath });
      }
    }

    function toggleCreateForm() {
      const form = document.getElementById('createForm');
      form.classList.toggle('visible');
      document.getElementById('previewCode').style.display = 'none';
    }

    function buildDefineStatement() {
      const varName = document.getElementById('newVar').value.trim();
      const displayName = document.getElementById('newName').value.trim();
      const color = document.getElementById('newColor').value.trim();
      const imageTag = document.getElementById('newImage').value.trim();

      if (!varName || !displayName) return null;

      let params = [];
      params.push('"' + displayName + '"');
      if (color) params.push('color="' + color + '"');
      if (imageTag) params.push('image="' + imageTag + '"');

      return 'define ' + varName + ' = Character(' + params.join(', ') + ')';
    }

    function previewDefinition() {
      const stmt = buildDefineStatement();
      const preview = document.getElementById('previewCode');
      if (stmt) {
        preview.textContent = stmt;
        preview.style.display = 'block';
      } else {
        preview.textContent = '${localize('Please fill in Variable Name and Display Name.', '変数名と表示名を入力してください。')}';
        preview.style.display = 'block';
      }
    }

    function createCharacter() {
      const stmt = buildDefineStatement();
      if (!stmt) {
        previewDefinition();
        return;
      }
      vscode.postMessage({ command: 'insertCharacter', statement: stmt });
    }
  </script>
</body>
</html>`;
  }

  private renderCharacterCard(char: CharacterInfo, webview: vscode.Webview): string {
    const bgColor = char.color || '#666';
    const initial = char.displayName.charAt(0).toUpperCase();
    const exprCount = char.expressions.length;

    // Build expression data with webview URIs for the JS data
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      for (const expr of char.expressions) {
        if (expr.filePath) {
          const fileUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'game', expr.filePath));
          (expr as any).webviewUri = webview.asWebviewUri(fileUri).toString();
        }
      }
    }

    return `<div class="character-card" data-var="${char.variable}" onclick="selectCharacter('${char.variable}')">
      <div class="card-header">
        <div class="card-avatar" style="background:${bgColor}">${initial}</div>
        <div>
          <div class="card-name">${this.escapeHtml(char.displayName)}</div>
          <div class="card-variable">${char.variable}</div>
        </div>
      </div>
      <div class="card-meta">
        ${char.color ? `<span><span class="color-swatch" style="background:${char.color}"></span>${char.color}</span>` : ''}
        ${char.imageTag ? `<span>img: ${char.imageTag}</span>` : ''}
        <span>${exprCount} ${localize('expressions', '表情')}</span>
      </div>
    </div>`;
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private async handleMessage(msg: { command: string; [key: string]: any }): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    switch (msg.command) {
      case 'goToDefinition': {
        if (!workspaceFolder || !msg.file) return;
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, msg.file);
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc, {
          selection: new vscode.Range(msg.line, 0, msg.line, 0),
        });
        break;
      }

      case 'copyDefinition': {
        if (msg.raw) {
          await vscode.env.clipboard.writeText(msg.raw);
          vscode.window.showInformationMessage(
            localize('Definition copied to clipboard.', '定義をクリップボードにコピーしました。'),
          );
        }
        break;
      }

      case 'openFile': {
        if (!workspaceFolder || !msg.path) return;
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, msg.path);
        await vscode.commands.executeCommand('vscode.open', fileUri);
        break;
      }

      case 'insertCharacter': {
        if (!msg.statement) return;
        await this.insertCharacterStatement(msg.statement);
        // Refresh after a short delay to let the indexer pick up the change
        setTimeout(() => this.refresh(), 500);
        break;
      }
    }
  }

  /**
   * Insert a character define statement into the appropriate file.
   * Tries to find an existing file with character definitions, or creates one.
   */
  private async insertCharacterStatement(statement: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const index = this.getIndex();

    // Find the best file to insert into
    let targetFile: string | undefined;
    let insertLine = 0;

    // Strategy 1: Insert after existing character definitions
    for (const [, entry] of index.characters) {
      targetFile = entry.file;
      insertLine = Math.max(insertLine, entry.node.line + 1);
    }

    // Strategy 2: Look for a definitions file
    if (!targetFile) {
      const gameDir = path.join(workspaceFolder.uri.fsPath, 'game');
      const candidates = ['definitions.rpy', 'characters.rpy', 'script.rpy'];
      for (const candidate of candidates) {
        if (fs.existsSync(path.join(gameDir, candidate))) {
          targetFile = `game/${candidate}`;
          break;
        }
      }
    }

    // Strategy 3: Create definitions.rpy
    if (!targetFile) {
      targetFile = 'game/definitions.rpy';
      const filePath = path.join(workspaceFolder.uri.fsPath, targetFile);
      fs.writeFileSync(filePath, `# Character definitions\n${statement}\n`, 'utf-8');
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(
        localize('Character created in definitions.rpy', 'definitions.rpyにキャラクターを作成しました'),
      );
      return;
    }

    // Insert into existing file
    const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, targetFile);
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc);

    const edit = new vscode.WorkspaceEdit();
    const position = new vscode.Position(insertLine, 0);
    edit.insert(fileUri, position, statement + '\n');
    await vscode.workspace.applyEdit(edit);

    // Move cursor to the inserted line
    editor.selection = new vscode.Selection(
      new vscode.Position(insertLine, 0),
      new vscode.Position(insertLine, statement.length),
    );
    editor.revealRange(new vscode.Range(insertLine, 0, insertLine, 0));

    vscode.window.showInformationMessage(
      localize(
        `Character "${statement.split('"')[1]}" added to ${targetFile}`,
        `キャラクター「${statement.split('"')[1]}」を${targetFile}に追加しました`,
      ),
    );
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
