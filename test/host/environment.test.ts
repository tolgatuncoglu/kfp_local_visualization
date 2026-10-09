import { describe, expect, it, vi } from 'vitest';
import type { Uri } from 'vscode';
import { executableOnPath, resolveKfpExecutable } from '../../src/host/environment';

const file = { fsPath: '/work/second/pipeline.py' } as Uri;
const python = async () => '/work/second/.venv/bin/python';

describe('resolveKfpExecutable', () => {
  it('uses the interpreter selected for the previewed file in a multi-root workspace', async () => {
    const getInterpreter = vi.fn(python);
    const result = await resolveKfpExecutable(file, undefined, {
      getInterpreter,
      exists: (path) => path === '/work/second/.venv/bin/kfp',
      platform: 'darwin',
    });
    expect(result).toBe('/work/second/.venv/bin/kfp');
    expect(getInterpreter).toHaveBeenCalledWith(file);
  });

  it('explicit setting wins over the auto-detected interpreter', async () => {
    const result = await resolveKfpExecutable(file, '/tools/kfp', {
      getInterpreter: python,
      exists: () => true,
      platform: 'darwin',
    });
    expect(result).toBe('/tools/kfp');
  });

  it('throws when the configured path does not exist, even if the interpreter has kfp', async () => {
    await expect(resolveKfpExecutable(file, '/tools/kfp', {
      getInterpreter: python,
      exists: (path) => path === '/work/second/.venv/bin/kfp',
      platform: 'darwin',
    })).rejects.toThrow('Configured KFP executable does not exist: /tools/kfp');
  });

  it('ignores an empty or blank setting', async () => {
    const result = await resolveKfpExecutable(file, '  ', {
      getInterpreter: python,
      exists: (path) => path === '/work/second/.venv/bin/kfp',
      platform: 'darwin',
    });
    expect(result).toBe('/work/second/.venv/bin/kfp');
  });

  it('uses configured CLI when no Python environment is selected', async () => {
    const result = await resolveKfpExecutable(file, '/tools/kfp', {
      getInterpreter: async () => undefined,
      exists: (path) => path === '/tools/kfp',
      platform: 'darwin',
    });
    expect(result).toBe('/tools/kfp');
  });

  it('falls back to plain kfp when nothing is selected or configured', async () => {
    const result = await resolveKfpExecutable(file, undefined, {
      getInterpreter: async () => undefined,
      exists: () => false,
      platform: 'darwin',
    });
    expect(result).toBe('kfp');
  });

  it('falls back to kfp on PATH when the interpreter has no sibling kfp', async () => {
    const onPath = vi.fn(() => true);
    const result = await resolveKfpExecutable(file, undefined, {
      getInterpreter: python,
      exists: () => false,
      platform: 'darwin',
      onPath,
    });
    expect(result).toBe('kfp');
    expect(onPath).toHaveBeenCalledWith('kfp');
  });

  it('throws naming the interpreter when neither sibling nor PATH kfp exists', async () => {
    for (const onPath of [undefined, () => false]) {
      await expect(resolveKfpExecutable(file, undefined, {
        getInterpreter: python,
        exists: () => false,
        platform: 'darwin',
        onPath,
      })).rejects.toThrow('KFP CLI was not found beside the selected Python interpreter: /work/second/.venv/bin/python');
    }
  });
});

describe('executableOnPath', () => {
  it('searches PATH entries', () => {
    const exists = (p: string) => p === '/b/kfp';
    expect(executableOnPath('kfp', { PATH: '/a:/b' }, 'linux', exists)).toBe(true);
    expect(executableOnPath('kfp', { PATH: '/a:/c' }, 'linux', exists)).toBe(false);
    expect(executableOnPath('kfp', {}, 'linux', exists)).toBe(false);
  });

  it('honours PATHEXT on Windows', () => {
    const exists = (p: string) => p.endsWith('kfp.EXE');
    expect(executableOnPath('kfp', { PATH: 'C:\\bin', PATHEXT: '.CMD;.EXE' }, 'win32', exists)).toBe(true);
  });
});
