import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  trusted: true,
  errors: [] as string[],
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
    activeTextEditor: undefined,
  },
  workspace: {
    get isTrusted() { return state.trusted; },
    onDidSaveTextDocument: () => ({ dispose() {} }),
  },
  env: { clipboard: { writeText: async () => {} } },
}));

import { activate } from '../../src/host/extension';

beforeEach(() => {
  state.handlers.clear();
  state.errors.length = 0;
  state.trusted = true;
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
});
