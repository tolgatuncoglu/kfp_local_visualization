import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_SCOPE_DEPTH, parsePipelineSpec, PipelineSpecError, type GraphScope } from '../../src/core/graph';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('parsePipelineSpec', () => {
  it('creates one root task from a compiled pipeline', () => {
    const graph = parsePipelineSpec(fixture('simple.yaml'));
    expect(graph.root.label).toBe('simple-pipeline');
    expect(graph.root.tasks.map((task) => [task.key, task.label, task.componentName])).toEqual([
      ['hello', 'Hello', 'comp-hello'],
    ]);
    expect([graph.nodeCount, graph.edgeCount]).toEqual([1, 0]);
  });

  it('distinguishes data links from ordering dependencies and groups data inputs', () => {
    const graph = parsePipelineSpec(fixture('data.yaml'));
    expect(graph.root.edges.map(({ from, to, kind, labels }) => [from, to, kind, labels])).toEqual([
      ['root/ingest', 'root/train', 'data', ['dataset ← data', 'rows ← count']],
      ['root/prepare', 'root/train', 'order', []],
    ]);
    expect(graph.edgeCount).toBe(2);
    expect(graph.root.tasks.find((task) => task.key === 'train')?.dependencies).toEqual(['prepare']);
    expect(graph.root.tasks.find((task) => task.key === 'train')?.inputs.map((input) => input.sourceDescription)).toEqual(['ingest.data', 'ingest.count']);
  });

  it('distinguishes pipeline inputs from constants in task details', () => {
    const graph = parsePipelineSpec(`root:\n  dag:\n    tasks:\n      example:\n        inputs:\n          parameters:\n            from_parent: {componentInputParameter: source}\n            literal: {runtimeValue: {constant: 5}}\n`);
    expect(graph.root.tasks[0].inputs.map((input) => input.sourceDescription)).toEqual([
      'pipeline input source', 'constant',
    ]);
  });

  it('creates child scopes for nested pipeline components', () => {
    const graph = parsePipelineSpec(fixture('nested.yaml'));
    const group = graph.root.tasks.find((task) => task.key === 'group');
    expect(group?.childScope?.tasks.map((task) => task.id)).toEqual(['root/group/child']);
    expect(graph.nodeCount).toBe(3);
  });

  it('retains static condition and loop information', () => {
    const conditional = parsePipelineSpec(fixture('conditional.yaml')).root.tasks[0];
    const loop = parsePipelineSpec(fixture('loop.yaml')).root.tasks[0];
    expect(conditional.condition).toBe("inputs.parameters['go'] == true");
    expect(conditional.triggerStrategy).toBe('ALL_UPSTREAM_TASKS_COMPLETED');
    expect(loop.iterator).toBe('parameter');
  });

  it('ignores unknown optional fields in otherwise valid IR', () => {
    const source = fixture('simple.yaml').replace('root:\n', 'futureField: {anything: true}\nroot:\n');
    expect(parsePipelineSpec(source).root.tasks).toHaveLength(1);
  });

  it('rejects malformed YAML and missing root DAG with a format error', () => {
    expect(() => parsePipelineSpec('root: [')).toThrow(PipelineSpecError);
    expect(() => parsePipelineSpec('root: {}')).toThrow(PipelineSpecError);
  });

  it('drops edges to tasks outside the scope but keeps the input visible', () => {
    const graph = parsePipelineSpec(`root:
  dag:
    tasks:
      a:
        dependentTasks: [ghost]
        inputs:
          parameters:
            x: {taskOutputParameter: {producerTask: missing, outputParameterKey: out}}
      b:
        dependentTasks: [a]
`);
    expect(graph.root.edges.map((edge) => [edge.from, edge.to])).toEqual([['root/a', 'root/b']]);
    expect(graph.edgeCount).toBe(1);
    const a = graph.root.tasks.find((task) => task.key === 'a');
    expect(a?.inputs[0].sourceDescription).toBe('missing.out');
    expect(a?.dependencies).toEqual(['ghost']);
  });

  it('rejects pathological nesting with a PipelineSpecError', () => {
    const depth = MAX_SCOPE_DEPTH + 5;
    let yaml = 'components:\n';
    for (let i = 0; i < depth; i += 1) {
      yaml += `  comp-${i}:\n    dag:\n      tasks:\n        t:\n          componentRef: {name: comp-${i + 1}}\n`;
    }
    yaml += `  comp-${depth}:\n    dag:\n      tasks:\n        leaf: {}\n`;
    yaml += 'root:\n  dag:\n    tasks:\n      t:\n        componentRef: {name: comp-0}\n';
    expect(() => parsePipelineSpec(yaml)).toThrow(PipelineSpecError);
  });

  it('rejects exponential component fan-out before materializing it', () => {
    const depth = 20;
    let yaml = 'components:\n';
    for (let i = 0; i < depth; i += 1) {
      yaml += `  comp-${i}:\n    dag:\n      tasks:\n        a:\n          componentRef: {name: comp-${i + 1}}\n        b:\n          componentRef: {name: comp-${i + 1}}\n`;
    }
    yaml += `  comp-${depth}:\n    dag:\n      tasks:\n        leaf: {}\n`;
    yaml += 'root:\n  dag:\n    tasks:\n      t:\n        componentRef: {name: comp-0}\n';
    expect(() => parsePipelineSpec(yaml)).toThrow(/more than \d+ tasks/);
  });

  describe('real KFP 2.17 output (real-stress.yaml)', () => {
    const graph = parsePipelineSpec(fixture('real-stress.yaml'));
    const scopeOf = (path: string[]): GraphScope => {
      let scope = graph.root;
      for (const key of path) {
        const child = scope.tasks.find((task) => task.key === key)?.childScope;
        if (!child) throw new Error(`no scope ${key}`);
        scope = child;
      }
      return scope;
    };
    const keys = (scope: GraphScope) => scope.tasks.map((task) => task.key);

    it('has the expected nested structure', () => {
      expect(keys(graph.root)).toEqual(['cleanup', 'exit-handler-1']);
      expect(keys(scopeOf(['exit-handler-1']))).toEqual(['agg', 'condition-branches-2', 'flag', 'for-loop-5', 'gen']);
      expect(keys(scopeOf(['exit-handler-1', 'for-loop-5']))).toEqual(['inner', 'work-3']);
    });

    it('retains iterators, conditions and trigger strategies', () => {
      const handler = scopeOf(['exit-handler-1']);
      expect(handler.tasks.find((task) => task.key === 'for-loop-5')?.iterator).toBe('parameter');
      const branches = scopeOf(['exit-handler-1', 'condition-branches-2']);
      expect(branches.tasks.find((task) => task.key === 'condition-3')?.condition).toBeTruthy();
      expect(graph.root.tasks.find((task) => task.key === 'cleanup')?.triggerStrategy).toBe('ALL_UPSTREAM_TASKS_COMPLETED');
    });

    it('never produces an edge endpoint without a task in its scope', () => {
      const check = (scope: GraphScope) => {
        const ids = new Set(scope.tasks.map((task) => task.id));
        for (const edge of scope.edges) {
          expect(ids.has(edge.from), edge.from).toBe(true);
          expect(ids.has(edge.to), edge.to).toBe(true);
        }
        scope.tasks.forEach((task) => task.childScope && check(task.childScope));
      };
      check(graph.root);
    });
  });
});
