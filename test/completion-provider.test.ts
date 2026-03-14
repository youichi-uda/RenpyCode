import { describe, it, expect } from 'vitest';
import { RenpyCompletionProvider } from '../src/language/completion-provider';
import { Position, CompletionItemKind, CompletionList } from 'vscode';
import { ProjectIndex } from '../src/parser/types';

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
    uri: { fsPath: 'test.rpy', toString: () => 'test.rpy' },
  } as any;
}

const token = { isCancellationRequested: false } as any;
const defaultContext = { triggerKind: 0 } as any;

/** Extract items from CompletionList */
function getItems(result: CompletionList) {
  return result.items;
}

function emptyIndex(): ProjectIndex {
  return {
    labels: new Map(),
    characters: new Map(),
    screens: new Map(),
    images: new Map(),
    transforms: new Map(),
    variables: new Map(),
    files: new Map(),
    assetFiles: new Set(),
  } as ProjectIndex;
}

function indexWithLabels(...names: string[]): ProjectIndex {
  const idx = emptyIndex();
  for (const name of names) {
    idx.labels.set(name, [{ file: 'script.rpy', node: { line: 0, type: 'label', value: name } }]);
  }
  return idx;
}

function indexWithCharacters(...entries: [string, string][]): ProjectIndex {
  const idx = emptyIndex();
  for (const [name, charDef] of entries) {
    idx.characters.set(name, { file: 'script.rpy', node: { line: 0, type: 'define', value: charDef } });
  }
  return idx;
}

function indexWithScreens(...names: string[]): ProjectIndex {
  const idx = emptyIndex();
  for (const name of names) {
    idx.screens.set(name, [{ file: 'script.rpy', node: { line: 0, type: 'screen', value: name } }]);
  }
  return idx;
}

function indexWithImages(...names: string[]): ProjectIndex {
  const idx = emptyIndex();
  for (const name of names) {
    idx.images.set(name, [{ file: 'script.rpy', node: { line: 0, type: 'image', value: name } }]);
  }
  return idx;
}

function indexWithTransforms(...names: string[]): ProjectIndex {
  const idx = emptyIndex();
  for (const name of names) {
    idx.transforms.set(name, { file: 'script.rpy', node: { line: 0, type: 'transform', value: name } });
  }
  return idx;
}

describe('RenpyCompletionProvider', () => {
  describe('label completions', () => {
    it('returns labels after "jump "', () => {
      const idx = indexWithLabels('start', 'chapter1', 'ending');
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    jump s');
      const pos = new Position(0, 10);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      const names = items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

      expect(names).toContain('start');
      expect(names).toContain('chapter1');
      expect(names).toContain('ending');
      expect(items.every(i => i.kind === CompletionItemKind.Function)).toBe(true);
    });

    it('returns labels after "call "', () => {
      const idx = indexWithLabels('start', 'helper');
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    call h');
      const pos = new Position(0, 10);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      const names = items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

      expect(names).toContain('start');
      expect(names).toContain('helper');
    });

    it('returns labels after "jump " with no partial typed', () => {
      const idx = indexWithLabels('start');
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('jump s');
      const pos = new Position(0, 6);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      expect(items.map(i => typeof i.label === 'string' ? i.label : i.label.label)).toContain('start');
    });
  });

  describe('character completions', () => {
    it('returns characters on indented line with partial word', () => {
      const idx = indexWithCharacters(
        ['e', 'Character("Eileen", color="#c8ffc8")'],
        ['s', 'Character("Sylvie")'],
      );
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('label start:\n    e');
      const pos = new Position(1, 5);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      const names = items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

      expect(names).toContain('e');
      expect(names).toContain('s');
      // Character items have detail containing character name
      const charItems = items.filter(i => i.kind === CompletionItemKind.Variable);
      expect(charItems.length).toBe(2);
    });

    it('includes statement completions alongside characters on indented line', () => {
      const idx = indexWithCharacters(['e', 'Character("Eileen")']);
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('label start:\n    s');
      const pos = new Position(1, 5);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      // Should include both character completions and statement completions
      const hasKeywords = items.some(i => i.kind === CompletionItemKind.Keyword);
      expect(hasKeywords).toBe(true);
    });

    it('does not return characters on line starting with $', () => {
      const idx = indexWithCharacters(['e', 'Character("Eileen")']);
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    $ foo');
      const pos = new Position(0, 9);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      const charItems = items.filter(i => i.kind === CompletionItemKind.Variable);
      expect(charItems.length).toBe(0);
    });
  });

  describe('screen completions', () => {
    it('returns screens after "show screen "', () => {
      const idx = indexWithScreens('main_menu', 'preferences', 'save');
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    show screen m');
      const pos = new Position(0, 17);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      const names = items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

      expect(names).toContain('main_menu');
      expect(names).toContain('preferences');
      expect(names).toContain('save');
      expect(items.every(i => i.kind === CompletionItemKind.Struct)).toBe(true);
    });

    it('returns screens after "call screen "', () => {
      const idx = indexWithScreens('confirm');
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    call screen c');
      const pos = new Position(0, 17);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      expect(items.map(i => typeof i.label === 'string' ? i.label : i.label.label)).toContain('confirm');
    });

    it('returns screens after "use "', () => {
      const idx = indexWithScreens('navigation');
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    use n');
      const pos = new Position(0, 9);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      expect(items.map(i => typeof i.label === 'string' ? i.label : i.label.label)).toContain('navigation');
    });
  });

  describe('image completions', () => {
    it('returns images after "show "', () => {
      const idx = indexWithImages('eileen happy', 'sylvie normal');
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    show e');
      const pos = new Position(0, 10);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      const names = items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

      expect(names).toContain('eileen happy');
      expect(names).toContain('sylvie normal');
      expect(names).toContain('screen'); // "show screen <name>" keyword
      const imageItems = items.filter(i => i.kind === CompletionItemKind.Color);
      expect(imageItems.length).toBe(2);
    });

    it('returns images after "scene "', () => {
      const idx = indexWithImages('bg meadow');
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    scene b');
      const pos = new Position(0, 11);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      expect(items.map(i => typeof i.label === 'string' ? i.label : i.label.label)).toContain('bg meadow');
    });
  });

  describe('transform completions', () => {
    it('returns built-in and user transforms after "at "', () => {
      const idx = indexWithTransforms('my_transform');
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    show eileen at m');
      const pos = new Position(0, 20);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      const names = items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

      // Built-in transforms
      expect(names).toContain('center');
      expect(names).toContain('left');
      expect(names).toContain('right');
      // User transform
      expect(names).toContain('my_transform');
    });
  });

  describe('transition completions', () => {
    it('returns transitions after "with "', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    with d');
      const pos = new Position(0, 10);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      // Should return transition items from RENPY_STATEMENTS
      expect(items.length).toBeGreaterThan(0);
      expect(items.every(i => i.kind === CompletionItemKind.Constant)).toBe(true);
    });
  });

  describe('statement completions', () => {
    it('returns statement keywords at line start', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('la');
      const pos = new Position(0, 2);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      const names = items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

      expect(names).toContain('label');
      expect(items.every(i => i.kind === CompletionItemKind.Keyword)).toBe(true);
    });

    it('returns statement keywords on empty line', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('');
      const pos = new Position(0, 0);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      expect(items.length).toBeGreaterThan(0);
      expect(items.every(i => i.kind === CompletionItemKind.Keyword)).toBe(true);
    });

    it('filters statements by typed prefix', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('sh');
      const pos = new Position(0, 2);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      const names = items.map(i => typeof i.label === 'string' ? i.label : i.label.label);

      expect(names).toContain('show');
      expect(names).not.toContain('label');
      expect(names).not.toContain('jump');
    });
  });

  describe('no completions', () => {
    it('returns empty list for unrecognized context', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    "Hello world"');
      const pos = new Position(0, 17);

      const result = provider.provideCompletionItems(doc, pos, token, defaultContext);
      expect(result.items).toEqual([]);
    });

    it('returns no labels from empty index', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    jump s');
      const pos = new Position(0, 10);

      const result = provider.provideCompletionItems(doc, pos, token, defaultContext);
      expect(result.items).toEqual([]);
    });

    it('returns no characters from empty index', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('label start:\n    e');
      const pos = new Position(1, 5);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      // Should still get statement completions, but no character completions
      const charItems = items.filter(i => i.kind === CompletionItemKind.Variable);
      expect(charItems).toEqual([]);
    });

    it('returns no screens from empty index', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    show screen m');
      const pos = new Position(0, 17);

      const result = provider.provideCompletionItems(doc, pos, token, defaultContext);
      expect(result.items).toEqual([]);
    });
  });

  describe('action completions', () => {
    it('returns actions after "action "', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('        action S');
      const pos = new Position(0, 16);

      const items = getItems(provider.provideCompletionItems(doc, pos, token, defaultContext));
      expect(items.length).toBeGreaterThan(0);
      expect(items.every(i => i.kind === CompletionItemKind.Function)).toBe(true);
    });
  });

  describe('CompletionList behavior', () => {
    it('always returns CompletionList with isIncomplete=true', () => {
      const idx = emptyIndex();
      const provider = new RenpyCompletionProvider(() => idx);
      const doc = mockDocument('    ');
      const pos = new Position(0, 4);

      const result = provider.provideCompletionItems(doc, pos, token, defaultContext);
      expect(result).toBeInstanceOf(CompletionList);
      expect(result.isIncomplete).toBe(true);
    });
  });
});
