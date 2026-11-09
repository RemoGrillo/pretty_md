// "Markdown Files" view: every .md / .markdown file in the workspace, as a folder tree.
import * as vscode from 'vscode';

export type FileNode =
  | { kind: 'folder'; uri: vscode.Uri; label: string; children: FileNode[] }
  | { kind: 'file'; uri: vscode.Uri };

const ALWAYS_EXCLUDED = ['node_modules', '.git', '.venv', 'venv', '__pycache__', 'site-packages', '.tox', 'dist', 'out', 'build'];
const MAX_FILES = 5000;

function excludeGlob(): string {
  const patterns = ALWAYS_EXCLUDED.map((d) => `**/${d}/**`);
  const filesExclude = vscode.workspace.getConfiguration('files').get<Record<string, unknown>>('exclude') ?? {};
  for (const [glob, on] of Object.entries(filesExclude)) {
    if (on === true && !/[{}]/.test(glob)) patterns.push(glob, `${glob}/**`);
  }
  return `{${patterns.join(',')}}`;
}

export class FilesProvider implements vscode.TreeDataProvider<FileNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private roots: Promise<FileNode[]> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{md,markdown}', false, true, false);
    const later = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(), 400);
    };
    this.disposables.push(
      watcher,
      watcher.onDidCreate(later),
      watcher.onDidDelete(later),
      vscode.workspace.onDidChangeWorkspaceFolders(later),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('files.exclude')) later();
      }),
    );
  }

  refresh(): void {
    this.roots = undefined;
    this.emitter.fire();
  }

  private async build(): Promise<FileNode[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (!folders.length) return [];
    const uris = await vscode.workspace.findFiles('**/*.{md,markdown}', excludeGlob(), MAX_FILES);
    const tops = folders.map((f): FileNode => ({ kind: 'folder', uri: f.uri, label: f.name, children: [] }));
    for (const uri of uris) {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      if (!folder) continue;
      const top = tops[folder.index] as Extract<FileNode, { kind: 'folder' }>;
      const parts = vscode.workspace.asRelativePath(uri, false).split('/');
      let node = top;
      let dir = folder.uri;
      for (const part of parts.slice(0, -1)) {
        dir = vscode.Uri.joinPath(dir, part);
        let next = node.children.find((c) => c.kind === 'folder' && c.uri.path === dir.path) as
          | Extract<FileNode, { kind: 'folder' }>
          | undefined;
        if (!next) {
          next = { kind: 'folder', uri: dir, label: part, children: [] };
          node.children.push(next);
        }
        node = next;
      }
      node.children.push({ kind: 'file', uri });
    }
    for (const top of tops) sortAndCompact(top);
    // A single workspace folder: show its contents directly.
    return tops.length === 1 ? (tops[0] as Extract<FileNode, { kind: 'folder' }>).children : tops.filter((t) => t.kind === 'folder' && t.children.length);
  }

  getChildren(node?: FileNode): Thenable<FileNode[]> | FileNode[] {
    if (node) return node.kind === 'folder' ? node.children : [];
    this.roots ??= this.build();
    return this.roots;
  }

  getTreeItem(node: FileNode): vscode.TreeItem {
    if (node.kind === 'folder') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.resourceUri = node.uri;
      item.iconPath = vscode.ThemeIcon.Folder;
      item.id = `folder:${node.uri.toString()}`;
      return item;
    }
    const item = new vscode.TreeItem(node.uri, vscode.TreeItemCollapsibleState.None);
    item.iconPath = vscode.ThemeIcon.File;
    item.id = `file:${node.uri.toString()}`;
    item.contextValue = 'prettyMd.file';
    item.tooltip = vscode.workspace.asRelativePath(node.uri);
    item.command = { command: 'prettyMd.openPreview', title: '', arguments: [node.uri] };
    return item;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.emitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

/** Folders first, then files, alphabetically; merge single-child folder chains ("docs/guides"). */
function sortAndCompact(node: FileNode): void {
  if (node.kind !== 'folder') return;
  for (const child of node.children) sortAndCompact(child);
  node.children = node.children.map((c) => {
    let cur = c;
    while (cur.kind === 'folder' && cur.children.length === 1 && cur.children[0].kind === 'folder') {
      const only = cur.children[0];
      cur = { ...only, label: `${cur.label}/${only.label}` };
    }
    return cur;
  });
  const name = (n: FileNode) => (n.kind === 'folder' ? n.label : n.uri.path.split('/').pop()!).toLowerCase();
  node.children.sort((a, b) => (a.kind === b.kind ? name(a).localeCompare(name(b)) : a.kind === 'folder' ? -1 : 1));
}
