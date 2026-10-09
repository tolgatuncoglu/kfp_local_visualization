import assert from 'node:assert/strict';
import { chmod, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';

async function until(check: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for VS Code extension behavior');
}

export async function run(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(workspace, 'integration workspace exists');
  const extension = vscode.extensions.getExtension('tolgatuncoglu.kfp-dag-preview');
  assert.ok(extension, 'development extension is installed');
  await extension.activate();
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('kfpDagPreview.previewPython'));
  assert.ok(commands.includes('kfpDagPreview.previewYaml'));

  const pipelinePath = join(workspace, 'pipeline.py');
  const executable = join(workspace, 'fake-kfp');
  const countPath = join(workspace, 'compile-count.txt');
  await writeFile(pipelinePath, 'from kfp import dsl\n@dsl.pipeline\ndef demo(): pass\n');
  await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const input = args[args.indexOf('--py') + 1];
const output = args[args.indexOf('--output') + 1];
const countFile = path.join(path.dirname(input), 'compile-count.txt');
const previous = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0;
fs.writeFileSync(countFile, String(previous + 1));
const source = fs.readFileSync(input, 'utf8');
const task = source.includes('# changed') ? 'after' : 'before';
fs.writeFileSync(output, 'pipelineInfo: {name: demo}\\nroot:\\n  dag:\\n    tasks:\\n      ' + task + ': {taskInfo: {name: ' + task + '}}\\n');
`);
  await chmod(executable, 0o755);
  await vscode.workspace.getConfiguration('kfpDagPreview').update('kfpExecutable', executable, vscode.ConfigurationTarget.Global);

  const uri = vscode.Uri.file(pipelinePath);
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  await vscode.commands.executeCommand('kfpDagPreview.previewPython', uri);
  await until(async () => { try { return Number(await readFile(countPath, 'utf8')) >= 1; } catch { return false; } });
  const hasSidePanel = vscode.window.tabGroups.all.some((group) =>
    group.tabs.some((tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('kfpDagPreview')),
  );
  assert.ok(hasSidePanel, 'preview opens in a VS Code webview tab');

  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, document.lineAt(document.lineCount - 1).range.end, '# changed\n');
  await vscode.workspace.applyEdit(edit);
  await document.save();
  await until(async () => Number(await readFile(countPath, 'utf8')) >= 2);
  assert.equal(Number(await readFile(countPath, 'utf8')), 2, 'saving recompiles once');
  assert.ok((await stat(pipelinePath)).isFile(), 'source file remains present');
}
