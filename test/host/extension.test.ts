import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  trusted: true,
  errors: [] as string[],
  choices: [] as string[],
  picked: 'Enter function name…',
  panel: undefined as any,
  panelCallbacks: undefined as any,
  panelDisposals: 0,
  saveDisposals: 0,
}));

vi.mock('../../src/host/panel', () => ({
  createDagPanel: (_uri: unknown, callbacks: any) => {
    state.panelCallbacks = callbacks;
    state.panel = {
      whenReady: async () => {},
      showLoading() {}, showGraph() {}, showError() {}, showSizeWarning() {},
      dispose() { state.panelDisposals++; state.panelCallbacks.disposed(); },
    };
    return state.panel;
  },
}));

vi.mock('vscode', () => ({
  commands: {
    registerCommand: (name: string, handler: (...args: any[]) => unknown) => {
      state.handlers.set(name, handler);
      return { dispose() {} };
    },
  },
  window: {
    createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
    showErrorMessage: async (message: string) => { state.errors.push(message); },
    showQuickPick: async (choices: string[]) => { state.choices = choices; return state.picked; },
    showInputBox: async () => 'manual_pipeline',
    activeTextEditor: undefined,
  },
  workspace: {
    get isTrusted() { return state.trusted; },
    onDidSaveTextDocument: () => ({ dispose() { state.saveDisposals++; } }),
    openTextDocument: async () => ({ getText: () => 'root:\n  dag:\n    tasks:\n      hello: {taskInfo: {name: Hello}}\n' }),
  },
  env: { clipboard: { writeText: async () => {} } },
}));

import { activate, selectPipeline } from '../../src/host/extension';

beforeEach(() => {
  state.handlers.clear();
  state.errors.length = 0;
  state.trusted = true;
  state.choices = [];
  state.panelDisposals = 0;
  state.saveDisposals = 0;
});

describe('extension activation', () => {
  it('registers Python and compiled YAML preview commands', () => {
    activate({ subscriptions: [] } as any);
    expect([...state.handlers.keys()]).toEqual([
      'kfpDagPreview.previewPython',
      'kfpDagPreview.previewYaml',
    ]);
  });

  it('refuses Python compilation in an untrusted workspace', async () => {
    state.trusted = false;
    activate({ subscriptions: [] } as any);
    await state.handlers.get('kfpDagPreview.previewPython')!({ scheme: 'file', fsPath: '/work/pipeline.py' });
    expect(state.errors[0]).toContain('trusted workspace');
  });

  it('offers manual function entry even when one pipeline name is detected', async () => {
    const chosen = await selectPipeline('from kfp import dsl\n@dsl.pipeline\ndef known(): pass\n@kfp.dsl.pipeline\ndef other(): pass\n');
    expect(state.choices).toEqual(['known', 'Enter function name…']);
    expect(chosen).toBe('manual_pipeline');
  });

  it('disposes open preview panels and save listeners when the extension deactivates', async () => {
    const context = { subscriptions: [] as { dispose(): void }[] };
    activate(context as any);
    await state.handlers.get('kfpDagPreview.previewYaml')!({ scheme: 'file', fsPath: '/work/pipeline.yaml', toString: () => 'file:///work/pipeline.yaml' });
    expect(state.saveDisposals).toBe(0);
    context.subscriptions.forEach((subscription) => subscription.dispose());
    expect(state.panelDisposals).toBe(1);
    expect(state.saveDisposals).toBe(1);
  });
});
