/**
 * WebView HTML/CSS/JS for the interactive node editor.
 * SVG-based renderer with pan/zoom, drag, port connections, minimap.
 */

import { EditorGraph } from './node-editor-protocol';

export function renderNodeEditorHtml(graph: EditorGraph): string {
  const graphJson = JSON.stringify(graph);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  overflow: hidden;
  background: var(--vscode-editor-background, #1e1e1e);
  color: var(--vscode-editor-foreground, #d4d4d4);
  font-family: var(--vscode-font-family, sans-serif);
  width: 100vw; height: 100vh;
  user-select: none;
}

/* ── Canvas ── */
#viewport { width: 100%; height: 100%; position: relative; cursor: grab; }
#viewport.panning { cursor: grabbing; }
#viewport.connecting { cursor: crosshair; }
#canvas {
  position: absolute; top: 0; left: 0;
  transform-origin: 0 0;
  overflow: visible;
}

/* ── Nodes ── */
.node-group { cursor: pointer; }
.node-group:hover .node-body { filter: brightness(1.15); }
.node-group.selected .node-body { stroke: #58a6ff; stroke-width: 3; }
.node-body { rx: 8; ry: 8; stroke-width: 1; }
.node-title {
  font-size: 13px; font-weight: 600;
  fill: #fff;
  pointer-events: none;
}
.node-subtitle {
  font-size: 10px;
  fill: rgba(255,255,255,0.6);
  pointer-events: none;
}
.node-dialogue {
  font-size: 10px;
  fill: rgba(255,255,255,0.5);
  pointer-events: none;
  font-style: italic;
}

/* Node type colors */
.node-start .node-body { fill: #2d6a30; stroke: #4CAF50; }
.node-normal .node-body { fill: #1a4a7a; stroke: #2196F3; }
.node-choice .node-body { fill: #7a5a1a; stroke: #FF9800; }
.node-dead_end .node-body { fill: #7a1a1a; stroke: #f44336; }
.node-orphan .node-body { fill: #3a3a3a; stroke: #9E9E9E; }

/* ── Ports ── */
.port {
  r: 6; fill: #555; stroke: #888; stroke-width: 1.5;
  cursor: crosshair;
  transition: fill 0.15s;
}
.port:hover { fill: #58a6ff; stroke: #58a6ff; r: 8; }
.port-label {
  font-size: 9px;
  fill: rgba(255,255,255,0.5);
  pointer-events: none;
}

/* ── Edges ── */
.edge { fill: none; stroke-width: 2; pointer-events: stroke; cursor: pointer; }
.edge:hover { stroke-width: 3; }
.edge-jump { stroke: #58a6ff; }
.edge-call { stroke: #c084fc; stroke-dasharray: 8 4; }
.edge-choice { stroke: #FF9800; }
.edge-arrow { fill: #58a6ff; }
.edge-arrow-call { fill: #c084fc; }
.edge-arrow-choice { fill: #FF9800; }
.edge-pending { stroke: #58a6ff; stroke-width: 2; stroke-dasharray: 4 4; fill: none; opacity: 0.7; }

/* ── Toolbar ── */
.toolbar {
  position: fixed; top: 8px; right: 8px; z-index: 10;
  display: flex; gap: 4px; align-items: center;
  background: var(--vscode-editorWidget-background, #252526);
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  border-radius: 6px; padding: 4px 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,.3);
}
.toolbar button {
  height: 28px; padding: 0 8px;
  background: transparent; color: var(--vscode-editor-foreground);
  border: 1px solid transparent; border-radius: 4px;
  cursor: pointer; font-size: 13px; line-height: 1;
  display: flex; align-items: center; justify-content: center; gap: 4px;
}
.toolbar button:hover { background: var(--vscode-toolbar-hoverBackground, #2a2d2e); }
.toolbar .zoom-level {
  font-size: 11px; min-width: 40px; text-align: center;
  color: var(--vscode-descriptionForeground);
}
.toolbar .sep {
  width: 1px; height: 20px;
  background: var(--vscode-editorWidget-border, #454545);
  margin: 0 4px;
}

/* ── Stats ── */
.stats {
  position: fixed; bottom: 8px; left: 8px; z-index: 10;
  font-size: 11px; color: var(--vscode-descriptionForeground);
  background: var(--vscode-editorWidget-background, #252526);
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  border-radius: 4px; padding: 4px 8px;
}

/* ── Minimap ── */
.minimap {
  position: fixed; bottom: 8px; right: 8px; z-index: 10;
  width: 180px; height: 120px;
  background: rgba(30,30,30,0.9);
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  border-radius: 6px; overflow: hidden;
}
.minimap svg { width: 100%; height: 100%; }
.minimap-viewport {
  fill: rgba(88,166,255,0.15);
  stroke: #58a6ff; stroke-width: 1;
}

/* ── Context Menu ── */
.ctx-menu {
  position: fixed; z-index: 100;
  background: var(--vscode-menu-background, #252526);
  border: 1px solid var(--vscode-menu-border, #454545);
  border-radius: 4px; padding: 4px 0;
  box-shadow: 0 2px 8px rgba(0,0,0,.4);
  min-width: 180px;
}
.ctx-item {
  padding: 6px 16px; cursor: pointer;
  font-size: 13px; color: var(--vscode-menu-foreground, #ccc);
  white-space: nowrap;
}
.ctx-item:hover {
  background: var(--vscode-menu-selectionBackground, #094771);
  color: var(--vscode-menu-selectionForeground, #fff);
}
.ctx-sep { height: 1px; background: var(--vscode-menu-border, #454545); margin: 4px 0; }

/* ── Modal ── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
}
.modal {
  background: var(--vscode-editorWidget-background, #252526);
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  border-radius: 8px; padding: 24px; min-width: 320px;
  box-shadow: 0 4px 16px rgba(0,0,0,.5);
}
.modal h3 { font-size: 14px; margin-bottom: 12px; }
.modal input, .modal textarea {
  width: 100%; padding: 6px 10px;
  background: var(--vscode-input-background, #3c3c3c);
  color: var(--vscode-input-foreground, #ccc);
  border: 1px solid var(--vscode-input-border, #555);
  border-radius: 4px; font-size: 13px;
  font-family: var(--vscode-editor-font-family, monospace);
  margin-bottom: 12px;
}
.modal textarea { min-height: 100px; resize: vertical; }
.modal-buttons { display: flex; gap: 8px; justify-content: flex-end; }
.modal-buttons button {
  padding: 6px 16px; border-radius: 4px; cursor: pointer;
  font-size: 13px; border: 1px solid #555;
}
.modal-buttons .btn-primary {
  background: #0e639c; color: #fff; border-color: #0e639c;
}
.modal-buttons .btn-cancel {
  background: transparent; color: var(--vscode-editor-foreground);
}
</style>
</head>
<body>

<!-- Toolbar -->
<div class="toolbar">
  <button onclick="zoomIn()" title="Zoom In">+</button>
  <span class="zoom-level" id="zoomLevel">100%</span>
  <button onclick="zoomOut()" title="Zoom Out">&minus;</button>
  <div class="sep"></div>
  <button onclick="fitToView()" title="Fit">&#x26F6;</button>
  <button onclick="autoLayoutBtn()" title="Auto Layout">&#x2725; Layout</button>
  <div class="sep"></div>
  <button onclick="addLabelBtn()" title="Add Label">+ Label</button>
  <button onclick="addMenuBtn()" title="Add Menu">+ Menu</button>
</div>

<div class="stats" id="stats"></div>

<!-- Main canvas -->
<div id="viewport">
  <svg id="canvas" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow-jump" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="edge-arrow"/></marker>
      <marker id="arrow-call" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="edge-arrow-call"/></marker>
      <marker id="arrow-choice" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="edge-arrow-choice"/></marker>
    </defs>
    <g id="edgesLayer"></g>
    <g id="nodesLayer"></g>
    <line id="pendingEdge" class="edge-pending" x1="0" y1="0" x2="0" y2="0" style="display:none"/>
  </svg>
</div>

<!-- Minimap -->
<div class="minimap" id="minimap">
  <svg id="minimapSvg" xmlns="http://www.w3.org/2000/svg">
    <g id="minimapContent"></g>
    <rect class="minimap-viewport" id="minimapViewport" x="0" y="0" width="0" height="0"/>
  </svg>
</div>

<script>
const vscodeApi = acquireVsCodeApi();
const NODE_W = 200, NODE_H = 80, PORT_R = 6;

// ── State ──
let graph = ${graphJson};
let nodes = new Map();
let edges = new Map();
let selection = new Set();
let scale = 1, panX = 0, panY = 0;
let dragState = 'idle'; // idle | panning | moving | connecting | selecting
let dragStart = { x: 0, y: 0 };
let panStart = { x: 0, y: 0 };
let moveStart = new Map(); // nodeId -> {x,y}
let pendingConn = null; // { fromId, fromPort }
let ctxMenu = null;

const MIN_SCALE = 0.1, MAX_SCALE = 5;
const viewport = document.getElementById('viewport');
const canvas = document.getElementById('canvas');
const edgesLayer = document.getElementById('edgesLayer');
const nodesLayer = document.getElementById('nodesLayer');
const pendingEdgeLine = document.getElementById('pendingEdge');

// ── Init ──
function init() {
  rebuildFromGraph(graph);
  fitToView();
  updateStats();
}

function rebuildFromGraph(g) {
  graph = g;
  nodes.clear();
  edges.clear();
  for (const n of g.nodes) nodes.set(n.id, { ...n });
  for (const e of g.edges) edges.set(e.id, { ...e });
  renderAll();
}

// ── Rendering ──
let _nodeEls = new Map();  // nodeId -> SVG <g> element
let _edgeEls = new Map();  // edgeId -> SVG <path> element
let _rafId = 0;

function renderAll() {
  const nodeFrag = document.createDocumentFragment();
  const edgeFrag = document.createDocumentFragment();
  _nodeEls.clear();
  _edgeEls.clear();

  for (const e of edges.values()) renderEdge(e, edgeFrag);
  for (const n of nodes.values()) renderNode(n, nodeFrag);

  nodesLayer.innerHTML = '';
  edgesLayer.innerHTML = '';
  nodesLayer.appendChild(nodeFrag);
  edgesLayer.appendChild(edgeFrag);
  scheduleMinimapUpdate();
}

/** Update selection CSS classes without DOM rebuild */
function updateSelection() {
  for (const [id, el] of _nodeEls) {
    if (selection.has(id)) el.classList.add('selected');
    else el.classList.remove('selected');
  }
}

/** Fast position-only update — no DOM rebuild */
function updatePositions() {
  for (const n of nodes.values()) {
    const el = _nodeEls.get(n.id);
    if (el) el.setAttribute('transform', 'translate(' + (n.x - NODE_W/2) + ',' + n.y + ')');
  }
  for (const e of edges.values()) {
    const el = _edgeEls.get(e.id);
    if (el) updateEdgePath(el, e);
  }
  scheduleMinimapUpdate();
}

let _mmTimer = 0;
function scheduleMinimapUpdate() {
  if (_mmTimer) return;
  const delay = nodes.size > 200 ? 500 : 200;
  _mmTimer = setTimeout(() => { _mmTimer = 0; updateMinimap(); }, delay);
}

function renderNode(n, parent) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.classList.add('node-group', 'node-' + n.type);
  if (selection.has(n.id)) g.classList.add('selected');
  g.setAttribute('transform', 'translate(' + (n.x - NODE_W/2) + ',' + n.y + ')');
  g.dataset.nodeId = n.id;

  // Body
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.classList.add('node-body');
  rect.setAttribute('width', NODE_W);
  rect.setAttribute('height', NODE_H);
  g.appendChild(rect);

  // Title
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.classList.add('node-title');
  title.setAttribute('x', 12);
  title.setAttribute('y', 22);
  title.textContent = n.label;
  g.appendChild(title);

  // Subtitle (dialogue count)
  const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  sub.classList.add('node-subtitle');
  sub.setAttribute('x', 12);
  sub.setAttribute('y', 40);
  const parts = [];
  if (n.dialogueCount > 0) parts.push(n.dialogueCount + ' lines');
  if (n.hasMenu) parts.push('menu');
  if (n.hasReturn) parts.push('return');
  sub.textContent = parts.join(' · ') || n.file;
  g.appendChild(sub);

  // Dialogue preview
  if (n.dialoguePreview && n.dialoguePreview.length > 0) {
    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    preview.classList.add('node-dialogue');
    preview.setAttribute('x', 12);
    preview.setAttribute('y', 58);
    preview.textContent = n.dialoguePreview[0].substring(0, 30) + (n.dialoguePreview[0].length > 30 ? '...' : '');
    g.appendChild(preview);
  }

  // Input port (top center)
  const inPort = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  inPort.classList.add('port');
  inPort.setAttribute('cx', NODE_W / 2);
  inPort.setAttribute('cy', 0);
  inPort.dataset.portType = 'in';
  inPort.dataset.nodeId = n.id;
  g.appendChild(inPort);

  // Output port (bottom center)
  const outPort = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  outPort.classList.add('port');
  outPort.setAttribute('cx', NODE_W / 2);
  outPort.setAttribute('cy', NODE_H);
  outPort.dataset.portType = 'out';
  outPort.dataset.nodeId = n.id;
  g.appendChild(outPort);

  // Choice ports (if menu node)
  if (n.choices && n.choices.length > 0) {
    const spacing = NODE_W / (n.choices.length + 1);
    n.choices.forEach((choice, i) => {
      const cx = spacing * (i + 1);
      const choiceText = typeof choice === 'object' ? choice.text : choice;
      const choiceLine = typeof choice === 'object' ? choice.line : -1;

      const cp = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      cp.classList.add('port');
      cp.setAttribute('cx', cx);
      cp.setAttribute('cy', NODE_H);
      cp.dataset.portType = 'choice';
      cp.dataset.nodeId = n.id;
      cp.dataset.choiceIndex = i;
      cp.dataset.choiceLine = choiceLine;
      g.appendChild(cp);

      const cl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      cl.classList.add('port-label');
      cl.setAttribute('x', cx);
      cl.setAttribute('y', NODE_H + 16);
      cl.setAttribute('text-anchor', 'middle');
      cl.textContent = choiceText.length > 15 ? choiceText.substring(0, 14) + '…' : choiceText;
      g.appendChild(cl);
    });
  }

  (parent || nodesLayer).appendChild(g);
  _nodeEls.set(n.id, g);
}

function renderEdge(e, parent) {
  const fromNode = nodes.get(e.from);
  const toNode = nodes.get(e.to);
  if (!fromNode || !toNode) return;

  // Determine start point based on port type
  let x1 = fromNode.x, y1 = fromNode.y + NODE_H;

  if (e.fromPort && e.fromPort.startsWith('choice:')) {
    const choiceIdx = parseInt(e.fromPort.split(':')[1], 10);
    const choices = fromNode.choices || [];
    if (choices.length > 0) {
      const spacing = NODE_W / (choices.length + 1);
      x1 = (fromNode.x - NODE_W / 2) + spacing * (choiceIdx + 1);
    }
  }

  const x2 = toNode.x, y2 = toNode.y;

  const dy = Math.abs(y2 - y1);
  const cp = Math.max(50, dy * 0.4);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('edge', 'edge-' + e.type);
  path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1+cp) + ', ' + x2 + ' ' + (y2-cp) + ', ' + x2 + ' ' + y2);
  path.setAttribute('marker-end', 'url(#arrow-' + e.type + ')');
  path.dataset.edgeId = e.id;
  (parent || edgesLayer).appendChild(path);
  _edgeEls.set(e.id, path);
}

function updateEdgePath(path, e) {
  const fromNode = nodes.get(e.from);
  const toNode = nodes.get(e.to);
  if (!fromNode || !toNode) return;

  let x1 = fromNode.x, y1 = fromNode.y + NODE_H;
  if (e.fromPort && e.fromPort.startsWith('choice:')) {
    const choiceIdx = parseInt(e.fromPort.split(':')[1], 10);
    const choices = fromNode.choices || [];
    if (choices.length > 0) {
      const spacing = NODE_W / (choices.length + 1);
      x1 = (fromNode.x - NODE_W / 2) + spacing * (choiceIdx + 1);
    }
  }
  const x2 = toNode.x, y2 = toNode.y;
  const dy = Math.abs(y2 - y1);
  const cp = Math.max(50, dy * 0.4);
  path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1+cp) + ', ' + x2 + ' ' + (y2-cp) + ', ' + x2 + ' ' + y2);
}

// ── Transform ──
function applyTransform() {
  canvas.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
  document.getElementById('zoomLevel').textContent = Math.round(scale * 100) + '%';
  updateMinimap();
}

// ── Pan & Zoom ──
viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * delta));
  const rect = viewport.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  panX = cx - (cx - panX) * (newScale / scale);
  panY = cy - (cy - panY) * (newScale / scale);
  scale = newScale;
  applyTransform();
}, { passive: false });

// ── Mouse interactions ──
canvas.addEventListener('mousedown', (e) => {
  const port = e.target.closest('.port');
  const nodeGroup = e.target.closest('.node-group');

  if (port && (port.dataset.portType === 'out' || port.dataset.portType === 'choice')) {
    const fromId = port.dataset.nodeId;
    const fromPort = port.dataset.portType === 'choice' ? 'choice:' + port.dataset.choiceIndex : 'bottom';

    // Check if this port already has an outgoing edge
    const hasExisting = Array.from(edges.values()).some(e => e.from === fromId && e.fromPort === fromPort);
    if (hasExisting) {
      // Port already connected — don't allow another connection
      e.stopPropagation();
      return;
    }

    // Start connection
    dragState = 'connecting';
    viewport.classList.add('connecting');
    pendingConn = { fromId, fromPort };
    const fromNode = nodes.get(fromId);
    let startX = fromNode.x, startY = fromNode.y + NODE_H;
    if (port.dataset.portType === 'choice') {
      const choiceIdx = parseInt(port.dataset.choiceIndex, 10);
      const choiceCount = (fromNode.choices || []).length;
      if (choiceCount > 0) {
        const spacing = NODE_W / (choiceCount + 1);
        startX = (fromNode.x - NODE_W / 2) + spacing * (choiceIdx + 1);
      }
    }
    pendingEdgeLine.setAttribute('x1', startX);
    pendingEdgeLine.setAttribute('y1', startY);
    pendingEdgeLine.style.display = '';
    e.stopPropagation();
    return;
  }

  if (nodeGroup) {
    // Start moving node
    dragState = 'moving';
    const nodeId = nodeGroup.dataset.nodeId;
    if (!e.shiftKey && !selection.has(nodeId)) {
      selection.clear();
    }
    selection.add(nodeId);
    moveStart.clear();
    for (const id of selection) {
      const n = nodes.get(id);
      if (n) moveStart.set(id, { x: n.x, y: n.y });
    }
    dragStart = { x: e.clientX, y: e.clientY };
    updateSelection();
    e.stopPropagation();
    return;
  }
});

viewport.addEventListener('mousedown', (e) => {
  if (dragState !== 'idle') return;
  if (e.button !== 0) return;
  // Pan
  dragState = 'panning';
  viewport.classList.add('panning');
  dragStart = { x: e.clientX, y: e.clientY };
  panStart = { x: panX, y: panY };
  selection.clear();
  updateSelection();
});

window.addEventListener('mousemove', (e) => {
  if (dragState === 'panning') {
    panX = panStart.x + (e.clientX - dragStart.x);
    panY = panStart.y + (e.clientY - dragStart.y);
    applyTransform();
  } else if (dragState === 'moving') {
    const dx = (e.clientX - dragStart.x) / scale;
    const dy = (e.clientY - dragStart.y) / scale;
    for (const id of selection) {
      const orig = moveStart.get(id);
      const n = nodes.get(id);
      if (orig && n) {
        n.x = orig.x + dx;
        n.y = orig.y + dy;
      }
    }
    updatePositions();
  } else if (dragState === 'connecting') {
    const rect = viewport.getBoundingClientRect();
    const mx = (e.clientX - rect.left - panX) / scale;
    const my = (e.clientY - rect.top - panY) / scale;
    pendingEdgeLine.setAttribute('x2', mx);
    pendingEdgeLine.setAttribute('y2', my);
  }
});

window.addEventListener('mouseup', (e) => {
  if (dragState === 'panning') {
    viewport.classList.remove('panning');
  } else if (dragState === 'moving') {
    // Send position update
    const positions = [];
    for (const id of selection) {
      const n = nodes.get(id);
      if (n) positions.push({ id, x: n.x, y: n.y });
    }
    vscodeApi.postMessage({ type: 'moveNodes', positions });
  } else if (dragState === 'connecting') {
    viewport.classList.remove('connecting');
    pendingEdgeLine.style.display = 'none';
    // Check if released over a port
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const port = el?.closest?.('.port');
    if (port && port.dataset.portType === 'in' && pendingConn) {
      const toId = port.dataset.nodeId;
      if (toId !== pendingConn.fromId) {
        vscodeApi.postMessage({ type: 'connect', from: pendingConn.fromId, to: toId, edgeType: 'jump' });
      }
    }
    pendingConn = null;
  }
  dragState = 'idle';
});

// ── Double click → edit ──
canvas.addEventListener('dblclick', (e) => {
  const nodeGroup = e.target.closest('.node-group');
  if (nodeGroup) {
    const nodeId = nodeGroup.dataset.nodeId;
    const node = nodes.get(nodeId);
    if (node) showEditDialog(node);
  }
});

// ── Right click → context menu ──
function hideCtxMenu() { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; } }

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  hideCtxMenu();

  // Check if right-clicking on a choice port
  const port = e.target.closest('.port');
  if (port && port.dataset.portType === 'choice') {
    const nodeId = port.dataset.nodeId;
    const node = nodes.get(nodeId);
    const choiceLine = parseInt(port.dataset.choiceLine, 10);
    const choiceIdx = parseInt(port.dataset.choiceIndex, 10);
    if (node && choiceLine >= 0) {
      const choiceObj = node.choices && node.choices[choiceIdx];
      const choiceText = choiceObj ? (typeof choiceObj === 'object' ? choiceObj.text : choiceObj) : 'Choice';

      ctxMenu = document.createElement('div');
      ctxMenu.className = 'ctx-menu';
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';

      addCtxItem('Go to "' + choiceText + '"', () => vscodeApi.postMessage({ type: 'navigate', file: node.file, line: choiceLine }));
      const choicePort = 'choice:' + choiceIdx;
      const choiceHasEdge = Array.from(edges.values()).some(e => e.from === nodeId && e.fromPort === choicePort);
      if (!choiceHasEdge) {
        addCtxItem('Add Jump from this choice...', () => showConnectDialog(nodeId, 'jump'));
      }
      document.body.appendChild(ctxMenu);
      return;
    }
  }

  const nodeGroup = e.target.closest('.node-group');
  if (!nodeGroup) return;

  const nodeId = nodeGroup.dataset.nodeId;
  const node = nodes.get(nodeId);
  if (!node) return;

  ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.top = e.clientY + 'px';

  addCtxItem('Go to Definition', () => vscodeApi.postMessage({ type: 'navigate', file: node.file, line: node.line }));
  addCtxItem('Warp to "' + node.label + '"', () => vscodeApi.postMessage({ type: 'warp', file: node.file, line: node.line }));
  addCtxSep();
  const hasBottomEdge = Array.from(edges.values()).some(e => e.from === nodeId && e.fromPort === 'bottom');
  if (!hasBottomEdge) {
    addCtxItem('Add Jump from here...', () => showConnectDialog(nodeId, 'jump'));
    addCtxItem('Add Call from here...', () => showConnectDialog(nodeId, 'call'));
  }
  addCtxItem('Add Menu...', () => vscodeApi.postMessage({ type: 'createMenu', parentLabel: nodeId, choices: ['Choice 1', 'Choice 2'] }));
  addCtxSep();
  addCtxItem('Edit Dialogue...', () => showEditDialog(node));
  addCtxItem('Delete "' + node.label + '"', () => {
    if (confirm('Delete label "' + node.label + '"?')) {
      vscodeApi.postMessage({ type: 'deleteNode', nodeId });
    }
  });

  document.body.appendChild(ctxMenu);
});

function addCtxItem(text, onClick) {
  const item = document.createElement('div');
  item.className = 'ctx-item';
  item.textContent = text;
  item.onclick = () => { hideCtxMenu(); onClick(); };
  ctxMenu.appendChild(item);
}
function addCtxSep() {
  const sep = document.createElement('div');
  sep.className = 'ctx-sep';
  ctxMenu.appendChild(sep);
}

document.addEventListener('mousedown', (e) => {
  if (ctxMenu && !ctxMenu.contains(e.target)) hideCtxMenu();
});

// ── Keyboard ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selection.size > 0 && !document.querySelector('.modal-overlay')) {
      for (const id of selection) {
        vscodeApi.postMessage({ type: 'deleteNode', nodeId: id });
      }
    }
  }
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); vscodeApi.postMessage({ type: 'undo' }); }
  if (e.ctrlKey && e.key === 'y') { e.preventDefault(); vscodeApi.postMessage({ type: 'redo' }); }
});

// ── Dialogs ──
function showModal(title, contentHtml, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = '<div class="modal"><h3>' + title + '</h3>' + contentHtml +
    '<div class="modal-buttons"><button class="btn-cancel" id="modalCancel">Cancel</button>' +
    '<button class="btn-primary" id="modalOk">OK</button></div></div>';
  document.body.appendChild(overlay);
  const input = overlay.querySelector('input, textarea');
  if (input) { input.focus(); input.select(); }
  overlay.querySelector('#modalCancel').onclick = () => overlay.remove();
  overlay.querySelector('#modalOk').onclick = () => { onSubmit(overlay); overlay.remove(); };
  overlay.querySelector('input, textarea')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(overlay); overlay.remove(); }
    if (e.key === 'Escape') overlay.remove();
  });
}

function showEditDialog(node) {
  const lines = (node.dialoguePreview || []).join('\\n');
  showModal('Edit Dialogue — ' + node.label,
    '<textarea id="dlgText">' + lines + '</textarea>',
    (overlay) => {
      const text = overlay.querySelector('#dlgText').value;
      const newLines = text.split('\\n').filter(l => l.trim());
      vscodeApi.postMessage({ type: 'editDialogue', nodeId: node.id, lines: newLines });
    });
}

function showConnectDialog(fromId, edgeType) {
  const targets = Array.from(nodes.values()).filter(n => n.id !== fromId).map(n => n.id).sort();
  const options = targets.map(t => '<option value="' + t + '">' + t + '</option>').join('');
  // Use a simple input instead of select for flexibility
  showModal('Connect — ' + edgeType,
    '<input id="targetLabel" list="targetList" placeholder="Target label name"><datalist id="targetList">' + options + '</datalist>',
    (overlay) => {
      const target = overlay.querySelector('#targetLabel').value.trim();
      if (target) vscodeApi.postMessage({ type: 'connect', from: fromId, to: target, edgeType });
    });
}

// ── Toolbar actions ──
function zoomIn() {
  const rect = viewport.getBoundingClientRect();
  const cx = rect.width/2, cy = rect.height/2;
  const ns = Math.min(MAX_SCALE, scale * 1.3);
  panX = cx - (cx - panX) * (ns / scale);
  panY = cy - (cy - panY) * (ns / scale);
  scale = ns; applyTransform();
}
function zoomOut() {
  const rect = viewport.getBoundingClientRect();
  const cx = rect.width/2, cy = rect.height/2;
  const ns = Math.max(MIN_SCALE, scale / 1.3);
  panX = cx - (cx - panX) * (ns / scale);
  panY = cy - (cy - panY) * (ns / scale);
  scale = ns; applyTransform();
}
function resetView() { scale = 1; panX = 0; panY = 0; applyTransform(); }
function fitToView() {
  if (nodes.size === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes.values()) {
    minX = Math.min(minX, n.x - NODE_W/2);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NODE_W/2);
    maxY = Math.max(maxY, n.y + NODE_H);
  }
  const gw = maxX - minX + 80, gh = maxY - minY + 80;
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(vw/gw, vh/gh) * 0.85));
  panX = (vw - gw * scale) / 2 - minX * scale;
  panY = (vh - gh * scale) / 2 - minY * scale;
  applyTransform();
}
function autoLayoutBtn() { vscodeApi.postMessage({ type: 'requestAutoLayout' }); }
function addLabelBtn() {
  showModal('New Label', '<input id="labelName" placeholder="label_name">', (overlay) => {
    const name = overlay.querySelector('#labelName').value.trim();
    if (name) vscodeApi.postMessage({ type: 'createLabel', name });
  });
}
function addMenuBtn() {
  if (selection.size !== 1) { alert('Select one node first'); return; }
  const nodeId = selection.values().next().value;
  showModal('Add Menu Choices', '<textarea id="menuChoices" placeholder="Choice 1\\nChoice 2\\nChoice 3"></textarea>', (overlay) => {
    const text = overlay.querySelector('#menuChoices').value;
    const choices = text.split('\\n').map(l => l.trim()).filter(Boolean);
    if (choices.length > 0) vscodeApi.postMessage({ type: 'createMenu', parentLabel: nodeId, choices });
  });
}

// ── Minimap ──
function updateMinimap() {
  const mmContent = document.getElementById('minimapContent');
  const mmViewport = document.getElementById('minimapViewport');
  mmContent.innerHTML = '';

  if (nodes.size === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes.values()) {
    minX = Math.min(minX, n.x - NODE_W/2);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NODE_W/2);
    maxY = Math.max(maxY, n.y + NODE_H);
  }

  const pad = 20;
  const gw = maxX - minX + pad*2;
  const gh = maxY - minY + pad*2;
  const mmW = 180, mmH = 120;
  const mmScale = Math.min(mmW / gw, mmH / gh);
  const colors = { start: '#4CAF50', normal: '#2196F3', choice: '#FF9800', dead_end: '#f44336', orphan: '#9E9E9E' };
  const frag = document.createDocumentFragment();

  for (const n of nodes.values()) {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', (n.x - NODE_W/2 - minX + pad) * mmScale);
    r.setAttribute('y', (n.y - minY + pad) * mmScale);
    r.setAttribute('width', NODE_W * mmScale);
    r.setAttribute('height', NODE_H * mmScale);
    r.setAttribute('fill', colors[n.type] || '#555');
    r.setAttribute('rx', 2);
    frag.appendChild(r);
  }
  mmContent.appendChild(frag);

  // Viewport rect
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const vx = (-panX / scale - minX + pad) * mmScale;
  const vy = (-panY / scale - minY + pad) * mmScale;
  const vWidth = (vw / scale) * mmScale;
  const vHeight = (vh / scale) * mmScale;
  mmViewport.setAttribute('x', vx);
  mmViewport.setAttribute('y', vy);
  mmViewport.setAttribute('width', vWidth);
  mmViewport.setAttribute('height', vHeight);
}

function updateStats() {
  document.getElementById('stats').textContent = nodes.size + ' labels · ' + edges.size + ' connections';
}

// ── Messages from extension ──
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'fullGraph') {
    rebuildFromGraph(msg.graph);
    updateStats();
  } else if (msg.type === 'layoutResult') {
    for (const pos of msg.positions) {
      const n = nodes.get(pos.id);
      if (n) { n.x = pos.x; n.y = pos.y; }
    }
    renderAll();
    fitToView();
  } else if (msg.type === 'error') {
    alert(msg.message);
  }
});

// Boot
init();
</script>
</body>
</html>`;
}
