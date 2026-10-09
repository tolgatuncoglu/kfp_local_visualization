import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Uri } from 'vscode';

export type EnvironmentDependencies = {
  getInterpreter(fileUri: Uri): Promise<string | undefined>;
  exists(path: string): boolean;
  platform: NodeJS.Platform;
};

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
  },
): Promise<string> {
  const interpreter = await dependencies.getInterpreter(fileUri);
  if (interpreter) {
    const folder = dirname(interpreter);
    const executableName = dependencies.platform === 'win32' ? 'kfp.exe' : 'kfp';
    const candidates = [join(folder, executableName)];
    if (dependencies.platform === 'win32') candidates.push(join(folder, 'Scripts', executableName));
    const found = candidates.find(dependencies.exists);
    if (found) return found;
    throw new Error(`KFP CLI was not found beside the selected Python interpreter: ${interpreter}. Install kfp in that environment.`);
  }
  if (configuredPath) {
    if (dependencies.exists(configuredPath)) return configuredPath;
    throw new Error(`Configured KFP executable does not exist: ${configuredPath}`);
  }
  return 'kfp';
}
