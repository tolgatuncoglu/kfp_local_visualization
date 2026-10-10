import { describe, expect, it, vi } from 'vitest';
import { subscribeChanges } from '../../src/host/changes';

function harness() {
  const handlers: Record<string, (uri: any) => void> = {};
  const patterns: { base: unknown; pattern: string }[] = [];
  const uri = (path: string): any => ({ path, toString: () => `file://${path}` });
  const watcher = {
    dispose: () => {},
    onDidChange: (h: any) => { handlers.change = h; return { dispose: () => {} }; },
    onDidCreate: (h: any) => { handlers.create = h; return { dispose: () => {} }; },
    onDidDelete: (h: any) => { handlers.delete = h; return { dispose: () => {} }; },
  };
  const vscode: any = {
    workspace: {
      onDidSaveTextDocument: () => ({ dispose: () => {} }),
      getWorkspaceFolder: () => undefined,
      createFileSystemWatcher: () => watcher,
    },
    Uri: { joinPath: (base: any) => base },
    RelativePattern: class { constructor(public base: unknown, public pattern: string) { patterns.push({ base, pattern }); } },
  };
  return { vscode, handlers, patterns, uri };
}

describe('subscribeChanges', () => {
  it('matches a YAML file with glob metacharacters by exact URI, not by pattern', () => {
    const h = harness();
    const listener = vi.fn();
    subscribeChanges(h.vscode, h.uri('/w/pipeline[prod].yaml'), false, listener);
    expect(h.patterns[0].pattern).toBe('*');
    h.handlers.change(h.uri('/w/pipeline[prod].yaml'));
    expect(listener).toHaveBeenCalledTimes(1);
    h.handlers.change(h.uri('/w/pipelinep.yaml'));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
