import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compilePipeline } from '../../src/host/compiler';

const directories: string[] = [];

function fakeKfp(body: string): { directory: string; executable: string; filePath: string } {
  const directory = mkdtempSync(join(tmpdir(), 'kfp-test-'));
  directories.push(directory);
  const executable = join(directory, 'kfp');
  const filePath = join(directory, 'pipeline.py');
  writeFileSync(filePath, '# test pipeline\n');
  writeFileSync(executable, `#!${process.execPath}\n${body}\n`);
  chmodSync(executable, 0o755);
  return { directory, executable, filePath };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('compilePipeline', () => {
  it('passes fixed CLI arguments, uses the source directory, and deletes temporary IR', async () => {
    const { directory, executable, filePath } = fakeKfp(`
      const fs = require('node:fs');
      const path = require('node:path');
      const args = process.argv.slice(2);
      const output = args[args.indexOf('--output') + 1];
      fs.writeFileSync(path.join(process.cwd(), 'args.json'), JSON.stringify({ args, cwd: process.cwd() }));
      fs.writeFileSync(output, 'root:\\n  dag:\\n    tasks: {}\\n');
    `);
    const yaml = await compilePipeline({ filePath, functionName: 'train', executable });
    const result = JSON.parse(readFileSync(join(directory, 'args.json'), 'utf8'));
    expect(result.args.slice(0, 4)).toEqual(['dsl', 'compile', '--py', filePath]);
    expect(result.args.slice(-2)).toEqual(['--function', 'train']);
    expect(result.cwd).toBe(realpathSync(directory));
    expect(yaml).toContain('tasks: {}');
    expect(existsSync(result.args[result.args.indexOf('--output') + 1])).toBe(false);
  });

  it('reports compiler stderr without leaving temporary IR', async () => {
    const { executable, filePath } = fakeKfp(`process.stderr.write('ImportError: no module\\n'); process.exit(2);`);
    await expect(compilePipeline({ filePath, executable })).rejects.toThrow('ImportError: no module');
  });

  it('stops a compile when cancelled', async () => {
    const { executable, filePath } = fakeKfp(`setTimeout(() => {}, 5000);`);
    const controller = new AbortController();
    const pending = compilePipeline({ filePath, executable, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
  });
});
