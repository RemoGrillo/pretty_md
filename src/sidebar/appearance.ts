// "Appearance" view: theme thumbnails, text size, column width, open-by-default.
import * as vscode from 'vscode';
import { localizedThemes, readSettings, updateSetting, type PrettyPreviewProvider } from '../previewEditor';
import { isOpenByDefault, setOpenByDefault } from '../defaults';
import { THEME_IDS } from '../themes';
import { scriptJson } from '../template';

const t = vscode.l10n.t;

type FromView =
  | { type: 'ready' }
  | { type: 'setTheme'; theme: string }
  | { type: 'previewTheme'; theme: string | null }
  | { type: 'setFontSize'; size: number }
  | { type: 'setWidth'; width: string }
  | { type: 'setOpenByDefault'; enabled: boolean }
  | { type: 'openSettings' };

function nonce(): string {
  let out = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}


export class AppearanceViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'prettyMd.appearance';
  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly provider: PrettyPreviewProvider,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('prettyMd') || e.affectsConfiguration('workbench.editorAssociations')) this.postState();
      }),
    );
  }

  get isResolved(): boolean {
    return this.view !== undefined;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const webview = view.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media'), vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };
    const n = nonce();
    const asUri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...p)).toString();
    const init = {
      themes: localizedThemes(),
      strings: {
        theme: t('Theme'),
        textSize: t('Text size'),
        smaller: t('Smaller text'),
        larger: t('Larger text'),
        width: t('Column width'),
        narrow: t('Narrow'),
        medium: t('Medium'),
        wide: t('Wide'),
        full: t('Full'),
        openByDefault: t('Open Markdown files in pretty.md'),
        settings: t('All settings…'),
      },
    };
    webview.html = `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${asUri('media', 'sidebar.css')}">
<script id="pm-init" type="application/json">${scriptJson(init)}</script>
</head>
<body>
<div id="app"></div>
<script nonce="${n}" src="${asUri('dist', 'sidebar.js')}"></script>
</body>
</html>`;
    this.disposables.push(
      webview.onDidReceiveMessage((m: FromView) => this.handleMessage(m)),
      view.onDidChangeVisibility(() => {
        if (!view.visible) this.provider.previewTheme(null);
      }),
      view.onDidDispose(() => {
        this.view = undefined;
      }),
    );
  }

  private postState(): void {
    if (!this.view) return;
    const s = readSettings();
    void this.view.webview.postMessage({
      type: 'state',
      state: { theme: s.theme, fontSize: s.fontSize, contentWidth: s.contentWidth, openByDefault: isOpenByDefault() },
    });
  }

  async handleMessage(m: FromView): Promise<void> {
    switch (m.type) {
      case 'ready':
        this.postState();
        break;
      case 'previewTheme':
        this.provider.previewTheme(m.theme && THEME_IDS.includes(m.theme) ? m.theme : null);
        break;
      case 'setTheme':
        if (THEME_IDS.includes(m.theme)) {
          await updateSetting('theme', m.theme);
          this.provider.previewTheme(null);
        }
        break;
      case 'setFontSize':
        await updateSetting('fontSize', Math.min(32, Math.max(10, Math.round(m.size))));
        break;
      case 'setWidth':
        if (['narrow', 'medium', 'wide', 'full'].includes(m.width)) await updateSetting('contentWidth', m.width);
        break;
      case 'setOpenByDefault':
        await setOpenByDefault(m.enabled);
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:remogrillo.pretty-md');
        break;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
