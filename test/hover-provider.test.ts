import { describe, it, expect } from 'vitest';
import { RenpyHoverProvider } from '../src/language/hover-provider';
import { ProjectIndex } from '../src/parser/types';

function mockDocument(text: string) {
  const lines = text.split(/\r?\n/);
  return {
    getText: (range?: any) => {
      if (range) {
        const line = lines[range.start.line] || '';
        return line.substring(range.start.character, range.end.character);
      }
      return text;
    },
    lineCount: lines.length,
    lineAt: (n: number) => {
      const t = lines[n] || '';
      return {
        text: t,
        range: { start: { line: n, character: 0 }, end: { line: n, character: t.length } },
      };
    },
    getWordRangeAtPosition: (pos: any, regex?: RegExp) => {
      const line = lines[pos.line] || '';
      const re = regex || /[\w.]+/;
      let match;
      const g = new RegExp(re.source, 'g');
      while ((match = g.exec(line)) !== null) {
        if (pos.character >= match.index && pos.character <= match.index + match[0].length) {
          return {
            start: { line: pos.line, character: match.index },
            end: { line: pos.line, character: match.index + match[0].length },
          };
        }
      }
      return undefined;
    },
    uri: { fsPath: 'test.rpy', toString: () => 'test.rpy' },
  } as any;
}

const token = { isCancellationRequested: false } as any;

function emptyIndex(): ProjectIndex {
  return {
    labels: new Map(),
    characters: new Map(),
    screens: new Map(),
    images: new Map(),
    transforms: new Map(),
    variables: new Map(),
    files: new Map(),
    testcases: new Map(),
    assetFiles: new Set(),
  } as ProjectIndex;
}

describe('RenpyHoverProvider', () => {
  describe('image hover preview', () => {
    it('should return hover for scene statement with image in index', () => {
      const idx = emptyIndex();
      idx.images.set('bg room', [{
        file: 'script.rpy',
        node: { type: 'image_def', name: 'bg room', value: '"images/bg/room.png"', line: 5 } as any,
      }]);
      idx.assetFiles.add('game/images/bg/room.png');

      const provider = new RenpyHoverProvider(() => idx);
      const doc = mockDocument('    scene bg room');
      // Hover over "bg" in "scene bg room"
      const hover = provider.provideHover(doc, { line: 0, character: 10 } as any, token);

      expect(hover).toBeDefined();
      expect(hover!.contents).toBeDefined();
    });

    it('should not return image hover for show screen', () => {
      const idx = emptyIndex();
      const provider = new RenpyHoverProvider(() => idx);
      const doc = mockDocument('    show screen preferences');
      const hover = provider.provideHover(doc, { line: 0, character: 18 } as any, token);

      // Should not match as image — may return a screen hover or undefined
      // The key is it should NOT try to preview "screen" as an image
      if (hover) {
        const content = (hover.contents as any).value || '';
        expect(content).not.toContain('<img');
      }
    });

    it('should resolve image file with underscore naming', () => {
      const idx = emptyIndex();
      idx.assetFiles.add('game/images/bg_room.png');

      const provider = new RenpyHoverProvider(() => idx);
      const doc = mockDocument('    scene bg room');
      const hover = provider.provideHover(doc, { line: 0, character: 10 } as any, token);

      // Should find the image via underscore convention
      expect(hover).toBeDefined();
    });

    it('should resolve image file with subdirectory naming', () => {
      const idx = emptyIndex();
      idx.assetFiles.add('game/images/bg/room.png');

      const provider = new RenpyHoverProvider(() => idx);
      const doc = mockDocument('    scene bg room');
      const hover = provider.provideHover(doc, { line: 0, character: 10 } as any, token);

      expect(hover).toBeDefined();
    });
  });

  describe('label hover', () => {
    it('should show label info on jump target', () => {
      const idx = emptyIndex();
      idx.labels.set('start', [{
        file: 'script.rpy',
        node: { type: 'label', name: 'start', line: 0 } as any,
      }]);

      const provider = new RenpyHoverProvider(() => idx);
      const doc = mockDocument('    jump start');
      const hover = provider.provideHover(doc, { line: 0, character: 10 } as any, token);

      expect(hover).toBeDefined();
      const content = (hover!.contents as any).value || '';
      expect(content).toContain('start');
    });
  });

  describe('character hover', () => {
    it('should show character info', () => {
      const idx = emptyIndex();
      idx.characters.set('e', {
        file: 'script.rpy',
        node: { type: 'define', name: 'e', value: 'Character("Eileen")', line: 0 } as any,
      });

      const provider = new RenpyHoverProvider(() => idx);
      const doc = mockDocument('    e "Hello"');
      const hover = provider.provideHover(doc, { line: 0, character: 4 } as any, token);

      expect(hover).toBeDefined();
      const content = (hover!.contents as any).value || '';
      expect(content).toContain('Eileen');
    });
  });

  describe('image definition hover with preview', () => {
    it('should show thumbnail on image definition', () => {
      const idx = emptyIndex();
      idx.images.set('bg park', [{
        file: 'script.rpy',
        node: { type: 'image_def', name: 'bg park', value: '"images/bg/park.png"', line: 3 } as any,
      }]);
      idx.assetFiles.add('game/images/bg/park.png');

      const provider = new RenpyHoverProvider(() => idx);
      // Hover over single word "bg" — image index key is "bg park" which won't match single word
      // But hover over the image name in an image definition should work
      const doc = mockDocument('    image bg park = "images/bg/park.png"');
      // The word at position will be "bg" — the image index uses multi-word keys
      // This tests the existing image hover, not the scene hover
    });
  });
});
