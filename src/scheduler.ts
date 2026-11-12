import { performance } from 'node:perf_hooks';
import { passed, type Check, type CurrentRun } from './model.js';
import { runCheck } from './runner.js';

export interface ScheduleOptions {
  budgetMs: number; failurePolicy: 'continue' | 'fail-fast';
  signal?: AbortSignal; onCheck?: (check: Check) => void;
}
export async function executeChecks(checks: Check[], directories: string[], options: ScheduleOptions) {
  const results: CurrentRun['results'] = [];
  let stopReason: CurrentRun['execution']['stopReason'] = null;
  const controller = new AbortController(), started = performance.now();
  const stop = (reason: 'cancelled' | 'budget'): void => {
    if (stopReason === null) { stopReason = reason; controller.abort(); }
  };
  const cancel = (): void => stop('cancelled');
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => stop('budget'), options.budgetMs);
  try {
    for (const [i, check] of checks.entries()) {
      if (performance.now() - started >= options.budgetMs) stop('budget');
      if (stopReason !== null) break;
      options.onCheck?.(check);
      if (options.signal?.aborted) cancel();
      if (stopReason !== null) break;
      const result = await runCheck(check, directories[i]!, controller.signal);
      results.push(result);
      if (stopReason !== null) break;
      if (options.failurePolicy === 'fail-fast' && !passed(result)) { stopReason = 'fail-fast'; break; }
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
  if (results.length < checks.length && stopReason === null) throw new Error('Scheduling ended without a stop reason');
  const skipped: CurrentRun['skipped'] = checks.slice(results.length).map(check => ({
    id: check.id, reason: stopReason!
  }));
  return { results, skipped, stopReason };
}
