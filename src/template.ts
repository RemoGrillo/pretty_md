// The preview page shell. Pure (no `vscode` import) so the sample generator
// can build the exact same page outside VS Code.
import type { ThemeInfo } from './themes';

export type ContentWidth = 'narrow' | 'medium' | 'wide' | 'full';

export interface ViewSettings {
  theme: string;
  fontSize: number;
  contentWidth: ContentWidth;
  /** In slide mode, headings up to this level (1–6) start a new slide. */
  slideLevel: number;
}

export interface UiStrings {
  contents: string;
  theme: string;
  smaller: string;
  larger: string;
  edit: string;
  editTitle: string;
  noHeadings: string;
  copied: string;
  slides: string;
  slidesTitle: string;
  prevSlide: string;
  nextSlide: string;
  exitSlides: string;
}

export const DEFAULT_UI_STRINGS: UiStrings = {
  contents: 'Contents',
  theme: 'Theme',
  smaller: 'Smaller text',
  larger: 'Larger text',
  edit: 'Edit',
  editTitle: 'Edit the Markdown source (or double-click any paragraph)',
  noHeadings: 'No headings',
  copied: 'Copied',
  slides: 'Slides',
  slidesTitle: 'Present as slides (← → to move, Esc to exit)',
  prevSlide: 'Previous slide',
  nextSlide: 'Next slide',
  exitSlides: 'Exit slides (Esc)',
};

export interface PageInit {
  settings: ViewSettings;
  themes: ThemeInfo[];
  strings: UiStrings;
  /** Open straight into slide mode at this slide (used by the sample pages). */
  startSlides?: number;
}

export interface PageParts {
  cspSource: string;
  nonce: string;
  lang: string;
  /** URI of the document's folder, with trailing slash: relative images and links resolve against it. */
  baseHref: string;
  styleHref: string;
  scriptSrc: string;
  bodyHtml: string;
  init: PageInit;
}

const attr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** JSON that is safe inside a <script> element. */
export const scriptJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const ICONS = {
  toc: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2 3.25h1.5v1.5H2zm3 0h9v1.5H5zM2 7.25h1.5v1.5H2zm3 0h9v1.5H5zm-3 4h1.5v1.5H2zm3 0h9v1.5H5z"/></svg>',
  theme:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 1a7 7 0 1 0 0 14c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01a1.5 1.5 0 0 1 1.12-2.49H11.5A3.5 3.5 0 0 0 15 6.5C15 3.46 11.87 1 8 1Zm-4 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm2-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm2.5 2a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
  slides:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 2.5h13M2.5 2.5V10a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V2.5M8 11v2.3M5.5 14.7 8 13.3l2.5 1.4"/><path d="M6.8 4.7v3.9l3.2-1.95z" fill="currentColor" stroke="none"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
  close: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  edit: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M11.7 1.3a1.75 1.75 0 0 1 2.47 0l.53.53a1.75 1.75 0 0 1 0 2.47L6.08 12.92a2 2 0 0 1-.9.52l-3.23.9a.5.5 0 0 1-.62-.62l.9-3.23c.1-.34.27-.65.52-.9L11.7 1.3Zm1.41 1.06a.25.25 0 0 0-.35 0L11.5 3.62 12.38 4.5l1.26-1.26a.25.25 0 0 0 0-.35l-.53-.53ZM11.32 5.56l-.88-.88-6.83 6.83a.5.5 0 0 0-.13.22l-.45 1.6 1.6-.45a.5.5 0 0 0 .22-.13l6.47-6.47Z"/></svg>',
};

export function buildPage(p: PageParts): string {
  const s = p.init.settings;
  const theme = p.init.themes.find((t) => t.id === s.theme);
  const csp = [
    "default-src 'none'",
    `img-src ${p.cspSource} https: data: blob:`,
    `media-src ${p.cspSource} https: data:`,
    `style-src ${p.cspSource} 'unsafe-inline'`,
    `font-src ${p.cspSource} data:`,
    `script-src 'nonce-${p.nonce}'`,
  ].join('; ');
  const str = p.init.strings;
  return `<!DOCTYPE html>
<html lang="${attr(p.lang)}" data-theme="${attr(s.theme)}" data-width="${attr(s.contentWidth)}" style="--pm-font-size:${s.fontSize}px">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${attr(p.baseHref)}">
<link rel="stylesheet" href="${attr(p.styleHref)}">
<script id="pm-init" type="application/json">${scriptJson(p.init)}</script>
</head>
<body>
<nav id="pm-toolbar" aria-label="pretty.md">
  <button type="button" id="pm-toc-btn" title="${attr(str.contents)}" aria-label="${attr(str.contents)}" aria-expanded="false">${ICONS.toc}</button>
  <button type="button" id="pm-theme-btn" title="${attr(str.theme)}" aria-haspopup="menu" aria-expanded="false">${ICONS.theme}<span id="pm-theme-name">${attr(theme?.label ?? s.theme)}</span></button>
  <span class="pm-sep" aria-hidden="true"></span>
  <button type="button" id="pm-smaller" title="${attr(str.smaller)}" aria-label="${attr(str.smaller)}"><span class="pm-a pm-a-small">A</span></button>
  <button type="button" id="pm-larger" title="${attr(str.larger)}" aria-label="${attr(str.larger)}"><span class="pm-a pm-a-large">A</span></button>
  <span class="pm-sep" aria-hidden="true"></span>
  <button type="button" id="pm-slides-btn" title="${attr(str.slidesTitle)}" aria-label="${attr(str.slides)}">${ICONS.slides}</button>
  <button type="button" id="pm-edit" title="${attr(str.editTitle)}">${ICONS.edit}<span>${attr(str.edit)}</span></button>
</nav>
<div id="pm-theme-menu" role="menu" hidden></div>
<aside id="pm-toc" aria-label="${attr(str.contents)}" hidden><div class="pm-toc-title">${attr(str.contents)}</div><ol id="pm-toc-list"></ol></aside>
<main id="content">${p.bodyHtml}</main>
<div id="pm-slides" role="region" aria-roledescription="carousel" aria-label="${attr(str.slides)}" tabindex="-1" hidden>
  <div id="pm-slide-stage" aria-live="polite"></div>
  <button type="button" class="pm-slide-nav" id="pm-slide-prev" title="${attr(str.prevSlide)}" aria-label="${attr(str.prevSlide)}">${ICONS.prev}</button>
  <button type="button" class="pm-slide-nav" id="pm-slide-next" title="${attr(str.nextSlide)}" aria-label="${attr(str.nextSlide)}">${ICONS.next}</button>
  <div id="pm-slide-hud"><span id="pm-slide-count"></span><button type="button" id="pm-slide-exit" title="${attr(str.exitSlides)}" aria-label="${attr(str.exitSlides)}">${ICONS.close}</button></div>
  <div id="pm-slide-progress" aria-hidden="true"><span></span></div>
</div>
<script nonce="${attr(p.nonce)}" src="${attr(p.scriptSrc)}"></script>
</body>
</html>`;
}
