// Runs inside the "Appearance" sidebar view.
import type { ThemeInfo } from '../themes';

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

interface State {
  theme: string;
  fontSize: number;
  contentWidth: string;
  openByDefault: boolean;
}

const vscode: VsCodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: () => undefined };
const init = JSON.parse(document.getElementById('pm-init')!.textContent!) as {
  themes: ThemeInfo[];
  strings: Record<string, string>;
};
const S = init.strings;
const app = document.getElementById('app')!;

const FONT: Record<ThemeInfo['swatch']['font'], string> = {
  serif: 'var(--f-garamond)',
  sans: 'var(--f-inter)',
  display: 'var(--f-playfair)',
  mono: 'var(--f-jetbrains)',
  editor: 'var(--vscode-editor-font-family)',
};

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { dataset?: Record<string, string>; style?: string; [prop: string]: unknown } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const { dataset, style, ...rest } = props;
  const el = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(el.dataset, dataset);
  if (style) el.setAttribute('style', style);
  el.append(...children);
  return el;
};

// ---- themes
const grid = h('div', { className: 'themes', role: 'radiogroup' });
grid.setAttribute('aria-label', S.theme);
for (const th of init.themes) {
  const card = h(
    'button',
    { type: 'button', className: 'card', title: th.description, dataset: { theme: th.id } },
    h(
      'span',
      {
        className: 'page',
        style: `background:${th.swatch.bg};color:${th.swatch.fg};--accent:${th.swatch.accent};--font:${FONT[th.swatch.font]}`,
      },
      h('span', { className: 'aa' }, 'Aa'),
      h('span', { className: 'rule' }),
      h('span', { className: 'line' }),
      h('span', { className: 'line short' }),
    ),
    h('span', { className: 'name' }, th.label),
  );
  card.setAttribute('role', 'radio');
  grid.append(card);
}

// ---- text size
const sizeOut = h('output', { className: 'size' });
const sizeRow = h(
  'div',
  { className: 'row' },
  h('span', { className: 'label' }, S.textSize),
  h(
    'div',
    { className: 'stepper' },
    h('button', { type: 'button', title: S.smaller, ariaLabel: S.smaller, dataset: { step: '-1' } }, h('span', { className: 'a small' }, 'A')),
    sizeOut,
    h('button', { type: 'button', title: S.larger, ariaLabel: S.larger, dataset: { step: '1' } }, h('span', { className: 'a large' }, 'A')),
  ),
);

// ---- width
const widths = ['narrow', 'medium', 'wide', 'full'];
const seg = h('div', { className: 'segmented', role: 'radiogroup' });
for (const w of widths) {
  const b = h('button', { type: 'button', dataset: { width: w }, title: S[w] }, h('span', { className: `bar bar-${w}` }));
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', S[w]);
  seg.append(b);
}
const widthRow = h('div', { className: 'row' }, h('span', { className: 'label' }, S.width), seg);

// ---- open by default
const toggle = h('input', { type: 'checkbox', id: 'default' });
const toggleRow = h('label', { className: 'check', htmlFor: 'default' }, toggle, h('span', {}, S.openByDefault));

const settingsLink = h('button', { type: 'button', className: 'link' }, S.settings);

app.append(
  h('div', { className: 'section-title' }, S.theme),
  grid,
  h('div', { className: 'controls' }, sizeRow, widthRow, toggleRow, settingsLink),
);

// ---- state
let state: State | undefined;

function render(s: State): void {
  state = s;
  for (const card of grid.querySelectorAll<HTMLElement>('.card')) {
    card.setAttribute('aria-checked', String(card.dataset.theme === s.theme));
  }
  sizeOut.textContent = `${s.fontSize} px`;
  for (const b of seg.querySelectorAll<HTMLElement>('button')) b.setAttribute('aria-checked', String(b.dataset.width === s.contentWidth));
  toggle.checked = s.openByDefault;
}

grid.addEventListener('click', (e) => {
  const card = (e.target as Element).closest<HTMLElement>('.card');
  if (card && state) {
    render({ ...state, theme: card.dataset.theme! });
    vscode.postMessage({ type: 'setTheme', theme: card.dataset.theme });
  }
});
grid.addEventListener('mouseover', (e) => {
  const card = (e.target as Element).closest<HTMLElement>('.card');
  if (card) vscode.postMessage({ type: 'previewTheme', theme: card.dataset.theme });
});
grid.addEventListener('mouseleave', () => vscode.postMessage({ type: 'previewTheme', theme: null }));
grid.addEventListener('keydown', (e) => {
  const cards = [...grid.querySelectorAll<HTMLElement>('.card')];
  const i = cards.indexOf(document.activeElement as HTMLElement);
  const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (delta && i >= 0) {
    e.preventDefault();
    cards[(i + delta + cards.length) % cards.length].focus();
  }
});

sizeRow.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-step]');
  if (b && state) {
    const size = Math.min(32, Math.max(10, state.fontSize + Number(b.dataset.step)));
    render({ ...state, fontSize: size });
    vscode.postMessage({ type: 'setFontSize', size });
  }
});

seg.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-width]');
  if (b && state) {
    render({ ...state, contentWidth: b.dataset.width! });
    vscode.postMessage({ type: 'setWidth', width: b.dataset.width });
  }
});

toggle.addEventListener('change', () => vscode.postMessage({ type: 'setOpenByDefault', enabled: toggle.checked }));
settingsLink.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));

window.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'state') render(e.data.state as State);
});

vscode.postMessage({ type: 'ready' });
