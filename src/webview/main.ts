// Runs inside the preview webview.
import morphdom from 'morphdom';
import type { PageInit, ViewSettings } from '../template';
import type { ThemeInfo } from '../themes';
import { createSlides } from './slides';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

interface State {
  scrollY: number;
  tocOpen: boolean;
  /** Slide being shown, or null outside slide mode. */
  slide: number | null;
}

const vscode: VsCodeApi =
  typeof acquireVsCodeApi === 'function'
    ? acquireVsCodeApi()
    : { postMessage: () => undefined, getState: () => undefined, setState: () => undefined };

const init = JSON.parse(document.getElementById('pm-init')!.textContent!) as PageInit;
const root = document.documentElement;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const content = $<HTMLElement>('content');
const toolbar = $<HTMLElement>('pm-toolbar');
const themeBtn = $<HTMLButtonElement>('pm-theme-btn');
const themeName = $<HTMLElement>('pm-theme-name');
const themeMenu = $<HTMLElement>('pm-theme-menu');
const toc = $<HTMLElement>('pm-toc');
const tocList = $<HTMLOListElement>('pm-toc-list');
const tocBtn = $<HTMLButtonElement>('pm-toc-btn');

let settings: ViewSettings = init.settings;
const state: State = { scrollY: 0, tocOpen: false, slide: null, ...((vscode.getState() as Partial<State>) ?? {}) };
const saveState = () => vscode.setState(state);

const slides = createSlides({
  content,
  level: () => settings.slideLevel,
  onChange: (s) => {
    state.slide = s.active ? s.index : null;
    saveState();
    vscode.postMessage({ type: 'slides', ...s });
  },
  onExit: (line) => {
    if (line !== undefined) scrollToLine(line);
  },
});

// ---------------------------------------------------------------- settings

let appliedSlideLevel = settings.slideLevel;

function applySettings(s: ViewSettings): void {
  root.dataset.theme = s.theme;
  root.dataset.width = s.contentWidth;
  root.style.setProperty('--pm-font-size', `${s.fontSize}px`);
  root.style.setProperty('--pm-scale', String(s.fontSize / 17));
  themeName.textContent = themeLabel(s.theme);
  renderThemeMenu();
  if (s.slideLevel !== appliedSlideLevel) {
    appliedSlideLevel = s.slideLevel;
    slides.rebuild();
  } else {
    slides.refit();
  }
}

const themeLabel = (id: string) => init.themes.find((t) => t.id === id)?.label ?? id;

// -------------------------------------------------------------- theme menu

const FONT_VAR: Record<ThemeInfo['swatch']['font'], string> = {
  serif: 'var(--f-garamond)',
  sans: 'var(--f-inter)',
  display: 'var(--f-playfair)',
  mono: 'var(--f-jetbrains)',
  editor: 'var(--vscode-font-family)',
};

function renderThemeMenu(): void {
  themeMenu.replaceChildren(
    ...init.themes.map((th) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'pm-theme-item';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(th.id === settings.theme));
      item.dataset.theme = th.id;
      const sw = document.createElement('span');
      sw.className = 'pm-swatch';
      sw.textContent = 'Aa';
      sw.style.background = th.swatch.bg;
      sw.style.color = th.swatch.fg;
      sw.style.fontFamily = FONT_VAR[th.swatch.font];
      sw.style.setProperty('--sw-accent', th.swatch.accent);
      const text = document.createElement('span');
      text.className = 'pm-theme-text';
      const label = document.createElement('span');
      label.className = 'pm-theme-label';
      label.textContent = th.label;
      const desc = document.createElement('span');
      desc.className = 'pm-theme-desc';
      desc.textContent = th.description;
      text.append(label, desc);
      item.append(sw, text);
      return item;
    }),
  );
}

function setMenuOpen(open: boolean): void {
  themeMenu.hidden = !open;
  themeBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    showToolbar();
    (themeMenu.querySelector<HTMLElement>('[aria-checked="true"]') ?? themeMenu.querySelector<HTMLElement>('button'))?.focus();
  } else {
    root.dataset.theme = settings.theme;
  }
}

themeBtn.addEventListener('click', () => setMenuOpen(Boolean(themeMenu.hidden)));
themeMenu.addEventListener('mouseover', (e) => {
  const item = (e.target as Element).closest<HTMLElement>('.pm-theme-item');
  if (item) root.dataset.theme = item.dataset.theme!;
});
themeMenu.addEventListener('focusin', (e) => {
  const item = (e.target as Element).closest<HTMLElement>('.pm-theme-item');
  if (item) root.dataset.theme = item.dataset.theme!;
});
themeMenu.addEventListener('mouseleave', () => {
  root.dataset.theme = settings.theme;
});
themeMenu.addEventListener('click', (e) => {
  const item = (e.target as Element).closest<HTMLElement>('.pm-theme-item');
  if (!item) return;
  settings = { ...settings, theme: item.dataset.theme! };
  applySettings(settings);
  setMenuOpen(false);
  vscode.postMessage({ type: 'setTheme', theme: settings.theme });
});
themeMenu.addEventListener('keydown', (e) => {
  const items = [...themeMenu.querySelectorAll<HTMLElement>('.pm-theme-item')];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !slides.active) {
    if (!themeMenu.hidden) {
      setMenuOpen(false);
      themeBtn.focus();
    } else if (!toc.hidden && window.innerWidth < 1100) {
      setTocOpen(false);
    }
  }
});
document.addEventListener('mousedown', (e) => {
  const target = e.target as Node;
  if (!themeMenu.hidden && !themeMenu.contains(target) && !themeBtn.contains(target)) setMenuOpen(false);
});

// --------------------------------------------------------------- font size

function bumpFont(delta: number): void {
  settings = { ...settings, fontSize: Math.min(32, Math.max(10, settings.fontSize + delta)) };
  applySettings(settings);
  vscode.postMessage({ type: 'setFontSize', size: settings.fontSize });
}
$('pm-smaller').addEventListener('click', () => bumpFont(-1));
$('pm-larger').addEventListener('click', () => bumpFont(1));

$('pm-edit').addEventListener('click', () => vscode.postMessage({ type: 'editSource', line: topVisibleLine() }));
$('pm-slides-btn').addEventListener('click', () => slides.enter({ line: topVisibleLine() }));

// ------------------------------------------------------- table of contents

function buildToc(): void {
  const headings = [...content.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id]')];
  if (!headings.length) {
    const li = document.createElement('li');
    li.className = 'pm-toc-empty';
    li.textContent = init.strings.noHeadings;
    tocList.replaceChildren(li);
    return;
  }
  const min = Math.min(...headings.map((h) => +h.tagName[1]));
  tocList.replaceChildren(
    ...headings.map((h) => {
      const li = document.createElement('li');
      li.style.setProperty('--depth', String(+h.tagName[1] - min));
      const a = document.createElement('a');
      a.href = `#${encodeURIComponent(h.id)}`;
      a.textContent = h.textContent?.trim() ?? '';
      a.dataset.target = h.id;
      li.append(a);
      return li;
    }),
  );
  spy();
}

function setTocOpen(open: boolean): void {
  toc.hidden = !open;
  root.classList.toggle('pm-toc-open', open);
  tocBtn.setAttribute('aria-expanded', String(open));
  state.tocOpen = open;
  saveState();
  if (open) spy();
}
tocBtn.addEventListener('click', () => setTocOpen(Boolean(toc.hidden)));

/** Highlight the section currently being read. */
function spy(): void {
  if (toc.hidden) return;
  const headings = [...content.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id]')];
  let current: HTMLElement | undefined;
  for (const h of headings) {
    if (h.getBoundingClientRect().top < 120) current = h;
    else break;
  }
  for (const a of tocList.querySelectorAll<HTMLElement>('a')) {
    const on = a.dataset.target === current?.id;
    a.classList.toggle('pm-current', on);
    if (on) a.scrollIntoView({ block: 'nearest' });
  }
}

// ------------------------------------------------------------- navigation

function scrollToFragment(fragment: string): void {
  const el =
    document.getElementById(fragment) ??
    document.getElementById(fragment.toLowerCase()) ??
    document.querySelector(`[name="${CSS.escape(fragment)}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function lineElements(): { line: number; el: HTMLElement }[] {
  return [...content.querySelectorAll<HTMLElement>('[data-line]')]
    .map((el) => ({ line: Number(el.dataset.line), el }))
    .filter((x) => !Number.isNaN(x.line) && x.el.offsetParent !== null);
}

/** Scroll so that source line `line` is at the top (interpolating between rendered blocks). */
function scrollToLine(line: number): void {
  const items = lineElements();
  if (!items.length) return;
  let prev = items[0];
  let next: (typeof items)[number] | undefined;
  for (const item of items) {
    if (item.line <= line) prev = item;
    else {
      next = item;
      break;
    }
  }
  const top = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;
  let y = top(prev.el);
  if (next && next.line > prev.line) {
    y += ((line - prev.line) / (next.line - prev.line)) * (top(next.el) - y);
  }
  window.scrollTo({ top: Math.max(0, y - 24) });
}

function topVisibleLine(): number | undefined {
  for (const { line, el } of lineElements()) {
    if (el.getBoundingClientRect().bottom > 60) return line;
  }
  return undefined;
}

document.addEventListener('click', (e) => {
  const target = e.target as Element;

  const copy = target.closest<HTMLButtonElement>('.pm-copy');
  if (copy) {
    const code = copy.parentElement?.querySelector('code')?.textContent ?? '';
    void navigator.clipboard.writeText(code).then(() => {
      copy.classList.add('pm-copied');
      copy.dataset.label = init.strings.copied;
      setTimeout(() => copy.classList.remove('pm-copied'), 1400);
    });
    return;
  }

  const box = target.closest<HTMLInputElement>('input.pm-task');
  if (box) {
    e.preventDefault();
    const li = box.closest<HTMLElement>('li[data-line]');
    if (li) vscode.postMessage({ type: 'toggleTask', line: Number(li.dataset.line) });
    return;
  }

  const a = target.closest<HTMLAnchorElement>('a[href]');
  if (a && (content.contains(a) || toc.contains(a) || $('pm-slides').contains(a))) {
    e.preventDefault();
    const href = a.getAttribute('href')!;
    if (href.startsWith('#')) {
      const fragment = decodeURIComponent(href.slice(1));
      if (!slides.active || !slides.goToFragment(fragment)) scrollToFragment(fragment);
      if (toc.contains(a) && window.innerWidth < 1100) setTocOpen(false);
    } else {
      vscode.postMessage({ type: 'openLink', href });
    }
  }
});

content.addEventListener('dblclick', (e) => {
  const block = (e.target as Element).closest<HTMLElement>('[data-line]');
  if (block) {
    window.getSelection()?.removeAllRanges();
    vscode.postMessage({ type: 'editSource', line: Number(block.dataset.line) });
  }
});

// --------------------------------------------------- toolbar auto-hide

let lastY = window.scrollY;
function showToolbar(): void {
  toolbar.classList.remove('pm-hidden');
}
let scrollQueued = false;
window.addEventListener(
  'scroll',
  () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      const y = window.scrollY;
      if (themeMenu.hidden) toolbar.classList.toggle('pm-hidden', y > lastY && y > 80);
      lastY = y;
      state.scrollY = y;
      saveState();
      spy();
    });
  },
  { passive: true },
);
document.addEventListener('mousemove', (e) => {
  if (e.clientY < 64) showToolbar();
});

// ----------------------------------------------------------------- updates

function updateContent(html: string): void {
  const next = document.createElement('main');
  next.id = 'content';
  next.innerHTML = html;
  morphdom(content, next, {
    onBeforeElUpdated(from, to) {
      if (from.isEqualNode(to)) return false;
      if (from instanceof HTMLDetailsElement && to instanceof HTMLDetailsElement) to.open = from.open;
      return true;
    },
  });
  buildToc();
  slides.rebuild();
}

window.addEventListener('message', (event: MessageEvent) => {
  const m = event.data as { type: string; [k: string]: unknown };
  switch (m.type) {
    case 'render':
      updateContent(m.html as string);
      break;
    case 'settings':
      settings = m.settings as ViewSettings;
      applySettings(settings);
      break;
    case 'previewTheme':
      root.dataset.theme = (m.theme as string | null) ?? settings.theme;
      break;
    case 'scrollToLine':
      if (slides.active) slides.goToLine(m.line as number);
      else scrollToLine(m.line as number);
      break;
    case 'scrollToFragment':
      if (!slides.active || !slides.goToFragment(m.fragment as string)) scrollToFragment(m.fragment as string);
      break;
    case 'startSlides':
      if (!slides.active) slides.enter({ line: topVisibleLine() });
      break;
    case 'stopSlides':
      slides.exit();
      break;
  }
});

// -------------------------------------------------------------------- boot

applySettings(settings);
buildToc();
if (state.tocOpen) setTocOpen(true);
if (state.scrollY) window.scrollTo(0, state.scrollY);
// Back in slide mode after the tab was hidden and its webview rebuilt (or a sample page asking for it).
if (init.startSlides !== undefined) slides.enter({ index: init.startSlides, animate: false });
else if (state.slide !== null) slides.enter({ index: state.slide, animate: false });
else vscode.postMessage({ type: 'slides', active: false, index: 0, count: 0 });
vscode.postMessage({ type: 'ready' });
