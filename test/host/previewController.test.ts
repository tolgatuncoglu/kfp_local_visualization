import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePipelineSpec, type PipelineGraph } from '../../src/core/graph';
import { PreviewController } from '../../src/host/previewController';

const sample = parsePipelineSpec(readFileSync(join(__dirname, '..', 'fixtures', 'simple.yaml'), 'utf8'));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(load: (signal: AbortSignal) => Promise<PipelineGraph> = async () => sample) {
  let changed: () => void = () => {};
  const subscription = { dispose: vi.fn() };
  const panel = {
    showLoading: vi.fn(),
    showGraph: vi.fn(),
    showError: vi.fn(),
    showSizeWarning: vi.fn(),
  };
  const controller = new PreviewController({
    sourceUri: 'file:///work/pipeline.py',
    load,
    panel,
    subscribeChanges: (listener) => { changed = listener; return subscription; },
    debounceMs: 250,
  });
  return { controller, panel, changed: () => changed(), subscription };
}

afterEach(() => vi.useRealTimers());

describe('PreviewController', () => {
  it('compiles immediately on explicit start and updates after saving its source', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => sample);
    const h = harness(load);
    await h.controller.start();
    expect(load).toHaveBeenCalledTimes(1);
    expect(h.panel.showGraph).toHaveBeenCalledTimes(1);
    h.changed();
    await vi.advanceTimersByTimeAsync(249);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('coalesces a burst of save and watcher events into one compile', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => sample);
    const h = harness(load);
    await h.controller.start();
    h.changed();
    await vi.advanceTimersByTimeAsync(100);
    h.changed();
    h.changed();
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never displays an older compile that finishes after a newer save', async () => {
    vi.useFakeTimers();
    const first = deferred<PipelineGraph>();
    const second = deferred<PipelineGraph>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const h = harness(load);
    const initial = h.controller.start();
    h.changed();
    await vi.advanceTimersByTimeAsync(250);
    second.resolve(sample);
    await Promise.resolve();
    first.resolve(sample);
    await initial;
    expect(h.panel.showGraph).toHaveBeenCalledTimes(1);
  });

  it('retains the last good diagram when a later compile fails', async () => {
    const load = vi.fn().mockResolvedValueOnce(sample).mockRejectedValueOnce(new Error('broken import'));
    const h = harness(load);
    await h.controller.start();
    await h.controller.refresh();
    expect(h.panel.showError).toHaveBeenCalledWith('broken import', true);
    expect(h.controller.getMermaidSource()).toContain('Hello');
    h.controller.collapse('root/group');
    expect(h.panel.showGraph).toHaveBeenLastCalledWith(sample, expect.any(String), 'broken import');
  });

  it('stops listening and cancels refresh after disposal', async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => sample);
    const h = harness(load);
    await h.controller.start();
    h.controller.dispose();
    h.changed();
    await vi.advanceTimersByTimeAsync(300);
    expect(h.subscription.dispose).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('pauses oversized graphs until the user asks to render them', async () => {
    const graph = { ...sample, nodeCount: 501, edgeCount: 1001 };
    const h = harness(async () => graph);
    await h.controller.start();
    expect(h.panel.showSizeWarning).toHaveBeenCalledWith(501, 1001);
    expect(h.panel.showGraph).not.toHaveBeenCalled();
    h.controller.renderAnyway();
    expect(h.panel.showGraph).toHaveBeenCalledTimes(1);
  });
});
