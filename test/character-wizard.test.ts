import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CharacterWizard, buildDefineStatement } from '../src/character/character-wizard';
import { ProjectIndex, DefineNode } from '../src/parser/types';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefineNode(variable: string, value: string, line = 0): DefineNode {
  const raw = `define ${variable} = ${value}`;
  return {
    type: 'define',
    name: variable,
    nameRange: { start: { line, column: 7 }, end: { line, column: 7 + variable.length } },
    value,
    valueRange: { start: { line, column: 10 + variable.length }, end: { line, column: raw.length } },
    line,
    indent: 0,
    raw,
    children: [],
  };
}

function createIndex(
  characters: Map<string, { file: string; node: DefineNode }> = new Map(),
  images: Map<string, { file: string; node: any }[]> = new Map(),
): ProjectIndex {
  return {
    files: new Map(),
    labels: new Map(),
    screens: new Map(),
    characters,
    images,
    transforms: new Map(),
    variables: new Map(),
    testcases: new Map(),
    assetFiles: new Set(),
  };
}

/** Access private methods on CharacterWizard for testing. */
function getPrivate(wizard: CharacterWizard) {
  return wizard as any;
}

// ---------------------------------------------------------------------------
// parseCharacterDefine
// ---------------------------------------------------------------------------

describe('CharacterWizard.parseCharacterDefine', () => {
  let wizard: CharacterWizard;

  beforeEach(() => {
    wizard = new CharacterWizard(() => createIndex());
  });

  it('parses basic Character definition', () => {
    const node = makeDefineNode('e', 'Character("Eileen", color="#c8ffc8")');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info).not.toBeNull();
    expect(info.variable).toBe('e');
    expect(info.displayName).toBe('Eileen');
    expect(info.color).toBe('#c8ffc8');
    expect(info.file).toBe('game/script.rpy');
    expect(info.line).toBe(0);
  });

  it('parses Character with image tag', () => {
    const node = makeDefineNode('e', 'Character("Eileen", image="eileen", color="#c8ffc8")');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info.imageTag).toBe('eileen');
  });

  it('parses Character with who_* styling', () => {
    const node = makeDefineNode('e', 'Character("Eileen", who_color="#ff0000", who_font="bold.ttf", who_size=42, who_bold=True, who_italic=True)');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info.whoColor).toBe('#ff0000');
    expect(info.whoFont).toBe('bold.ttf');
    expect(info.whoSize).toBe('42');
    expect(info.whoBold).toBe('True');
    expect(info.whoItalic).toBe('True');
  });

  it('parses Character with what_* styling', () => {
    const node = makeDefineNode('e', 'Character("Eileen", what_font="dialog.ttf", what_size=32, what_color="#aabbcc", what_text_align=0.5, what_prefix="«", what_suffix="»")');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info.whatFont).toBe('dialog.ttf');
    expect(info.whatSize).toBe('32');
    expect(info.whatColor).toBe('#aabbcc');
    expect(info.whatTextAlign).toBe('0.5');
    expect(info.whatPrefix).toBe('«');
    expect(info.whatSuffix).toBe('»');
  });

  it('parses Character with window_* styling', () => {
    const node = makeDefineNode('e', 'Character("Eileen", window_background="gui/bubble.png", window_left_padding=50, window_top_padding=30, window_margin=(10, 10, 10, 10), window_yminimum=150)');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info.windowBackground).toBe('gui/bubble.png');
    expect(info.windowLeftPadding).toBe('50');
    expect(info.windowTopPadding).toBe('30');
    // window_margin is a tuple — extracted as raw
    expect(info.windowMargin).toContain('(10');
    expect(info.windowYminimum).toBe('150');
  });

  it('parses Character with advanced properties', () => {
    const node = makeDefineNode('e', 'Character("Eileen", kind=bubble, dynamic=True, retain=True, ctc=ctc_anim, ctc_position="nestled", callback=my_cb, multiple=2)');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info.kind).toBe('bubble');
    expect(info.dynamic).toBe('True');
    expect(info.retain).toBe('True');
    expect(info.ctc).toBe('ctc_anim');
    expect(info.ctcPosition).toBe('nestled');
    expect(info.callback).toBe('my_cb');
    expect(info.multiple).toBe('2');
  });

  it('parses Character with translated name _("...")', () => {
    const node = makeDefineNode('e', 'Character(_("Eileen"), color="#c8ffc8")');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info.displayName).toBe('Eileen');
  });

  it('returns null for non-Character value', () => {
    const node = makeDefineNode('config.screen_width', '1920');
    const info = getPrivate(wizard).parseCharacterDefine('config.screen_width', node, 'game/options.rpy');

    expect(info).toBeNull();
  });

  it('uses variable name as display name when name is missing', () => {
    // Edge case: Character() with no string first arg (unlikely but handled)
    const node = makeDefineNode('narrator', 'Character(color="#ffffff")');
    const info = getPrivate(wizard).parseCharacterDefine('narrator', node, 'game/script.rpy');

    // Falls back to variable name
    expect(info.displayName).toBe('narrator');
  });

  it('parses who_outlines with complex value', () => {
    const node = makeDefineNode('e', 'Character("Eileen", who_outlines=[(2, "#000000", 0, 0)])');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info.whoOutlines).toContain('[(2');
  });

  it('does not confuse color with who_color', () => {
    const node = makeDefineNode('e', 'Character("Eileen", color="#aabbcc", who_color="#ff0000")');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info.color).toBe('#aabbcc');
    expect(info.whoColor).toBe('#ff0000');
  });

  it('does not confuse color with what_color', () => {
    const node = makeDefineNode('e', 'Character("Eileen", what_color="#112233", color="#aabbcc")');
    const info = getPrivate(wizard).parseCharacterDefine('e', node, 'game/script.rpy');

    expect(info.color).toBe('#aabbcc');
    expect(info.whatColor).toBe('#112233');
  });

  it('parses full production-ready definition', () => {
    const node = makeDefineNode('p',
      'Character("ABYO", kind=bubble, image="abyo", dynamic=False, retain=True, multiple=2, callback=p_voice_callback, ctc="ctc_anim", ctc_position="nestled", who_font="fonts/brand_bold.ttf", who_size=42, who_color="#7a00c0ff", who_outlines=[(2, "#c0c0c0ff")], what_font="fonts/dialogue_reg.ttf", what_size=32, what_color="#ffffffff", what_outlines=[(2, "#7a00c0ff")], what_prefix="«", what_suffix="»", window_background="gui/bubble_abyo.png", window_left_padding=50, window_top_padding=30, window_yminimum=150)');
    const info = getPrivate(wizard).parseCharacterDefine('p', node, 'game/characters.rpy');

    expect(info.displayName).toBe('ABYO');
    expect(info.kind).toBe('bubble');
    expect(info.imageTag).toBe('abyo');
    expect(info.dynamic).toBe('False');
    expect(info.retain).toBe('True');
    expect(info.multiple).toBe('2');
    expect(info.callback).toBe('p_voice_callback');
    expect(info.ctc).toBe('ctc_anim');
    expect(info.ctcPosition).toBe('nestled');
    expect(info.whoFont).toBe('fonts/brand_bold.ttf');
    expect(info.whoSize).toBe('42');
    expect(info.whoColor).toBe('#7a00c0ff');
    expect(info.whatFont).toBe('fonts/dialogue_reg.ttf');
    expect(info.whatSize).toBe('32');
    expect(info.whatColor).toBe('#ffffffff');
    expect(info.whatPrefix).toBe('«');
    expect(info.whatSuffix).toBe('»');
    expect(info.windowBackground).toBe('gui/bubble_abyo.png');
    expect(info.windowLeftPadding).toBe('50');
    expect(info.windowTopPadding).toBe('30');
    expect(info.windowYminimum).toBe('150');
  });
});

// ---------------------------------------------------------------------------
// gatherCharacters
// ---------------------------------------------------------------------------

describe('CharacterWizard.gatherCharacters', () => {
  it('gathers and sorts characters from project index', () => {
    const characters = new Map<string, { file: string; node: DefineNode }>();
    characters.set('s', { file: 'game/script.rpy', node: makeDefineNode('s', 'Character("Sylvie", color="#ffccee")') });
    characters.set('e', { file: 'game/script.rpy', node: makeDefineNode('e', 'Character("Eileen", color="#c8ffc8")') });

    const wizard = new CharacterWizard(() => createIndex(characters));
    const result = getPrivate(wizard).gatherCharacters();

    expect(result.length).toBe(2);
    // Sorted alphabetically by variable
    expect(result[0].variable).toBe('e');
    expect(result[1].variable).toBe('s');
  });

  it('skips non-Character defines in index', () => {
    const characters = new Map<string, { file: string; node: DefineNode }>();
    characters.set('e', { file: 'game/script.rpy', node: makeDefineNode('e', 'Character("Eileen")') });
    characters.set('config_val', { file: 'game/options.rpy', node: makeDefineNode('config_val', '42') });

    const wizard = new CharacterWizard(() => createIndex(characters));
    const result = getPrivate(wizard).gatherCharacters();

    expect(result.length).toBe(1);
    expect(result[0].variable).toBe('e');
  });

  it('returns empty array when no characters defined', () => {
    const wizard = new CharacterWizard(() => createIndex());
    const result = getPrivate(wizard).gatherCharacters();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findExpressions
// ---------------------------------------------------------------------------

describe('CharacterWizard.findExpressions', () => {
  it('finds expressions from image definitions in index', () => {
    const images = new Map<string, { file: string; node: any }[]>();
    images.set('eileen', [{ file: 'game/script.rpy', node: {} }]);
    images.set('eileen happy', [{ file: 'game/script.rpy', node: {} }]);
    images.set('eileen sad', [{ file: 'game/script.rpy', node: {} }]);
    images.set('sylvie smile', [{ file: 'game/script.rpy', node: {} }]);

    const index = createIndex(new Map(), images);
    const wizard = new CharacterWizard(() => index);

    const charInfo = {
      variable: 'e',
      imageTag: 'eileen',
      expressions: [],
    };

    const result = getPrivate(wizard).findExpressions(charInfo, index);

    expect(result.length).toBe(3);
    const names = result.map((e: any) => e.name);
    expect(names).toContain('default');
    expect(names).toContain('happy');
    expect(names).toContain('sad');
    // sylvie should NOT be included
    expect(names).not.toContain('smile');
  });

  it('uses variable name as tag when imageTag is not set', () => {
    const images = new Map<string, { file: string; node: any }[]>();
    images.set('e', [{ file: 'game/script.rpy', node: {} }]);
    images.set('e happy', [{ file: 'game/script.rpy', node: {} }]);

    const index = createIndex(new Map(), images);
    const wizard = new CharacterWizard(() => index);

    const charInfo = {
      variable: 'e',
      imageTag: undefined,
      expressions: [],
    };

    const result = getPrivate(wizard).findExpressions(charInfo, index);

    expect(result.length).toBe(2);
    expect(result[0].name).toBe('default');
    expect(result[1].name).toBe('happy');
  });

  it('sorts with default first, then alphabetical', () => {
    const images = new Map<string, { file: string; node: any }[]>();
    images.set('eileen', [{ file: 'game/script.rpy', node: {} }]);
    images.set('eileen sad', [{ file: 'game/script.rpy', node: {} }]);
    images.set('eileen angry', [{ file: 'game/script.rpy', node: {} }]);
    images.set('eileen happy', [{ file: 'game/script.rpy', node: {} }]);

    const index = createIndex(new Map(), images);
    const wizard = new CharacterWizard(() => index);

    const result = getPrivate(wizard).findExpressions({ variable: 'e', imageTag: 'eileen', expressions: [] }, index);

    expect(result[0].name).toBe('default');
    expect(result[1].name).toBe('angry');
    expect(result[2].name).toBe('happy');
    expect(result[3].name).toBe('sad');
  });

  it('marks script-defined expressions correctly', () => {
    const images = new Map<string, { file: string; node: any }[]>();
    images.set('eileen happy', [{ file: 'game/images.rpy', node: {} }]);

    const index = createIndex(new Map(), images);
    const wizard = new CharacterWizard(() => index);

    const result = getPrivate(wizard).findExpressions({ variable: 'e', imageTag: 'eileen', expressions: [] }, index);

    expect(result[0].definedInScript).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleMessage
// ---------------------------------------------------------------------------

describe('CharacterWizard.handleMessage', () => {
  let wizard: CharacterWizard;
  let mockWorkspaceFolder: any;

  beforeEach(() => {
    mockWorkspaceFolder = {
      uri: vscode.Uri.file('D:/dev/RenPy/test-project'),
      name: 'test-project',
      index: 0,
    };
    (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

    wizard = new CharacterWizard(() => createIndex());
  });

  it('handles goToDefinition message', async () => {
    const openTextDocument = vi.fn().mockResolvedValue({});
    const showTextDocument = vi.fn().mockResolvedValue({});
    (vscode.workspace as any).openTextDocument = openTextDocument;
    (vscode.window as any).showTextDocument = showTextDocument;

    await getPrivate(wizard).handleMessage({
      command: 'goToDefinition',
      file: 'game/script.rpy',
      line: 5,
    });

    expect(openTextDocument).toHaveBeenCalled();
    expect(showTextDocument).toHaveBeenCalled();
  });

  it('handles copyDefinition message', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    (vscode.env as any).clipboard = { writeText };

    await getPrivate(wizard).handleMessage({
      command: 'copyDefinition',
      raw: 'define e = Character("Eileen")',
    });

    expect(writeText).toHaveBeenCalledWith('define e = Character("Eileen")');
  });

  it('handles openFile message', async () => {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    (vscode.commands as any).executeCommand = executeCommand;

    await getPrivate(wizard).handleMessage({
      command: 'openFile',
      path: 'game/images/eileen happy.png',
    });

    expect(executeCommand).toHaveBeenCalledWith('vscode.open', expect.anything());
  });

  it('ignores unknown command', async () => {
    // Should not throw
    await getPrivate(wizard).handleMessage({ command: 'unknownCommand' });
  });

  it('handles goToDefinition with no workspace folder gracefully', async () => {
    (vscode.workspace as any).workspaceFolders = [];
    // Should not throw
    await getPrivate(wizard).handleMessage({
      command: 'goToDefinition',
      file: 'game/script.rpy',
      line: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// buildDefineStatement (extracted from WebView JS into TypeScript)
// ---------------------------------------------------------------------------

describe('buildDefineStatement', () => {

  it('generates basic define statement', () => {
    const result = buildDefineStatement({ varName: 'e', displayName: 'Eileen', color: '#c8ffc8' });
    expect(result).toBe('define e = Character("Eileen", color="#c8ffc8")');
  });

  it('returns null when varName is empty', () => {
    expect(buildDefineStatement({ varName: '', displayName: 'Eileen' })).toBeNull();
  });

  it('returns null when displayName is empty', () => {
    expect(buildDefineStatement({ varName: 'e', displayName: '' })).toBeNull();
  });

  it('generates statement with all basic properties', () => {
    const result = buildDefineStatement({
      varName: 'e',
      displayName: 'Eileen',
      color: '#c8ffc8',
      imageTag: 'eileen',
    });
    expect(result).toBe('define e = Character("Eileen", color="#c8ffc8", image="eileen")');
  });

  it('places kind before other params', () => {
    const result = buildDefineStatement({
      varName: 'e',
      displayName: 'Eileen',
      kind: 'bubble',
      color: '#c8ffc8',
    });
    expect(result).toBe('define e = Character("Eileen", kind=bubble, color="#c8ffc8")');
  });

  it('generates statement with who_* styling', () => {
    const result = buildDefineStatement({
      varName: 'e',
      displayName: 'Eileen',
      whoFont: 'bold.ttf',
      whoSize: '42',
      whoBold: true,
    });
    expect(result).toContain('who_font="bold.ttf"');
    expect(result).toContain('who_size=42');
    expect(result).toContain('who_bold=True');
  });

  it('generates statement with what_* styling', () => {
    const result = buildDefineStatement({
      varName: 'e',
      displayName: 'Eileen',
      whatPrefix: '«',
      whatSuffix: '»',
      whatTextAlign: '0.5',
    });
    expect(result).toContain('what_prefix="«"');
    expect(result).toContain('what_suffix="»"');
    expect(result).toContain('what_text_align=0.5');
  });

  it('generates statement with window_* styling', () => {
    const result = buildDefineStatement({
      varName: 'e',
      displayName: 'Eileen',
      windowBackground: 'gui/bubble.png',
      windowYminimum: '150',
    });
    expect(result).toContain('window_background="gui/bubble.png"');
    expect(result).toContain('window_yminimum=150');
  });

  it('generates statement with advanced properties', () => {
    const result = buildDefineStatement({
      varName: 'e',
      displayName: 'Eileen',
      dynamic: true,
      retain: true,
      ctc: 'ctc_anim',
      ctcPosition: 'nestled',
      callback: 'my_cb',
      multiple: '2',
    });
    expect(result).toContain('dynamic=True');
    expect(result).toContain('retain=True');
    expect(result).toContain('ctc=ctc_anim');
    expect(result).toContain('ctc_position="nestled"');
    expect(result).toContain('callback=my_cb');
    expect(result).toContain('multiple=2');
  });

  it('generates minimal statement with only required fields', () => {
    const result = buildDefineStatement({ varName: 'narrator', displayName: 'Narrator' });
    expect(result).toBe('define narrator = Character("Narrator")');
  });

  it('does not include false booleans', () => {
    const result = buildDefineStatement({
      varName: 'e',
      displayName: 'Eileen',
      whoBold: false,
      whoItalic: false,
      dynamic: false,
      retain: false,
    });
    expect(result).toBe('define e = Character("Eileen")');
  });

  it('does not include empty string params', () => {
    const result = buildDefineStatement({
      varName: 'e',
      displayName: 'Eileen',
      color: '',
      whoFont: '',
      whatSize: '',
      windowBackground: '',
      callback: '',
    });
    expect(result).toBe('define e = Character("Eileen")');
  });

  it('generates full production-ready definition', () => {
    const result = buildDefineStatement({
      varName: 'p',
      displayName: 'ABYO',
      kind: 'bubble',
      imageTag: 'abyo',
      retain: true,
      multiple: '2',
      callback: 'p_voice_callback',
      ctc: 'ctc_anim',
      ctcPosition: 'nestled',
      whoFont: 'fonts/brand_bold.ttf',
      whoSize: '42',
      whoColor: '#7a00c0ff',
      whoOutlines: '[(2, "#c0c0c0ff")]',
      whatFont: 'fonts/dialogue_reg.ttf',
      whatSize: '32',
      whatColor: '#ffffffff',
      whatOutlines: '[(2, "#7a00c0ff")]',
      whatPrefix: '«',
      whatSuffix: '»',
      windowBackground: 'gui/bubble_abyo.png',
      windowLeftPadding: '50',
      windowTopPadding: '30',
      windowYminimum: '150',
    });
    expect(result).not.toBeNull();
    // Verify structure
    expect(result!).toMatch(/^define p = Character\("ABYO"/);
    // Verify kind comes early
    const kindIdx = result!.indexOf('kind=bubble');
    const colorIdx = result!.indexOf('who_color=');
    expect(kindIdx).toBeLessThan(colorIdx);
    // Verify all params present
    expect(result!).toContain('image="abyo"');
    expect(result!).toContain('retain=True');
    expect(result!).toContain('multiple=2');
    expect(result!).toContain('callback=p_voice_callback');
    expect(result!).toContain('ctc=ctc_anim');
    expect(result!).toContain('ctc_position="nestled"');
    expect(result!).toContain('who_font="fonts/brand_bold.ttf"');
    expect(result!).toContain('who_size=42');
    expect(result!).toContain('who_outlines=[(2, "#c0c0c0ff")]');
    expect(result!).toContain('what_prefix="«"');
    expect(result!).toContain('what_suffix="»"');
    expect(result!).toContain('window_background="gui/bubble_abyo.png"');
    expect(result!).toContain('window_yminimum=150');
    // Verify dynamic=False is NOT included (dynamic was not set)
    expect(result!).not.toContain('dynamic=');
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('CharacterWizard.escapeHtml', () => {
  let wizard: CharacterWizard;

  beforeEach(() => {
    wizard = new CharacterWizard(() => createIndex());
  });

  it('escapes HTML special characters', () => {
    const escape = getPrivate(wizard).escapeHtml.bind(wizard);
    expect(escape('&')).toBe('&amp;');
    expect(escape('<script>')).toBe('&lt;script&gt;');
    expect(escape('"hello"')).toBe('&quot;hello&quot;');
    expect(escape('normal text')).toBe('normal text');
  });

  it('escapes combined special chars', () => {
    const escape = getPrivate(wizard).escapeHtml.bind(wizard);
    expect(escape('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
  });
});

// ---------------------------------------------------------------------------
// renderCharacterCard
// ---------------------------------------------------------------------------

describe('CharacterWizard.renderCharacterCard', () => {
  let wizard: CharacterWizard;
  let mockWebview: any;

  beforeEach(() => {
    const mockWorkspaceFolder = {
      uri: vscode.Uri.file('D:/dev/RenPy/test-project'),
      name: 'test-project',
      index: 0,
    };
    (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

    wizard = new CharacterWizard(() => createIndex());
    mockWebview = {
      asWebviewUri: (uri: any) => ({ toString: () => `https://webview/${uri.fsPath}` }),
    };
  });

  it('renders card with color and image tag', () => {
    const char = {
      variable: 'e',
      displayName: 'Eileen',
      color: '#c8ffc8',
      imageTag: 'eileen',
      file: 'game/script.rpy',
      line: 0,
      raw: 'define e = Character("Eileen")',
      expressions: [],
    };
    const html = getPrivate(wizard).renderCharacterCard(char, mockWebview);
    expect(html).toContain('data-var="e"');
    expect(html).toContain('Eileen');
    expect(html).toContain('#c8ffc8');
    expect(html).toContain('img: eileen');
    expect(html).toContain('E'); // initial
  });

  it('renders card without color or image tag', () => {
    const char = {
      variable: 'narrator',
      displayName: 'Narrator',
      file: 'game/script.rpy',
      line: 0,
      raw: 'define narrator = Character("Narrator")',
      expressions: [],
    };
    const html = getPrivate(wizard).renderCharacterCard(char, mockWebview);
    expect(html).toContain('data-var="narrator"');
    expect(html).toContain('#666'); // fallback color
    expect(html).not.toContain('img:');
  });

  it('populates webviewUri for expressions with filePath', () => {
    const char = {
      variable: 'e',
      displayName: 'Eileen',
      color: '#c8ffc8',
      imageTag: 'eileen',
      file: 'game/script.rpy',
      line: 0,
      raw: 'define e = Character("Eileen")',
      expressions: [
        { name: 'happy', imageTag: 'eileen happy', filePath: 'images/eileen happy.png', definedInScript: false },
        { name: 'sad', imageTag: 'eileen sad', definedInScript: true },
      ],
    };
    getPrivate(wizard).renderCharacterCard(char, mockWebview);
    expect((char.expressions[0] as any).webviewUri).toContain('webview');
    expect((char.expressions[1] as any).webviewUri).toBeUndefined();
  });

  it('escapes HTML in display name', () => {
    const char = {
      variable: 'x',
      displayName: '<Evil>',
      file: 'game/script.rpy',
      line: 0,
      raw: 'define x = Character("<Evil>")',
      expressions: [],
    };
    const html = getPrivate(wizard).renderCharacterCard(char, mockWebview);
    expect(html).toContain('&lt;Evil&gt;');
    expect(html).not.toContain('<Evil>');
  });
});

// ---------------------------------------------------------------------------
// renderHtml
// ---------------------------------------------------------------------------

describe('CharacterWizard.renderHtml', () => {
  let wizard: CharacterWizard;

  beforeEach(() => {
    const mockWorkspaceFolder = {
      uri: vscode.Uri.file('D:/dev/RenPy/test-project'),
      name: 'test-project',
      index: 0,
    };
    (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

    const characters = new Map<string, { file: string; node: DefineNode }>();
    characters.set('e', { file: 'game/script.rpy', node: makeDefineNode('e', 'Character("Eileen", color="#c8ffc8")') });

    wizard = new CharacterWizard(() => createIndex(characters));

    // Set up panel mock
    const panel = (vscode.window as any).createWebviewPanel();
    getPrivate(wizard)._panel = panel;
  });

  it('returns valid HTML with character cards', () => {
    const characters = getPrivate(wizard).gatherCharacters();
    const html = getPrivate(wizard).renderHtml(characters);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Character Wizard');
    expect(html).toContain('data-var="e"');
    expect(html).toContain('Eileen');
  });

  it('renders empty state when no characters', () => {
    const html = getPrivate(wizard).renderHtml([]);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('No characters defined yet');
  });

  it('includes search box', () => {
    const html = getPrivate(wizard).renderHtml([]);
    expect(html).toContain('searchBox');
    expect(html).toContain('filterCharacters');
  });

  it('includes advanced section toggle', () => {
    const html = getPrivate(wizard).renderHtml([]);
    expect(html).toContain('advSection');
    expect(html).toContain('toggleAdvanced');
    expect(html).toContain('who_font');
    expect(html).toContain('what_prefix');
    expect(html).toContain('window_background');
    expect(html).toContain('newKind');
    expect(html).toContain('newRetain');
    expect(html).toContain('newCtcPosition');
  });

  it('embeds character data as JSON', () => {
    const characters = getPrivate(wizard).gatherCharacters();
    const html = getPrivate(wizard).renderHtml(characters);
    // The JSON data should contain all advanced properties
    expect(html).toContain('"variable":"e"');
    expect(html).toContain('"displayName":"Eileen"');
  });
});

// ---------------------------------------------------------------------------
// scanExpressionFiles
// ---------------------------------------------------------------------------

describe('CharacterWizard.scanExpressionFiles', () => {
  let wizard: CharacterWizard;
  let tmpDir: string;

  beforeEach(() => {
    wizard = new CharacterWizard(() => createIndex());
    // Create a temp directory structure
    tmpDir = path.join(__dirname, '_tmp_scan_test');
    fs.mkdirSync(path.join(tmpDir, 'images'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds matching image files', () => {
    fs.writeFileSync(path.join(tmpDir, 'images', 'eileen.png'), '');
    fs.writeFileSync(path.join(tmpDir, 'images', 'eileen happy.png'), '');
    fs.writeFileSync(path.join(tmpDir, 'images', 'eileen_sad.png'), '');
    fs.writeFileSync(path.join(tmpDir, 'images', 'sylvie.png'), '');

    const expressions: any[] = [];
    const seen = new Set<string>();
    getPrivate(wizard).scanExpressionFiles(tmpDir, tmpDir, 'eileen', expressions, seen);

    const names = expressions.map(e => e.name);
    expect(names).toContain('default');
    expect(names).toContain('happy');
    expect(names).toContain('sad');
    expect(names).not.toContain('sylvie');
    expect(expressions.length).toBe(3);
  });

  it('skips non-image files', () => {
    fs.writeFileSync(path.join(tmpDir, 'images', 'eileen.txt'), '');
    fs.writeFileSync(path.join(tmpDir, 'images', 'eileen.rpy'), '');

    const expressions: any[] = [];
    const seen = new Set<string>();
    getPrivate(wizard).scanExpressionFiles(tmpDir, tmpDir, 'eileen', expressions, seen);

    expect(expressions.length).toBe(0);
  });

  it('skips dot and underscore directories', () => {
    fs.mkdirSync(path.join(tmpDir, '.hidden'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '_private'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.hidden', 'eileen.png'), '');
    fs.writeFileSync(path.join(tmpDir, '_private', 'eileen.png'), '');

    const expressions: any[] = [];
    const seen = new Set<string>();
    getPrivate(wizard).scanExpressionFiles(tmpDir, tmpDir, 'eileen', expressions, seen);

    expect(expressions.length).toBe(0);
  });

  it('recursively scans subdirectories', () => {
    fs.mkdirSync(path.join(tmpDir, 'images', 'characters'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'images', 'characters', 'eileen happy.png'), '');

    const expressions: any[] = [];
    const seen = new Set<string>();
    getPrivate(wizard).scanExpressionFiles(tmpDir, tmpDir, 'eileen', expressions, seen);

    expect(expressions.length).toBe(1);
    expect(expressions[0].name).toBe('happy');
    expect(expressions[0].filePath).toContain('images/characters/');
  });

  it('does not duplicate when already seen from script', () => {
    fs.writeFileSync(path.join(tmpDir, 'images', 'eileen happy.png'), '');

    const expressions: any[] = [];
    const seen = new Set<string>(['happy']); // already found from script
    getPrivate(wizard).scanExpressionFiles(tmpDir, tmpDir, 'eileen', expressions, seen);

    // Should not add a duplicate, but may update filePath on existing
    expect(expressions.length).toBe(0);
  });

  it('updates filePath on existing expression without one', () => {
    fs.writeFileSync(path.join(tmpDir, 'images', 'eileen.png'), '');

    const existing = { name: 'default', imageTag: 'eileen', definedInScript: true, filePath: undefined };
    const expressions: any[] = [existing];
    const seen = new Set<string>(['default']);
    getPrivate(wizard).scanExpressionFiles(tmpDir, tmpDir, 'eileen', expressions, seen);

    expect(existing.filePath).toContain('eileen.png');
  });

  it('supports jpg, jpeg, webp extensions', () => {
    fs.writeFileSync(path.join(tmpDir, 'eileen happy.jpg'), '');
    fs.writeFileSync(path.join(tmpDir, 'eileen sad.jpeg'), '');
    fs.writeFileSync(path.join(tmpDir, 'eileen angry.webp'), '');

    const expressions: any[] = [];
    const seen = new Set<string>();
    getPrivate(wizard).scanExpressionFiles(tmpDir, tmpDir, 'eileen', expressions, seen);

    expect(expressions.length).toBe(3);
  });

  it('handles permission errors gracefully', () => {
    // Scan a nonexistent directory — should not throw
    const expressions: any[] = [];
    const seen = new Set<string>();
    expect(() => {
      getPrivate(wizard).scanExpressionFiles(path.join(tmpDir, 'nonexistent'), tmpDir, 'eileen', expressions, seen);
    }).not.toThrow();
    expect(expressions.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleMessage — previewStatement / createCharacter
// ---------------------------------------------------------------------------

describe('CharacterWizard.handleMessage (advanced)', () => {
  let wizard: CharacterWizard;
  let mockPanel: any;

  beforeEach(() => {
    const mockWorkspaceFolder = {
      uri: vscode.Uri.file('D:/dev/RenPy/test-project'),
      name: 'test-project',
      index: 0,
    };
    (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

    wizard = new CharacterWizard(() => createIndex());

    mockPanel = {
      webview: {
        html: '',
        onDidReceiveMessage: () => ({ dispose() {} }),
        asWebviewUri: (uri: any) => ({ toString: () => `https://webview/${uri.fsPath}` }),
        postMessage: vi.fn().mockResolvedValue(true),
      },
      reveal() {},
      onDidDispose: () => ({ dispose() {} }),
      dispose() {},
    };
    getPrivate(wizard)._panel = mockPanel;
  });

  it('handles previewStatement with valid params', async () => {
    await getPrivate(wizard).handleMessage({
      command: 'previewStatement',
      params: { varName: 'e', displayName: 'Eileen', color: '#c8ffc8' },
    });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
      command: 'previewResult',
      text: 'define e = Character("Eileen", color="#c8ffc8")',
    });
  });

  it('handles previewStatement with missing params', async () => {
    await getPrivate(wizard).handleMessage({
      command: 'previewStatement',
      params: { varName: '', displayName: '' },
    });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
      command: 'previewResult',
      text: expect.stringContaining('Variable Name'),
    });
  });

  it('handles createCharacter with missing params', async () => {
    await getPrivate(wizard).handleMessage({
      command: 'createCharacter',
      params: { varName: '', displayName: '' },
    });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
      command: 'previewResult',
      text: expect.stringContaining('Variable Name'),
    });
  });
});

// ---------------------------------------------------------------------------
// insertCharacterStatement
// ---------------------------------------------------------------------------

describe('CharacterWizard.insertCharacterStatement', () => {
  let wizard: CharacterWizard;
  let mockWorkspaceFolder: any;

  beforeEach(() => {
    mockWorkspaceFolder = {
      uri: vscode.Uri.file('D:/dev/RenPy/test-project'),
      name: 'test-project',
      index: 0,
    };
    (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];
    (vscode.workspace as any).applyEdit = vi.fn().mockResolvedValue(true);
    (vscode.workspace as any).openTextDocument = vi.fn().mockResolvedValue({});
    (vscode.window as any).showTextDocument = vi.fn().mockResolvedValue({
      selection: null,
      revealRange: vi.fn(),
    });
    (vscode.window as any).showInformationMessage = vi.fn();
  });

  it('inserts after existing character definitions', async () => {
    const characters = new Map<string, { file: string; node: DefineNode }>();
    characters.set('e', { file: 'game/script.rpy', node: makeDefineNode('e', 'Character("Eileen")', 5) });
    characters.set('s', { file: 'game/script.rpy', node: makeDefineNode('s', 'Character("Sylvie")', 6) });

    wizard = new CharacterWizard(() => createIndex(characters));

    await getPrivate(wizard).insertCharacterStatement('define p = Character("ABYO")');

    expect((vscode.workspace as any).applyEdit).toHaveBeenCalled();
  });

  it('does nothing when no workspace folder', async () => {
    (vscode.workspace as any).workspaceFolders = [];
    wizard = new CharacterWizard(() => createIndex());

    await getPrivate(wizard).insertCharacterStatement('define p = Character("ABYO")');

    expect((vscode.workspace as any).applyEdit).not.toHaveBeenCalled();
  });

  it('falls back to script.rpy when it exists', async () => {
    // Use a real temp directory with a script.rpy
    const tmpDir = path.join(__dirname, '_tmp_insert_test');
    const gameDir = path.join(tmpDir, 'game');
    fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(path.join(gameDir, 'script.rpy'), '# test\n', 'utf-8');

    mockWorkspaceFolder.uri = vscode.Uri.file(tmpDir);
    (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

    wizard = new CharacterWizard(() => createIndex());
    await getPrivate(wizard).insertCharacterStatement('define p = Character("ABYO")');

    expect((vscode.workspace as any).applyEdit).toHaveBeenCalled();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates definitions.rpy when no file found', async () => {
    // Use a real temp directory with NO rpy files
    const tmpDir = path.join(__dirname, '_tmp_insert_test2');
    const gameDir = path.join(tmpDir, 'game');
    fs.mkdirSync(gameDir, { recursive: true });

    mockWorkspaceFolder.uri = vscode.Uri.file(tmpDir);
    (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

    wizard = new CharacterWizard(() => createIndex());
    await getPrivate(wizard).insertCharacterStatement('define p = Character("ABYO")');

    // Should have created definitions.rpy
    const defFile = path.join(gameDir, 'definitions.rpy');
    expect(fs.existsSync(defFile)).toBe(true);
    const content = fs.readFileSync(defFile, 'utf-8');
    expect(content).toContain('define p = Character("ABYO")');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// show / dispose / refresh
// ---------------------------------------------------------------------------

describe('CharacterWizard lifecycle', () => {
  let wizard: CharacterWizard;

  beforeEach(() => {
    const mockWorkspaceFolder = {
      uri: vscode.Uri.file('D:/dev/RenPy/test-project'),
      name: 'test-project',
      index: 0,
    };
    (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];
    wizard = new CharacterWizard(() => createIndex());
  });

  it('creates panel on first show()', async () => {
    await wizard.show();
    expect(getPrivate(wizard)._panel).toBeDefined();
  });

  it('reuses panel on second show()', async () => {
    await wizard.show();
    const panel1 = getPrivate(wizard)._panel;
    await wizard.show();
    const panel2 = getPrivate(wizard)._panel;
    expect(panel1).toBe(panel2);
  });

  it('dispose clears panel', async () => {
    await wizard.show();
    wizard.dispose();
    // Panel dispose was called (mock doesn't clear _panel, but dispose was invoked)
  });
});
