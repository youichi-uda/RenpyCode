/**
 * Auto-layout algorithm for the node editor.
 * Simplified Sugiyama-style layered layout for DAGs.
 */

import { EditorNode, EditorEdge } from './node-editor-protocol';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const LAYER_GAP = 150;
const NODE_GAP = 40;

interface LayoutNode {
  id: string;
  layer: number;
  order: number;
}

/**
 * Assign layer/position to each node using a Sugiyama-style algorithm.
 */
export function autoLayout(
  nodes: EditorNode[],
  edges: EditorEdge[],
): { id: string; x: number; y: number }[] {
  if (nodes.length === 0) return [];

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const n of nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }
  for (const e of edges) {
    if (nodeMap.has(e.from) && nodeMap.has(e.to)) {
      outgoing.get(e.from)!.push(e.to);
      incoming.get(e.to)!.push(e.from);
    }
  }

  // ── Phase 1: Layer assignment (longest path from sources) ──
  const layers = new Map<string, number>();

  // Find sources (no incoming edges)
  const sources = nodes.filter(n => incoming.get(n.id)!.length === 0);
  if (sources.length === 0) {
    // Cyclic graph fallback: use 'start' or first node as source
    const startNode = nodes.find(n => n.id === 'start') || nodes[0];
    sources.push(startNode);
  }

  // BFS longest-path layering
  const queue: { id: string; depth: number }[] = sources.map(s => ({ id: s.id, depth: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const current = layers.get(id) ?? -1;
    if (depth > current) {
      layers.set(id, depth);
    }
    for (const target of outgoing.get(id) || []) {
      if (!visited.has(`${id}->${target}`) || (layers.get(target) ?? -1) < depth + 1) {
        visited.add(`${id}->${target}`);
        queue.push({ id: target, depth: depth + 1 });
      }
    }
  }

  // Assign layer 0 to any unvisited nodes (disconnected components)
  for (const n of nodes) {
    if (!layers.has(n.id)) {
      layers.set(n.id, 0);
    }
  }

  // ── Phase 2: Group nodes by layer ──
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(id);
  }

  // ── Phase 3: Order within layers (median heuristic) ──
  const maxLayer = Math.max(...layerGroups.keys());

  // Initialize order
  const orderMap = new Map<string, number>();
  for (const [, group] of layerGroups) {
    group.forEach((id, i) => orderMap.set(id, i));
  }

  // Sweep 4 times alternating direction
  for (let sweep = 0; sweep < 4; sweep++) {
    const forward = sweep % 2 === 0;
    const start = forward ? 1 : maxLayer - 1;
    const end = forward ? maxLayer + 1 : -1;
    const step = forward ? 1 : -1;

    for (let layer = start; layer !== end; layer += step) {
      const group = layerGroups.get(layer);
      if (!group) continue;

      const prevLayer = layer - step;
      const prevGroup = layerGroups.get(prevLayer) || [];
      const prevPositions = new Map<string, number>();
      prevGroup.forEach((id, i) => prevPositions.set(id, orderMap.get(id) ?? i));

      // Compute median position of connected nodes in adjacent layer
      const medians: { id: string; median: number }[] = [];
      for (const id of group) {
        const connected = forward
          ? (incoming.get(id) || []).filter(c => layers.get(c) === prevLayer)
          : (outgoing.get(id) || []).filter(c => layers.get(c) === prevLayer);

        if (connected.length === 0) {
          medians.push({ id, median: orderMap.get(id) ?? 0 });
        } else {
          const positions = connected.map(c => prevPositions.get(c) ?? orderMap.get(c) ?? 0).sort((a, b) => a - b);
          const mid = Math.floor(positions.length / 2);
          medians.push({ id, median: positions[mid] });
        }
      }

      medians.sort((a, b) => a.median - b.median);
      medians.forEach((m, i) => orderMap.set(m.id, i));
    }
  }

  // ── Phase 4: Coordinate assignment ──
  const results: { id: string; x: number; y: number }[] = [];

  for (let layer = 0; layer <= maxLayer; layer++) {
    const group = layerGroups.get(layer);
    if (!group) continue;

    // Sort by order
    group.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));

    const totalWidth = group.length * NODE_WIDTH + (group.length - 1) * NODE_GAP;
    const startX = -totalWidth / 2;

    for (let i = 0; i < group.length; i++) {
      results.push({
        id: group[i],
        x: startX + i * (NODE_WIDTH + NODE_GAP) + NODE_WIDTH / 2,
        y: layer * (NODE_HEIGHT + LAYER_GAP),
      });
    }
  }

  // Normalize: shift all positions so that minimum x,y is at a safe margin
  if (results.length > 0) {
    let minX = Infinity, minY = Infinity;
    for (const r of results) {
      minX = Math.min(minX, r.x - NODE_WIDTH / 2);
      minY = Math.min(minY, r.y);
    }
    const margin = 60;
    const offsetX = -minX + margin;
    const offsetY = -minY + margin;
    for (const r of results) {
      r.x += offsetX;
      r.y += offsetY;
    }
  }

  return results;
}

export { NODE_WIDTH, NODE_HEIGHT };
