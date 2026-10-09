import YAML from 'yaml';

export type GraphInput = {
  name: string;
  kind: 'parameter' | 'artifact';
  sourceTask?: string;
  sourceOutput?: string;
  sourceDescription: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: 'data' | 'order';
  labels: string[];
};

export type GraphTask = {
  id: string;
  key: string;
  label: string;
  componentName: string;
  inputs: GraphInput[];
  dependencies: string[];
  condition?: string;
  triggerStrategy?: string;
  iterator?: 'parameter' | 'artifact';
  childScope?: GraphScope;
};

export type GraphScope = {
  id: string;
  label: string;
  tasks: GraphTask[];
  edges: GraphEdge[];
};

export type PipelineGraph = {
  root: GraphScope;
  nodeCount: number;
  edgeCount: number;
};

export class PipelineSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineSpecError';
  }
}

type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;

const string = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function inputsOf(task: RecordValue): GraphInput[] {
  const inputs = record(task.inputs) ?? {};
  const result: GraphInput[] = [];
  for (const kind of ['artifact', 'parameter'] as const) {
    const map = record(inputs[kind === 'artifact' ? 'artifacts' : 'parameters']) ?? {};
    for (const name of Object.keys(map).sort()) {
      const value = record(map[name]) ?? {};
      const selector = record(value[kind === 'artifact' ? 'taskOutputArtifact' : 'taskOutputParameter']);
      const sourceTask = string(selector?.producerTask);
      const sourceOutput = string(selector?.[kind === 'artifact' ? 'outputArtifactKey' : 'outputParameterKey']);
      const pipelineInput = string(value[kind === 'artifact' ? 'componentInputArtifact' : 'componentInputParameter']);
      result.push({
        name,
        kind,
        sourceTask,
        sourceOutput,
        sourceDescription: sourceTask
          ? `${sourceTask}.${sourceOutput ?? '?'}`
          : pipelineInput
            ? `pipeline input ${pipelineInput}`
            : value.runtimeValue !== undefined
              ? 'constant'
              : 'other input',
      });
    }
  }
  return result;
}

function parseScope(
  dag: RecordValue,
  id: string,
  label: string,
  components: RecordValue,
  componentStack: ReadonlySet<string>,
): GraphScope {
  const rawTasks = record(dag.tasks);
  if (!rawTasks) throw new PipelineSpecError(`DAG ${id} has no task map`);

  const tasks: GraphTask[] = Object.keys(rawTasks).sort().map((key) => {
    const task = record(rawTasks[key]);
    if (!task) throw new PipelineSpecError(`Task ${id}/${key} is invalid`);
    const taskId = `${id}/${key}`;
    const componentName = string(record(task.componentRef)?.name) ?? '';
    const component = record(components[componentName]);
    const childDag = record(component?.dag);
    if (childDag && componentStack.has(componentName)) {
      throw new PipelineSpecError(`Recursive component reference at ${taskId}`);
    }
    const trigger = record(task.triggerPolicy);
    const graphTask: GraphTask = {
      id: taskId,
      key,
      label: string(record(task.taskInfo)?.name) ?? key,
      componentName,
      inputs: inputsOf(task),
      dependencies: Array.isArray(task.dependentTasks)
        ? task.dependentTasks.filter((name): name is string => typeof name === 'string').sort()
        : [],
    };
    const condition = string(trigger?.condition);
    const strategy = string(trigger?.strategy);
    if (condition) graphTask.condition = condition;
    if (strategy && strategy !== 'TRIGGER_STRATEGY_UNSPECIFIED' && strategy !== 'ALL_UPSTREAM_TASKS_SUCCEEDED') {
      graphTask.triggerStrategy = strategy;
    }
    if (task.parameterIterator) graphTask.iterator = 'parameter';
    else if (task.artifactIterator) graphTask.iterator = 'artifact';
    if (childDag) {
      graphTask.childScope = parseScope(
        childDag,
        taskId,
        graphTask.label,
        components,
        new Set([...componentStack, componentName]),
      );
    }
    return graphTask;
  });

  const edges = new Map<string, GraphEdge>();
  const addEdge = (from: string, to: string, kind: GraphEdge['kind'], label?: string) => {
    const key = `${from}\u0000${to}\u0000${kind}`;
    let edge = edges.get(key);
    if (!edge) {
      edge = { from, to, kind, labels: [] };
      edges.set(key, edge);
    }
    if (label && !edge.labels.includes(label)) edge.labels.push(label);
  };
  for (const graphTask of tasks) {
    const source = record(rawTasks[graphTask.key]) ?? {};
    for (const upstream of Array.isArray(source.dependentTasks) ? source.dependentTasks : []) {
      if (typeof upstream === 'string') addEdge(`${id}/${upstream}`, graphTask.id, 'order');
    }
    for (const input of graphTask.inputs) {
      if (input.sourceTask) {
        addEdge(
          `${id}/${input.sourceTask}`,
          graphTask.id,
          'data',
          `${input.name} ← ${input.sourceOutput ?? input.sourceTask}`,
        );
      }
    }
  }
  const sortedEdges = [...edges.values()].sort((a, b) =>
    a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind),
  );
  for (const edge of sortedEdges) edge.labels.sort();
  return { id, label, tasks, edges: sortedEdges };
}

export function parsePipelineSpec(yamlText: string): PipelineGraph {
  let raw: unknown;
  try {
    raw = YAML.parse(yamlText);
  } catch (error) {
    throw new PipelineSpecError(`Invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  const spec = record(raw);
  const rootDag = record(record(spec?.root)?.dag);
  if (!rootDag) throw new PipelineSpecError('Expected KFP v2 PipelineSpec with root.dag');
  const components = record(spec?.components) ?? {};
  const label = string(record(spec?.pipelineInfo)?.name) ?? 'Pipeline';
  const root = parseScope(rootDag, 'root', label, components, new Set());
  const count = (scope: GraphScope): [number, number] =>
    scope.tasks.reduce<[number, number]>(
      ([nodes, edges], task) => {
        const [childNodes, childEdges] = task.childScope ? count(task.childScope) : [0, 0];
        return [nodes + 1 + childNodes, edges + childEdges];
      },
      [0, scope.edges.length],
    );
  const [nodeCount, edgeCount] = count(root);
  return { root, nodeCount, edgeCount };
}
