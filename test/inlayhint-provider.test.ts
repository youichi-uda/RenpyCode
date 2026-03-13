import { describe, it, expect } from 'vitest';
import { RenpyInlayHintsProvider } from '../src/language/inlayhint-provider';
import { InlayHintKind } from 'vscode';
import type { ProjectIndex, ParsedFile, DefineNode, LabelNode, DialogueNode, NarrationNode, CommandNode } from '../src/parser/types';

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

/** Range covering all lines in a document */
function fullRange(doc: ReturnType<typeof mockDocument>) {
  return {
    start: { line: 0, character: 0 },
    end: { line: doc.lineCount, character: 0 },
  } as any;
}

function makeRange(startLine: number, startCol: number, endLine: number, endCol: number) {
  return { start: { line: startLine, column: startCol }, end: { line: endLine, column: endCol } };
}

function emptyIndex(): ProjectIndex {
  return {
    files: new Map(),
    labels: new Map(),
    screens: new Map(),
    characters: new Map(),
    images: new Map(),
    transforms: new Map(),
    variables: new Map(),
    testcases: new Map(),
    assetFiles: new Set(),
  };
}

function dialogueNode(line: number, character: string, text: string): DialogueNode {
  const charEnd = character.length;
  return {
    type: 'dialogue',
    line,
    indent: 4,
    raw: `    ${character} "${text}"`,
    range: makeRange(line, 0, line, charEnd + text.length + 7),
    children: [],
    character,
    characterRange: makeRange(line, 4, line, 4 + charEnd),
    text,
    textRange: makeRange(line, 4 + charEnd + 2, line, 4 + charEnd + 2 + text.length),
  };
}

function narrationNode(line: number, text: string): NarrationNode {
  return {
    type: 'narration',
    line,
    indent: 4,
    raw: `    "${text}"`,
    range: makeRange(line, 0, line, text.length + 6),
    children: [],
    text,
    textRange: makeRange(line, 5, line, 5 + text.length),
  };
}

function commandNode(line: number, command: string, target: string): CommandNode {
  const targetStart = 4 + command.length + 1;
  return {
    type: 'command',
    line,
    indent: 4,
    raw: `    ${command} ${target}`,
    range: makeRange(line, 0, line, targetStart + target.length),
    children: [],
    command,
    commandRange: makeRange(line, 4, line, 4 + command.length),
    target,
    targetRange: makeRange(line, targetStart, line, targetStart + target.length),
  };
}

function defineCharNode(name: string, displayName: string, line = 0): DefineNode {
  return {
    type: 'define',
    line,
    indent: 0,
    raw: `define ${name} = Character("${displayName}")`,
    range: makeRange(line, 0, line, 40),
    children: [],
    name,
    nameRange: makeRange(line, 7, line, 7 + name.length),
    value: `Character("${displayName}")`,
    valueRange: makeRange(line, 7 + name.length + 3, line, 40),
  };
}

function labelNode(name: string, line = 0): LabelNode {
  return {
    type: 'label',
    line,
    indent: 0,
    raw: `label ${name}:`,
    range: makeRange(line, 0, line, 6 + name.length + 1),
    children: [],
    name,
    nameRange: makeRange(line, 6, line, 6 + name.length),
  };
}

describe('RenpyInlayHintsProvider', () => {
  describe('character display name hints', () => {
    it('shows display name next to character variable in dialogue', () => {
      const index = emptyIndex();
      const charNode = defineCharNode('s', 'Sylvie');
      index.characters.set('s', { file: 'script.rpy', node: charNode });

      const dialogue = dialogueNode(1, 's', 'Hello there!');
      const parsed: ParsedFile = {
        file: 'test.rpy',
        nodes: [dialogue],
        labels: new Map(),
        screens: new Map(),
        characters: new Map(),
        images: new Map(),
        transforms: new Map(),
        defines: new Map(),
        defaults: new Map(),
        testcases: new Map(),
        errors: [],
      };
      index.files.set('test.rpy', parsed);

      const provider = new RenpyInlayHintsProvider(() => index);
      const doc = mockDocument('    s "Hello there!"');
      const hints = provider.provideInlayHints(doc, fullRange(doc), token);

      expect(hints.length).toBe(1);
      expect(hints[0].label).toBe(' (Sylvie)');
      expect(hints[0].kind).toBe(InlayHintKind.Type);
      expect(hints[0].paddingLeft).toBe(false);
    });

    it('does not show hint when character is not in index', () => {
      const index = emptyIndex();

      const dialogue = dialogueNode(1, 'unknown_char', 'Hello!');
      const parsed: ParsedFile = {
        file: 'test.rpy',
        nodes: [dialogue],
        labels: new Map(),
        screens: new Map(),
        characters: new Map(),
        images: new Map(),
        transforms: new Map(),
        defines: new Map(),
        defaults: new Map(),
        testcases: new Map(),
        errors: [],
      };
      index.files.set('test.rpy', parsed);

      const provider = new RenpyInlayHintsProvider(() => index);
      const doc = mockDocument('    unknown_char "Hello!"');
      const hints = provider.provideInlayHints(doc, fullRange(doc), token);

      expect(hints.length).toBe(0);
    });
  });

  describe('jump/call target file hints', () => {
    it('shows file location for jump target', () => {
      const index = emptyIndex();
      const lbl = labelNode('start', 5);
      index.labels.set('start', [{ file: 'script.rpy', node: lbl }]);

      const jumpCmd = commandNode(1, 'jump', 'start');
      const parsed: ParsedFile = {
        file: 'test.rpy',
        nodes: [jumpCmd],
        labels: new Map(),
        screens: new Map(),
        characters: new Map(),
        images: new Map(),
        transforms: new Map(),
        defines: new Map(),
        defaults: new Map(),
        testcases: new Map(),
        errors: [],
      };
      index.files.set('test.rpy', parsed);

      const provider = new RenpyInlayHintsProvider(() => index);
      const doc = mockDocument('    jump start');
      const hints = provider.provideInlayHints(doc, fullRange(doc), token);

      expect(hints.length).toBe(1);
      // label is on line 5 (0-based), displayed as line 6
      expect(hints[0].label).toContain('script.rpy:6');
      expect(hints[0].kind).toBe(InlayHintKind.Parameter);
      expect(hints[0].paddingLeft).toBe(true);
    });

    it('shows file location for call target', () => {
      const index = emptyIndex();
      const lbl = labelNode('helper', 10);
      index.labels.set('helper', [{ file: 'utils.rpy', node: lbl }]);

      const callCmd = commandNode(0, 'call', 'helper');
      const parsed: ParsedFile = {
        file: 'test.rpy',
        nodes: [callCmd],
        labels: new Map(),
        screens: new Map(),
        characters: new Map(),
        images: new Map(),
        transforms: new Map(),
        defines: new Map(),
        defaults: new Map(),
        testcases: new Map(),
        errors: [],
      };
      index.files.set('test.rpy', parsed);

      const provider = new RenpyInlayHintsProvider(() => index);
      const doc = mockDocument('    call helper');
      const hints = provider.provideInlayHints(doc, fullRange(doc), token);

      expect(hints.length).toBe(1);
      expect(hints[0].label).toBe(' → utils.rpy:11');
    });
  });

  describe('narration lines', () => {
    it('does not produce character hints for narration', () => {
      const index = emptyIndex();

      const narration = narrationNode(0, 'This is narration.');
      const parsed: ParsedFile = {
        file: 'test.rpy',
        nodes: [narration],
        labels: new Map(),
        screens: new Map(),
        characters: new Map(),
        images: new Map(),
        transforms: new Map(),
        defines: new Map(),
        defaults: new Map(),
        testcases: new Map(),
        errors: [],
      };
      index.files.set('test.rpy', parsed);

      const provider = new RenpyInlayHintsProvider(() => index);
      const doc = mockDocument('    "This is narration."');
      const hints = provider.provideInlayHints(doc, fullRange(doc), token);

      expect(hints.length).toBe(0);
    });
  });

  describe('empty document', () => {
    it('returns no hints for empty document', () => {
      const index = emptyIndex();
      const parsed: ParsedFile = {
        file: 'test.rpy',
        nodes: [],
        labels: new Map(),
        screens: new Map(),
        characters: new Map(),
        images: new Map(),
        transforms: new Map(),
        defines: new Map(),
        defaults: new Map(),
        testcases: new Map(),
        errors: [],
      };
      index.files.set('test.rpy', parsed);

      const provider = new RenpyInlayHintsProvider(() => index);
      const doc = mockDocument('');
      const hints = provider.provideInlayHints(doc, fullRange(doc), token);

      expect(hints.length).toBe(0);
    });

    it('returns no hints when file is not in index', () => {
      const index = emptyIndex();

      const provider = new RenpyInlayHintsProvider(() => index);
      const doc = mockDocument('    s "Hello"');
      const hints = provider.provideInlayHints(doc, fullRange(doc), token);

      expect(hints.length).toBe(0);
    });
  });
});
