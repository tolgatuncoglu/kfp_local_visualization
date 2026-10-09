import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type CompileInput = {
  filePath: string;
  functionName?: string;
  executable: string;
  signal?: AbortSignal;
};

function cancelled(): Error {
  return new Error('KFP compilation cancelled');
}

export async function compilePipeline(input: CompileInput): Promise<string> {
  if (input.signal?.aborted) throw cancelled();
  const directory = await fs.mkdtemp(join(tmpdir(), 'kfp-dag-preview-'));
  const output = join(directory, 'pipeline.yaml');
  try {
    const args = ['dsl', 'compile', '--py', input.filePath, '--output', output];
    if (input.functionName) args.push('--function', input.functionName);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(input.executable, args, {
        cwd: dirname(input.filePath),
        windowsHide: true,
        shell: false,
      });
      let stderr = '';
      let stdout = '';
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        input.signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => {
        child.kill();
        finish(cancelled());
      };
      input.signal?.addEventListener('abort', onAbort, { once: true });
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-1_000_000); });
      child.stdout.on('data', (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-1_000_000); });
      child.on('error', (error) => finish(error));
      child.on('close', (code) => {
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
