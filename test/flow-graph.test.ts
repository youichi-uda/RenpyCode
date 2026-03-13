import { describe, it, expect } from 'vitest';
import { FlowGraphProvider } from '../src/flow-graph/flow-graph-provider';
import { ProjectIndex, LabelNode, CommandNode, MenuNode, MenuChoiceNode, NarrationNode, DialogueNode } from '../src/parser/types';
import { Uri } from 'vscode';

function makeNode(partial: Partial<LabelNode> & { type: 'label'; name: string }): LabelNode {
  return {
    line: 0,
    indent: 0,
    raw: '',
    children: [],
    nameRange: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
    ...partial,
  } as LabelNode;
}

function makeCommand(command: string, target?: string): CommandNode {
  return {
    type: 'command',
    command,
    target,
    line: 0,
    indent: 4,
    raw: `    ${command}${target ? ' ' + target : ''}`,
    children: [],
    commandRange: { start: { line: 0, column: 4 }, end: { line: 0, column: 4 + command.length } },
    targetRange: target ? { start: { line: 0, column: 5 + command.length }, end: { line: 0, column: 5 + command.length + target.length } } : undefined,
  };
}

function makeDialogue(char: string, text: string): DialogueNode {
  return {
    type: 'dialogue',
    character: char,
    text,
    line: 0,
    indent: 4,
    raw: `    ${char} "${text}"`,
    children: [],
    characterRange: { start: { line: 0, column: 4 }, end: { line: 0, column: 4 + char.length } },
    textRange: { start: { line: 0, column: 6 + char.length }, end: { line: 0, column: 6 + char.length + text.length } },
  };
}

function makeNarration(text: string): NarrationNode {
  return {
    type: 'narration',
    text,
    line: 0,
    indent: 4,
    raw: `    "${text}"`,
    children: [],
    textRange: { start: { line: 0, column: 5 }, end: { line: 0, column: 5 + text.length } },
  };
}

function makeMenu(choices: { text: string; children: any[] }[]): MenuNode {
  return {
    type: 'menu',
    line: 0,
    indent: 4,
    raw: '    menu:',
    children: choices.map(c => ({
      type: 'menu_choice' as const,
      text: c.text,
      condition: undefined,
      line: 0,
      indent: 8,
      raw: `        "${c.text}":`,
      children: c.children,
      textRange: { start: { line: 0, column: 9 }, end: { line: 0, column: 9 + c.text.length } },
    })),
  };
}

function createIndex(labels: Map<string, { file: string; node: LabelNode }[]>): ProjectIndex {
  return {
    files: new Map(),
    labels,
    screens: new Map(),
    characters: new Map(),
    images: new Map(),
    transforms: new Map(),
    variables: new Map(),
    testcases: new Map(),
    assetFiles: new Set(),
  };
}

describe('FlowGraphProvider', () => {
  it('builds graph with nodes for each label', () => {
    const labels = new Map<string, { file: string; node: LabelNode }[]>();
    labels.set('start', [{ file: 'script.rpy', node: makeNode({ type: 'label', name: 'start', children: [] }) }]);
    labels.set('ending', [{ file: 'script.rpy', node: makeNode({ type: 'label', name: 'ending', children: [] }) }]);

    const provider = new FlowGraphProvider(() => createIndex(labels), Uri.file('/ext'));
    const graph = provider.buildGraph();

    expect(graph.nodes.length).toBe(2);
    expect(graph.nodes.map(n => n.name).sort()).toEqual(['ending', 'start']);
  });

  it('creates jump edges', () => {
    const startNode = makeNode({
      type: 'label',
      name: 'start',
      children: [makeCommand('jump', 'ending')],
    });
    const endingNode = makeNode({ type: 'label', name: 'ending', children: [makeCommand('return')] });

    const labels = new Map<string, { file: string; node: LabelNode }[]>();
    labels.set('start', [{ file: 's.rpy', node: startNode }]);
    labels.set('ending', [{ file: 's.rpy', node: endingNode }]);

    const provider = new FlowGraphProvider(() => createIndex(labels), Uri.file('/ext'));
    const graph = provider.buildGraph();

    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0]).toEqual({ from: 'start', to: 'ending', type: 'jump' });
  });

  it('creates call edges', () => {
    const startNode = makeNode({
      type: 'label',
      name: 'start',
      children: [makeCommand('call', 'subroutine')],
    });

    const labels = new Map<string, { file: string; node: LabelNode }[]>();
    labels.set('start', [{ file: 's.rpy', node: startNode }]);
    labels.set('subroutine', [{ file: 's.rpy', node: makeNode({ type: 'label', name: 'subroutine', children: [] }) }]);

    const provider = new FlowGraphProvider(() => createIndex(labels), Uri.file('/ext'));
    const graph = provider.buildGraph();

    expect(graph.edges.some(e => e.from === 'start' && e.to === 'subroutine' && e.type === 'call')).toBe(true);
  });

  it('detects menus', () => {
    const menu = makeMenu([
      { text: 'Choice A', children: [makeCommand('jump', 'a')] },
      { text: 'Choice B', children: [makeCommand('jump', 'b')] },
    ]);

    const startNode = makeNode({ type: 'label', name: 'start', children: [menu] });

    const labels = new Map<string, { file: string; node: LabelNode }[]>();
    labels.set('start', [{ file: 's.rpy', node: startNode }]);
    labels.set('a', [{ file: 's.rpy', node: makeNode({ type: 'label', name: 'a', children: [] }) }]);
    labels.set('b', [{ file: 's.rpy', node: makeNode({ type: 'label', name: 'b', children: [] }) }]);

    const provider = new FlowGraphProvider(() => createIndex(labels), Uri.file('/ext'));
    const graph = provider.buildGraph();

    const startFlowNode = graph.nodes.find(n => n.name === 'start')!;
    expect(startFlowNode.hasMenu).toBe(true);

    // Should have edges from menu choices
    expect(graph.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('detects return statements', () => {
    const node = makeNode({
      type: 'label',
      name: 'end',
      children: [makeCommand('return')],
    });

    const labels = new Map<string, { file: string; node: LabelNode }[]>();
    labels.set('end', [{ file: 's.rpy', node }]);

    const provider = new FlowGraphProvider(() => createIndex(labels), Uri.file('/ext'));
    const graph = provider.buildGraph();

    expect(graph.nodes[0].hasReturn).toBe(true);
  });

  it('counts dialogue lines', () => {
    const node = makeNode({
      type: 'label',
      name: 'start',
      children: [
        makeDialogue('e', 'Hello!'),
        makeNarration('It was a sunny day.'),
        makeDialogue('s', 'Hi there!'),
      ],
    });

    const labels = new Map<string, { file: string; node: LabelNode }[]>();
    labels.set('start', [{ file: 's.rpy', node }]);

    const provider = new FlowGraphProvider(() => createIndex(labels), Uri.file('/ext'));
    const graph = provider.buildGraph();

    expect(graph.nodes[0].dialogueCount).toBe(3);
  });

  it('handles empty index', () => {
    const provider = new FlowGraphProvider(
      () => createIndex(new Map()),
      Uri.file('/ext'),
    );
    const graph = provider.buildGraph();

    expect(graph.nodes.length).toBe(0);
    expect(graph.edges.length).toBe(0);
  });

  it('generates mermaid syntax', () => {
    const startNode = makeNode({
      type: 'label',
      name: 'start',
      children: [makeCommand('jump', 'end')],
    });
    const endNode = makeNode({
      type: 'label',
      name: 'end',
      children: [makeCommand('return')],
    });

    const labels = new Map<string, { file: string; node: LabelNode }[]>();
    labels.set('start', [{ file: 's.rpy', node: startNode }]);
    labels.set('end', [{ file: 's.rpy', node: endNode }]);

    const provider = new FlowGraphProvider(() => createIndex(labels), Uri.file('/ext'));
    const graph = provider.buildGraph();
    const mermaid = provider.generateMermaid(graph);

    expect(mermaid).toContain('flowchart');
    expect(mermaid).toContain('start');
    expect(mermaid).toContain('end');
  });
});
