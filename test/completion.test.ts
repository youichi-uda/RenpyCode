import { describe, it, expect } from 'vitest';
import { Parser } from '../src/parser/parser';
import { ProjectIndex, CHARACTER_DEF_RE } from '../src/parser/types';
import { RenpyCompletionProvider } from '../src/language/completion-provider';
import * as vscode from 'vscode';

// ── Test helpers ──

function createIndex(text: string, file = 'game/script.rpy'): ProjectIndex {
  const parser = new Parser(file);
  const parsed = parser.parse(text);
  const index: ProjectIndex = {
    files: new Map([[file, parsed]]),
    labels: new Map(),
    screens: new Map(),
    characters: new Map(),
    images: new Map(),
    transforms: new Map(),
    variables: new Map(),
    testcases: new Map(),
    assetFiles: new Set(),
  };

  for (const [name, node] of parsed.labels) {
    index.labels.set(name, [{ file, node }]);
  }
  for (const [name, node] of parsed.characters) {
    index.characters.set(name, { file, node });
  }
  for (const [name, node] of parsed.screens) {
    index.screens.set(name, [{ file, node }]);
  }
  for (const [name, node] of parsed.images) {
    index.images.set(name, [{ file, node }]);
  }
  for (const [name, node] of parsed.transforms) {
    index.transforms.set(name, { file, node });
  }

  return index;
}

/** Create a mock TextDocument from a multi-line string */
function makeDocument(text: string) {
  const lines = text.split('\n');
  return {
    lineAt(line: number) {
      return { text: lines[line] || '' };
    },
    languageId: 'renpy',
    uri: vscode.Uri.file('test.rpy'),
  } as unknown as vscode.TextDocument;
}

/** Get completion items at a specific line and column */
function getCompletions(
  provider: RenpyCompletionProvider,
  text: string,
  line: number,
  character: number,
): vscode.CompletionItem[] {
  const doc = makeDocument(text);
  const position = new vscode.Position(line, character);
  const result = provider.provideCompletionItems(
    doc,
    position,
    { isCancellationRequested: false } as vscode.CancellationToken,
    { triggerKind: 0 } as vscode.CompletionContext,
  );
  // Support both CompletionList and CompletionItem[] return
  if ('items' in result) {
    return result.items;
  }
  return result as vscode.CompletionItem[];
}

function labels(items: vscode.CompletionItem[]): string[] {
  return items.map(i => typeof i.label === 'string' ? i.label : i.label.label);
}

// ── Shared test fixture ──

const FULL_SCRIPT = [
  'define s = Character(_("Sylvie"), color="#c8ffc8")',      // 0
  'define m = Character(_("Me"), color="#c8c8ff")',           // 1
  'define e = Character("Eileen")',                           // 2
  '',                                                         // 3
  'image bg room = "bg/room.png"',                            // 4
  'image bg park = "bg/park.png"',                            // 5
  '',                                                         // 6
  'transform fade_in:',                                       // 7
  '    alpha 0.0',                                            // 8
  '    linear 1.0 alpha 1.0',                                 // 9
  '',                                                         // 10
  'screen test_screen():',                                    // 11
  '    text "Hello"',                                         // 12
  '    textbutton "Click" action Return()',                   // 13
  '',                                                         // 14
  'label start:',                                             // 15
  '    scene bg room',                                        // 16
  '    show eileen happy',                                    // 17
  '    s "Hello!"',                                           // 18
  '    jump rightaway',                                       // 19
  '',                                                         // 20
  'label rightaway:',                                         // 21
  '    s "Let\'s go."',                                       // 22
  '    call later',                                           // 23
  '    return',                                                // 24
  '',                                                         // 25
  'label later:',                                             // 26
  '    e "Goodbye!"',                                         // 27
  '    return',                                                // 28
].join('\n');

const fullIndex = createIndex(FULL_SCRIPT);
const provider = new RenpyCompletionProvider(() => fullIndex);

// ══════════════════════════════════════════════════════════════
// A. Character definition parsing
// ══════════════════════════════════════════════════════════════

describe('Character definition parsing', () => {
  it('CHARACTER_DEF_RE matches Character("...")', () => {
    expect(CHARACTER_DEF_RE.test('Character("Eileen")')).toBe(true);
  });

  it('CHARACTER_DEF_RE matches Character(_("..."))', () => {
    expect(CHARACTER_DEF_RE.test('Character(_("Sylvie"), color="#c8ffc8")')).toBe(true);
  });

  it('parses Character("Name") define', () => {
    const parser = new Parser('test.rpy');
    const result = parser.parse('define e = Character("Eileen", color="#c8ffc8")');
    expect(result.characters.has('e')).toBe(true);
  });

  it('parses Character(_("Name")) define', () => {
    const parser = new Parser('test.rpy');
    const result = parser.parse('define s = Character(_("Sylvie"), color="#c8ffc8")');
    expect(result.characters.has('s')).toBe(true);
  });

  it('parses multiple characters', () => {
    expect(fullIndex.characters.size).toBe(3);
    expect(fullIndex.characters.has('s')).toBe(true);
    expect(fullIndex.characters.has('m')).toBe(true);
    expect(fullIndex.characters.has('e')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// B. Index integrity
// ══════════════════════════════════════════════════════════════

describe('Index integrity', () => {
  it('indexes all labels', () => {
    expect(fullIndex.labels.has('start')).toBe(true);
    expect(fullIndex.labels.has('rightaway')).toBe(true);
    expect(fullIndex.labels.has('later')).toBe(true);
  });

  it('indexes screens', () => {
    expect(fullIndex.screens.has('test_screen')).toBe(true);
  });

  it('indexes images', () => {
    expect(fullIndex.images.has('bg room')).toBe(true);
    expect(fullIndex.images.has('bg park')).toBe(true);
  });

  it('indexes transforms', () => {
    expect(fullIndex.transforms.has('fade_in')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// C. Completion provider returns CompletionList
// ══════════════════════════════════════════════════════════════

describe('CompletionList behavior', () => {
  it('returns a CompletionList with isIncomplete=true', () => {
    const doc = makeDocument(FULL_SCRIPT);
    const position = new vscode.Position(18, 4);
    const result = provider.provideCompletionItems(
      doc,
      position,
      { isCancellationRequested: false } as vscode.CancellationToken,
      { triggerKind: 0 } as vscode.CompletionContext,
    );
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('isIncomplete', true);
  });
});

// ══════════════════════════════════════════════════════════════
// D. A-1: jump label completion
// ══════════════════════════════════════════════════════════════

describe('A-1: jump label completion', () => {
  // Simulate typing "    jump " at a new line inside label block
  const text = FULL_SCRIPT.replace('    jump rightaway', '    jump ');

  it('shows label names after "jump "', () => {
    const items = getCompletions(provider, text, 19, 9); // "    jump " = 9 chars
    const names = labels(items);
    expect(names).toContain('start');
    expect(names).toContain('rightaway');
    expect(names).toContain('later');
  });

  it('shows label names after "jump r" (partial)', () => {
    const partialText = FULL_SCRIPT.replace('    jump rightaway', '    jump r');
    const items = getCompletions(provider, partialText, 19, 10);
    const names = labels(items);
    expect(names).toContain('rightaway');
  });

  it('label items have Function kind', () => {
    const items = getCompletions(provider, text, 19, 9);
    expect(items.every(i => i.kind === vscode.CompletionItemKind.Function)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// E. A-2: call label completion
// ══════════════════════════════════════════════════════════════

describe('A-2: call label completion', () => {
  const text = FULL_SCRIPT.replace('    call later', '    call ');

  it('shows label names after "call "', () => {
    const items = getCompletions(provider, text, 23, 9);
    const names = labels(items);
    expect(names).toContain('start');
    expect(names).toContain('rightaway');
    expect(names).toContain('later');
  });
});

// ══════════════════════════════════════════════════════════════
// F. A-3: Character completion for dialogue
// ══════════════════════════════════════════════════════════════

describe('A-3: Character completion for dialogue', () => {
  it('shows characters when typing "    s" (indented word)', () => {
    // Replace line 18 with just "    s"
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    s');
    const items = getCompletions(provider, text, 18, 5); // "    s" = 5 chars
    const names = labels(items);
    expect(names).toContain('s');
    expect(names).toContain('m');
    expect(names).toContain('e');
  });

  it('shows characters on empty indented line "    "', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    ');
    const items = getCompletions(provider, text, 18, 4); // "    " = 4 chars
    const charItems = items.filter(i => i.kind === vscode.CompletionItemKind.Variable);
    expect(charItems.length).toBe(3); // s, m, e
  });

  it('character item has snippet insertText', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    s');
    const items = getCompletions(provider, text, 18, 5);
    const sItem = items.find(i => (typeof i.label === 'string' ? i.label : i.label.label) === 's');
    expect(sItem).toBeDefined();
    expect(sItem!.insertText).toBeInstanceOf(vscode.SnippetString);
    expect((sItem!.insertText as vscode.SnippetString).value).toBe('s "${1}"');
  });

  it('shows display name "Sylvie" for _("Sylvie") wrapped character', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    s');
    const items = getCompletions(provider, text, 18, 5);
    const sItem = items.find(i => (typeof i.label === 'string' ? i.label : i.label.label) === 's');
    expect(sItem!.detail).toContain('Sylvie');
  });

  it('shows display name "Me" for _("Me") wrapped character', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    m');
    const items = getCompletions(provider, text, 18, 5);
    const mItem = items.find(i => (typeof i.label === 'string' ? i.label : i.label.label) === 'm');
    expect(mItem!.detail).toContain('Me');
  });

  it('shows display name "Eileen" for Character("Eileen") (no wrapper)', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    e');
    const items = getCompletions(provider, text, 18, 5);
    const eItem = items.find(i => (typeof i.label === 'string' ? i.label : i.label.label) === 'e');
    expect(eItem!.detail).toContain('Eileen');
  });

  it('does NOT show characters on non-indented line', () => {
    // At top level (column 0), should show only statements
    const text = 'label start:\n    pass\ns';
    const items = getCompletions(provider, text, 2, 1);
    const charItems = items.filter(i => i.kind === vscode.CompletionItemKind.Variable);
    expect(charItems.length).toBe(0);
  });

  it('does NOT show characters after $ (python line)', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    $ something');
    const items = getCompletions(provider, text, 18, 15);
    // $ line should not trigger character completions
    const charItems = items.filter(i => i.kind === vscode.CompletionItemKind.Variable);
    expect(charItems.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════
// G. A-4: Screen name completion
// ══════════════════════════════════════════════════════════════

describe('A-4: Screen name completion', () => {
  it('shows screens after "show screen "', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    show screen ');
    const items = getCompletions(provider, text, 18, 16);
    const names = labels(items);
    expect(names).toContain('test_screen');
  });

  it('shows screens after "call screen "', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    call screen ');
    const items = getCompletions(provider, text, 18, 16);
    const names = labels(items);
    expect(names).toContain('test_screen');
  });

  it('shows screens after "use " (inside screen)', () => {
    // Inside a screen block: "    use "
    const text = FULL_SCRIPT.replace('    text "Hello"', '    use ');
    const items = getCompletions(provider, text, 12, 8);
    const names = labels(items);
    expect(names).toContain('test_screen');
  });
});

// ══════════════════════════════════════════════════════════════
// H. A-5: Statement completion
// ══════════════════════════════════════════════════════════════

describe('A-5: Statement completion', () => {
  it('shows statement keywords on empty indented line', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    ');
    const items = getCompletions(provider, text, 18, 4);
    const names = labels(items);
    expect(names).toContain('label');
    expect(names).toContain('scene');
    expect(names).toContain('show');
    expect(names).toContain('jump');
    expect(names).toContain('call');
    expect(names).toContain('menu');
    expect(names).toContain('if');
  });

  it('shows statements starting with "la" when typing "la"', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    la');
    const items = getCompletions(provider, text, 18, 6);
    const names = labels(items);
    expect(names).toContain('label');
  });

  it('statement items have Keyword kind', () => {
    const text = FULL_SCRIPT.replace('    s "Hello!"', '    ');
    const items = getCompletions(provider, text, 18, 4);
    const kwItems = items.filter(i => i.kind === vscode.CompletionItemKind.Keyword);
    expect(kwItems.length).toBeGreaterThan(0);
  });

  it('shows statements at top-level (no indent)', () => {
    const text = FULL_SCRIPT + '\n';
    const line = text.split('\n').length - 1;
    const items = getCompletions(provider, text, line, 0);
    const names = labels(items);
    expect(names).toContain('label');
    expect(names).toContain('define');
    expect(names).toContain('screen');
  });
});

// ══════════════════════════════════════════════════════════════
// I. Image completion (scene/show/hide)
// ══════════════════════════════════════════════════════════════

describe('Image completion', () => {
  it('shows images after "scene "', () => {
    const text = FULL_SCRIPT.replace('    scene bg room', '    scene ');
    const items = getCompletions(provider, text, 16, 10);
    const names = labels(items);
    expect(names).toContain('bg room');
    expect(names).toContain('bg park');
  });

  it('shows images after "show "', () => {
    const text = FULL_SCRIPT.replace('    show eileen happy', '    show ');
    const items = getCompletions(provider, text, 17, 9);
    const names = labels(items);
    expect(names).toContain('bg room');
  });
});

// ══════════════════════════════════════════════════════════════
// J. Transform completion (at)
// ══════════════════════════════════════════════════════════════

describe('Transform completion', () => {
  it('shows transforms after "at "', () => {
    // "    show eileen at " — trimmed = "show eileen at "
    const text = FULL_SCRIPT.replace('    show eileen happy', '    show eileen at ');
    const items = getCompletions(provider, text, 17, 19);
    const names = labels(items);
    expect(names).toContain('fade_in');
    // Built-in transforms
    expect(names).toContain('center');
    expect(names).toContain('left');
    expect(names).toContain('right');
  });
});

// ══════════════════════════════════════════════════════════════
// K. Edge cases
// ══════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('returns empty list for mid-dialogue text', () => {
    // Cursor in the middle of a dialogue string — should not suggest
    const items = getCompletions(provider, FULL_SCRIPT, 18, 10); // inside "Hello!"
    expect(items.length).toBe(0);
  });

  it('returns items for line with only whitespace', () => {
    const text = '    ';
    const fullText = 'label start:\n' + text;
    const items = getCompletions(provider, fullText, 1, 4);
    expect(items.length).toBeGreaterThan(0);
  });

  it('does not crash on empty document', () => {
    const items = getCompletions(provider, '', 0, 0);
    expect(items).toBeDefined();
  });

  it('handles tab indentation', () => {
    const text = 'label start:\n\ts';
    const items = getCompletions(provider, text, 1, 2);
    const charItems = items.filter(i => i.kind === vscode.CompletionItemKind.Variable);
    expect(charItems.length).toBe(3); // s, m, e
  });
});
