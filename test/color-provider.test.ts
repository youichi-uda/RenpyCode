import { describe, it, expect } from 'vitest';
import { RenpyColorProvider } from '../src/language/color-provider';
import { Color, Range } from 'vscode';

function mockDocument(text: string) {
  const lines = text.split(/\r?\n/);
  return {
    getText: () => text,
    lineCount: lines.length,
    lineAt: (n: number) => ({
      text: lines[n] || '',
      firstNonWhitespaceCharacterIndex: (lines[n] || '').search(/\S/),
    }),
  } as any;
}

const token = { isCancellationRequested: false } as any;

describe('RenpyColorProvider', () => {
  const provider = new RenpyColorProvider();

  describe('provideDocumentColors', () => {
    it('detects #rrggbb colors', () => {
      const doc = mockDocument('define e = Character("Eileen", color="#c8ffc8")');
      const colors = provider.provideDocumentColors(doc, token);
      expect(colors.length).toBe(1);
      expect(colors[0].color.red).toBeCloseTo(0xc8 / 255, 2);
      expect(colors[0].color.green).toBeCloseTo(0xff / 255, 2);
      expect(colors[0].color.blue).toBeCloseTo(0xc8 / 255, 2);
    });

    it('detects #rgb shorthand', () => {
      const doc = mockDocument('color="#f00"');
      const colors = provider.provideDocumentColors(doc, token);
      expect(colors.length).toBe(1);
      expect(colors[0].color.red).toBeCloseTo(1.0, 2);
      expect(colors[0].color.green).toBeCloseTo(0.0, 2);
      expect(colors[0].color.blue).toBeCloseTo(0.0, 2);
    });

    it('detects #rrggbbaa colors', () => {
      const doc = mockDocument('color="#ff000080"');
      const colors = provider.provideDocumentColors(doc, token);
      expect(colors.length).toBe(1);
      expect(colors[0].color.alpha).toBeCloseTo(0x80 / 255, 2);
    });

    it('detects multiple colors on different lines', () => {
      const doc = mockDocument('color="#ff0000"\ncolor="#00ff00"\ncolor="#0000ff"');
      const colors = provider.provideDocumentColors(doc, token);
      expect(colors.length).toBe(3);
    });

    it('returns empty for no colors', () => {
      const doc = mockDocument('label start:\n    "Hello world"');
      const colors = provider.provideDocumentColors(doc, token);
      expect(colors.length).toBe(0);
    });

    it('ignores invalid hex lengths', () => {
      const doc = mockDocument('color="#ff00"'); // 4 digits — not valid
      const colors = provider.provideDocumentColors(doc, token);
      expect(colors.length).toBe(0);
    });
  });

  describe('provideColorPresentations', () => {
    it('formats color as #rrggbb', () => {
      const color = new Color(1, 0, 0, 1);
      const context = { document: {} as any, range: new Range(0, 0, 0, 7) };
      const presentations = provider.provideColorPresentations(color, context, token);
      expect(presentations.length).toBe(1);
      expect(presentations[0].label).toBe('#ff0000');
    });

    it('formats color with alpha as #rrggbbaa', () => {
      const color = new Color(1, 0, 0, 0.5);
      const context = { document: {} as any, range: new Range(0, 0, 0, 9) };
      const presentations = provider.provideColorPresentations(color, context, token);
      expect(presentations[0].label).toMatch(/^#ff0000[0-9a-f]{2}$/);
    });
  });
});
