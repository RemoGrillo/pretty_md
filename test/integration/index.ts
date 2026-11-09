// Runs inside a real VS Code / VSCodium extension host (see scripts/integration.mjs).
import * as vscode from 'vscode';
import * as assert from 'assert';
import type { PrettyMdApi } from '../../src/extension';
import type { FileNode } from '../../src/sidebar/files';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(what: string, fn: () => T | undefined | false, timeout = 15000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for: ${what}`);
    await sleep(100);
  }
}
const log = (msg: string) => console.log(`[pretty-md test] ${msg}`);

export async function run(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders![0].uri;
  const doc = vscode.Uri.joinPath(folder, 'showcase.md');
  const other = vscode.Uri.joinPath(folder, 'other.md');

  const ext = vscode.extensions.getExtension<PrettyMdApi>('remogrillo.pretty-md');
  assert.ok(ext, 'extension present');
  log(`VS Code ${vscode.version}`);

  // 1. Opening a .md file uses pretty.md by default.
  await vscode.commands.executeCommand('vscode.open', doc);
  const tab = await waitFor('custom editor tab', () => {
    const t = vscode.window.tabGroups.activeTabGroup.activeTab;
    return t?.input instanceof vscode.TabInputCustom ? t : undefined;
  });
  assert.strictEqual((tab.input as vscode.TabInputCustom).viewType, 'prettyMd.preview');
  log('PASS opens .md in pretty.md by default');

  // 2. The webview script loads under the CSP and reports ready.
  const { provider } = ext.exports;
  const preview = await waitFor('preview ready', () => {
    const p = provider.findPreview(doc);
    return p?.isReady ? p : undefined;
  });
  log('PASS webview script loaded and handshake completed');

  // 2b. Sidebar: the activity bar container opens and its three views work.
  await vscode.commands.executeCommand('workbench.view.extension.prettyMd');
  const { appearance, outline, files } = ext.exports;
  await waitFor('appearance view resolved', () => appearance.isResolved);
  const roots = await waitFor('outline populated', () => {
    const r = outline.getChildren();
    return r.length ? r : undefined;
  });
  assert.strictEqual(roots[0].heading.text, 'On Reading Well');
  assert.deepStrictEqual(
    roots[0].children.map((c) => c.heading.text),
    ['Why typography matters'],
  );
  await vscode.commands.executeCommand('prettyMd.revealHeading', doc, 'what-you-get', roots[0].children[0].children[0].heading.line);
  const tree = (await files.getChildren()) as FileNode[];
  const labels = tree.map((n) => (n.kind === 'folder' ? `${n.label}/` : n.uri.path.split('/').pop()));
  assert.deepStrictEqual(labels, ['docs/guide/', 'other.md', 'showcase.md']);
  await appearance.handleMessage({ type: 'setWidth', width: 'wide' });
  assert.strictEqual(vscode.workspace.getConfiguration('prettyMd').get('contentWidth'), 'wide');
  await appearance.handleMessage({ type: 'previewTheme', theme: 'terminal' });
  await appearance.handleMessage({ type: 'previewTheme', theme: null });
  log('PASS sidebar: appearance view, contents tree, files tree');

  // 3. Theme / font size settings round-trip without errors.
  await preview.handleMessage({ type: 'setTheme', theme: 'night' });
  assert.strictEqual(vscode.workspace.getConfiguration('prettyMd').get('theme'), 'night');
  await preview.handleMessage({ type: 'setFontSize', size: 19 });
  assert.strictEqual(vscode.workspace.getConfiguration('prettyMd').get('fontSize'), 19);
  log('PASS theme and font size are saved to settings');

  // 4. Ticking a task in the preview edits the source.
  const textDoc = await vscode.workspace.openTextDocument(doc);
  const taskLine = textDoc.getText().split('\n').findIndex((l) => l.includes('[ ] Your next idea'));
  await preview.handleMessage({ type: 'toggleTask', line: taskLine });
  assert.match(textDoc.lineAt(taskLine).text, /\[x\] Your next idea/);
  log('PASS task checkbox toggles the Markdown source');

  // 5. "Edit" opens the text editor beside, at the requested line.
  await preview.handleMessage({ type: 'editSource', line: 10 });
  const editor = await waitFor('text editor', () =>
    vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === doc.toString()),
  );
  assert.strictEqual(editor.selection.active.line, 10);
  assert.notStrictEqual(editor.viewColumn, preview.panel.viewColumn);
  log('PASS edit source opens a text editor beside the preview');

  // 6. Live update: editing the source re-renders without errors.
  await editor.edit((e) => e.insert(new vscode.Position(textDoc.lineCount, 0), '\n## Added live\n'));
  await sleep(400);
  log('PASS live edit accepted');

  // 7. Diffs between Markdown files stay textual.
  await vscode.commands.executeCommand('vscode.diff', other, doc, 'diff');
  const diffTab = await waitFor('diff tab', () => vscode.window.tabGroups.activeTabGroup.activeTab);
  log(`diff tab input: ${diffTab.input?.constructor?.name}`);
  assert.ok(diffTab.input instanceof vscode.TabInputTextDiff, 'diff opens as a text diff');
  log('PASS diffs use the text diff editor');

  // 8. Commands are registered.
  const cmds = await vscode.commands.getCommands(true);
  for (const c of ['prettyMd.openPreview', 'prettyMd.openPreviewToSide', 'prettyMd.editSource', 'prettyMd.selectTheme', 'prettyMd.toggleOpenByDefault']) {
    assert.ok(cmds.includes(c), c);
  }
  log('PASS commands registered');

  // 9. Toggle back to the text editor by default, and again.
  await vscode.commands.executeCommand('prettyMd.toggleOpenByDefault');
  const assoc = vscode.workspace.getConfiguration('workbench').get<Record<string, string>>('editorAssociations') ?? {};
  assert.strictEqual(assoc['*.md'], 'default');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.commands.executeCommand('vscode.open', other);
  await waitFor('text editor for other.md', () =>
    vscode.window.activeTextEditor?.document.uri.toString() === other.toString(),
  );
  await vscode.commands.executeCommand('prettyMd.toggleOpenByDefault');
  const after = vscode.workspace.getConfiguration('workbench').inspect<Record<string, string>>('editorAssociations');
  assert.ok(!after?.globalValue?.['*.md'], 'override removed');
  log('PASS toggle open-by-default');

  await vscode.commands.executeCommand('workbench.action.files.revert');
  log('ALL PASSED');
}
