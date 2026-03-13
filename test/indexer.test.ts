import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectIndexer } from '../src/analyzer/project-indexer';

// Mock vscode.TextDocument for indexDocument()
function mockDocument(uri: string, text: string) {
  return {
    uri: { fsPath: uri, toString: () => uri },
    getText: () => text,
    languageId: 'renpy',
    lineAt: (n: number) => ({ text: text.split(/\r?\n/)[n] || '' }),
  } as any;
}

describe('ProjectIndexer', () => {
  let indexer: ProjectIndexer;

  beforeEach(() => {
    indexer = new ProjectIndexer();
  });

  it('starts with an empty index', () => {
    const idx = indexer.getIndex();
    expect(idx.files.size).toBe(0);
    expect(idx.labels.size).toBe(0);
    expect(idx.characters.size).toBe(0);
  });

  it('indexes labels from a document', () => {
    indexer.indexDocument(mockDocument('game/script.rpy', [
      'label start:',
      '    "Hello"',
      '',
      'label ending:',
      '    return',
    ].join('\n')));

    const idx = indexer.getIndex();
    expect(idx.labels.has('start')).toBe(true);
    expect(idx.labels.has('ending')).toBe(true);
    expect(idx.labels.get('start')![0].file).toBe('game/script.rpy');
  });

  it('indexes characters', () => {
    indexer.indexDocument(mockDocument('game/script.rpy',
      'define e = Character("Eileen", color="#c8ffc8")\ndefine s = Character("Sylvie")',
    ));

    const idx = indexer.getIndex();
    expect(idx.characters.has('e')).toBe(true);
    expect(idx.characters.has('s')).toBe(true);
  });

  it('indexes screens', () => {
    indexer.indexDocument(mockDocument('game/screens.rpy',
      'screen say(who, what):\n    text what',
    ));

    const idx = indexer.getIndex();
    expect(idx.screens.has('say')).toBe(true);
  });

  it('indexes images', () => {
    indexer.indexDocument(mockDocument('game/images.rpy',
      'image bg room = "bg/room.png"\nimage eileen happy = "eileen/happy.png"',
    ));

    const idx = indexer.getIndex();
    expect(idx.images.has('bg room')).toBe(true);
    expect(idx.images.has('eileen happy')).toBe(true);
  });

  it('indexes transforms', () => {
    indexer.indexDocument(mockDocument('game/transforms.rpy',
      'transform myslide(d=1.0):\n    ease d xalign 1.0',
    ));

    const idx = indexer.getIndex();
    expect(idx.transforms.has('myslide')).toBe(true);
  });

  it('indexes variables (define + default)', () => {
    indexer.indexDocument(mockDocument('game/vars.rpy',
      'define config.name = "My Game"\ndefault points = 0',
    ));

    const idx = indexer.getIndex();
    expect(idx.variables.has('config.name')).toBe(true);
    expect(idx.variables.has('points')).toBe(true);
  });

  it('indexes testcases', () => {
    indexer.indexDocument(mockDocument('game/tests.rpy',
      'testcase good_end:\n    "Go to the library"',
    ));

    const idx = indexer.getIndex();
    expect(idx.testcases.has('good_end')).toBe(true);
  });

  it('handles incremental re-index of same file', () => {
    indexer.indexDocument(mockDocument('game/script.rpy',
      'label start:\n    "Hello"',
    ));
    expect(indexer.getIndex().labels.has('start')).toBe(true);

    // Re-index same file with different content
    indexer.indexDocument(mockDocument('game/script.rpy',
      'label intro:\n    "Welcome"',
    ));

    const idx = indexer.getIndex();
    expect(idx.labels.has('intro')).toBe(true);
    expect(idx.labels.has('start')).toBe(false); // old label removed
    expect(idx.files.size).toBe(1);
  });

  it('handles multiple files', () => {
    indexer.indexDocument(mockDocument('game/script1.rpy',
      'label start:\n    jump chapter1',
    ));
    indexer.indexDocument(mockDocument('game/script2.rpy',
      'label chapter1:\n    return',
    ));

    const idx = indexer.getIndex();
    expect(idx.files.size).toBe(2);
    expect(idx.labels.size).toBe(2);
  });

  it('removes file cleanly', () => {
    indexer.indexDocument(mockDocument('game/script.rpy',
      'label start:\n    "Hello"\ndefine e = Character("Eileen")',
    ));

    expect(indexer.getIndex().labels.has('start')).toBe(true);
    expect(indexer.getIndex().characters.has('e')).toBe(true);

    indexer.removeFile('game/script.rpy');

    const idx = indexer.getIndex();
    expect(idx.files.size).toBe(0);
    expect(idx.labels.size).toBe(0);
    expect(idx.characters.size).toBe(0);
  });

  it('indexes a complex game script', () => {
    indexer.indexDocument(mockDocument('game/script.rpy', `
define e = Character("Eileen", color="#c8ffc8")
define s = Character("Sylvie")
default points = 0
default route = "none"

image bg room = "bg/room.png"

transform myslide:
    ease 1.0 xalign 1.0

screen stats_overlay:
    text "[points]"

label start:
    scene bg room
    show eileen happy at center
    e "Hello!"
    menu:
        "Say hi":
            $ points += 1
            jump good
        "Leave":
            jump bad

label good:
    e "Thanks!"
    return

label bad:
    e "Goodbye."
    return

testcase test_good:
    "Say hi"
`.trim()));

    const idx = indexer.getIndex();
    expect(idx.labels.size).toBe(3);
    expect(idx.characters.size).toBe(2);
    expect(idx.variables.size).toBeGreaterThanOrEqual(4); // 2 defines + 2 defaults
    expect(idx.images.size).toBe(1);
    expect(idx.transforms.size).toBe(1);
    expect(idx.screens.size).toBe(1);
    expect(idx.testcases.size).toBe(1);
  });
});
