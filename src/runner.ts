import { spawn, type ChildProcess } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resultOutcome, type Check, type Result } from './model.js';

export async function runCheck(check: Check, cwd: string, signal?: AbortSignal): Promise<Result> {
  const startedAt = new Date().toISOString(), begin = performance.now(), limit = 64 * 1024;
  return new Promise(resolve => {
    let child: ChildProcess | undefined, timer: NodeJS.Timeout | undefined;
    let failure: Result['failure'] = null, error: string | null = null;
    let stdout: Buffer = Buffer.alloc(0), stderr: Buffer = Buffer.alloc(0);
    let truncated = false;
    const append = (old: Buffer, data: Buffer): Buffer => {
      if (old.length + data.length > limit) truncated = true;
      return Buffer.concat([old, data.subarray(0, Math.max(0, limit - old.length))]);
    };
    const kill = (): void => {
      if (!child?.pid) return;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ESRCH') error = String(e);
      }
    };
    const abort = (): void => { failure = 'interrupted'; kill(); };
    const finish = (exitCode: number | null, terminationSignal: NodeJS.Signals | null): void => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); kill();
      const raw = {
        id: check.id, argv: check.argv, cwd: check.cwd, timeoutMs: check.timeoutMs, startedAt,
        durationMs: Math.round(performance.now() - begin), exitCode, signal: terminationSignal,
        failure, error, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), truncated
      };
      resolve({ ...raw, outcome: resultOutcome(raw) });
    };
    if (signal?.aborted) { failure = 'interrupted'; finish(null, null); return; }
    try {
      child = spawn(check.argv[0]!, check.argv.slice(1), { cwd, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { failure = 'spawn'; error = String(e); finish(null, null); return; }
    child.stdout!.on('data', (data: Buffer) => { stdout = append(stdout, data); });
    child.stderr!.on('data', (data: Buffer) => { stderr = append(stderr, data); });
    child.on('error', e => { failure = 'spawn'; error = e.message; });
    child.on('exit', kill);
    child.on('close', finish);
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { failure = 'timeout'; kill(); }, check.timeoutMs);
  });
}
