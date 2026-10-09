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

  it('handles multi-line decorators with arguments', () => {
    const source = [
      'from kfp import dsl',
      '@dsl.pipeline(',
      '    name="x",',
      '    description="def fake(): pass",',
      ')',
      'def real(): pass',
    ].join('\n');
    expect(discoverPipelineNames(source)).toEqual(['real']);
  });

  it('handles fully qualified kfp.dsl.pipeline and import kfp as alias', () => {
    const source = [
      'import kfp',
      'import kfp as k',
      '@kfp.dsl.pipeline(name="a")',
      'def a(): pass',
      '@k.dsl.pipeline',
      'def b(): pass',
    ].join('\n');
    expect(discoverPipelineNames(source)).toEqual(['a', 'b']);
  });

  it('allows comments, blank lines and other decorators between decorator and def', () => {
    const source = [
      'from kfp import dsl',
      '@dsl.pipeline(name="a")',
      '',
      '# explain',
      '@other',
      '',
      'async def a(): pass',
    ].join('\n');
    expect(discoverPipelineNames(source)).toEqual(['a']);
  });

  it('does not leak a pipeline decorator onto a later class or function', () => {
    const source = '@dsl.pipeline\nclass Foo:\n    pass\ndef later(): pass\n';
    expect(discoverPipelineNames(source)).toEqual([]);
  });
});
