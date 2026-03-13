import { describe, it, expect } from 'vitest';
import { RenpyCodeActionProvider } from '../src/language/codeaction-provider';
import { CodeActionKind, Diagnostic, DiagnosticSeverity, Range } from 'vscode';

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

function emptyIndex() {
  return {
    files: new Map(),
    labels: new Map(),
    screens: new Map(),
    characters: new Map(),
    images: new Map(),
  };
}

describe('RenpyCodeActionProvider', () => {
  const provider = new RenpyCodeActionProvider(() => emptyIndex() as any);

  it('returns "Create label" action for undefined label diagnostic', () => {
    const doc = mockDocument('jump myLabel');
    const diag = new Diagnostic(
      new Range(0, 5, 0, 12),
      "Undefined label 'myLabel'",
      DiagnosticSeverity.Error,
    );
    const context = { diagnostics: [diag] } as any;
    const actions = provider.provideCodeActions(doc, new Range(0, 0, 0, 0), context, token);

    expect(actions.length).toBe(1);
    expect(actions[0].title).toBe("Create label 'myLabel'");
    expect(actions[0].kind).toBe(CodeActionKind.QuickFix);
    expect(actions[0].edit).toBeDefined();
  });

  it('returns "Define character" action for undefined character diagnostic', () => {
    const doc = mockDocument('e "Hello"');
    const diag = new Diagnostic(
      new Range(0, 0, 0, 1),
      "Undefined character 'e'",
      DiagnosticSeverity.Warning,
    );
    const context = { diagnostics: [diag] } as any;
    const actions = provider.provideCodeActions(doc, new Range(0, 0, 0, 0), context, token);

    expect(actions.length).toBe(1);
    expect(actions[0].title).toBe("Define character 'e'");
    expect(actions[0].kind).toBe(CodeActionKind.QuickFix);
    expect(actions[0].edit).toBeDefined();
  });

  it('inserts character define after existing defines and comments', () => {
    const doc = mockDocument('define s = Character("Sylvie")\n\nlabel start:\n    s "Hi"');
    const diag = new Diagnostic(
      new Range(3, 4, 3, 5),
      "Undefined character 'e'",
      DiagnosticSeverity.Warning,
    );
    const context = { diagnostics: [diag] } as any;
    const actions = provider.provideCodeActions(doc, new Range(0, 0, 0, 0), context, token);

    expect(actions.length).toBe(1);
    // The edit inserts after the blank line (line 1), so at line 2
    const entries = actions[0].edit!.entries();
    expect(entries.length).toBe(1);
    // The inserted text should capitalize the display name
    expect(entries[0].newText).toContain('Character("E")');
  });

  it('returns empty for diagnostics without matching patterns', () => {
    const doc = mockDocument('show eileen happy');
    const diag = new Diagnostic(
      new Range(0, 0, 0, 17),
      'Some other warning',
      DiagnosticSeverity.Warning,
    );
    const context = { diagnostics: [diag] } as any;
    const actions = provider.provideCodeActions(doc, new Range(0, 0, 0, 0), context, token);

    expect(actions.length).toBe(0);
  });

  it('returns no actions when no diagnostics', () => {
    const doc = mockDocument('label start:\n    "Hello"');
    const context = { diagnostics: [] } as any;
    const actions = provider.provideCodeActions(doc, new Range(0, 0, 0, 0), context, token);

    expect(actions.length).toBe(0);
  });

  it('returns both label and character actions for multiple diagnostics', () => {
    const doc = mockDocument('jump myLabel\ne "Hello"');
    const diag1 = new Diagnostic(
      new Range(0, 5, 0, 12),
      "Undefined label 'myLabel'",
      DiagnosticSeverity.Error,
    );
    const diag2 = new Diagnostic(
      new Range(1, 0, 1, 1),
      "Undefined character 'e'",
      DiagnosticSeverity.Warning,
    );
    const context = { diagnostics: [diag1, diag2] } as any;
    const actions = provider.provideCodeActions(doc, new Range(0, 0, 0, 0), context, token);

    expect(actions.length).toBe(2);
    expect(actions[0].title).toBe("Create label 'myLabel'");
    expect(actions[1].title).toBe("Define character 'e'");
  });
});
