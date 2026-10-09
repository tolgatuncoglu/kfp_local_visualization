import type { GraphScope, GraphTask, PipelineGraph } from '../core/graph';

export function tasksIn(scope: GraphScope): GraphTask[] {
  return scope.tasks.flatMap((task) => [task, ...(task.childScope ? tasksIn(task.childScope) : [])]);
}

export function reconcileTaskDetails(
  graph: PipelineGraph,
  selectedId: string,
  show: (task: GraphTask) => void,
  clear: () => void,
): void {
  const task = selectedId ? tasksIn(graph.root).find((candidate) => candidate.id === selectedId) : undefined;
  if (task) show(task);
  else clear();
}

// Mermaid DOM ids are `flowchart-<nodeId>-<counter>`, optionally prefixed with `<diagramId>-`.
// Node ids are `n` + lowercase hex, so they never contain '-' and the match is exact.
const MERMAID_DOM_ID = /(?:^|-)flowchart-(n[0-9a-f]+)-\d+$/;

export function parseMermaidNodeId(domId: string): string | undefined {
  return MERMAID_DOM_ID.exec(domId)?.[1];
}

export function indexNodesByMermaidId<T extends { id: string }>(elements: Iterable<T>): Map<string, T> {
  const map = new Map<string, T>();
  for (const element of elements) {
    const nodeId = parseMermaidNodeId(element.id);
    if (nodeId !== undefined && !map.has(nodeId)) map.set(nodeId, element);
  }
  return map;
}
