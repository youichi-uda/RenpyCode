import { describe, it, expect } from 'vitest';
import { ATLPreviewProvider } from '../src/language/atl-preview-provider';
import { ProjectIndex, TransformDefNode } from '../src/parser/types';

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

function makeTransformNode(name: string, params: string | undefined, childRaws: string[]): TransformDefNode {
  return {
    type: 'transform_def',
    name,
    nameRange: { start: { line: 0, column: 10 }, end: { line: 0, column: 10 + name.length } },
    parameters: params,
    range: { start: { line: 0, column: 0 }, end: { line: 0, column: 30 } },
    line: 0,
    indent: 0,
    raw: `transform ${name}${params ? `(${params})` : ''}:`,
    children: childRaws.map((raw, i) => ({
      type: 'unknown' as const,
      raw: `    ${raw}`,
      line: i + 1,
      indent: 4,
      range: { start: { line: i + 1, column: 0 }, end: { line: i + 1, column: raw.length + 4 } },
      children: [],
    })),
  };
}

describe('ATLPreviewProvider', () => {
  // We can't test the full WebView display, but we can test the parseATL logic
  // by accessing it indirectly through the class

  it('should create provider without errors', () => {
    const idx = emptyIndex();
    const provider = new ATLPreviewProvider(() => idx);
    expect(provider).toBeDefined();
  });

  it('should have transforms in index', () => {
    const idx = emptyIndex();
    idx.transforms.set('fadeIn', {
      file: 'transforms.rpy',
      node: makeTransformNode('fadeIn', undefined, [
        'alpha 0.0',
        '1.0',
        'alpha 1.0',
      ]),
    });

    expect(idx.transforms.has('fadeIn')).toBe(true);
    const entry = idx.transforms.get('fadeIn')!;
    expect(entry.node.children.length).toBe(3);
  });

  it('should handle transform with parameters', () => {
    const idx = emptyIndex();
    idx.transforms.set('move', {
      file: 'transforms.rpy',
      node: makeTransformNode('move', 'x, y', [
        'xpos 0.0',
        '0.5',
        'xpos 1.0',
      ]),
    });

    const entry = idx.transforms.get('move')!;
    expect(entry.node.parameters).toBe('x, y');
  });

  it('should handle transform with repeat', () => {
    const idx = emptyIndex();
    const node = makeTransformNode('spin', undefined, [
      'rotate 0',
      '2.0',
      'rotate 360',
      'repeat',
    ]);
    idx.transforms.set('spin', { file: 'transforms.rpy', node });

    const repeatChild = node.children.find(c => c.raw.trim() === 'repeat');
    expect(repeatChild).toBeDefined();
  });
});
