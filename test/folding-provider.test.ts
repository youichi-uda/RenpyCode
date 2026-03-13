import { describe, it, expect } from 'vitest';
import { RenpyFoldingProvider } from '../src/language/folding-provider';

function mockDocument(text: string) {
  const lines = text.split(/\r?\n/);
  return {
    getText: () => text,
    lineCount: lines.length,
    lineAt: (n: number) => {
      const t = lines[n] || '';
      const idx = t.search(/\S/);
      return {
        text: t,
        firstNonWhitespaceCharacterIndex: idx === -1 ? 0 : idx,
      };
    },
  } as any;
}

const token = { isCancellationRequested: false } as any;
const ctx = {} as any;

describe('RenpyFoldingProvider', () => {
  const provider = new RenpyFoldingProvider();

  it('folds label blocks', () => {
    const doc = mockDocument([
      'label start:',
      '    "Hello"',
      '    "World"',
      '',
      'label end:',
      '    return',
    ].join('\n'));

    const ranges = provider.provideFoldingRanges(doc, ctx, token);
    expect(ranges.some(r => r.start === 0 && r.end === 2)).toBe(true);
    expect(ranges.some(r => r.start === 4 && r.end === 5)).toBe(true);
  });

  it('folds nested blocks', () => {
    const doc = mockDocument([
      'label start:',
      '    menu:',
      '        "Choice A":',
      '            jump a',
      '        "Choice B":',
      '            jump b',
    ].join('\n'));

    const ranges = provider.provideFoldingRanges(doc, ctx, token);
    // label block should fold 0→5
    expect(ranges.some(r => r.start === 0 && r.end === 5)).toBe(true);
    // menu block should fold 1→5
    expect(ranges.some(r => r.start === 1 && r.end === 5)).toBe(true);
  });

  it('folds comment blocks', () => {
    const doc = mockDocument([
      '# Comment line 1',
      '# Comment line 2',
      '# Comment line 3',
      'label start:',
      '    return',
    ].join('\n'));

    const ranges = provider.provideFoldingRanges(doc, ctx, token);
    expect(ranges.some(r => r.start === 0 && r.end === 2 && r.kind === 1)).toBe(true); // FoldingRangeKind.Comment = 1
  });

  it('does not fold single lines', () => {
    const doc = mockDocument([
      'label start:',
      '    return',
    ].join('\n'));

    const ranges = provider.provideFoldingRanges(doc, ctx, token);
    expect(ranges.some(r => r.start === 0 && r.end === 1)).toBe(true);
  });

  it('handles empty document', () => {
    const doc = mockDocument('');
    const ranges = provider.provideFoldingRanges(doc, ctx, token);
    expect(ranges.length).toBe(0);
  });

  it('folds screen definitions', () => {
    const doc = mockDocument([
      'screen say(who, what):',
      '    window:',
      '        vbox:',
      '            text who',
      '            text what',
    ].join('\n'));

    const ranges = provider.provideFoldingRanges(doc, ctx, token);
    expect(ranges.some(r => r.start === 0 && r.end === 4)).toBe(true);
  });
});
