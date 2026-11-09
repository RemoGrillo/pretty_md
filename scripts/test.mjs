// Bundles the tests with esbuild (TypeScript, ESM deps) and runs them with node:test.
import * as esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('out', { recursive: true });
await esbuild.build({
  entryPoints: ['test/renderer.test.ts'],
  outfile: 'out/renderer.test.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'warning',
});
const r = spawnSync(process.execPath, ['--test', 'out/renderer.test.cjs'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
