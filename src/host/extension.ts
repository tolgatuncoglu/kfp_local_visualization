import * as vscode from 'vscode';
import { parsePipelineSpec } from '../core/graph';
import { compilePipeline } from './compiler';
import { resolveKfpExecutable } from './environment';
import { createDagPanel } from './panel';
import { discoverPipelineNames } from './pipelines';
import { PreviewController } from './previewController';

function activeUri(provided?: vscode.Uri): vscode.Uri | undefined {
  return provided ?? vscode.window.activeTextEditor?.document.uri;
}

export async function selectPipeline(source: string): Promise<string | undefined> {
  const names = discoverPipelineNames(source);
  if (names.length > 0) {
    const manual = 'Enter function name…';
    const picked = await vscode.window.showQuickPick([...names, manual], {
      placeHolder: 'Select a KFP pipeline to preview',
    });
    if (!picked) return undefined;
    if (picked !== manual) return picked;
  }
  return vscode.window.showInputBox({
    prompt: 'Pipeline function name',
    placeHolder: 'my_pipeline',
    validateInput: (value) => /^\w+$/.test(value) ? undefined : 'Enter a Python function name',
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('KFP DAG Preview');
  context.subscriptions.push(output);

  async function openPreview(uri: vscode.Uri, load: (signal: AbortSignal) => Promise<ReturnType<typeof parsePipelineSpec>>): Promise<void> {
    let controller: PreviewController | undefined;
    let closed = false;
    const panel = createDagPanel(uri, {
      refresh: () => { void controller?.refresh(); },
      copyMermaid: () => {
        const source = controller?.getMermaidSource();
        if (source) void vscode.env.clipboard.writeText(source);
      },
      collapse: (scopeId) => controller?.collapse(scopeId),
      renderAnyway: () => controller?.renderAnyway(),
      showOutput: () => output.show(true),
      disposed: () => { closed = true; controller?.dispose(); },
    });
    context.subscriptions.push(panel);
    await panel.whenReady();
    if (closed) return;
    controller = new PreviewController({
      sourceUri: uri.toString(),
      load,
      panel,
      subscribeSave: (listener) => vscode.workspace.onDidSaveTextDocument((document) => listener(document.uri.toString())),
      reportError: (error) => output.appendLine(`[${new Date().toISOString()}] ${uri.fsPath}\n${error.stack ?? error.message}\n`),
    });
    await controller.start();
  }

  context.subscriptions.push(vscode.commands.registerCommand('kfpDagPreview.previewPython', async (provided?: vscode.Uri, requestedFunctionName?: string) => {
    if (!vscode.workspace.isTrusted) {
      await vscode.window.showErrorMessage('KFP DAG Preview needs a trusted workspace to compile Python pipeline code.');
      return;
    }
    const uri = activeUri(provided);
    if (!uri || uri.scheme !== 'file' || !uri.fsPath.endsWith('.py')) {
      await vscode.window.showErrorMessage('Open a local Python pipeline file to preview its DAG.');
      return;
    }
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const functionName = requestedFunctionName ?? await selectPipeline(document.getText());
      if (!functionName) return;
      await openPreview(uri, async (signal) => {
        const configured = vscode.workspace.getConfiguration('kfpDagPreview', uri).get<string>('kfpExecutable');
        const executable = await resolveKfpExecutable(uri, configured || undefined);
        const yaml = await compilePipeline({ filePath: uri.fsPath, functionName, executable, signal });
        return parsePipelineSpec(yaml);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(message);
      await vscode.window.showErrorMessage(`KFP DAG Preview: ${message}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('kfpDagPreview.previewYaml', async (provided?: vscode.Uri) => {
    const uri = activeUri(provided);
    if (!uri || !['file', 'vscode-remote'].includes(uri.scheme)) {
      await vscode.window.showErrorMessage('Open a compiled KFP v2 YAML file to preview its DAG.');
      return;
    }
    try {
      await openPreview(uri, async () => {
        const document = await vscode.workspace.openTextDocument(uri);
        return parsePipelineSpec(document.getText());
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(message);
      await vscode.window.showErrorMessage(`KFP DAG Preview: ${message}`);
    }
  }));
}

export function deactivate(): void {}
