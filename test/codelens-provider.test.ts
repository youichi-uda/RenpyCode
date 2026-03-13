import { describe, it, expect } from 'vitest';
import { RenpyCodeLensProvider } from '../src/language/codelens-provider';

function mockDocument(text: string) {
  const lines = text.split(/\r?\n/);
  return {
    getText: () => text,
    lineCount: lines.length,
    lineAt: (n: number) => ({ text: lines[n] || '' }),
    uri: { fsPath: 'test.rpy', toString: () => 'test.rpy' },
  } as any;
}

const token = { isCancellationRequested: false } as any;

function makeRange(line: number, col: number, endLine: number, endCol: number) {
  return { start: { line, column: col }, end: { line: endLine, column: endCol } };
}

function makeLabelNode(name: string, line: number) {
  return {
    type: 'label' as const,
    name,
    line,
    nameRange: makeRange(line, 6, line, 6 + name.length),
    raw: `label ${name}:`,
    indent: 0,
    children: [],
    range: makeRange(line, 0, line, 6 + name.length + 1),
  };
}

function makeScreenNode(name: string, line: number) {
  return {
    type: 'screen' as const,
    name,
    line,
    nameRange: makeRange(line, 7, line, 7 + name.length),
    raw: `screen ${name}:`,
    indent: 0,
    children: [],
    range: makeRange(line, 0, line, 7 + name.length + 1),
  };
}

function makeCommandNode(command: string, target: string, raw?: string) {
  return {
    type: 'command' as const,
    command,
    target,
    raw: raw || `${command} ${target}`,
    indent: 4,
    line: 0,
    children: [],
    range: makeRange(0, 0, 0, 0),
    commandRange: makeRange(0, 0, 0, command.length),
  };
}

function makeUnknownNode(raw: string) {
  return {
    type: 'unknown' as const,
    raw,
    indent: 4,
    line: 0,
    children: [],
    range: makeRange(0, 0, 0, 0),
  };
}

function makeIndex(
  parsedFiles: Map<string, { nodes: any[]; labels: Map<string, any>; screens: Map<string, any> }>,
) {
  const files = new Map<string, any>();
  for (const [path, data] of parsedFiles) {
    files.set(path, {
      file: path,
      nodes: data.nodes,
      labels: data.labels,
      screens: data.screens,
      characters: new Map(),
      images: new Map(),
      transforms: new Map(),
      defines: new Map(),
      defaults: new Map(),
      testcases: new Map(),
    });
  }
  return {
    files,
    labels: new Map(),
    screens: new Map(),
    characters: new Map(),
    images: new Map(),
  } as any;
}

describe('RenpyCodeLensProvider', () => {
  it('returns CodeLens for label definitions with reference count', () => {
    const labelNode = makeLabelNode('start', 0);
    const jumpNode = makeCommandNode('jump', 'start');

    const parsed = new Map([
      ['test.rpy', {
        nodes: [labelNode, jumpNode],
        labels: new Map([['start', labelNode]]),
        screens: new Map(),
      }],
    ]);

    const index = makeIndex(parsed);
    const provider = new RenpyCodeLensProvider(() => index);
    const doc = mockDocument('label start:\n    jump start');
    const lenses = provider.provideCodeLenses(doc, token);

    expect(lenses.length).toBe(1);
    expect(lenses[0].command!.title).toBe('1 references');
    expect(lenses[0].command!.command).toBe('editor.action.findReferences');
  });

  it('returns CodeLens for screen definitions with reference count', () => {
    const screenNode = makeScreenNode('say', 0);
    const showScreenNode = makeCommandNode('show', 'say', 'show screen say');

    const parsed = new Map([
      ['test.rpy', {
        nodes: [screenNode, showScreenNode],
        labels: new Map(),
        screens: new Map([['say', screenNode]]),
      }],
    ]);

    const index = makeIndex(parsed);
    const provider = new RenpyCodeLensProvider(() => index);
    const doc = mockDocument('screen say:\n    text "hello"');
    const lenses = provider.provideCodeLenses(doc, token);

    expect(lenses.length).toBe(1);
    expect(lenses[0].command!.title).toBe('1 references');
  });

  it('returns no CodeLens for empty document', () => {
    const parsed = new Map([
      ['test.rpy', {
        nodes: [],
        labels: new Map(),
        screens: new Map(),
      }],
    ]);

    const index = makeIndex(parsed);
    const provider = new RenpyCodeLensProvider(() => index);
    const doc = mockDocument('');
    const lenses = provider.provideCodeLenses(doc, token);

    expect(lenses.length).toBe(0);
  });

  it('returns separate CodeLens for multiple labels', () => {
    const labelA = makeLabelNode('start', 0);
    const labelB = makeLabelNode('ending', 3);

    const parsed = new Map([
      ['test.rpy', {
        nodes: [labelA, labelB],
        labels: new Map([['start', labelA], ['ending', labelB]]),
        screens: new Map(),
      }],
    ]);

    const index = makeIndex(parsed);
    const provider = new RenpyCodeLensProvider(() => index);
    const doc = mockDocument('label start:\n    return\n\nlabel ending:\n    return');
    const lenses = provider.provideCodeLenses(doc, token);

    expect(lenses.length).toBe(2);
    expect(lenses[0].command!.title).toBe('0 references');
    expect(lenses[1].command!.title).toBe('0 references');
  });

  it('reference count reflects actual jump/call usage in index', () => {
    const labelNode = makeLabelNode('battle', 0);
    const jump1 = makeCommandNode('jump', 'battle');
    const jump2 = makeCommandNode('jump', 'battle');
    const call1 = makeCommandNode('call', 'battle');
    const jumpOther = makeCommandNode('jump', 'other');

    const parsed = new Map([
      ['test.rpy', {
        nodes: [labelNode],
        labels: new Map([['battle', labelNode]]),
        screens: new Map(),
      }],
      ['other.rpy', {
        nodes: [jump1, jump2, call1, jumpOther],
        labels: new Map(),
        screens: new Map(),
      }],
    ]);

    const index = makeIndex(parsed);
    const provider = new RenpyCodeLensProvider(() => index);
    const doc = mockDocument('label battle:\n    return');
    const lenses = provider.provideCodeLenses(doc, token);

    expect(lenses.length).toBe(1);
    // 2 jumps to 'battle' + 1 call to 'battle' = 3 references
    expect(lenses[0].command!.title).toBe('3 references');
  });

  it('counts screen references from use statements', () => {
    const screenNode = makeScreenNode('hud', 0);
    const useNode = makeUnknownNode('    use hud');

    const parsed = new Map([
      ['test.rpy', {
        nodes: [screenNode, useNode],
        labels: new Map(),
        screens: new Map([['hud', screenNode]]),
      }],
    ]);

    const index = makeIndex(parsed);
    const provider = new RenpyCodeLensProvider(() => index);
    const doc = mockDocument('screen hud:\n    text "HP"');
    const lenses = provider.provideCodeLenses(doc, token);

    expect(lenses.length).toBe(1);
    expect(lenses[0].command!.title).toBe('1 references');
  });

  it('returns empty array when file is not in index', () => {
    const index = makeIndex(new Map());
    const provider = new RenpyCodeLensProvider(() => index);
    const doc = mockDocument('label start:\n    return');
    const lenses = provider.provideCodeLenses(doc, token);

    expect(lenses.length).toBe(0);
  });

  it('counts references in nested children', () => {
    const labelNode = makeLabelNode('target', 0);
    const innerJump = makeCommandNode('jump', 'target');
    const parentNode = {
      type: 'init_block' as const,
      raw: 'init:',
      indent: 0,
      line: 2,
      children: [innerJump],
      range: makeRange(2, 0, 3, 0),
      isPython: false,
    };

    const parsed = new Map([
      ['test.rpy', {
        nodes: [labelNode, parentNode],
        labels: new Map([['target', labelNode]]),
        screens: new Map(),
      }],
    ]);

    const index = makeIndex(parsed);
    const provider = new RenpyCodeLensProvider(() => index);
    const doc = mockDocument('label target:\n    return\ninit:\n    jump target');
    const lenses = provider.provideCodeLenses(doc, token);

    expect(lenses.length).toBe(1);
    expect(lenses[0].command!.title).toBe('1 references');
  });
});
