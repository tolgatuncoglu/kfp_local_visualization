import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parsePipelineSpec } from '../../src/core/graph';
import { reconcileTaskDetails } from '../../src/webview/taskSelection';

const graph = parsePipelineSpec(readFileSync(join(__dirname, '..', 'fixtures', 'simple.yaml'), 'utf8'));

describe('selected task details', () => {
  it('uses the new task after a graph refresh and clears details when it disappears', () => {
    const selected = graph.root.tasks[0].id;
    const updated = { ...graph.root.tasks[0], componentName: 'new-component' };
    const show = vi.fn();
    const clear = vi.fn();
    reconcileTaskDetails({ ...graph, root: { ...graph.root, tasks: [updated] } }, selected, show, clear);
    expect(show).toHaveBeenCalledWith(updated);
    reconcileTaskDetails({ ...graph, root: { ...graph.root, tasks: [] } }, selected, show, clear);
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
