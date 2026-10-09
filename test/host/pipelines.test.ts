import { describe, expect, it } from 'vitest';
import { discoverPipelineNames } from '../../src/host/pipelines';

describe('discoverPipelineNames', () => {
  it('finds a conventional KFP pipeline without importing the file', () => {
    expect(discoverPipelineNames('from kfp import dsl\n@dsl.pipeline\ndef train(): pass\n')).toEqual(['train']);
  });

  it('finds multiple pipelines using imported aliases', () => {
    const source = [
      'from kfp import dsl as kfp_dsl',
      'from kfp.dsl import pipeline as pipe',
      '@kfp_dsl.pipeline(name="first")',
      'def first(): pass',
      '@pipe',
      'def second(): pass',
    ].join('\n');
    expect(discoverPipelineNames(source)).toEqual(['first', 'second']);
  });

  it('does not treat component functions or commented decorators as pipelines', () => {
    const source = '# @dsl.pipeline\ndef ignored(): pass\n@dsl.component\ndef worker(): pass\n';
    expect(discoverPipelineNames(source)).toEqual([]);
  });
});
