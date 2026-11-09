// "Contents" view: the headings of the Markdown document being read or edited.
import * as vscode from 'vscode';
import type { Heading } from '../renderer';
import type { PrettyPreviewProvider } from '../previewEditor';

export interface OutlineNode {
  heading: Heading;
  uri: vscode.Uri;
  children: OutlineNode[];
}

export class OutlineProvider implements vscode.TreeDataProvider<OutlineNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private document: vscode.TextDocument | undefined;
  private roots: OutlineNode[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  view: vscode.TreeView<OutlineNode> | undefined;

  constructor(private readonly provider: PrettyPreviewProvider) {
    this.disposables.push(
      provider.onDidChangeActive(() => this.track()),
      vscode.window.onDidChangeActiveTextEditor(() => this.track()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === this.document) {
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.rebuild(), 300);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((d) => {
        if (d === this.document) this.setDocument(undefined);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('prettyMd.typographer')) this.rebuild();
      }),
    );
    this.track();
  }

  /** Follow the active Markdown editor (text or pretty.md); keep the last one when focus moves elsewhere. */
  private track(): void {
    const text = vscode.window.activeTextEditor?.document;
    if (text?.languageId === 'markdown') return this.setDocument(text);
    const preview = this.provider.active;
    if (preview?.panel.active) return this.setDocument(preview.document);
    if (this.document && this.document.isClosed) this.setDocument(undefined);
  }

  private setDocument(doc: vscode.TextDocument | undefined): void {
    if (doc === this.document) return;
    this.document = doc;
    this.rebuild();
  }

  private rebuild(): void {
    const doc = this.document;
    this.roots = [];
    if (doc) {
      const stack: OutlineNode[] = [];
      for (const heading of this.provider.outline(doc)) {
        const node: OutlineNode = { heading, uri: doc.uri, children: [] };
        while (stack.length && stack[stack.length - 1].heading.level >= heading.level) stack.pop();
        (stack.length ? stack[stack.length - 1].children : this.roots).push(node);
        stack.push(node);
      }
    }
    if (this.view) this.view.description = doc ? vscode.workspace.asRelativePath(doc.uri) : undefined;
    this.emitter.fire();
  }

  get currentDocument(): vscode.TextDocument | undefined {
    return this.document;
  }

  getChildren(node?: OutlineNode): OutlineNode[] {
    return node ? node.children : this.roots;
  }

  getTreeItem(node: OutlineNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.heading.text || ' ',
      node.children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
    );
    item.id = `${node.uri.toString()}#${node.heading.id}`;
    item.tooltip = `${'#'.repeat(node.heading.level)} ${node.heading.text}`;
    item.command = {
      command: 'prettyMd.revealHeading',
      title: '',
      arguments: [node.uri, node.heading.id, node.heading.line],
    };
    return item;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.emitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
