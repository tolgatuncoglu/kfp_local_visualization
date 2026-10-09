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
