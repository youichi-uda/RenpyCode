/**
 * Ren'Py story flow graph provider (Pro feature).
 * Builds a graph of labels and jump/call relationships, renders with Mermaid.js in a WebView.
 * Ported from MCP story_flow_graph.
 */

import * as vscode from 'vscode';
import { ProjectIndex, RenpyNode, LABEL_REF_COMMANDS } from '../parser/types';

export interface FlowNode {
  name: string;
  file: string;
  line: number;
  hasMenu: boolean;
  hasReturn: boolean;
  dialogueCount: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  type: 'jump' | 'call' | 'choice';
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export class FlowGraphProvider {
  constructor(
    private getIndex: () => ProjectIndex,
    private extensionUri: vscode.Uri,
  ) {}

  /**
   * Build the flow graph from the project index.
   */
  buildGraph(): FlowGraph {
    const index = this.getIndex();
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const edgeSet = new Set<string>();

    for (const [name, entries] of index.labels) {
      const entry = entries[0];
      const labelNode = entry.node;

      let hasMenu = false;
      let hasReturn = false;
      let dialogueCount = 0;

      // Walk children to find jumps, calls, menus, returns
      this.walkNodes(labelNode.children, name, edges, edgeSet, (node) => {
        if (node.type === 'menu') hasMenu = true;
        if (node.type === 'command' && node.command === 'return') hasReturn = true;
        if (node.type === 'dialogue' || node.type === 'narration') dialogueCount++;
      });

      nodes.push({
        name,
        file: entry.file,
        line: entry.node.line,
        hasMenu,
        hasReturn,
        dialogueCount,
      });
    }

    return { nodes, edges };
  }

  private walkNodes(
    nodes: RenpyNode[],
    currentLabel: string,
    edges: FlowEdge[],
    edgeSet: Set<string>,
    visitor: (node: RenpyNode) => void,
  ): void {
    for (const node of nodes) {
      visitor(node);

      if (node.type === 'command' && LABEL_REF_COMMANDS.has(node.command) && node.target) {
        const type = node.command === 'call' ? 'call' as const : 'jump' as const;
        const key = `${currentLabel}->${node.target}:${type}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ from: currentLabel, to: node.target, type });
        }
      }

      // Menu choices: look for jumps inside choice branches
      if (node.type === 'menu_choice') {
        this.walkNodes(node.children, currentLabel, edges, edgeSet, visitor);
      }

      if (node.children.length > 0 && node.type !== 'menu_choice') {
        this.walkNodes(node.children, currentLabel, edges, edgeSet, visitor);
      }
    }
  }

  /**
   * Generate Mermaid.js flowchart syntax from a FlowGraph.
   */
  generateMermaid(graph: FlowGraph): string {
    const lines: string[] = ['flowchart TD'];
    const nodeSet = new Set(graph.nodes.map(n => n.name));

    for (const node of graph.nodes) {
      const shape = node.hasMenu
        ? `${node.name}{{"${node.name} (menu)"}}`
        : node.hasReturn
          ? `${node.name}(["${node.name}"])`
          : node.name === 'start'
            ? `${node.name}(("${node.name}"))`
            : `${node.name}["${node.name}"]`;
      lines.push(`    ${shape}`);
    }

    for (const edge of graph.edges) {
      if (!nodeSet.has(edge.to)) {
        // Dead-end: target doesn't exist
        lines.push(`    ${edge.to}["${edge.to} ❌"]`);
        nodeSet.add(edge.to);
      }
      const arrow = edge.type === 'call' ? '-.->|call|' : edge.type === 'choice' ? '-->|choice|' : '-->';
      lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
    }

    // Style the start node
    if (nodeSet.has('start')) {
      lines.push('    style start fill:#4CAF50,stroke:#333,color:#fff');
    }

    // Style dead ends
    for (const node of graph.nodes) {
      const hasOutgoing = graph.edges.some(e => e.from === node.name);
      if (!hasOutgoing && !node.hasReturn && node.name !== 'start') {
        lines.push(`    style ${node.name} fill:#f44336,stroke:#333,color:#fff`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Render the flow graph in a WebView panel.
   */
  renderHtml(graph: FlowGraph, webview: vscode.Webview): string {
    const mermaidCode = this.generateMermaid(graph);
    const nodesJson = JSON.stringify(graph.nodes);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      width: 100vw; height: 100vh;
    }
    #viewport {
      width: 100%; height: 100%;
      overflow: hidden;
      position: relative;
      cursor: grab;
    }
    #viewport.dragging { cursor: grabbing; }
    #graph {
      position: absolute;
      transform-origin: 0 0;
      padding: 40px;
    }
    .toolbar {
      position: fixed; top: 8px; right: 8px; z-index: 10;
      display: flex; gap: 4px; align-items: center;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 6px; padding: 4px 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,.3);
    }
    .toolbar button {
      width: 28px; height: 28px;
      background: transparent; color: var(--vscode-editor-foreground);
      border: 1px solid transparent; border-radius: 4px;
      cursor: pointer; font-size: 16px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
    }
    .toolbar button:hover { background: var(--vscode-toolbar-hoverBackground, #2a2d2e); }
    .toolbar .zoom-level {
      font-size: 11px; min-width: 40px; text-align: center;
      color: var(--vscode-descriptionForeground);
    }
    .toolbar .separator {
      width: 1px; height: 20px;
      background: var(--vscode-editorWidget-border, #454545);
      margin: 0 4px;
    }
    .stats {
      position: fixed; bottom: 8px; left: 8px; z-index: 10;
      font-size: 11px; color: var(--vscode-descriptionForeground);
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 4px; padding: 4px 8px;
    }
    .node { cursor: pointer !important; }
    .ctx-menu {
      position: fixed; z-index: 100;
      background: var(--vscode-menu-background, #252526);
      border: 1px solid var(--vscode-menu-border, #454545);
      border-radius: 4px; padding: 4px 0;
      box-shadow: 0 2px 8px rgba(0,0,0,.4);
      min-width: 160px;
    }
    .ctx-menu-item {
      padding: 6px 16px; cursor: pointer;
      font-size: 13px; color: var(--vscode-menu-foreground, #ccc);
      white-space: nowrap;
    }
    .ctx-menu-item:hover {
      background: var(--vscode-menu-selectionBackground, #094771);
      color: var(--vscode-menu-selectionForeground, #fff);
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="zoomIn()" title="Zoom In">+</button>
    <span class="zoom-level" id="zoomLevel">100%</span>
    <button onclick="zoomOut()" title="Zoom Out">&minus;</button>
    <div class="separator"></div>
    <button onclick="fitToView()" title="Fit to View">&#x26F6;</button>
    <button onclick="resetView()" title="Reset View">&#x21BA;</button>
  </div>
  <div class="stats">${graph.nodes.length} labels, ${graph.edges.length} connections</div>
  <div id="viewport">
    <div id="graph">
      <pre class="mermaid">
${mermaidCode}
      </pre>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    const vscodeApi = acquireVsCodeApi();
    const nodes = ${nodesJson};

    // --- Pan & Zoom state ---
    let scale = 1;
    let panX = 0, panY = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let panStartX = 0, panStartY = 0;

    const MIN_SCALE = 0.1;
    const MAX_SCALE = 5;
    const viewport = document.getElementById('viewport');
    const graphEl = document.getElementById('graph');

    function applyTransform() {
      graphEl.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
      document.getElementById('zoomLevel').textContent = Math.round(scale * 100) + '%';
    }

    // --- Mouse wheel zoom (toward cursor) ---
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * delta));
      const rect = viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      // Zoom toward cursor position
      panX = cx - (cx - panX) * (newScale / scale);
      panY = cy - (cy - panY) * (newScale / scale);
      scale = newScale;
      applyTransform();
    }, { passive: false });

    // --- Mouse drag pan ---
    viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      panStartX = panX;
      panStartY = panY;
      viewport.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panX = panStartX + (e.clientX - dragStartX);
      panY = panStartY + (e.clientY - dragStartY);
      applyTransform();
    });
    window.addEventListener('mouseup', () => {
      isDragging = false;
      viewport.classList.remove('dragging');
    });

    // --- Toolbar actions ---
    function zoomIn() {
      const rect = viewport.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      const newScale = Math.min(MAX_SCALE, scale * 1.3);
      panX = cx - (cx - panX) * (newScale / scale);
      panY = cy - (cy - panY) * (newScale / scale);
      scale = newScale;
      applyTransform();
    }
    function zoomOut() {
      const rect = viewport.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      const newScale = Math.max(MIN_SCALE, scale / 1.3);
      panX = cx - (cx - panX) * (newScale / scale);
      panY = cy - (cy - panY) * (newScale / scale);
      scale = newScale;
      applyTransform();
    }
    function resetView() {
      scale = 1; panX = 0; panY = 0;
      applyTransform();
    }
    function fitToView() {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const gw = graphEl.scrollWidth / scale;
      const gh = graphEl.scrollHeight / scale;
      if (gw === 0 || gh === 0) return;
      const fitScale = Math.min(vw / gw, vh / gh) * 0.9;
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale));
      panX = (vw - gw * scale) / 2;
      panY = (vh - gh * scale) / 2;
      applyTransform();
    }

    // --- Mermaid init ---
    const isDark = document.body.getAttribute('data-vscode-theme-kind')?.includes('dark')
      || !document.body.getAttribute('data-vscode-theme-kind')?.includes('light');
    mermaid.initialize({
      startOnLoad: true,
      theme: isDark ? 'dark' : 'default',
      flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' },
      securityLevel: 'loose',
    });

    // --- Find node from DOM element ---
    function nodeFromEl(el) {
      const nodeEl = el.closest('.node');
      if (!nodeEl) return null;
      const text = nodeEl.textContent.trim().replace(/ \\(menu\\)$/, '').replace(/ ❌$/, '');
      return nodes.find(n => n.name === text) || null;
    }

    // --- Left click → navigate to source ---
    document.addEventListener('click', (e) => {
      hideCtxMenu();
      if (isDragging) return;
      const node = nodeFromEl(e.target);
      if (node) {
        vscodeApi.postMessage({ type: 'navigate', file: node.file, line: node.line });
      }
    });

    // --- Right click → context menu ---
    let ctxMenu = null;
    function hideCtxMenu() {
      if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    }
    document.addEventListener('contextmenu', (e) => {
      hideCtxMenu();
      const node = nodeFromEl(e.target);
      if (!node) return;
      e.preventDefault();

      ctxMenu = document.createElement('div');
      ctxMenu.className = 'ctx-menu';
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';

      const goTo = document.createElement('div');
      goTo.className = 'ctx-menu-item';
      goTo.textContent = 'Go to Definition';
      goTo.onclick = () => { hideCtxMenu(); vscodeApi.postMessage({ type: 'navigate', file: node.file, line: node.line }); };
      ctxMenu.appendChild(goTo);

      const warp = document.createElement('div');
      warp.className = 'ctx-menu-item';
      warp.textContent = 'Warp to "' + node.name + '"';
      warp.onclick = () => { hideCtxMenu(); vscodeApi.postMessage({ type: 'warp', file: node.file, line: node.line }); };
      ctxMenu.appendChild(warp);

      document.body.appendChild(ctxMenu);
    });
    document.addEventListener('mousedown', (e) => {
      if (ctxMenu && !ctxMenu.contains(e.target)) hideCtxMenu();
    });

    // Auto fit after render
    setTimeout(fitToView, 500);
  </script>
</body>
</html>`;
  }
}
