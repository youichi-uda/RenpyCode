/**
 * Unit tests for RenpyDiagnosticsProvider.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { RenpyDiagnosticsProvider, DiagnosticsConfig } from '../src/language/diagnostics';
import { ProjectIndex } from '../src/parser/types';

// ── Helpers ──────────────────────────────────────────────────

function mockDocument(text: string) {
  const lines = text.split(/\r?\n/);
  return {
    getText: () => text,
    lineCount: lines.length,
    lineAt: (n: number) => ({ text: lines[n] || '' }),
    uri: vscode.Uri.file('test.rpy'),
  } as any;
}

function allEnabled(): DiagnosticsConfig {
  return {
    enable: true,
    undefinedLabel: true,
    undefinedCharacter: true,
    invalidJump: true,
    indentation: true,
    unusedLabel: true,
    missingResource: true,
    unreachableCode: true,
  };
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

// ── Tests ────────────────────────────────────────────────────

describe('RenpyDiagnosticsProvider', () => {
  let config: DiagnosticsConfig;
  let index: ProjectIndex;
  let provider: RenpyDiagnosticsProvider;

  beforeEach(() => {
    config = allEnabled();
    index = emptyIndex();
    provider = new RenpyDiagnosticsProvider(
      () => index,
      () => config,
    );
  });

  function getDiagnostics(text: string): vscode.Diagnostic[] {
    const doc = mockDocument(text);
    provider.analyzeDocument(doc);
    return (provider.collection as any)._map.get(doc.uri.toString()) || [];
  }

  // 1. Undefined label warning on `jump nonexistent`
  it('reports undefined label on jump to non-existent label', () => {
    index.labels = new Map();
    const diags = getDiagnostics('label start:\n    jump nonexistent');
    const labelDiag = diags.find(d => d.message.includes("Undefined label 'nonexistent'"));
    expect(labelDiag).toBeDefined();
    expect(labelDiag!.severity).toBe(vscode.DiagnosticSeverity.Warning);
  });

  // 2. Undefined character warning on `unknown_char "Hello"`
  it('reports undefined character for unknown speaker', () => {
    const diags = getDiagnostics('label start:\n    unknown_char "Hello"');
    const charDiag = diags.find(d => d.message.includes("Undefined character 'unknown_char'"));
    expect(charDiag).toBeDefined();
    expect(charDiag!.severity).toBe(vscode.DiagnosticSeverity.Warning);
  });

  // 3. No warning for defined character
  it('does not warn for a defined character', () => {
    index.characters.set('eileen', { file: 'test.rpy', node: {} as any });
    const diags = getDiagnostics('label start:\n    eileen "Hello"');
    const charDiag = diags.find(d => d.message.includes('Undefined character'));
    expect(charDiag).toBeUndefined();
  });

  // 4. Missing image warning on `show fake_image`
  it('reports missing image on show with unknown image', () => {
    const diags = getDiagnostics('label start:\n    show fake_image');
    const imgDiag = diags.find(d => d.message.includes("'fake_image' is not defined"));
    expect(imgDiag).toBeDefined();
    expect(imgDiag!.severity).toBe(vscode.DiagnosticSeverity.Warning);
  });

  // 5. Missing audio warning on `play music "nonexistent.ogg"`
  it('reports missing resource on play with non-existent audio file', () => {
    const diags = getDiagnostics('label start:\n    play music "nonexistent.ogg"');
    const resDiag = diags.find(d => d.message.includes("'nonexistent.ogg' not found"));
    expect(resDiag).toBeDefined();
    expect(resDiag!.severity).toBe(vscode.DiagnosticSeverity.Warning);
  });

  // 6. Unreachable code hint after jump
  it('reports unreachable code after jump', () => {
    const diags = getDiagnostics('label start:\n    jump somewhere\n    "This is unreachable"');
    // The jump itself may produce an undefined-label warning; filter for unreachable
    const unreachDiag = diags.find(d => d.message.includes('Unreachable code'));
    expect(unreachDiag).toBeDefined();
    expect(unreachDiag!.severity).toBe(vscode.DiagnosticSeverity.Hint);
  });

  // 7. Unused label hint for unreferenced label
  it('reports unused label for a label never referenced', () => {
    // Provide a parsed file in the index so collectLabelRefs can scan it
    index.files.set('test.rpy', {
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
    });

    const diags = getDiagnostics('label orphan_label:\n    "Hello"');
    const unusedDiag = diags.find(d => d.message.includes("'orphan_label' is never referenced"));
    expect(unusedDiag).toBeDefined();
    expect(unusedDiag!.severity).toBe(vscode.DiagnosticSeverity.Hint);
  });

  // 8. No false positives inside screen blocks
  it('does not flag dialogue-like lines inside screen blocks', () => {
    index.characters = new Map(); // no characters defined
    const diags = getDiagnostics('screen myscreen():\n    textbutton "Hello"');
    const charDiag = diags.find(d => d.message.includes('Undefined character'));
    expect(charDiag).toBeUndefined();
  });

  // 9. Special labels (start) not flagged as unused
  it('does not flag special labels like start as unused', () => {
    index.files.set('test.rpy', {
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
    });

    const diags = getDiagnostics('label start:\n    "Hello"');
    const unusedDiag = diags.find(d => d.message.includes("'start' is never referenced"));
    expect(unusedDiag).toBeUndefined();
  });

  // 10. Config disable suppresses all diagnostics
  it('produces no diagnostics when config.enable is false', () => {
    config.enable = false;
    const diags = getDiagnostics('jump nonexistent\nunknown_char "Hello"');
    expect(diags).toHaveLength(0);
  });

  // 11. Individual config flags work
  it('suppresses undefined label warnings when undefinedLabel is false', () => {
    config.undefinedLabel = false;
    const diags = getDiagnostics('label start:\n    jump nonexistent');
    const labelDiag = diags.find(d => d.message.includes('Undefined label'));
    expect(labelDiag).toBeUndefined();
  });

  it('suppresses undefined character warnings when undefinedCharacter is false', () => {
    config.undefinedCharacter = false;
    const diags = getDiagnostics('label start:\n    unknown_char "Hello"');
    const charDiag = diags.find(d => d.message.includes('Undefined character'));
    expect(charDiag).toBeUndefined();
  });

  it('suppresses missing resource warnings when missingResource is false', () => {
    config.missingResource = false;
    const diags = getDiagnostics('label start:\n    show fake_image');
    const imgDiag = diags.find(d => d.message.includes('is not defined'));
    expect(imgDiag).toBeUndefined();
  });

  it('suppresses unreachable code hints when unreachableCode is false', () => {
    config.unreachableCode = false;
    const diags = getDiagnostics('label start:\n    jump somewhere\n    "Unreachable"');
    const unreachDiag = diags.find(d => d.message.includes('Unreachable code'));
    expect(unreachDiag).toBeUndefined();
  });

  it('suppresses unused label hints when unusedLabel is false', () => {
    config.unusedLabel = false;
    index.files.set('test.rpy', {
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
    });

    const diags = getDiagnostics('label orphan_label:\n    "Hello"');
    const unusedDiag = diags.find(d => d.message.includes('is never referenced'));
    expect(unusedDiag).toBeUndefined();
  });

  // Additional: no warning when label exists in index
  it('does not warn for jump to existing label', () => {
    index.labels.set('chapter2', [{ file: 'other.rpy', node: {} as any }]);
    const diags = getDiagnostics('label start:\n    jump chapter2');
    const labelDiag = diags.find(d => d.message.includes('Undefined label'));
    expect(labelDiag).toBeUndefined();
  });

  // Additional: no warning when image exists in index
  it('does not warn for show with a defined image', () => {
    index.images.set('eileen', [{ file: 'images.rpy', node: {} as any }]);
    const diags = getDiagnostics('label start:\n    show eileen happy');
    const imgDiag = diags.find(d => d.message.includes('is not defined'));
    expect(imgDiag).toBeUndefined();
  });

  // Additional: no warning when audio file exists in asset set
  it('does not warn for play with existing audio file', () => {
    index.assetFiles.add('audio/music.ogg');
    const diags = getDiagnostics('label start:\n    play music "audio/music.ogg"');
    const resDiag = diags.find(d => d.message.includes('not found'));
    expect(resDiag).toBeUndefined();
  });

  // Additional: character defined as variable should not warn
  it('does not warn for character defined as a variable', () => {
    index.variables.set('pov', { file: 'test.rpy', node: {} as any });
    const diags = getDiagnostics('label start:\n    pov "Hello"');
    const charDiag = diags.find(d => d.message.includes('Undefined character'));
    expect(charDiag).toBeUndefined();
  });

  // Additional: labels starting with underscore not flagged as unused
  it('does not flag labels starting with underscore as unused', () => {
    index.files.set('test.rpy', {
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
    });

    const diags = getDiagnostics('label _internal:\n    "Hello"');
    const unusedDiag = diags.find(d => d.message.includes('is never referenced'));
    expect(unusedDiag).toBeUndefined();
  });
});
