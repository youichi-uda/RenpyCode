import { describe, it, expect } from 'vitest';
import { RenpySignatureProvider } from '../src/language/signature-provider';
import { Position } from 'vscode';

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
const context = { triggerKind: 1 } as any;

function emptyIndex() {
  return {
    files: new Map(),
    labels: new Map(),
    screens: new Map(),
    characters: new Map(),
    images: new Map(),
  };
}

describe('RenpySignatureProvider', () => {
  describe('built-in signatures', () => {
    const provider = new RenpySignatureProvider(() => emptyIndex() as any);

    it('returns Character() signature when typing Character(', () => {
      const doc = mockDocument('define e = Character(');
      const pos = new Position(0, 21);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeDefined();
      expect(result!.signatures.length).toBe(1);
      expect(result!.signatures[0].label).toBe('Character(name, kind=None, **properties)');
      expect(result!.activeParameter).toBe(0);
    });

    it('returns Dissolve() signature when typing Dissolve(', () => {
      const doc = mockDocument('with Dissolve(');
      const pos = new Position(0, 14);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeDefined();
      expect(result!.signatures[0].label).toBe('Dissolve(time, alpha=False)');
      expect(result!.signatures[0].parameters.length).toBe(2);
    });

    it('returns Fade() signature', () => {
      const doc = mockDocument('with Fade(');
      const pos = new Position(0, 10);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeDefined();
      expect(result!.signatures[0].label).toContain('Fade(');
      expect(result!.signatures[0].parameters.length).toBe(4);
    });

    it('active parameter updates based on comma count', () => {
      const doc = mockDocument('define e = Character("Eileen", ');
      const pos = new Position(0, 30);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeDefined();
      expect(result!.activeParameter).toBe(1);
    });

    it('active parameter is 2 with two commas', () => {
      const doc = mockDocument('with Fade(0.5, 0.5, ');
      const pos = new Position(0, 20);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeDefined();
      expect(result!.activeParameter).toBe(2);
    });

    it('returns null outside function calls', () => {
      const doc = mockDocument('label start:');
      const pos = new Position(0, 12);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeUndefined();
    });

    it('returns null for plain text without parens', () => {
      const doc = mockDocument('"Hello world"');
      const pos = new Position(0, 5);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeUndefined();
    });

    it('returns signature for SetVariable(', () => {
      const doc = mockDocument('action SetVariable(');
      const pos = new Position(0, 19);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeDefined();
      expect(result!.signatures[0].label).toBe('SetVariable(name, value)');
    });

    it('returns signature for Play(', () => {
      const doc = mockDocument('Play(');
      const pos = new Position(0, 5);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeDefined();
      expect(result!.signatures[0].label).toBe('Play(channel, file, **kwargs)');
    });
  });

  describe('label signatures', () => {
    it('returns label signature when label has parameters', () => {
      const index = emptyIndex();
      index.labels.set('greet', [{
        file: 'script.rpy',
        node: { line: 5, parameters: 'name, greeting="hello"' } as any,
      }]);
      const provider = new RenpySignatureProvider(() => index as any);

      const doc = mockDocument('call greet(');
      const pos = new Position(0, 11);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeDefined();
      expect(result!.signatures[0].label).toBe('label greet(name, greeting="hello")');
      expect(result!.signatures[0].parameters.length).toBe(2);
      expect(result!.signatures[0].parameters[0].label).toBe('name');
      expect(result!.signatures[0].parameters[1].label).toBe('greeting');
    });

    it('returns undefined for label without parameters', () => {
      const index = emptyIndex();
      index.labels.set('start', [{
        file: 'script.rpy',
        node: { line: 0 } as any,
      }]);
      const provider = new RenpySignatureProvider(() => index as any);

      const doc = mockDocument('call start(');
      const pos = new Position(0, 11);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeUndefined();
    });

    it('returns undefined for unknown function name not in index', () => {
      const provider = new RenpySignatureProvider(() => emptyIndex() as any);
      const doc = mockDocument('call unknownFunc(');
      const pos = new Position(0, 17);
      const result = provider.provideSignatureHelp(doc, pos, token, context);

      expect(result).toBeUndefined();
    });
  });
});
