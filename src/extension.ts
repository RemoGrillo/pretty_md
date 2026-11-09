import * as vscode from 'vscode';
import { PrettyPreviewProvider, readSettings, updateSetting, localizedThemes } from './previewEditor';
import { isOpenByDefault, setOpenByDefault } from './defaults';
import { AppearanceViewProvider } from './sidebar/appearance';
import { OutlineProvider } from './sidebar/outline';
import { FilesProvider } from './sidebar/files';

const t = vscode.l10n.t;

export interface PrettyMdApi {
  provider: PrettyPreviewProvider;
  appearance: AppearanceViewProvider;
  outline: OutlineProvider;
  files: FilesProvider;
}

/** Commands get a Uri from editor menus, a tree node (with `.uri`) from the sidebar, or nothing from the palette. */
function uriFrom(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) return arg;
  const uri = (arg as { uri?: unknown } | undefined)?.uri;
  return uri instanceof vscode.Uri ? uri : undefined;
}

export function activate(context: vscode.ExtensionContext): PrettyMdApi {
  const provider = new PrettyPreviewProvider(context);
  const appearance = new AppearanceViewProvider(context.extensionUri, provider);
  const outline = new OutlineProvider(provider);
  const files = new FilesProvider();

  const targetUri = (arg?: unknown): vscode.Uri | undefined => {
    const uri = uriFrom(arg);
    if (uri) return uri;
    const active = vscode.window.activeTextEditor?.document;
    if (active?.languageId === 'markdown') return active.uri;
    return provider.active?.document.uri;
  };

  const openPreview = async (arg: unknown, column: vscode.ViewColumn) => {
    const target = targetUri(arg);
    if (!target) {
      void vscode.window.showInformationMessage(t('Open a Markdown file first.'));
      return;
    }
    await vscode.commands.executeCommand('vscode.openWith', target, PrettyPreviewProvider.viewType, column);
  };

  const outlineView = vscode.window.createTreeView('prettyMd.outline', { treeDataProvider: outline, showCollapseAll: true });
  outline.view = outlineView;
  const filesView = vscode.window.createTreeView('prettyMd.files', { treeDataProvider: files, showCollapseAll: true });

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(PrettyPreviewProvider.viewType, provider, {
      webviewOptions: { enableFindWidget: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.window.registerWebviewViewProvider(AppearanceViewProvider.viewId, appearance),
    appearance,
    outline,
    outlineView,
    files,
    filesView,

    vscode.commands.registerCommand('prettyMd.openPreview', (arg?: unknown) => openPreview(arg, vscode.ViewColumn.Active)),
    vscode.commands.registerCommand('prettyMd.openPreviewToSide', (arg?: unknown) =>
      openPreview(arg, vscode.ViewColumn.Beside),
    ),
    vscode.commands.registerCommand('prettyMd.openAsText', async (arg?: unknown) => {
      const target = targetUri(arg);
      if (target) await vscode.commands.executeCommand('vscode.openWith', target, 'default');
    }),

    vscode.commands.registerCommand('prettyMd.editSource', async (arg?: unknown) => {
      const target = uriFrom(arg) ?? provider.active?.document.uri;
      if (target) await provider.editSource(target, undefined, provider.active?.panel.viewColumn);
    }),

    vscode.commands.registerCommand('prettyMd.selectTheme', () => selectTheme(provider)),

    vscode.commands.registerCommand('prettyMd.toggleOpenByDefault', async () => {
      const enable = !isOpenByDefault();
      await setOpenByDefault(enable);
      void vscode.window.showInformationMessage(
        enable
          ? t('Markdown files will now open in pretty.md.')
          : t('Markdown files will now open in the text editor. Use "pretty.md: Open Pretty Preview" to read them pretty.'),
      );
    }),

    vscode.commands.registerCommand('prettyMd.revealHeading', (uri: vscode.Uri, id: string, line: number) =>
      provider.revealHeading(uri, id, line),
    ),
    vscode.commands.registerCommand('prettyMd.refreshFiles', () => files.refresh()),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('prettyMd')) provider.onConfigurationChanged(e);
    }),
  );
  return { provider, appearance, outline, files };
}

async function selectTheme(provider: PrettyPreviewProvider): Promise<void> {
  const current = readSettings().theme;
  const themes = localizedThemes();
  const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { id: string }>();
  qp.title = t('pretty.md: Select Theme');
  qp.placeholder = t('Move through the list to preview, Enter to apply');
  qp.items = themes.map((th) => ({
    id: th.id,
    label: th.label,
    description: th.id === current ? t('current') : undefined,
    detail: th.description,
  }));
  qp.activeItems = qp.items.filter((i) => i.id === current);
  let accepted = false;
  qp.onDidChangeActive((items) => {
    if (items[0]) provider.previewTheme(items[0].id);
  });
  qp.onDidAccept(async () => {
    const choice = qp.selectedItems[0] ?? qp.activeItems[0];
    accepted = true;
    qp.hide();
    if (choice) await updateSetting('theme', choice.id);
    provider.previewTheme(null);
  });
  qp.onDidHide(() => {
    if (!accepted) provider.previewTheme(null);
    qp.dispose();
  });
  qp.show();
}

export function deactivate(): void {}
