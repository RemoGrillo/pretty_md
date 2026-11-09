// Runs test/integration in a throwaway VSCodium/VS Code instance (separate profile).
// Usage: node scripts/integration.mjs [path-to-code-binary]   (default: codium)
import * as esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const code = process.argv[2] ?? '/opt/vscodium-bin/codium';
await esbuild.build({
  entryPoints: ['test/integration/index.ts'],
  outfile: 'out/integration.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  logLevel: 'warning',
});
spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });

const base = mkdtempSync(join(process.env.PM_TMP ?? tmpdir(), 'pretty-md-it-'));
const ws = join(base, 'ws');
spawnSync('mkdir', ['-p', ws, join(base, 'user', 'User')]);
copyFileSync('samples/showcase.md', join(ws, 'showcase.md'));
writeFileSync(join(ws, 'other.md'), '# Other\n\nSome text.\n');
spawnSync('mkdir', ['-p', join(ws, 'docs', 'guide'), join(ws, 'node_modules', 'pkg')]);
writeFileSync(join(ws, 'docs', 'guide', 'deep.md'), '# Deep\n');
writeFileSync(join(ws, 'node_modules', 'pkg', 'README.md'), '# ignored\n');
writeFileSync(join(base, 'user', 'User', 'settings.json'), JSON.stringify({ 'workbench.startupEditor': 'none', 'security.workspace.trust.enabled': false }));

const r = spawnSync(
  code,
  [
    `--extensionDevelopmentPath=${resolve('.')}`,
    `--extensionTestsPath=${resolve('out/integration.cjs')}`,
    `--user-data-dir=${join(base, 'user')}`,
    `--extensions-dir=${join(base, 'ext')}`,
    '--disable-extensions',
    '--disable-workspace-trust',
    '--new-window',
    ws,
  ],
  // ELECTRON_RUN_AS_NODE leaks in when launched from a VS Code terminal and would turn Electron into plain Node.
  { stdio: 'inherit', timeout: 120000, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } },
);
rmSync(base, { recursive: true, force: true });
process.exit(r.status ?? 1);
