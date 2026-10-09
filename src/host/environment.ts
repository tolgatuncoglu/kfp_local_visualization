import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import type { Uri } from 'vscode';

export type EnvironmentDependencies = {
  getInterpreter(fileUri: Uri): Promise<string | undefined>;
  exists(path: string): boolean;
  platform: NodeJS.Platform;
  /** Whether `name` resolves on PATH (no shell). Absent means "not resolvable". */
  onPath?(name: string): boolean;
};

/** Looks `name` up in process.env.PATH (honouring PATHEXT on Windows) without spawning a shell. */
export function executableOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): boolean {
  const pathValue = env.PATH ?? env.Path ?? '';
  const extensions = platform === 'win32'
    ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)]
    : [''];
  for (const entry of pathValue.split(platform === 'win32' ? ';' : delimiter)) {
    if (!entry) continue;
    for (const extension of extensions) {
      if (exists(join(entry, name + extension))) return true;
    }
  }
  return false;
}

async function activeInterpreter(fileUri: Uri): Promise<string | undefined> {
  const vscode = require('vscode') as typeof import('vscode');
  const extension = vscode.extensions.getExtension('ms-python.python');
  if (!extension) return undefined;
  const api = await extension.activate() as {
    environments?: {
      getActiveEnvironmentPath(resource: Uri): { path: string } | undefined;
      resolveEnvironment(path: string): Promise<{ executable?: { uri?: Uri } } | undefined>;
    };
  };
  const selected = api.environments?.getActiveEnvironmentPath(fileUri);
  if (!selected) return undefined;
  const resolved = await api.environments?.resolveEnvironment(selected.path);
  return resolved?.executable?.uri?.fsPath;
}

export async function resolveKfpExecutable(
  fileUri: Uri,
  configuredPath?: string,
  dependencies: EnvironmentDependencies = {
    getInterpreter: activeInterpreter,
    exists: existsSync,
    platform: process.platform,
    onPath: (name) => executableOnPath(name),
  },
): Promise<string> {
  // 1. An explicit setting always wins over auto-detection.
  const configured = configuredPath?.trim();
  if (configured) {
    if (dependencies.exists(configured)) return configured;
    throw new Error(`Configured KFP executable does not exist: ${configured}`);
  }
  // 2. KFP beside the interpreter selected in the Python extension.
  const interpreter = await dependencies.getInterpreter(fileUri);
  if (interpreter) {
    const folder = dirname(interpreter);
    const executableName = dependencies.platform === 'win32' ? 'kfp.exe' : 'kfp';
    const candidates = [join(folder, executableName)];
    if (dependencies.platform === 'win32') candidates.push(join(folder, 'Scripts', executableName));
    const found = candidates.find(dependencies.exists);
    if (found) return found;
    // 3. Plain `kfp`, but only when it really resolves on PATH.
    if (dependencies.onPath?.('kfp')) return 'kfp';
    throw new Error(`KFP CLI was not found beside the selected Python interpreter: ${interpreter}, or on PATH. Install kfp in that environment or set kfpDagPreview.kfpExecutable.`);
  }
  return 'kfp';
}
