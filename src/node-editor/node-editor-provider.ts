/**
 * Interactive node editor provider.
 * Replaces the Mermaid-based flow graph with a full visual editor.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, LABEL_REF_COMMANDS } from '../parser/types';
import { EditorNode, EditorEdge, EditorGraph, WebViewMessage } from './node-editor-protocol';
import { autoLayout } from './node-editor-layout';
import { NodeEditorCodegen } from './node-editor-codegen';
import { renderNodeEditorHtml } from './node-editor-html';
import { localize } from '../language/i18n';

export class NodeEditorProvider {
  private _panel?: vscode.WebviewPanel;
  private _currentGraph?: EditorGraph;
  private _codegen: NodeEditorCodegen;
  private _isUpdating = false;
  private _undoStack: EditorGraph[] = [];
  private _redoStack: EditorGraph[] = [];
  private _positions = new Map<string, { x: number; y: number }>();

  constructor(
    private getIndex: () => ProjectIndex,
    private extensionUri: vscode.Uri,
  ) {
    this._codegen = new NodeEditorCodegen(getIndex);
  }

  /**
   * Show or reveal the node editor panel.
   */
  async show(): Promise<void> {
    if (this._panel) {
      this._panel.reveal();
      this.refresh();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'renpyCode.nodeEditor',
      localize('RenPy Code: Story Editor', 'RenPy Code: ストーリーエディタ'),
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this._panel.onDidDispose(() => { this._panel = undefined; });
    this._panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));

    this.refresh();
  }

  /**
   * Rebuild graph from index and send to WebView.
   */
  refresh(): void {
    if (!this._panel) return;

    const graph = this.buildEditorGraph();
    this._currentGraph = graph;
    this._panel.webview.html = renderNodeEditorHtml(graph);
  }

  /**
   * Called when the project index updates (file changes).
   */
  onIndexUpdated(): void {
    if (this._isUpdating || !this._panel) return;

    const graph = this.buildEditorGraph();
    this._currentGraph = graph;
    this._panel.webview.postMessage({ type: 'fullGraph', graph });
  }

  /**
   * Build the editor graph from the project index.
   */
  private buildEditorGraph(): EditorGraph {
    const index = this.getIndex();
    const nodes: EditorNode[] = [];
    const edges: EditorEdge[] = [];
    const edgeSet = new Set<string>();
    const nodeNames = new Set<string>();

    for (const [name, entries] of index.labels) {
      const entry = entries[0];
      const labelNode = entry.node;
      nodeNames.add(name);

      let hasMenu = false;
      let hasReturn = false;
      let dialogueCount = 0;
      const dialoguePreview: string[] = [];
      const choices: { text: string; line: number }[] = [];

      this.walkNodes(labelNode.children, name, edges, edgeSet, choices, (node) => {
        if (node.type === 'menu') hasMenu = true;
        if (node.type === 'command' && node.command === 'return') hasReturn = true;
        if (node.type === 'dialogue') {
          dialogueCount++;
          if (dialoguePreview.length < 3) {
            dialoguePreview.push(`${node.character} "${node.text}"`);
          }
        }
        if (node.type === 'narration') {
          dialogueCount++;
          if (dialoguePreview.length < 3) {
            dialoguePreview.push(`"${node.text}"`);
          }
        }
      });

      // Use saved position or default
      const pos = this._positions.get(name) || { x: 0, y: 0 };

      nodes.push({
        id: name,
        label: name,
        type: hasMenu ? 'choice' : (name === 'start' ? 'start' : 'normal'),
        x: pos.x,
        y: pos.y,
        width: 200,
        height: 80,
        file: entry.file,
        line: entry.node.line,
        hasMenu,
        hasReturn,
        dialogueCount,
        dialoguePreview,
        choices,
        collapsed: false,
      });
    }

    // Build edge lookup sets for O(1) type determination
    const outgoingSet = new Set(edges.map(e => e.from));
    const incomingSet = new Set(edges.map(e => e.to));

    // Determine node types using Set lookups (O(1) per node)
    for (const node of nodes) {
      if (node.type === 'start' || node.type === 'choice') continue;
      if (!incomingSet.has(node.id) && node.id !== 'start') {
        node.type = 'orphan';
      } else if (!outgoingSet.has(node.id) && !node.hasReturn) {
        node.type = 'dead_end';
      }
    }

    // Auto-layout if no saved positions
    const needsLayout = nodes.every(n => n.x === 0 && n.y === 0);
    if (needsLayout && nodes.length > 0) {
      const positions = autoLayout(nodes, edges);
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      for (const pos of positions) {
        const node = nodeMap.get(pos.id);
        if (node) {
          node.x = pos.x;
          node.y = pos.y;
          this._positions.set(pos.id, { x: pos.x, y: pos.y });
        }
      }
    }

    return { nodes, edges };
  }

  private walkNodes(
    nodes: RenpyNode[],
    currentLabel: string,
    edges: EditorEdge[],
    edgeSet: Set<string>,
    choices: { text: string; line: number }[],
    visitor: (node: RenpyNode) => void,
    currentChoiceIndex?: number,
  ): void {
    for (const node of nodes) {
      visitor(node);

      if (node.type === 'command' && LABEL_REF_COMMANDS.has(node.command) && node.target) {
        const type = node.command === 'call' ? 'call' as const : 'jump' as const;
        const portSuffix = currentChoiceIndex !== undefined ? `:choice${currentChoiceIndex}` : '';
        const key = `${currentLabel}->${node.target}:${type}${portSuffix}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({
            id: key,
            from: currentLabel,
            to: node.target,
            fromPort: currentChoiceIndex !== undefined ? `choice:${currentChoiceIndex}` : 'bottom',
            toPort: 'top',
            type: currentChoiceIndex !== undefined ? 'choice' : type,
            choiceText: currentChoiceIndex !== undefined ? choices[currentChoiceIndex]?.text : undefined,
          });
        }
      }

      if (node.type === 'menu_choice') {
        const choiceIdx = choices.length;
        choices.push({ text: node.text, line: node.line });
        this.walkNodes(node.children, currentLabel, edges, edgeSet, choices, visitor, choiceIdx);
      }

      if (node.children.length > 0 && node.type !== 'menu_choice') {
        this.walkNodes(node.children, currentLabel, edges, edgeSet, choices, visitor, currentChoiceIndex);
      }
    }
  }

  /**
   * Handle messages from the WebView.
   */
  private async handleMessage(msg: WebViewMessage): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];

    switch (msg.type) {
      case 'navigate': {
        if (!ws) return;
        const uri = vscode.Uri.joinPath(ws.uri, msg.file);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
          selection: new vscode.Range(msg.line, 0, msg.line, 0),
          viewColumn: vscode.ViewColumn.Beside,
        });
        break;
      }

      case 'warp': {
        if (!ws) return;
        const uri = vscode.Uri.joinPath(ws.uri, msg.file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const line = doc.lineAt(msg.line);
        const relPath = msg.file.replace(/^game\//, '');
        const spec = `${relPath}:${msg.line + 1}`;
        vscode.commands.executeCommand('renpyCode.warpToLabel', spec);
        break;
      }

      case 'createLabel': {
        this.pushUndo();
        this._isUpdating = true;
        await this._codegen.createLabel(msg.name, msg.afterLabel);
        this._isUpdating = false;
        // Refresh after a delay to let the indexer catch up
        setTimeout(() => this.onIndexUpdated(), 500);
        break;
      }

      case 'createMenu': {
        this.pushUndo();
        this._isUpdating = true;
        await this._codegen.createMenu(msg.parentLabel, msg.choices);
        this._isUpdating = false;
        setTimeout(() => this.onIndexUpdated(), 500);
        break;
      }

      case 'connect': {
        this.pushUndo();
        this._isUpdating = true;
        await this._codegen.connect(msg.from, msg.to, msg.edgeType);
        this._isUpdating = false;
        setTimeout(() => this.onIndexUpdated(), 500);
        break;
      }

      case 'disconnect': {
        this.pushUndo();
        this._isUpdating = true;
        await this._codegen.disconnect(msg.from, msg.to);
        this._isUpdating = false;
        setTimeout(() => this.onIndexUpdated(), 500);
        break;
      }

      case 'deleteNode': {
        this.pushUndo();
        this._isUpdating = true;
        await this._codegen.deleteNode(msg.nodeId);
        this._isUpdating = false;
        this._positions.delete(msg.nodeId);
        setTimeout(() => this.onIndexUpdated(), 500);
        break;
      }

      case 'editDialogue': {
        this.pushUndo();
        this._isUpdating = true;
        await this._codegen.editDialogue(msg.nodeId, msg.lines);
        this._isUpdating = false;
        setTimeout(() => this.onIndexUpdated(), 500);
        break;
      }

      case 'renameLabel': {
        vscode.commands.executeCommand('renpyCode.renameSymbol');
        break;
      }

      case 'moveNodes': {
        for (const pos of msg.positions) {
          this._positions.set(pos.id, { x: pos.x, y: pos.y });
          const node = this._currentGraph?.nodes.find(n => n.id === pos.id);
          if (node) { node.x = pos.x; node.y = pos.y; }
        }
        break;
      }

      case 'requestAutoLayout': {
        if (!this._currentGraph) return;
        const positions = autoLayout(this._currentGraph.nodes, this._currentGraph.edges);
        for (const pos of positions) {
          this._positions.set(pos.id, { x: pos.x, y: pos.y });
        }
        this._panel?.webview.postMessage({ type: 'layoutResult', positions });
        break;
      }

      case 'requestRefresh': {
        this.onIndexUpdated();
        break;
      }

      case 'undo': {
        if (this._undoStack.length > 0) {
          this._redoStack.push(this._currentGraph!);
          this._currentGraph = this._undoStack.pop()!;
          this._panel?.webview.postMessage({ type: 'fullGraph', graph: this._currentGraph });
        }
        break;
      }

      case 'redo': {
        if (this._redoStack.length > 0) {
          this._undoStack.push(this._currentGraph!);
          this._currentGraph = this._redoStack.pop()!;
          this._panel?.webview.postMessage({ type: 'fullGraph', graph: this._currentGraph });
        }
        break;
      }
    }
  }

  private pushUndo(): void {
    if (this._currentGraph) {
      this._undoStack.push(JSON.parse(JSON.stringify(this._currentGraph)));
      this._redoStack = [];
      if (this._undoStack.length > 50) this._undoStack.shift();
    }
  }

  dispose(): void {
    this._panel?.dispose();
  }
}
