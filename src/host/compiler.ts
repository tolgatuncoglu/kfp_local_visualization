import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export type CompileInput = {
  filePath: string;
  functionName?: string;
  executable: string;
  signal?: AbortSignal;
  /** Kill the compiler and fail after this many milliseconds. Default 120000. */
  timeoutMs?: number;
};

export const DEFAULT_COMPILE_TIMEOUT_MS = 120_000;
const OUTPUT_TAIL_LIMIT = 1_000_000;

function cancelled(): Error {
  return new Error('KFP compilation cancelled');
}

function timedOut(ms: number): Error {
  return new Error(`KFP compilation timed out after ${Math.round(ms / 1000 * 10) / 10}s`);
}

export async function compilePipeline(input: CompileInput): Promise<string> {
  if (input.signal?.aborted) throw cancelled();
  const timeoutMs = input.timeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS;
  const directory = await fs.mkdtemp(join(tmpdir(), 'kfp-dag-preview-'));
  const output = join(directory, 'pipeline.yaml');
  try {
    const args = ['dsl', 'compile', '--py', input.filePath, '--output', output];
    if (input.functionName) args.push('--function', input.functionName);
    await new Promise<void>((resolve, reject) => {
      const posix = process.platform !== 'win32';
      const child = spawn(input.executable, args, {
        cwd: dirname(input.filePath),
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: posix,
      });
      const killTree = () => {
        try {
          if (posix && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill();
        } catch {
          try { child.kill('SIGKILL'); } catch { /* already gone */ }
        }
      };
      const stderrDecoder = new StringDecoder('utf8');
      const stdoutDecoder = new StringDecoder('utf8');
      let stderr = '';
      let stdout = '';
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        input.signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => {
        killTree();
        finish(cancelled());
      };
      input.signal?.addEventListener('abort', onAbort, { once: true });
      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        timer = setTimeout(() => {
          killTree();
          finish(timedOut(timeoutMs));
        }, timeoutMs);
      }
      child.stderr!.on('data', (chunk: Buffer) => { stderr = (stderr + stderrDecoder.write(chunk)).slice(-OUTPUT_TAIL_LIMIT); });
      child.stdout!.on('data', (chunk: Buffer) => { stdout = (stdout + stdoutDecoder.write(chunk)).slice(-OUTPUT_TAIL_LIMIT); });
      child.on('error', (error) => finish(error));
      child.on('close', (code) => {
        stderr = (stderr + stderrDecoder.end()).slice(-OUTPUT_TAIL_LIMIT);
        stdout = (stdout + stdoutDecoder.end()).slice(-OUTPUT_TAIL_LIMIT);
        if (input.signal?.aborted) finish(cancelled());
        else if (code === 0) finish();
        else finish(new Error(stderr.trim() || stdout.trim() || `KFP compiler exited with code ${code}`));
      });
      if (input.signal?.aborted) onAbort();
    });
    return await fs.readFile(output, 'utf8');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
