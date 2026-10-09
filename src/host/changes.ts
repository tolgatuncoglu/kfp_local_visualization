import type * as vscodeApi from 'vscode';

const IGNORED = /(^|\/)(__pycache__|\.venv|venv|node_modules|\.git)(\/|$)/;

export function isIgnoredPath(path: string): boolean {
  return IGNORED.test(path.replace(/\\/g, '/'));
}

// Fires for saves in VS Code and for on-disk changes (external tools, git). Python previews also watch every .py
// under the workspace folder because the pipeline may import sibling modules. Bursts are coalesced by PreviewController's debounce.
export function subscribeChanges(vscode: typeof vscodeApi, uri: vscodeApi.Uri, python: boolean, listener: () => void): { dispose(): void } {
  const disposables: { dispose(): void }[] = [];
  const key = uri.toString();
  disposables.push(vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.uri.toString() === key) listener();
  }));
  const folder = python ? vscode.workspace.getWorkspaceFolder(uri)?.uri : undefined;
  const parent = vscode.Uri.joinPath(uri, '..');
  const pattern = python
    ? new vscode.RelativePattern(folder ?? parent, '**/*.py')
    : new vscode.RelativePattern(parent, uri.path.slice(uri.path.lastIndexOf('/') + 1));
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  const onEvent = (changed: vscodeApi.Uri) => { if (!isIgnoredPath(changed.path)) listener(); };
  disposables.push(watcher, watcher.onDidChange(onEvent), watcher.onDidCreate(onEvent));
  if (python) disposables.push(watcher.onDidDelete(onEvent));
  return { dispose: () => disposables.forEach((item) => item.dispose()) };
}
