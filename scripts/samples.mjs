// Renders samples/showcase.md once per theme into out/samples/<theme>.html using the
// exact same renderer, page shell, CSS and webview script as the extension. Handy for
// eyeballing themes in a browser and for README screenshots.
import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
mkdirSync('out/samples', { recursive: true });
await esbuild.build({
  entryPoints: ['src/renderer.ts', 'src/template.ts', 'src/themes.ts'],
  outdir: 'out/lib',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  logLevel: 'warning',
});
const { createRenderer, DEFAULT_RENDER_STRINGS } = require(resolve('out/lib/renderer.cjs'));
const { buildPage, DEFAULT_UI_STRINGS } = require(resolve('out/lib/template.cjs'));
const { THEMES } = require(resolve('out/lib/themes.cjs'));

const source = readFileSync(process.argv[2] ?? 'samples/showcase.md', 'utf8');
const body = createRenderer({ typographer: true, breaks: false, strings: DEFAULT_RENDER_STRINGS }).render(source);
const url = (p) => pathToFileURL(resolve(p)).href;
// Stand-ins for the CSS variables VS Code injects, so the "Editor" theme renders outside VS Code.
const vscodeVars = `<style>html{--vscode-editor-background:#1f1f1f;--vscode-editor-foreground:#cccccc;--vscode-descriptionForeground:#9d9d9d;--vscode-textLink-foreground:#4daafc;--vscode-textCodeBlock-background:#2b2b2b;--vscode-textPreformat-background:#3c3c3c;--vscode-textBlockQuote-border:#616161;--vscode-font-family:system-ui,sans-serif;--vscode-editor-font-family:monospace}</style>`;

for (const theme of THEMES) {
  const page = buildPage({
    cspSource: 'file:',
    nonce: 'sample',
    lang: 'en',
    baseHref: url('samples') + '/',
    styleHref: url('media/preview.css'),
    scriptSrc: url('dist/webview.js'),
    bodyHtml: body,
    init: {
      settings: { theme: theme.id, fontSize: 17, contentWidth: 'medium' },
      themes: THEMES,
      strings: DEFAULT_UI_STRINGS,
    },
  }).replace('</head>', `${vscodeVars}</head>`);
  writeFileSync(`out/samples/${theme.id}.html`, page);
}
console.log(`wrote ${THEMES.length} pages to out/samples/`);
