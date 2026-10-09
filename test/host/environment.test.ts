import { describe, expect, it, vi } from 'vitest';
import type { Uri } from 'vscode';
import { resolveKfpExecutable } from '../../src/host/environment';

const file = { fsPath: '/work/second/pipeline.py' } as Uri;

describe('resolveKfpExecutable', () => {
  it('uses the interpreter selected for the previewed file in a multi-root workspace', async () => {
    const getInterpreter = vi.fn(async () => '/work/second/.venv/bin/python');
    const result = await resolveKfpExecutable(file, undefined, {
      getInterpreter,
      exists: (path) => path === '/work/second/.venv/bin/kfp',
      platform: 'darwin',
    });
    expect(result).toBe('/work/second/.venv/bin/kfp');
    expect(getInterpreter).toHaveBeenCalledWith(file);
  });

  it('uses configured CLI when no Python environment is selected', async () => {
    const result = await resolveKfpExecutable(file, '/tools/kfp', {
      getInterpreter: async () => undefined,
      exists: (path) => path === '/tools/kfp',
      platform: 'darwin',
    });
    expect(result).toBe('/tools/kfp');
  });

  it('falls back to PATH only when no selected or configured CLI is available', async () => {
    const result = await resolveKfpExecutable(file, undefined, {
      getInterpreter: async () => undefined,
      exists: () => false,
      platform: 'darwin',
    });
    expect(result).toBe('kfp');
  });

  it('does not silently use another environment when selected KFP is missing', async () => {
    await expect(resolveKfpExecutable(file, undefined, {
      getInterpreter: async () => '/work/second/.venv/bin/python',
      exists: () => false,
      platform: 'darwin',
    })).rejects.toThrow('KFP CLI was not found beside');
  });
});
