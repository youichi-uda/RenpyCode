import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const production = process.argv.includes('--production');

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
});

// Copy bridge script to package-accessible location (src/ is excluded by .vscodeignore)
mkdirSync('bridge', { recursive: true });
cpSync('src/bridge/bridge-script.rpy', 'bridge/bridge-script.rpy');
