import { describe, it, expect } from 'vitest';
import { ScreenTreeProvider } from '../src/language/screen-tree-provider';
import { ProjectIndex, ScreenNode } from '../src/parser/types';

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

function makeScreenNode(name: string, params?: string, children: any[] = []): ScreenNode {
  return {
    type: 'screen',
    name,
    nameRange: { start: { line: 0, column: 7 }, end: { line: 0, column: 7 + name.length } },
    parameters: params,
    range: { start: { line: 0, column: 0 }, end: { line: 0, column: 20 } },
    line: 0,
    indent: 0,
    raw: `screen ${name}${params ? `(${params})` : ''}:`,
    children,
  };
}

describe('ScreenTreeProvider', () => {
  it('should list all screens at root level', () => {
    const idx = emptyIndex();
    idx.screens.set('say', [{ file: 'screens.rpy', node: makeScreenNode('say', 'who, what') }]);
    idx.screens.set('main_menu', [{ file: 'screens.rpy', node: makeScreenNode('main_menu') }]);

    const provider = new ScreenTreeProvider(() => idx);
    const children = provider.getChildren();

    expect(children.length).toBe(2);
    const labels = children.map(c => c.label);
    expect(labels).toContain('screen main_menu');
    expect(labels).toContain('screen say(who, what)');
  });

  it('should return empty array for no screens', () => {
    const idx = emptyIndex();
    const provider = new ScreenTreeProvider(() => idx);
    const children = provider.getChildren();
    expect(children.length).toBe(0);
  });

  it('should show child widgets', () => {
    const idx = emptyIndex();
    const vboxChild = {
      type: 'unknown',
      raw: '        vbox:',
      line: 1,
      indent: 8,
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 13 } },
      children: [
        {
          type: 'unknown',
          raw: '            text "Hello"',
          line: 2,
          indent: 12,
          range: { start: { line: 2, column: 0 }, end: { line: 2, column: 24 } },
          children: [],
        },
      ],
    };

    idx.screens.set('test', [{ file: 'test.rpy', node: makeScreenNode('test', undefined, [vboxChild]) }]);

    const provider = new ScreenTreeProvider(() => idx);
    const roots = provider.getChildren();
    expect(roots.length).toBe(1);

    // Root screen should have children
    const screenItem = roots[0];
    expect(screenItem.children.length).toBe(1);

    // vbox child should have text child
    const vboxItem = screenItem.children[0];
    expect(vboxItem.label).toBe('vbox:');
    expect(vboxItem.children.length).toBe(1);
    expect(vboxItem.children[0].label).toBe('text "Hello"');
  });

  it('should skip blank and comment nodes', () => {
    const idx = emptyIndex();
    const children = [
      { type: 'blank', raw: '', line: 1, indent: 0, range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }, children: [] },
      { type: 'comment', raw: '    # comment', text: 'comment', line: 2, indent: 4, range: { start: { line: 2, column: 0 }, end: { line: 2, column: 13 } }, children: [] },
      { type: 'unknown', raw: '    text "visible"', line: 3, indent: 4, range: { start: { line: 3, column: 0 }, end: { line: 3, column: 18 } }, children: [] },
    ];

    idx.screens.set('test', [{ file: 'test.rpy', node: makeScreenNode('test', undefined, children) }]);

    const provider = new ScreenTreeProvider(() => idx);
    const roots = provider.getChildren();
    const screenItem = roots[0];

    // Should only have the text node, not blank or comment
    expect(screenItem.children.length).toBe(1);
    expect(screenItem.children[0].label).toBe('text "visible"');
  });
});
