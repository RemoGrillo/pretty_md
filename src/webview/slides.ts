// Slide mode: the rendered page is split into full-screen slides at headings (up to a
// configurable level) and at `---` rules. Slides are clones of the page's blocks, so the
// page underneath stays untouched and the slides keep every theme style.

export interface SlideState {
  active: boolean;
  index: number;
  count: number;
}

export interface SlidesOptions {
  content: HTMLElement;
  /** Headings up to this level start a new slide. */
  level: () => number;
  /** Called whenever the mode, the slide or the number of slides changes. */
  onChange: (state: SlideState) => void;
  /** Called on exit with the source line of the slide that was showing. */
  onExit: (line: number | undefined) => void;
}

export interface Slides {
  readonly active: boolean;
  enter(at?: { index?: number; line?: number; animate?: boolean }): void;
  exit(): void;
  /** Re-split after the page changed (live edit, settings), staying on the same slide. */
  rebuild(): void;
  /** Re-measure after a size change. */
  refit(): void;
  goToLine(line: number): void;
  /** Show the slide holding the element with this id; false if there is none. */
  goToFragment(fragment: string): boolean;
}

interface Slide {
  el: HTMLElement;
  inner: HTMLElement;
  /** Source line of the slide's first block (NaN for generated parts like footnotes). */
  line: number;
  dirty: boolean;
}

const MIN_FIT = 0.45;
const ANIMATION_CLASSES = ['pm-in-next', 'pm-in-prev', 'pm-out-next', 'pm-out-prev', 'pm-animate'];

const headingLevel = (el: Element): number => {
  const m = /^H([1-6])$/.exec(el.tagName);
  return m ? Number(m[1]) : 0;
};

const sourceLine = (el: Element): number => {
  const withLine = el.matches('[data-line]') ? el : el.querySelector('[data-line]');
  return Number(withLine?.getAttribute('data-line') ?? NaN);
};

export function createSlides(o: SlidesOptions): Slides {
  const root = document.documentElement;
  const host = document.getElementById('pm-slides')!;
  const stage = document.getElementById('pm-slide-stage')!;
  const counter = document.getElementById('pm-slide-count')!;
  const progress = document.querySelector<HTMLElement>('#pm-slide-progress span')!;
  const prevBtn = document.getElementById('pm-slide-prev') as HTMLButtonElement;
  const nextBtn = document.getElementById('pm-slide-next') as HTMLButtonElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let slides: Slide[] = [];
  /** Top-level page block → index of the slide that shows it. */
  let owner = new Map<Element, number>();
  let index = -1;
  let active = false;
  const animating = new Set<HTMLElement>();
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const state = (): SlideState => ({ active, index: Math.max(0, index), count: slides.length });
  const animations = () => !reducedMotion.matches;

  // ------------------------------------------------------------------ split

  function build(): void {
    const level = o.level();
    const blocks = [...o.content.children];
    // With a single document title, repeating it above every slide adds nothing.
    const kickerFloor = blocks.filter((b) => b.tagName === 'H1').length > 1 ? 1 : 2;
    const groups: { nodes: Element[]; kicker?: string }[] = [];
    const trail: (string | undefined)[] = [];
    const skipped: [Element, number][] = [];
    let current: Element[] = [];
    let kicker: string | undefined;

    const flush = () => {
      if (current.length) groups.push({ nodes: current, kicker });
      current = [];
      kicker = undefined;
    };

    for (const block of blocks) {
      if (block.matches('details.pm-front-matter')) {
        skipped.push([block, groups.length]);
        continue;
      }
      if (block.tagName === 'HR') {
        flush();
        skipped.push([block, groups.length]);
        continue;
      }
      const lvl = headingLevel(block);
      if (lvl) {
        const text = block.textContent?.trim() ?? '';
        if (lvl <= level) {
          flush();
          for (let l = lvl - 1; l >= kickerFloor; l--) {
            if (trail[l]) {
              kicker = trail[l];
              break;
            }
          }
        }
        trail[lvl] = text;
        trail.length = lvl + 1;
      }
      current.push(block);
    }
    flush();

    owner = new Map();
    for (const [el, i] of skipped) owner.set(el, Math.min(i, groups.length - 1));
    stage.replaceChildren();
    slides = groups.map((g, i) => {
      const el = document.createElement('section');
      el.className = 'pm-slide';
      el.setAttribute('aria-roledescription', 'slide');
      const inner = document.createElement('div');
      inner.className = 'pm-slide-inner';
      if (g.kicker) {
        const k = document.createElement('div');
        k.className = 'pm-slide-kicker';
        k.textContent = g.kicker;
        inner.append(k);
      }
      for (const node of g.nodes) {
        owner.set(node, i);
        inner.append(cleanClone(node));
      }
      [...inner.children].forEach((c, j) => (c as HTMLElement).style.setProperty('--i', String(Math.min(j, 9))));

      const lead = headingLevel(g.nodes[0]);
      if (lead) inner.querySelector(':scope > :is(h1, h2, h3, h4, h5, h6)')?.classList.add('pm-slide-title');
      const rest = g.nodes.slice(lead ? 1 : 0);
      const short =
        rest.length <= 2 &&
        rest.every((n) => /^(P|BLOCKQUOTE)$/.test(n.tagName) && !n.querySelector('img, pre, table')) &&
        rest.reduce((sum, n) => sum + (n.textContent?.length ?? 0), 0) < 300;
      if (short && (lead || rest.length === 1)) el.classList.add('pm-slide--center');
      if (lead === 1 && short) el.classList.add('pm-slide--title');

      el.append(inner);
      stage.append(el);
      return { el, inner, line: sourceLine(g.nodes[0]), dirty: true };
    });
  }

  /** A copy of a page block without ids (they stay unique on the page) and with eager images. */
  function cleanClone(node: Element): Element {
    const copy = node.cloneNode(true) as Element;
    for (const el of [copy, ...copy.querySelectorAll('[id]')]) {
      if (el.id) {
        (el as HTMLElement).dataset.pmId = el.id;
        el.removeAttribute('id');
      }
    }
    for (const img of copy.querySelectorAll('img')) img.loading = 'eager';
    return copy;
  }

  // -------------------------------------------------------------------- fit

  /** Shrink the text of a slide that does not fit the screen (down to MIN_FIT, then it scrolls). */
  function fit(s: Slide): void {
    if (!s.dirty) return;
    s.dirty = false;
    s.el.classList.remove('pm-slide--scroll');
    s.inner.style.setProperty('--fit', '1');
    const cs = getComputedStyle(s.el);
    const avail = s.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (avail <= 0) {
      s.dirty = true;
      return;
    }
    let f = 1;
    for (let k = 0; k < 6; k++) {
      const h = s.inner.offsetHeight;
      if (h <= avail || f <= MIN_FIT) break;
      f = Math.max(MIN_FIT, f * Math.max(0.6, avail / h) * 0.985);
      s.inner.style.setProperty('--fit', f.toFixed(3));
    }
    if (s.inner.offsetHeight > avail + 1) s.el.classList.add('pm-slide--scroll');
  }

  // ------------------------------------------------------------- navigation

  function clearAnimations(): void {
    clearTimeout(cleanupTimer);
    for (const el of animating) el.classList.remove(...ANIMATION_CLASSES);
    animating.clear();
  }

  function show(i: number, animate: boolean): void {
    if (!slides.length) return;
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === index) return;
    const from = slides[index];
    const to = slides[i];
    const dir = i > index ? 'next' : 'prev';
    clearAnimations();
    from?.el.classList.remove('pm-current');
    from?.el.setAttribute('aria-hidden', 'true');
    fit(to);
    to.el.classList.add('pm-current');
    to.el.removeAttribute('aria-hidden');
    to.el.setAttribute('aria-label', `${i + 1} / ${slides.length}`);
    to.el.scrollTop = 0;
    if (animate && animations()) {
      void to.el.offsetWidth; // restart the animations even when coming back to the same slide
      to.el.classList.add(`pm-in-${dir}`, 'pm-animate');
      animating.add(to.el);
      if (from) {
        from.el.classList.add(`pm-out-${dir}`);
        animating.add(from.el);
      }
      cleanupTimer = setTimeout(clearAnimations, 1800);
    }
    index = i;
    hud();
    // measure the neighbours ahead of time, so the next transition starts at the right size
    setTimeout(() => {
      for (const n of [slides[index + 1], slides[index - 1]]) if (n && active) fit(n);
    }, 60);
    o.onChange(state());
  }

  function hud(): void {
    counter.textContent = `${index + 1} / ${slides.length}`;
    progress.style.setProperty('--p', String((index + 1) / slides.length));
    prevBtn.disabled = index <= 0;
    nextBtn.disabled = index >= slides.length - 1;
  }

  const go = (i: number) => {
    show(i, true);
    wake();
  };

  function indexForLine(line: number): number {
    let best = 0;
    slides.forEach((s, i) => {
      if (s.line <= line) best = i;
    });
    return best;
  }

  function indexForFragment(fragment: string): number | undefined {
    let el: Element | null =
      document.getElementById(fragment) ??
      document.getElementById(fragment.toLowerCase()) ??
      o.content.querySelector(`[name="${CSS.escape(fragment)}"]`);
    if (!el || !o.content.contains(el)) return undefined;
    while (el && el.parentElement !== o.content) el = el.parentElement;
    return el ? owner.get(el) : undefined;
  }

  // ------------------------------------------------------------ enter / exit

  function enter(at: { index?: number; line?: number; animate?: boolean } = {}): void {
    clearTimeout(closeTimer);
    build();
    if (!slides.length) return;
    active = true;
    host.hidden = false;
    host.classList.remove('pm-closing', 'pm-opening');
    root.classList.add('pm-slides-on');
    index = -1;
    // no transitions on the first frame: progress bar and arrows start where they belong
    host.classList.add('pm-instant');
    requestAnimationFrame(() => requestAnimationFrame(() => host.classList.remove('pm-instant')));
    const start = at.index ?? (at.line !== undefined ? indexForLine(at.line) : 0);
    show(start, false);
    if (at.animate !== false && animations()) {
      void host.offsetWidth;
      host.classList.add('pm-opening');
      slides[index].el.classList.add('pm-animate');
      animating.add(slides[index].el);
      cleanupTimer = setTimeout(clearAnimations, 1800);
    }
    host.focus({ preventScroll: true });
    wake();
  }

  function exit(): void {
    if (!active) return;
    const line = slides[index]?.line;
    active = false;
    clearAnimations();
    root.classList.remove('pm-slides-on');
    o.onExit(Number.isNaN(line) ? undefined : line);
    const done = () => {
      host.hidden = true;
      host.classList.remove('pm-closing', 'pm-opening');
      stage.replaceChildren();
      slides = [];
      index = -1;
    };
    if (animations()) {
      host.classList.remove('pm-opening');
      host.classList.add('pm-closing');
      closeTimer = setTimeout(done, 220);
    } else {
      done();
    }
    o.onChange({ active: false, index: 0, count: 0 });
  }

  function rebuild(): void {
    if (!active) return;
    const before = { count: slides.length, index, line: slides[index]?.line };
    build();
    if (!slides.length) {
      exit();
      return;
    }
    index = -1;
    // Same number of slides: an edit inside a slide, stay put. Otherwise follow the source line.
    const target =
      slides.length === before.count || before.line === undefined || Number.isNaN(before.line)
        ? before.index
        : indexForLine(before.line);
    show(target, false);
  }

  function refit(): void {
    if (!active) return;
    for (const s of slides) s.dirty = true;
    if (slides[index]) fit(slides[index]);
  }

  // ------------------------------------------------------------------ input

  function wake(): void {
    host.classList.remove('pm-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => host.classList.add('pm-idle'), 2200);
  }

  prevBtn.addEventListener('click', () => go(index - 1));
  nextBtn.addEventListener('click', () => go(index + 1));
  document.getElementById('pm-slide-exit')!.addEventListener('click', () => exit());
  host.addEventListener('mousemove', wake);

  document.addEventListener(
    'keydown',
    (e) => {
      if (!active || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : document.body;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const onButton = Boolean(target.closest('button, a[href], summary'));
      const scrolls = slides[index]?.el.classList.contains('pm-slide--scroll');
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case 'n':
          go(index + 1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
        case 'Backspace':
        case 'p':
          go(index - 1);
          break;
        case ' ':
          if (onButton) return;
          go(index + (e.shiftKey ? -1 : 1));
          break;
        case 'ArrowDown':
          if (scrolls) return;
          go(index + 1);
          break;
        case 'ArrowUp':
          if (scrolls) return;
          go(index - 1);
          break;
        case 'Home':
          go(0);
          break;
        case 'End':
          go(slides.length - 1);
          break;
        case 'Escape':
          exit();
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  // swipe on touch screens and pens
  let swipe: { x: number; y: number } | undefined;
  host.addEventListener('pointerdown', (e) => {
    swipe = e.pointerType === 'mouse' ? undefined : { x: e.clientX, y: e.clientY };
  });
  host.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = undefined;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
  });

  // late images change a slide's height
  stage.addEventListener(
    'load',
    (e) => {
      const el = (e.target as Element).closest('.pm-slide');
      const s = slides.find((x) => x.el === el);
      if (!s) return;
      s.dirty = true;
      if (s === slides[index]) fit(s);
    },
    true,
  );

  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (!active || resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      refit();
    });
  });

  return {
    get active() {
      return active;
    },
    enter,
    exit,
    rebuild,
    refit,
    goToLine: (line) => {
      if (active) go(indexForLine(line));
    },
    goToFragment: (fragment) => {
      const i = indexForFragment(fragment);
      if (i === undefined) return false;
      go(i);
      return true;
    },
  };
}
