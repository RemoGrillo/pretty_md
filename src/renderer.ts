// Markdown → HTML. Pure (no `vscode` import) so it can be unit-tested and
// used by the sample generator.
import MarkdownIt, { type MarkdownIt as Md, type StateCore, type Token } from 'markdown-it';
import footnote from 'markdown-it-footnote';
import hljs from 'highlight.js/lib/common';

export interface RenderOptions {
  typographer: boolean;
  breaks: boolean;
  strings: RenderStrings;
}

export interface RenderStrings {
  copy: string;
  frontMatter: string;
  note: string;
  tip: string;
  important: string;
  warning: string;
  caution: string;
}

export const DEFAULT_RENDER_STRINGS: RenderStrings = {
  copy: 'Copy',
  frontMatter: 'Front matter',
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M5 1.5A1.5 1.5 0 0 1 6.5 0h6A1.5 1.5 0 0 1 14 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 5 9.5v-8Zm1.5-.25a.25.25 0 0 0-.25.25v8c0 .14.11.25.25.25h6c.14 0 .25-.11.25-.25v-8a.25.25 0 0 0-.25-.25h-6ZM2 5.5A1.5 1.5 0 0 1 3.5 4H4v1.25h-.5a.25.25 0 0 0-.25.25v9c0 .14.11.25.25.25h7a.25.25 0 0 0 .25-.25V14H12v.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 2 14.5v-9Z"/></svg>';

export interface Heading {
  level: number;
  text: string;
  /** Same id the rendered heading gets, for `#fragment` navigation. */
  id: string;
  /** Source line (0-based). */
  line: number;
}

export interface Renderer {
  render(source: string): string;
  outline(source: string): Heading[];
}

function splitFrontMatter(source: string): { body: string; frontMatter?: string; lineOffset: number } {
  const fm = FRONT_MATTER.exec(source);
  if (!fm) return { body: source, lineOffset: 0 };
  return { body: source.slice(fm[0].length), frontMatter: fm[1], lineOffset: fm[0].split('\n').length - 1 };
}

export function createRenderer(options: RenderOptions): Renderer {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: options.typographer,
    breaks: options.breaks,
  });
  md.use(footnote);
  md.use(sourceLines);
  md.use(headingIds);
  md.use(taskLists);
  md.use((m) => alerts(m, options.strings));
  md.use((m) => codeBlocks(m, options.strings));
  md.use(tableWrapper);
  md.use(lazyImages);

  return {
    render(source: string): string {
      const { body, frontMatter, lineOffset } = splitFrontMatter(source);
      const prefix =
        frontMatter === undefined
          ? ''
          : `<details class="pm-front-matter" data-line="0"><summary>${md.utils.escapeHtml(options.strings.frontMatter)}</summary>` +
            `<pre><code class="hljs language-yaml">${highlight(frontMatter, 'yaml', md)}</code></pre></details>\n`;
      return prefix + md.render(body, { lineOffset, slugs: new Map<string, number>() });
    },

    outline(source: string): Heading[] {
      const { body, lineOffset } = splitFrontMatter(source);
      const tokens = md.parse(body, { lineOffset, slugs: new Map<string, number>() });
      const headings: Heading[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== 'heading_open') continue;
        headings.push({
          level: Number(t.tag.slice(1)),
          text: inlineText(tokens[i + 1]).trim(),
          id: String(t.attrGet('id') ?? ''),
          line: Number(t.attrGet('data-line') ?? 0),
        });
      }
      return headings;
    },
  };
}

function highlight(code: string, lang: string, md: Md): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      /* fall through to plain text */
    }
  }
  return md.utils.escapeHtml(code);
}

/** data-line="<source line>" on block tokens: used for scroll sync, double-click-to-edit and task toggling. */
function sourceLines(md: Md): void {
  md.core.ruler.push('pm_source_lines', (state: StateCore) => {
    const offset = Number(state.env.lineOffset ?? 0);
    for (const token of state.tokens) {
      if (token.map && token.block && token.nesting !== -1) {
        token.attrSet('data-line', String(token.map[0] + offset));
      }
    }
  });
}

/** GitHub-compatible heading anchors, so `[x](#some-heading)` links work. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function inlineText(token: Token | undefined): string {
  if (!token?.children) return token?.content ?? '';
  return token.children
    .filter((c) => c.type === 'text' || c.type === 'code_inline')
    .map((c) => c.content)
    .join('');
}

function headingIds(md: Md): void {
  md.core.ruler.push('pm_heading_ids', (state: StateCore) => {
    const slugs = (state.env.slugs as Map<string, number> | undefined) ?? new Map<string, number>();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open' || tokens[i].attrGet('id')) continue;
      const base = slugify(inlineText(tokens[i + 1])) || 'section';
      const n = slugs.get(base) ?? 0;
      slugs.set(base, n + 1);
      tokens[i].attrSet('id', n === 0 ? base : `${base}-${n}`);
    }
  });
}

/** `- [ ] todo` / `- [x] done` → checkbox list items (clickable: the extension toggles the source). */
function taskLists(md: Md): void {
  md.core.ruler.after('inline', 'pm_task_lists', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') {
        continue;
      }
      const first = inline.children?.[0];
      const m = first?.type === 'text' ? /^\[([ xX])\][ \t]+/.exec(first.content) : null;
      if (!first || !m) continue;
      first.content = first.content.slice(m[0].length);
      const checked = m[1] !== ' ';
      const box = new state.Token('html_inline', '', 0);
      box.content = `<input type="checkbox" class="pm-task"${checked ? ' checked' : ''}> `;
      inline.children!.unshift(box);
      tokens[i - 2].attrJoin('class', 'pm-task-item');
      for (let j = i - 3; j >= 0; j--) {
        if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
          if (tokens[j].level === tokens[i - 2].level - 1) {
            if (!String(tokens[j].attrGet('class') ?? '').includes('pm-task-list')) tokens[j].attrJoin('class', 'pm-task-list');
            break;
          }
        }
      }
    }
  });
}

/** GitHub alerts: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`. */
function alerts(md: Md, strings: RenderStrings): void {
  const kinds: Record<string, keyof RenderStrings> = {
    NOTE: 'note',
    TIP: 'tip',
    IMPORTANT: 'important',
    WARNING: 'warning',
    CAUTION: 'caution',
  };
  md.core.ruler.after('inline', 'pm_alerts', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open' || tokens[i + 1].type !== 'paragraph_open') continue;
      const inline = tokens[i + 2];
      const first = inline.children?.[0];
      const m = first?.type === 'text' ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(first.content) : null;
      if (!first || !m) continue;
      const kind = kinds[m[1].toUpperCase()];
      tokens[i].attrJoin('class', `pm-alert pm-alert-${kind}`);
      const children = inline.children!;
      children.shift();
      if (children[0]?.type === 'softbreak' || children[0]?.type === 'hardbreak') children.shift();
      const title = new state.Token('html_inline', '', 0);
      title.content = `<span class="pm-alert-title">${md.utils.escapeHtml(strings[kind])}</span>`;
      children.unshift(title);
    }
  });
}

function codeBlocks(md: Md, strings: RenderStrings): void {
  const esc = md.utils.escapeHtml;
  const wrap = (token: Token, lang: string): string => {
    const line = token.attrGet('data-line');
    const langClass = lang ? ` language-${esc(lang)}` : '';
    return (
      `<div class="pm-code"${line !== null ? ` data-line="${line}"` : ''}>` +
      (lang ? `<span class="pm-code-lang">${esc(lang)}</span>` : '') +
      `<button class="pm-copy" type="button" title="${esc(strings.copy)}" aria-label="${esc(strings.copy)}">${COPY_ICON}</button>` +
      `<pre><code class="hljs${langClass}">${highlight(token.content, lang, md)}</code></pre></div>\n`
    );
  };
  md.renderer.rules.fence = (tokens, idx) => {
    const info = tokens[idx].info ? md.utils.unescapeAll(tokens[idx].info).trim() : '';
    return wrap(tokens[idx], info.split(/\s+/)[0] ?? '');
  };
  md.renderer.rules.code_block = (tokens, idx) => wrap(tokens[idx], '');
}

/** Wide tables scroll horizontally instead of stretching the page. */
function tableWrapper(md: Md): void {
  md.renderer.rules.table_open = (tokens, idx, options, _env, self) =>
    `<div class="pm-table">${self.renderToken(tokens, idx, options)}`;
  md.renderer.rules.table_close = (tokens, idx, options, _env, self) => `${self.renderToken(tokens, idx, options)}</div>`;
}

function lazyImages(md: Md): void {
  const original = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('loading', 'lazy');
    return original(tokens, idx, options, env, self);
  };
}
