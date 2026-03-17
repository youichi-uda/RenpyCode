import { describe, it, expect } from 'vitest';
import { RenpyFormattingProvider } from '../src/language/formatting-provider';

function mockDocument(text: string) {
  const lines = text.split(/\r?\n/);
  return {
    getText: () => text,
    lineCount: lines.length,
    lineAt: (n: number) => {
      const t = lines[n] || '';
      return {
        text: t,
        range: {
          start: { line: n, character: 0 },
          end: { line: n, character: t.length },
        },
        isEmptyOrWhitespace: t.trim() === '',
      };
    },
    uri: { fsPath: 'test.rpy', toString: () => 'test.rpy' },
  } as any;
}

const token = { isCancellationRequested: false } as any;
const defaultOptions = { insertSpaces: true, tabSize: 4 } as any;

function applyEdits(text: string, edits: any[]): string {
  const lines = text.split(/\r?\n/);
  // Sort edits in reverse order to apply from bottom to top
  const sorted = [...edits].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  for (const edit of sorted) {
    const startLine = edit.range.start.line;
    const endLine = edit.range.end.line;
    const startChar = edit.range.start.character;
    const endChar = edit.range.end.character;

    if (startLine === endLine) {
      const line = lines[startLine] || '';
      lines[startLine] = line.substring(0, startChar) + edit.newText + line.substring(endChar);
    } else {
      // Multi-line delete (for blank line removal)
      const firstLine = (lines[startLine] || '').substring(0, startChar);
      const lastLine = (lines[endLine] || '').substring(endChar);
      lines.splice(startLine, endLine - startLine + 1, firstLine + edit.newText + lastLine);
    }
  }

  return lines.join('\n');
}

describe('RenpyFormattingProvider', () => {
  const provider = new RenpyFormattingProvider();

  it('should convert tabs to spaces', () => {
    const doc = mockDocument('\tjump start');
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    const result = applyEdits('\tjump start', edits);
    expect(result).toBe('    jump start');
  });

  it('should remove trailing whitespace', () => {
    const doc = mockDocument('label start:   ');
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    const result = applyEdits('label start:   ', edits);
    expect(result).toBe('label start:');
  });

  it('should normalize define spacing', () => {
    const doc = mockDocument('    define e=Character("Eileen")');
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    const result = applyEdits('    define e=Character("Eileen")', edits);
    expect(result).toBe('    define e = Character("Eileen")');
  });

  it('should normalize default spacing', () => {
    const doc = mockDocument('    default book  =  False');
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    const result = applyEdits('    default book  =  False', edits);
    expect(result).toBe('    default book = False');
  });

  it('should remove space before colon on label', () => {
    const doc = mockDocument('label start :');
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    const result = applyEdits('label start :', edits);
    expect(result).toBe('label start:');
  });

  it('should remove space before colon on screen', () => {
    const doc = mockDocument('screen main_menu :');
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    const result = applyEdits('screen main_menu :', edits);
    expect(result).toBe('screen main_menu:');
  });

  it('should normalize multiple spaces after keywords', () => {
    const doc = mockDocument('    jump  start');
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    const result = applyEdits('    jump  start', edits);
    expect(result).toBe('    jump start');
  });

  it('should collapse consecutive blank lines to max 2', () => {
    const text = 'label start:\n\n\n\n\n    jump end';
    const doc = mockDocument(text);
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    const result = applyEdits(text, edits);
    const blankCount = result.split('\n').filter(l => l.trim() === '').length;
    expect(blankCount).toBeLessThanOrEqual(2);
  });

  it('should clean whitespace-only lines', () => {
    const doc = mockDocument('label start:\n    \n    jump end');
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    const result = applyEdits('label start:\n    \n    jump end', edits);
    expect(result).toBe('label start:\n\n    jump end');
  });

  it('should not modify already-formatted code', () => {
    const text = 'label start:\n    jump end';
    const doc = mockDocument(text);
    const edits = provider.provideDocumentFormattingEdits(doc, defaultOptions, token);
    expect(edits.length).toBe(0);
  });
});
