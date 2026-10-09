import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePipelineSpec } from '../../src/core/graph';

const kfp = process.env.KFP_CLI || 'kfp';
let available = false;
try {
  execFileSync(kfp, ['--help'], { stdio: 'ignore' });
  available = true;
} catch (error) {
  if (process.env.KFP_CLI) throw error;
}

describe('real KFP compiler', () => {
  it.skipIf(!available)('compiles a nested pipeline with data and ordering links', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kfp-real-test-'));
    try {
      const output = join(directory, 'pipeline.yaml');
      execFileSync(kfp, [
        'dsl', 'compile',
        '--py', resolve('test/fixtures/pipeline.py'),
        '--output', output,
        '--function', 'demo_pipeline',
      ], { encoding: 'utf8' });
      const graph = parsePipelineSpec(readFileSync(output, 'utf8'));
      expect(graph.root.tasks.map((task) => task.key)).toEqual(['consume', 'inner-pipeline', 'produce']);
      expect(graph.root.tasks.find((task) => task.key === 'inner-pipeline')?.childScope?.tasks).toHaveLength(1);
      expect(graph.root.edges.some((edge) => edge.kind === 'data')).toBe(true);
      expect(graph.root.edges.some((edge) => edge.kind === 'order')).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.skipIf(!available)('compiles the stress pipeline (If/Else, ParallelFor, ExitHandler, nested)', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kfp-real-test-'));
    try {
      const output = join(directory, 'stress.yaml');
      execFileSync(kfp, [
        'dsl', 'compile',
        '--py', resolve('test/fixtures/stress_pipeline.py'),
        '--output', output,
        '--function', 'stress',
      ], { encoding: 'utf8' });
      const graph = parsePipelineSpec(readFileSync(output, 'utf8'));
      expect(graph.root.tasks.map((task) => task.key)).toEqual(['cleanup', 'exit-handler-1']);
      const handler = graph.root.tasks.find((task) => task.key === 'exit-handler-1')?.childScope;
      expect(handler?.tasks.map((task) => task.key)).toEqual(['agg', 'condition-branches-2', 'flag', 'for-loop-5', 'gen']);
      expect(handler?.tasks.find((task) => task.key === 'for-loop-5')?.iterator).toBe('parameter');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
