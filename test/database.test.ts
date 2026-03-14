import { describe, it, expect } from 'vitest';
import { RENPY_STATEMENTS, getStatementInfo, getStatementDescription, getStatementsByKind } from '../src/language/renpy-database';

describe('Ren\'Py Database', () => {
  it('has a non-empty statements list', () => {
    expect(RENPY_STATEMENTS.length).toBeGreaterThan(50);
  });

  it('each statement has required fields', () => {
    for (const stmt of RENPY_STATEMENTS) {
      expect(stmt.name).toBeTruthy();
      expect(stmt.syntax).toBeTruthy();
      expect(stmt.description).toBeTruthy();
      expect(stmt.descriptionJa).toBeTruthy();
      expect(stmt.kind).toBeTruthy();
    }
  });

  describe('getStatementInfo', () => {
    it('finds core statements', () => {
      expect(getStatementInfo('label')).toBeDefined();
      expect(getStatementInfo('jump')).toBeDefined();
      expect(getStatementInfo('call')).toBeDefined();
      expect(getStatementInfo('return')).toBeDefined();
      expect(getStatementInfo('menu')).toBeDefined();
    });

    it('returns correct statement data', () => {
      const label = getStatementInfo('label')!;
      expect(label.name).toBe('label');
      expect(label.syntax).toContain('label');
      // 'label' exists as both statement and screen widget; map returns first registered
      expect(['statement', 'screen']).toContain(label.kind);
    });

    it('finds screen keywords', () => {
      const textStmt = getStatementInfo('text');
      expect(textStmt).toBeDefined();
      expect(textStmt!.kind).toBe('screen');
    });

    it('finds classes', () => {
      const character = getStatementInfo('Character');
      expect(character).toBeDefined();
      expect(character!.kind).toBe('class');
    });

    it('returns undefined for unknown statements', () => {
      expect(getStatementInfo('nonexistent_statement')).toBeUndefined();
    });
  });

  describe('getStatementDescription', () => {
    it('returns a non-empty description', () => {
      const label = getStatementInfo('label')!;
      const desc = getStatementDescription(label);
      expect(desc).toBeTruthy();
      expect(typeof desc).toBe('string');
    });
  });

  describe('getStatementsByKind', () => {
    it('filters by statement kind', () => {
      const statements = getStatementsByKind('statement');
      expect(statements.length).toBeGreaterThan(5);
      expect(statements.every(s => s.kind === 'statement')).toBe(true);
    });

    it('filters by screen kind', () => {
      const screens = getStatementsByKind('screen');
      expect(screens.length).toBeGreaterThan(3);
      expect(screens.every(s => s.kind === 'screen')).toBe(true);
    });

    it('filters by atl kind', () => {
      const atl = getStatementsByKind('atl');
      expect(atl.length).toBeGreaterThan(3);
    });

    it('filters by class kind', () => {
      const classes = getStatementsByKind('class');
      expect(classes.length).toBeGreaterThan(0);
      expect(classes.some(c => c.name === 'Character')).toBe(true);
    });

    it('returns empty for unknown kind', () => {
      const none = getStatementsByKind('nonexistent' as any);
      expect(none.length).toBe(0);
    });
  });

  it('has few duplicate statement names across categories', () => {
    const names = RENPY_STATEMENTS.map(s => s.name);
    const unique = new Set(names);
    // Some names legitimately appear in multiple categories:
    // 'ease' (transition + atl), 'pause' (statement + atl), 'on' (screen + atl),
    // 'window' (statement + screen), 'label' (statement + screen), 'event' (atl)
    expect(names.length - unique.size).toBeLessThanOrEqual(6);
  });
});
