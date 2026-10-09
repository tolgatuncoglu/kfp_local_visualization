import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePipelineSpec, PipelineSpecError } from '../../src/core/graph';

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
});
