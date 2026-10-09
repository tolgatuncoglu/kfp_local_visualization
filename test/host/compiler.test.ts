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

  it('does not hang when the compiler reads stdin', async () => {
    const { executable, filePath } = fakeKfp(`
      const fs = require('node:fs');
      const out = process.argv[process.argv.indexOf('--output') + 1];
      process.stdin.resume();
      process.stdin.on('end', () => { fs.writeFileSync(out, 'ok: true\\n'); });
    `);
    await expect(compilePipeline({ filePath, executable, timeoutMs: 5000 })).resolves.toContain('ok: true');
  });

  it('kills the process and rejects with a clear message on timeout', async () => {
    const { directory, executable, filePath } = fakeKfp(`
      require('node:fs').writeFileSync(require('node:path').join(process.cwd(), 'pid'), String(process.pid));
      setInterval(() => {}, 1000);
    `);
    // The timeout must outlast Node start-up on a loaded machine, or the child is killed before it records its pid.
    const started = Date.now();
    await expect(compilePipeline({ filePath, executable, timeoutMs: 3000 })).rejects.toThrow('KFP compilation timed out after 3s');
    expect(Date.now() - started).toBeLessThan(10_000);
    const pid = Number(readFileSync(join(directory, 'pid'), 'utf8'));
    await waitUntilDead(pid);
  });

  it('kills the whole process group on abort', async () => {
    if (process.platform === 'win32') return;
    const { directory, executable, filePath } = fakeKfp(`
      const { spawn } = require('node:child_process');
      const fs = require('node:fs');
      const path = require('node:path');
      const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      fs.writeFileSync(path.join(process.cwd(), 'pids'), JSON.stringify([process.pid, grandchild.pid]));
      setInterval(() => {}, 1000);
    `);
    const controller = new AbortController();
    const pending = compilePipeline({ filePath, executable, signal: controller.signal });
    const pidsFile = join(directory, 'pids');
    for (let i = 0; i < 100 && !existsSync(pidsFile); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 100));
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    for (const pid of JSON.parse(readFileSync(pidsFile, 'utf8')) as number[]) await waitUntilDead(pid);
  });

  it('keeps multibyte characters intact across chunk boundaries in stderr', async () => {
    const { executable, filePath } = fakeKfp(`
      const bytes = Buffer.from('error: \u00e9\u4e2d\u6587\n');
      process.stderr.write(bytes.subarray(0, 8));
      setTimeout(() => { process.stderr.write(bytes.subarray(8)); process.exit(1); }, 100);
    `);
    await expect(compilePipeline({ filePath, executable })).rejects.toThrow('error: \u00e9\u4e2d\u6587');
  });

  it('removes the temp directory after a timeout', async () => {
    const { directory, executable, filePath } = fakeKfp(`
      require('node:fs').writeFileSync(process.argv[process.argv.indexOf('--output') + 1], 'x');
      require('node:fs').writeFileSync(require('node:path').join(process.cwd(), 'out'), process.argv[process.argv.indexOf('--output') + 1]);
      setInterval(() => {}, 1000);
    `);
    await expect(compilePipeline({ filePath, executable, timeoutMs: 400 })).rejects.toThrow('timed out');
    const out = join(directory, 'out');
    if (existsSync(out)) expect(existsSync(readFileSync(out, 'utf8'))).toBe(false);
  });
});

async function waitUntilDead(pid: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    try { process.kill(pid, 0); } catch { return; }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`process ${pid} is still alive`);
}
