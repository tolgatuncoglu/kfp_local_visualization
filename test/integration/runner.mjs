import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const workspace = await mkdtemp(join(tmpdir(), 'kfp-vscode-test-'));
const macExecutable = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
try {
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || (process.platform === 'darwin' && existsSync(macExecutable) ? macExecutable : undefined),
    extensionDevelopmentPath: resolve('.'),
    extensionTestsPath: resolve('dist/integration.js'),
    launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust', '--user-data-dir', join(workspace, 'user-data')],
  });
} finally {
  await rm(workspace, { recursive: true, force: true });
}
