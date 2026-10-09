import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parsePipelineSpec } from '../../src/core/graph';
import { mermaidNodeId } from '../../src/core/mermaid';
import { indexNodesByMermaidId, parseMermaidNodeId, reconcileTaskDetails } from '../../src/webview/taskSelection';

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

describe('mermaid node lookup', () => {
  const idOf = (path: string, n = 0) => `flowchart-${mermaidNodeId(path)}-${n}`;

  it('parses plain and diagram-prefixed dom ids and rejects others', () => {
    const id = mermaidNodeId('root/work');
    expect(parseMermaidNodeId(`flowchart-${id}-12`)).toBe(id);
    expect(parseMermaidNodeId(`kfp-dag-3-flowchart-${id}-12`)).toBe(id);
    expect(parseMermaidNodeId(`flowchart-${id}`)).toBeUndefined();
    expect(parseMermaidNodeId('subGraph0')).toBeUndefined();
  });

  it('does not confuse prefix ids (work vs work-2, parent vs child)', () => {
    const els = [
      { id: idOf('root/work', 0) },
      { id: idOf('root/work-2', 1) },
      { id: idOf('root/loop', 2) },
      { id: idOf('root/loop/child', 3) },
    ];
    const map = indexNodesByMermaidId(els);
    expect(map.size).toBe(4);
    expect(map.get(mermaidNodeId('root/work'))).toBe(els[0]);
    expect(map.get(mermaidNodeId('root/work-2'))).toBe(els[1]);
    expect(map.get(mermaidNodeId('root/loop'))).toBe(els[2]);
    expect(map.get(mermaidNodeId('root/loop/child'))).toBe(els[3]);
    expect(map.get(mermaidNodeId('root/wor'))).toBeUndefined();
  });
});
