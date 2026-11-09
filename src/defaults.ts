import * as vscode from 'vscode';

const MD_PATTERNS = ['*.md', '*.markdown'];

/**
 * pretty.md registers itself as the default editor for *.md. "Off" is a user-level
 * `workbench.editorAssociations` override back to the plain text editor.
 */
export function isOpenByDefault(): boolean {
  const assoc = vscode.workspace.getConfiguration('workbench').get<Record<string, string>>('editorAssociations') ?? {};
  return !MD_PATTERNS.some((p) => assoc[p] === 'default');
}

export async function setOpenByDefault(enabled: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('workbench');
  const current = { ...(config.inspect<Record<string, string>>('editorAssociations')?.globalValue ?? {}) };
  for (const p of MD_PATTERNS) {
    if (enabled) {
      if (current[p] === 'default') delete current[p];
    } else {
      current[p] = 'default';
    }
  }
  await config.update(
    'editorAssociations',
    Object.keys(current).length ? current : undefined,
    vscode.ConfigurationTarget.Global,
  );
}
