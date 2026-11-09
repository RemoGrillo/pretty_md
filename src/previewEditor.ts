import * as vscode from 'vscode';
import * as path from 'path';
import { createRenderer, type Renderer, type RenderStrings } from './renderer';
import { buildPage, type ContentWidth, type UiStrings, type ViewSettings } from './template';
import { THEMES, THEME_IDS, DEFAULT_THEME } from './themes';

const t = vscode.l10n.t;

export interface Settings extends ViewSettings {
  typographer: boolean;
  breaks: boolean;
  scrollSync: boolean;
  editSourceBeside: boolean;
}

export function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration('prettyMd');
  const theme = c.get<string>('theme', DEFAULT_THEME);
  const width = c.get<string>('contentWidth', 'medium');
  return {
    theme: THEME_IDS.includes(theme) ? theme : DEFAULT_THEME,
    fontSize: Math.min(32, Math.max(10, Number(c.get('fontSize', 17)) || 17)),
    contentWidth: (['narrow', 'medium', 'wide', 'full'].includes(width) ? width : 'medium') as ContentWidth,
    slideLevel: Math.min(6, Math.max(1, Math.round(Number(c.get('slideLevel', 3))) || 3)),
    typographer: c.get('typographer', true),
    breaks: c.get('breaks', false),
    scrollSync: c.get('scrollSync', true),
    editSourceBeside: c.get('editSourceBeside', true),
  };
}

/** Write a prettyMd.* setting where it will actually take effect (workspace if overridden there, else user). */
export async function updateSetting(key: string, value: unknown): Promise<void> {
  const c = vscode.workspace.getConfiguration('prettyMd');
  const info = c.inspect(key);
  const target =
    info?.workspaceFolderValue !== undefined
      ? vscode.ConfigurationTarget.WorkspaceFolder
      : info?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
  await c.update(key, value, target);
}

function renderStrings(): RenderStrings {
  return {
    copy: t('Copy'),
    frontMatter: t('Front matter'),
    note: t('Note'),
    tip: t('Tip'),
    important: t('Important'),
    warning: t('Warning'),
    caution: t('Caution'),
  };
}

function uiStrings(): UiStrings {
  return {
    contents: t('Contents'),
    theme: t('Theme'),
    smaller: t('Smaller text'),
    larger: t('Larger text'),
    edit: t('Edit'),
    editTitle: t('Edit the Markdown source (or double-click any paragraph)'),
    noHeadings: t('No headings'),
    copied: t('Copied'),
    slides: t('Slides'),
    slidesTitle: t('Present as slides (← → to move, Esc to exit)'),
    prevSlide: t('Previous slide'),
    nextSlide: t('Next slide'),
    exitSlides: t('Exit slides (Esc)'),
  };
}

export function localizedThemes() {
  return THEMES.map((th) => ({ ...th, description: t(th.description) }));
}

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

const viewSettings = (s: Settings): ViewSettings => ({
  theme: s.theme,
  fontSize: s.fontSize,
  contentWidth: s.contentWidth,
  slideLevel: s.slideLevel,
});

export interface SlideState {
  active: boolean;
  index: number;
  count: number;
}

const dirname = (uri: vscode.Uri): vscode.Uri => uri.with({ path: path.posix.dirname(uri.path) });

type FromWebview =
  | { type: 'ready' }
  | { type: 'setTheme'; theme: string }
  | { type: 'setFontSize'; size: number }
  | { type: 'openLink'; href: string }
  | { type: 'editSource'; line?: number }
  | { type: 'toggleTask'; line: number }
  | ({ type: 'slides' } & SlideState);

export class PrettyPreviewProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'prettyMd.preview';

  private readonly previews = new Set<Preview>();
  private settings = readSettings();
  private renderer: Renderer = this.makeRenderer();
  /** Fragment to scroll to once a preview for that document is ready (`[x](other.md#part)`). */
  readonly pendingFragments = new Map<string, string>();
  /** Documents whose preview should switch to slide mode once ready. */
  readonly pendingSlides = new Set<string>();
  private activePreview: Preview | undefined;
  private readonly activeEmitter = new vscode.EventEmitter<Preview | undefined>();
  /** Fires when the focused pretty.md preview changes (undefined when it is closed). */
  readonly onDidChangeActive = this.activeEmitter.event;

  get active(): Preview | undefined {
    return this.activePreview;
  }

  setActive(preview: Preview | undefined): void {
    if (this.activePreview === preview) return;
    this.activePreview = preview;
    this.activeEmitter.fire(preview);
    this.updateSlidesContext();
  }

  /** `prettyMd.slidesActive` drives the play / stop button in the editor title. */
  updateSlidesContext(): void {
    void vscode.commands.executeCommand('setContext', 'prettyMd.slidesActive', Boolean(this.activePreview?.slides.active));
  }

  /** Turn slide mode on or off for a document, opening its preview first if needed. */
  async setSlides(uri: vscode.Uri, on: boolean): Promise<void> {
    const key = uri.toString();
    const preview = this.findPreview(uri);
    if (!on) {
      this.pendingSlides.delete(key);
      preview?.post({ type: 'stopSlides' });
      return;
    }
    if (preview?.isReady && preview.panel.visible) {
      preview.panel.reveal(undefined, false);
      preview.post({ type: 'startSlides' });
      return;
    }
    this.pendingSlides.add(key);
    if (preview) preview.panel.reveal(undefined, false);
    else await vscode.commands.executeCommand('vscode.openWith', uri, PrettyPreviewProvider.viewType);
  }

  constructor(readonly context: vscode.ExtensionContext) {}

  private makeRenderer(): Renderer {
    return createRenderer({
      typographer: this.settings.typographer,
      breaks: this.settings.breaks,
      strings: renderStrings(),
    });
  }

  getSettings(): Settings {
    return this.settings;
  }

  render(document: vscode.TextDocument): string {
    return this.renderer.render(document.getText());
  }

  outline(document: vscode.TextDocument) {
    return this.renderer.outline(document.getText());
  }

  /** Scroll to a heading: in the preview if one is open, and in a visible source editor. */
  async revealHeading(uri: vscode.Uri, id: string, line: number): Promise<void> {
    const preview = this.findPreview(uri);
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
    if (editor) {
      const range = new vscode.Range(line, 0, line, 0);
      editor.selection = new vscode.Selection(range.start, range.start);
      editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    }
    if (preview) {
      if (preview.panel.visible) {
        preview.post({ type: 'scrollToFragment', fragment: id });
      } else {
        // A hidden webview is rebuilt on reveal: scroll once it reports ready.
        this.pendingFragments.set(uri.toString(), id);
        preview.panel.reveal(undefined, false);
      }
    } else if (!editor) {
      this.pendingFragments.set(uri.toString(), id);
      await vscode.commands.executeCommand('vscode.openWith', uri, PrettyPreviewProvider.viewType);
    }
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const preview = new Preview(this, document, panel);
    this.previews.add(preview);
    if (panel.active) this.setActive(preview);
    panel.onDidDispose(() => {
      this.previews.delete(preview);
      if (this.activePreview === preview) this.setActive(undefined);
    });
  }

  onConfigurationChanged(e: vscode.ConfigurationChangeEvent): void {
    const before = this.settings;
    this.settings = readSettings();
    const rerender = before.typographer !== this.settings.typographer || before.breaks !== this.settings.breaks;
    if (rerender) this.renderer = this.makeRenderer();
    for (const p of this.previews) {
      p.postSettings();
      if (rerender) p.update();
    }
    void e;
  }

  /** Temporarily show a theme in every preview (quick pick hover); `null` restores the configured one. */
  previewTheme(theme: string | null): void {
    for (const p of this.previews) p.post({ type: 'previewTheme', theme });
  }

  findPreview(uri: vscode.Uri): Preview | undefined {
    for (const p of this.previews) if (p.document.uri.toString() === uri.toString()) return p;
    return undefined;
  }

  async editSource(uri: vscode.Uri, line?: number, column?: vscode.ViewColumn): Promise<void> {
    const selection = line !== undefined ? new vscode.Range(line, 0, line, 0) : undefined;
    const existing = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
    if (existing) {
      const editor = await vscode.window.showTextDocument(existing.document, { viewColumn: existing.viewColumn, selection });
      if (selection) editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      return;
    }
    const beside = this.settings.editSourceBeside;
    await vscode.commands.executeCommand('vscode.openWith', uri, 'default', {
      viewColumn: beside ? vscode.ViewColumn.Beside : (column ?? vscode.ViewColumn.Active),
      preview: false,
      selection,
    } satisfies vscode.TextDocumentShowOptions);
  }
}

class Preview {
  private readonly disposables: vscode.Disposable[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ready = false;
  /** As last reported by the webview. */
  slides: SlideState = { active: false, index: 0, count: 0 };

  get isReady(): boolean {
    return this.ready;
  }

  constructor(
    private readonly provider: PrettyPreviewProvider,
    readonly document: vscode.TextDocument,
    readonly panel: vscode.WebviewPanel,
  ) {
    const webview = panel.webview;
    const ext = provider.context.extensionUri;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(ext, 'media'),
        vscode.Uri.joinPath(ext, 'dist'),
        dirname(document.uri),
        ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri),
      ],
    };
    webview.html = this.html();

    this.disposables.push(
      webview.onDidReceiveMessage((m: FromWebview) => this.handleMessage(m)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === document && e.contentChanges.length) this.scheduleUpdate();
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (
          provider.getSettings().scrollSync &&
          e.textEditor.document === document &&
          e.textEditor === vscode.window.activeTextEditor &&
          e.visibleRanges.length
        ) {
          this.post({ type: 'scrollToLine', line: e.visibleRanges[0].start.line });
        }
      }),
      panel.onDidChangeViewState(() => {
        if (!panel.visible) this.ready = false; // its webview is torn down until shown again
        if (panel.active) provider.setActive(this);
      }),
    );
    panel.onDidDispose(() => {
      clearTimeout(this.timer);
      for (const d of this.disposables) d.dispose();
    });
  }

  private html(): string {
    const webview = this.panel.webview;
    const ext = this.provider.context.extensionUri;
    const s = this.provider.getSettings();
    const base = webview.asWebviewUri(dirname(this.document.uri)).toString();
    return buildPage({
      cspSource: webview.cspSource,
      nonce: nonce(),
      lang: vscode.env.language,
      baseHref: base.endsWith('/') ? base : `${base}/`,
      styleHref: webview.asWebviewUri(vscode.Uri.joinPath(ext, 'media', 'preview.css')).toString(),
      scriptSrc: webview.asWebviewUri(vscode.Uri.joinPath(ext, 'dist', 'webview.js')).toString(),
      bodyHtml: this.provider.render(this.document),
      init: {
        settings: viewSettings(s),
        themes: localizedThemes(),
        strings: uiStrings(),
      },
    });
  }

  post(message: unknown): void {
    if (this.ready) void this.panel.webview.postMessage(message);
  }

  postSettings(): void {
    this.post({ type: 'settings', settings: viewSettings(this.provider.getSettings()) });
  }

  private scheduleUpdate(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.update(), 120);
  }

  update(): void {
    this.post({ type: 'render', html: this.provider.render(this.document) });
  }

  async handleMessage(m: FromWebview): Promise<void> {
    switch (m.type) {
      case 'ready': {
        // The webview is (re)created from the html set at startup, which may be stale
        // after edits made while the tab was hidden: always resync.
        this.ready = true;
        this.postSettings();
        this.update();
        const key = this.document.uri.toString();
        const fragment = this.provider.pendingFragments.get(key);
        if (fragment) {
          this.provider.pendingFragments.delete(key);
          this.post({ type: 'scrollToFragment', fragment });
        }
        if (this.provider.pendingSlides.delete(key)) this.post({ type: 'startSlides' });
        break;
      }
      case 'slides':
        this.slides = { active: m.active, index: m.index, count: m.count };
        if (this.provider.active === this) this.provider.updateSlidesContext();
        break;
      case 'setTheme':
        if (THEME_IDS.includes(m.theme)) await updateSetting('theme', m.theme);
        break;
      case 'setFontSize':
        await updateSetting('fontSize', Math.min(32, Math.max(10, Math.round(m.size))));
        break;
      case 'editSource':
        await this.provider.editSource(this.document.uri, m.line, this.panel.viewColumn);
        break;
      case 'toggleTask':
        await this.toggleTask(m.line);
        break;
      case 'openLink':
        await this.openLink(m.href);
        break;
    }
  }

  private async toggleTask(line: number): Promise<void> {
    if (line < 0 || line >= this.document.lineCount) return;
    const text = this.document.lineAt(line).text;
    const m = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(text);
    if (!m) return;
    const col = m[1].length;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(this.document.uri, new vscode.Range(line, col, line, col + 1), m[2] === ' ' ? 'x' : ' ');
    await vscode.workspace.applyEdit(edit);
  }

  private async openLink(href: string): Promise<void> {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
    if (scheme) {
      if (['http', 'https', 'mailto'].includes(scheme)) {
        await vscode.env.openExternal(vscode.Uri.parse(href, true));
      } else if (scheme === 'file') {
        await this.openTarget(vscode.Uri.parse(href, true));
      }
      // Anything else (command:, vscode:, javascript: …) is deliberately ignored.
      return;
    }
    const hash = href.indexOf('#');
    const rawPath = hash >= 0 ? href.slice(0, hash) : href;
    const fragment = hash >= 0 ? decodeURIComponent(href.slice(hash + 1)) : '';
    if (!rawPath) {
      if (fragment) this.post({ type: 'scrollToFragment', fragment });
      return;
    }
    let target: vscode.Uri;
    let decoded = rawPath;
    try {
      decoded = decodeURIComponent(rawPath.split('?')[0]);
    } catch {
      /* keep raw */
    }
    if (decoded.startsWith('/')) {
      // GitHub-style root-relative link: relative to the workspace folder, else absolute.
      const folder = vscode.workspace.getWorkspaceFolder(this.document.uri);
      target = folder ? vscode.Uri.joinPath(folder.uri, decoded) : this.document.uri.with({ path: decoded });
    } else {
      target = vscode.Uri.joinPath(dirname(this.document.uri), decoded);
    }
    await this.openTarget(target, fragment);
  }

  private async openTarget(target: vscode.Uri, fragment = ''): Promise<void> {
    try {
      await vscode.workspace.fs.stat(target);
    } catch {
      void vscode.window.showWarningMessage(t('File not found: {0}', vscode.workspace.asRelativePath(target)));
      return;
    }
    const isMarkdown = /\.(md|markdown)$/i.test(target.path);
    if (isMarkdown && fragment) {
      const open = this.provider.findPreview(target);
      if (open) {
        open.panel.reveal();
        open.post({ type: 'scrollToFragment', fragment });
        return;
      }
      this.provider.pendingFragments.set(target.toString(), fragment);
    }
    const line = /^L(\d+)/.exec(fragment)?.[1];
    await vscode.commands.executeCommand(
      'vscode.open',
      target,
      line && !isMarkdown ? { selection: new vscode.Range(+line - 1, 0, +line - 1, 0) } : undefined,
    );
  }
}
