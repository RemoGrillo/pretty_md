import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, slugify, DEFAULT_RENDER_STRINGS } from '../src/renderer';
import { buildPage, DEFAULT_UI_STRINGS } from '../src/template';
import { THEMES } from '../src/themes';

const r = createRenderer({ typographer: true, breaks: false, strings: DEFAULT_RENDER_STRINGS });

test('headings get GitHub-style unique ids', () => {
  const html = r.render('# Hello, World!\n\n## Perché no?\n\n## Perché no?\n\n### `code` here');
  assert.match(html, /<h1 data-line="0" id="hello-world">/);
  assert.match(html, /id="perché-no"/);
  assert.match(html, /id="perché-no-1"/);
  assert.match(html, /id="code-here"/);
  assert.equal(slugify('  A  b-c_d!? '), 'a--b-c_d');
});

test('ids are not shared between renders', () => {
  assert.match(r.render('# Same'), /id="same"/);
  assert.match(r.render('# Same'), /id="same"/);
});

test('front matter is stripped, shown collapsed, and line numbers stay aligned', () => {
  const html = r.render('---\ntitle: x\ntags: [a]\n---\n# Title\n\nPara');
  assert.match(html, /<details class="pm-front-matter"/);
  assert.match(html, /<h1 data-line="4" id="title">/);
  assert.match(html, /<p data-line="6">Para<\/p>/);
});

test('task lists render checkboxes with source lines', () => {
  const html = r.render('- [ ] todo\n- [x] done\n- plain');
  assert.match(html, /<ul class="pm-task-list" data-line="0">/);
  assert.match(html, /<li class="pm-task-item" data-line="0"><input type="checkbox" class="pm-task"> todo/);
  assert.match(html, /<li class="pm-task-item" data-line="1"><input type="checkbox" class="pm-task" checked> done/);
  assert.match(html, /<li data-line="2">plain/);
});

test('fenced code is highlighted and wrapped with a copy button', () => {
  const html = r.render('```python\ndef f(x):\n    return "<b>"\n```');
  assert.match(html, /<div class="pm-code" data-line="0"><span class="pm-code-lang">python<\/span><button class="pm-copy"/);
  assert.match(html, /<span class="hljs-keyword">def<\/span>/);
  assert.match(html, /&lt;b&gt;/);
  const plain = r.render('```nonexistentlang\n<x>\n```');
  assert.match(plain, /<code class="hljs language-nonexistentlang">&lt;x&gt;/);
});

test('GitHub alerts become callouts', () => {
  const html = r.render('> [!WARNING]\n> Be careful.');
  assert.match(html, /<blockquote class="pm-alert pm-alert-warning" data-line="0">/);
  assert.match(html, /<span class="pm-alert-title">Warning<\/span>Be careful\./);
  assert.doesNotMatch(r.render('> [!NOPE]\n> x'), /pm-alert/);
});

test('outline matches rendered heading ids and source lines', () => {
  const src = '---\na: 1\n---\n# Intro\n\ntext\n\n## Part *one*\n\n## Part *one*\n';
  const outline = r.outline(src);
  assert.deepEqual(outline, [
    { level: 1, text: 'Intro', id: 'intro', line: 3 },
    { level: 2, text: 'Part one', id: 'part-one', line: 7 },
    { level: 2, text: 'Part one', id: 'part-one-1', line: 9 },
  ]);
  const html = r.render(src);
  for (const h of outline) assert.match(html, new RegExp(`data-line="${h.line}" id="${h.id}"`));
});

test('tables are wrapped for horizontal scrolling', () => {
  const html = r.render('| a | b |\n|---|---|\n| 1 | 2 |');
  assert.match(html, /^<div class="pm-table"><table data-line="0">/);
  assert.match(html, /<\/table>\n?<\/div>/);
});

test('footnotes, typographer, images', () => {
  const html = r.render('Text[^1] -- "quoted" ...\n\n![alt](img/a.png)\n\n[^1]: Note.');
  assert.match(html, /class="footnote-ref"/);
  assert.match(html, /–/);
  assert.match(html, /“quoted”/);
  assert.match(html, /…/);
  assert.match(html, /<img src="img\/a.png" alt="alt" loading="lazy">/);
});

test('page shell escapes init JSON and carries the CSP nonce', () => {
  const page = buildPage({
    cspSource: 'vscode-resource:',
    nonce: 'abc',
    lang: 'it',
    baseHref: 'https://x/dir/',
    styleHref: 's.css',
    scriptSrc: 'w.js',
    bodyHtml: '<p>x</p>',
    init: {
      settings: { theme: 'classic', fontSize: 17, contentWidth: 'medium' },
      themes: THEMES,
      strings: { ...DEFAULT_UI_STRINGS, contents: '</script><script>alert(1)</script>' },
    },
  });
  assert.match(page, /script-src 'nonce-abc'/);
  assert.match(page, /<script nonce="abc" src="w.js">/);
  const json = page.match(/<script id="pm-init" type="application\/json">([\s\S]*?)<\/script>/)![1];
  assert.equal(JSON.parse(json).strings.contents, '</script><script>alert(1)</script>');
  assert.match(page, /<html lang="it" data-theme="classic"/);
});
