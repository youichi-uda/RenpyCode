import { describe, it, expect } from 'vitest';
import { scanLines, hasMixedIndentation } from '../src/parser/scanner';

describe('Scanner', () => {
  describe('scanLines', () => {
    it('splits text into lines with correct line numbers', () => {
      const lines = scanLines('hello\nworld\nfoo');
      expect(lines.length).toBe(3);
      expect(lines[0].lineNumber).toBe(0);
      expect(lines[1].lineNumber).toBe(1);
      expect(lines[2].lineNumber).toBe(2);
    });

    it('trims content but preserves raw', () => {
      const lines = scanLines('    indented line');
      expect(lines[0].content).toBe('indented line');
      expect(lines[0].raw).toBe('    indented line');
    });

    it('calculates indent correctly', () => {
      const lines = scanLines('no indent\n    four spaces\n        eight spaces');
      expect(lines[0].indent).toBe(0);
      expect(lines[1].indent).toBe(4);
      expect(lines[2].indent).toBe(8);
    });

    it('expands tabs to 4 spaces', () => {
      const lines = scanLines('\tindented');
      expect(lines[0].indent).toBe(4);
    });

    it('detects empty lines', () => {
      const lines = scanLines('text\n\n   \nmore');
      expect(lines[0].isEmpty).toBe(false);
      expect(lines[1].isEmpty).toBe(true);
      expect(lines[2].isEmpty).toBe(true);
      expect(lines[3].isEmpty).toBe(false);
    });

    it('detects comments', () => {
      const lines = scanLines('# comment\n    # indented comment\ncode');
      expect(lines[0].isComment).toBe(true);
      expect(lines[0].isEmpty).toBe(true);
      expect(lines[1].isComment).toBe(true);
      expect(lines[2].isComment).toBe(false);
    });

    it('handles Windows line endings', () => {
      const lines = scanLines('line1\r\nline2\r\n');
      expect(lines[0].content).toBe('line1');
      expect(lines[1].content).toBe('line2');
    });

    it('handles empty input', () => {
      const lines = scanLines('');
      expect(lines.length).toBe(1);
      expect(lines[0].isEmpty).toBe(true);
    });
  });

  describe('hasMixedIndentation', () => {
    it('returns false for spaces only', () => {
      expect(hasMixedIndentation('    text')).toBe(false);
    });

    it('returns false for tabs only', () => {
      expect(hasMixedIndentation('\t\ttext')).toBe(false);
    });

    it('returns true for mixed tabs and spaces', () => {
      expect(hasMixedIndentation('\t    text')).toBe(true);
      expect(hasMixedIndentation('  \ttext')).toBe(true);
    });

    it('returns false for no indentation', () => {
      expect(hasMixedIndentation('text')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(hasMixedIndentation('')).toBe(false);
    });
  });
});
