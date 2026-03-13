import { describe, it, expect } from 'vitest';
import { RenpyLinkProvider } from '../src/language/link-provider';
import { Uri, workspace } from 'vscode';

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

describe('RenpyLinkProvider', () => {
  const provider = new RenpyLinkProvider();

  // Set up a mock workspace folder for all tests
  const originalFolders = workspace.workspaceFolders;

  function withWorkspace(fn: () => void) {
    (workspace as any).workspaceFolders = [{ uri: new Uri('/project') }];
    try {
      fn();
    } finally {
      (workspace as any).workspaceFolders = originalFolders;
    }
  }

  it('detects image paths like "images/bg.png"', () => {
    withWorkspace(() => {
      const doc = mockDocument('image bg = "images/bg.png"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(1);
      expect(links[0].target!.fsPath).toContain('game/images/bg.png');
    });
  });

  it('detects .jpg image paths', () => {
    withWorkspace(() => {
      const doc = mockDocument('image bg = "images/bg.jpg"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(1);
    });
  });

  it('detects .webp image paths', () => {
    withWorkspace(() => {
      const doc = mockDocument('image bg = "images/bg.webp"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(1);
    });
  });

  it('detects audio paths like "audio/bgm.ogg"', () => {
    withWorkspace(() => {
      const doc = mockDocument('play music "audio/bgm.ogg"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(1);
      expect(links[0].target!.fsPath).toContain('game/audio/bgm.ogg');
    });
  });

  it('detects .mp3 audio paths', () => {
    withWorkspace(() => {
      const doc = mockDocument('play sound "sfx/click.mp3"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(1);
    });
  });

  it('detects .rpy file paths', () => {
    withWorkspace(() => {
      const doc = mockDocument('# see "screens/main_menu.rpy"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(1);
      expect(links[0].target!.fsPath).toContain('game/screens/main_menu.rpy');
    });
  });

  it('returns no links for non-matching extensions', () => {
    withWorkspace(() => {
      const doc = mockDocument('"hello.txt" "data.json" "notes.md"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(0);
    });
  });

  it('detects multiple links in the same document', () => {
    withWorkspace(() => {
      const doc = mockDocument(
        'image bg = "images/bg.png"\nplay music "audio/bgm.ogg"\nimage fg = "images/fg.jpg"',
      );
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(3);
    });
  });

  it('detects multiple links on the same line', () => {
    withWorkspace(() => {
      const doc = mockDocument('"a.png" "b.ogg"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(2);
    });
  });

  it('returns empty when no workspace folders', () => {
    (workspace as any).workspaceFolders = [];
    const doc = mockDocument('image bg = "images/bg.png"');
    const links = provider.provideDocumentLinks(doc, token);

    expect(links.length).toBe(0);
    (workspace as any).workspaceFolders = originalFolders;
  });

  it('skips paths with interpolation brackets', () => {
    withWorkspace(() => {
      const doc = mockDocument('"images/[name].png"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(0);
    });
  });

  it('skips paths with curly braces', () => {
    withWorkspace(() => {
      const doc = mockDocument('"images/{name}.png"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(0);
    });
  });

  it('link range starts after the opening quote', () => {
    withWorkspace(() => {
      const doc = mockDocument('"bg.png"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(1);
      // The range should start at column 1 (after the opening quote)
      expect(links[0].range.startCharacter).toBe(1);
      // And end at column 7 (length of "bg.png")
      expect(links[0].range.endCharacter).toBe(7);
    });
  });

  it('detects video file extensions', () => {
    withWorkspace(() => {
      const doc = mockDocument('"video/intro.mp4" "video/cut.webm" "video/scene.ogv"');
      const links = provider.provideDocumentLinks(doc, token);

      expect(links.length).toBe(3);
    });
  });
});
