/**
 * Unit tests for Ren'Py snippets definition file.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SNIPPETS_PATH = resolve(__dirname, '..', 'snippets', 'renpy.json');

describe('Ren\'Py snippets (renpy.json)', () => {
  let snippets: Record<string, any>;

  // 1. JSON is valid and parseable
  it('is valid JSON', () => {
    const raw = readFileSync(SNIPPETS_PATH, 'utf-8');
    expect(() => { snippets = JSON.parse(raw); }).not.toThrow();
  });

  function loadSnippets(): Record<string, any> {
    return JSON.parse(readFileSync(SNIPPETS_PATH, 'utf-8'));
  }

  // 2. All snippets have required fields: prefix, body, description
  it('every snippet has prefix, body, and description', () => {
    const data = loadSnippets();
    for (const [name, snippet] of Object.entries(data)) {
      expect(snippet, `snippet "${name}" is an object`).toBeTypeOf('object');
      expect(snippet.prefix, `snippet "${name}" has prefix`).toBeDefined();
      expect(snippet.body, `snippet "${name}" has body`).toBeDefined();
      expect(snippet.description, `snippet "${name}" has description`).toBeDefined();
    }
  });

  // 3. Body is string or string array
  it('every snippet body is a string or an array of strings', () => {
    const data = loadSnippets();
    for (const [name, snippet] of Object.entries(data)) {
      const body = snippet.body;
      if (typeof body === 'string') {
        // ok
      } else if (Array.isArray(body)) {
        for (const line of body) {
          expect(typeof line, `snippet "${name}" body array element is a string`).toBe('string');
        }
      } else {
        expect.fail(`snippet "${name}" body is neither string nor array: ${typeof body}`);
      }
    }
  });

  // 4. No duplicate prefixes
  it('has no duplicate prefixes', () => {
    const data = loadSnippets();
    const prefixes = new Map<string, string>();
    for (const [name, snippet] of Object.entries(data)) {
      const prefix = snippet.prefix;
      if (prefixes.has(prefix)) {
        expect.fail(`duplicate prefix "${prefix}" in snippets "${prefixes.get(prefix)}" and "${name}"`);
      }
      prefixes.set(prefix, name);
    }
  });

  // 5. All expected snippets exist
  it('contains all expected core snippets', () => {
    const data = loadSnippets();
    const prefixes = new Set(Object.values(data).map((s: any) => s.prefix));
    const expected = [
      'label',
      'menu',
      'character',
      'screen',
      'image',
      'transform',
      'define',
      'default',
      'if',
      'show',
      'scene',
      'hide',
      'jump',
      'call',
      'return',
      'style',
      'python',
      'playmusic',
      'playsound',
      'testcase',
      'translate',
    ];
    for (const prefix of expected) {
      expect(prefixes.has(prefix), `expected snippet with prefix "${prefix}"`).toBe(true);
    }
  });

  // Additional: prefix and description are non-empty strings
  it('has non-empty prefix and description strings', () => {
    const data = loadSnippets();
    for (const [name, snippet] of Object.entries(data)) {
      expect(typeof snippet.prefix, `snippet "${name}" prefix is string`).toBe('string');
      expect(snippet.prefix.length, `snippet "${name}" prefix is non-empty`).toBeGreaterThan(0);
      expect(typeof snippet.description, `snippet "${name}" description is string`).toBe('string');
      expect(snippet.description.length, `snippet "${name}" description is non-empty`).toBeGreaterThan(0);
    }
  });

  // Additional: body arrays have at least one element
  it('body arrays are non-empty', () => {
    const data = loadSnippets();
    for (const [name, snippet] of Object.entries(data)) {
      if (Array.isArray(snippet.body)) {
        expect(snippet.body.length, `snippet "${name}" body array is non-empty`).toBeGreaterThan(0);
      }
    }
  });
});
