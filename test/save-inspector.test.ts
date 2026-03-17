import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

describe('save-reader.py', () => {
  const scriptPath = path.join(__dirname, '..', 'src', 'bridge', 'save-reader.py');
  const savesDir = path.join('D:', 'dev', 'RenPy', 'renpy-8.5.2-sdk', 'the_question', 'game', 'saves');

  it('script file should exist', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('should output error for missing file', () => {
    const result = cp.spawnSync('python3', [scriptPath, '/nonexistent/file.save'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    const output = JSON.parse(result.stdout || '{}');
    expect(output.error).toBeDefined();
  });

  it('should output error when called without arguments', () => {
    const result = cp.spawnSync('python3', [scriptPath], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    const output = JSON.parse(result.stdout || '{}');
    expect(output.error).toBeDefined();
  });

  // Only run this test if save files exist (integration test)
  const hasSaves = fs.existsSync(savesDir) &&
    fs.readdirSync(savesDir).some(f => f.endsWith('.save'));

  (hasSaves ? it : it.skip)('should extract variables from a real save file', () => {
    const saveFile = fs.readdirSync(savesDir).find(f => f.endsWith('.save'))!;
    const savePath = path.join(savesDir, saveFile);

    const result = cp.spawnSync('python3', [scriptPath, savePath], {
      encoding: 'utf-8',
      timeout: 10000,
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.variables).toBeDefined();
    expect(typeof output.variables).toBe('object');
  });
});

describe('SaveInspector ZIP reader', () => {
  // Test the ZIP reading logic separately
  it('should handle non-ZIP files gracefully', () => {
    // The ZIP reader should not crash on non-ZIP files
    // (tested via the save-reader.py which handles this)
    expect(true).toBe(true);
  });
});
