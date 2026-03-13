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
    body { margin: 0; padding: 16px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); }
    #graph { width: 100%; min-height: 80vh; }
    .controls { margin-bottom: 12px; display: flex; gap: 8px; }
    .controls button { padding: 4px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; border-radius: 3px; }
    .controls button:hover { background: var(--vscode-button-hoverBackground); }
    .stats { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
    .mermaid { cursor: pointer; }
    .node { cursor: pointer !important; }
  </style>
</head>
<body>
  <div class="controls">
    <button onclick="zoomIn()">Zoom In</button>
    <button onclick="zoomOut()">Zoom Out</button>
    <button onclick="resetZoom()">Reset</button>
  </div>
  <div class="stats">${graph.nodes.length} labels, ${graph.edges.length} connections</div>
  <div id="graph">
    <pre class="mermaid">
${mermaidCode}
    </pre>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    const vscode = acquireVsCodeApi();
    const nodes = ${nodesJson};
    let scale = 1;

    mermaid.initialize({
      startOnLoad: true,
      theme: document.body.classList.contains('vscode-light') ? 'default' : 'dark',
      flowchart: { useMaxWidth: true, htmlLabels: true },
      securityLevel: 'loose',
    });

    document.addEventListener('click', (e) => {
      const el = e.target.closest('.node');
      if (!el) return;
      const text = el.textContent.trim().replace(/ \\(menu\\)$/, '').replace(/ ❌$/, '');
      const node = nodes.find(n => n.name === text);
      if (node) {
        vscode.postMessage({ type: 'navigate', file: node.file, line: node.line });
      }
    });

    function zoomIn() { scale *= 1.2; applyZoom(); }
    function zoomOut() { scale /= 1.2; applyZoom(); }
    function resetZoom() { scale = 1; applyZoom(); }
    function applyZoom() {
      document.getElementById('graph').style.transform = 'scale(' + scale + ')';
      document.getElementById('graph').style.transformOrigin = 'top left';
    }
  </script>
</body>
</html>`;
  }
}
