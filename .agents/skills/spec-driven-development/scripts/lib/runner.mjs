import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const OUTPUT_LIMIT = 64 * 1024;

export function runCheck(check, cwd, signal) {
  const startedAt = new Date().toISOString(), started = performance.now();
  const timeoutMs = check.timeoutMs ?? 120000;
  return new Promise(resolve => {
    let child, timer, timedOut = false, aborted = false, error = null;
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), truncated = false;
    const append = (old, data) => {
      if (old.length + data.length > OUTPUT_LIMIT) truncated = true;
      return Buffer.concat([old, data.subarray(0, Math.max(0, OUTPUT_LIMIT - old.length))]);
    };
    const kill = () => {
      if (child?.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (e) {
          if (e.code !== 'ESRCH') error = e.message;
        }
      }
    };
    const abort = () => { aborted = true; kill(); };
    const finish = (exitCode, terminationSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      // Reap children left in the check's process group.
      kill();
      resolve({
        id: check.id, argv: check.argv, cwd: check.cwd ?? '.', timeoutMs,
        startedAt, durationMs: Math.round(performance.now() - started),
        exitCode, signal: terminationSignal, timedOut, aborted, error,
        status: exitCode === 0 && !error && !timedOut && !aborted ? 'passed' : 'failed',
        stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), truncated
      });
    };
    if (signal?.aborted) { aborted = true; finish(null, null); return; }
    try {
      child = spawn(check.argv[0], check.argv.slice(1), {
        cwd, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (e) { error = e.message; finish(null, null); return; }
    child.stdout.on('data', data => { stdout = append(stdout, data); });
    child.stderr.on('data', data => { stderr = append(stderr, data); });
    child.on('error', e => { error = e.message; });
    child.on('close', finish);
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
  });
}
