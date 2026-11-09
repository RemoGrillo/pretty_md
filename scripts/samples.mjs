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

const renderer = createRenderer({ typographer: true, breaks: false, strings: DEFAULT_RENDER_STRINGS });
const body = renderer.render(readFileSync(process.argv[2] ?? 'samples/showcase.md', 'utf8'));
const deck = renderer.render(readFileSync('samples/slides.md', 'utf8'));
const url = (p) => pathToFileURL(resolve(p)).href;
// Stand-ins for the CSS variables VS Code injects, so the "Editor" theme renders outside VS Code.
const vscodeVars = `<style>html{--vscode-editor-background:#1f1f1f;--vscode-editor-foreground:#cccccc;--vscode-descriptionForeground:#9d9d9d;--vscode-textLink-foreground:#4daafc;--vscode-textCodeBlock-background:#2b2b2b;--vscode-textPreformat-background:#3c3c3c;--vscode-textBlockQuote-border:#616161;--vscode-font-family:system-ui,sans-serif;--vscode-editor-font-family:monospace}</style>`;

// out/samples/<theme>.html: the page; out/samples/slides/<theme>.html: samples/slides.md in slide mode.
mkdirSync('out/samples/slides', { recursive: true });
const pages = THEMES.flatMap((theme) => [
  { theme, file: `out/samples/${theme.id}.html`, html: body },
  { theme, file: `out/samples/slides/${theme.id}.html`, html: deck, startSlides: 0 },
]);
for (const { theme, file, html, startSlides } of pages) {
  const page = buildPage({
    cspSource: 'file:',
    nonce: 'sample',
    lang: 'en',
    baseHref: url('samples') + '/',
    styleHref: url('media/preview.css'),
    scriptSrc: url('dist/webview.js'),
    bodyHtml: html,
    init: {
      settings: { theme: theme.id, fontSize: 17, contentWidth: 'medium', slideLevel: 3 },
      themes: THEMES,
      strings: DEFAULT_UI_STRINGS,
      startSlides,
    },
  }).replace('</head>', `${vscodeVars}</head>`);
  writeFileSync(file, page);
}
console.log(`wrote ${pages.length} pages to out/samples/`);
