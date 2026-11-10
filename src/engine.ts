import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ReviewSchema, SpecError, incomplete, passed, type Assessment, type Run, type Review, type Check } from './model.js';
import { hash } from './spec.js';
import { readSpec, snapshot, safePath, changedFiles, featureDirectory } from './workspace.js';
import { lock, locked, startRun, finishRun, loadRun, loadReview, saveReview, errorMessage } from './store.js';
import { runCheck } from './runner.js';

const runtime = () => ({ node: process.version, platform: process.platform, arch: process.arch });
const toolHash = async () => hash(await fs.readFile(fileURLToPath(import.meta.url)));
function empty(feature: string): Assessment {
  return { feature, acceptance: 'unverified', checks: 'pending', freshness: 'missing', review: 'not-required',
    reasons: [], run: null, decision: null, baseline: null, changes: [] };
}
async function assess(root: string, feature: string, checkLock: boolean): Promise<Assessment> {
  const a = empty(feature);
  try {
    const spec = await readSpec(root, feature), missing = incomplete(spec), required = spec.criteria.some(c => c.review !== null);
    a.review = required ? 'pending' : 'not-required';
    if (checkLock && await locked(root)) {
      a.acceptance = 'blocked'; a.reasons.push('Verification is in progress or its lock needs recovery'); return a;
    }
    const saved = await loadRun(root, feature);
    if (!saved) { a.reasons.push('Run verify to collect evidence'); return a; }
    const { run } = saved; a.run = run;
    if (run.error || !run.spec || !run.before || !run.after) throw new SpecError(run.error ?? 'Incomplete run evidence');
    const expected = incomplete(run.spec).length ? [] : run.spec.checks;
    if (run.results.length !== expected.length ||
      run.results.some((r, i) => {
        const c = expected[i]!;
        return r.id !== c.id || JSON.stringify(r.argv) !== JSON.stringify(c.argv) || r.cwd !== c.cwd || r.timeoutMs !== c.timeoutMs;
      })) throw new SpecError('Evidence does not cover the declared checks');
    // A matching hash must also carry the exact compiled contract, not altered mappings.
    if (run.spec.hash === spec.hash && JSON.stringify(run.spec) !== JSON.stringify(spec)) throw new SpecError('Evidence contract mismatch');
    a.checks = !run.results.length ? (missing.length ? 'pending' : 'none') : run.results.every(passed) ? 'passed' : 'failed';
    const current = await snapshot(root, feature);
    a.changes = changedFiles(run.before, current);
    const fresh = run.spec.hash === spec.hash && run.before.digest === current.digest && run.after.digest === current.digest &&
      run.toolHash === await toolHash() && JSON.stringify(run.runtime) === JSON.stringify(runtime());
    a.freshness = fresh ? 'current' : 'stale';
    const decision = await loadReview(root, feature);
    if (decision?.runId === run.id && decision.runHash === saved.hash) {
      a.decision = decision; a.review = decision.decision === 'approve' ? 'approved' : 'rejected';
    }
    if (!fresh) { a.review = required ? 'pending' : 'not-required'; a.decision = null; a.acceptance = 'stale'; a.reasons.push('Spec, workspace, runtime, or verifier changed; rerun verification'); return a; }
    if (run.results.some(r => r.failure === 'spawn' || r.error !== null)) {
      a.acceptance = 'invalid'; a.freshness = 'invalid';
      a.reasons.push('A check could not execute reliably; inspect its error and rerun verification');
      return a;
    }
    if (run.mode === 'baseline') { a.acceptance = 'blocked'; a.reasons.push('Baseline recorded; implement the change and run verify again'); return a; }
    if (missing.length) { a.acceptance = 'blocked'; a.reasons.push('Add Verify or Review: ' + missing.map(c => c.title).join(', ')); return a; }
    if (a.review === 'rejected') { a.acceptance = 'changes-requested'; a.reasons.push('The recorded review requests changes'); }
    else if (a.checks === 'failed') { a.acceptance = 'blocked'; a.reasons.push('Fix the failing checks, then rerun verify'); }
    else if (a.review === 'pending') { a.acceptance = 'needs-review'; a.reasons.push('Automated work is complete; the declared human review remains'); }
    else a.acceptance = 'ready';
    const baseline = await loadRun(root, feature, 'baseline');
    if (baseline?.run.mode === 'baseline' && baseline.run.spec?.hash === spec.hash && baseline.run.before &&
      baseline.run.before.digest !== run.before.digest && baseline.run.error === null) {
      const recovered = run.results.filter(passed).filter(r => baseline.run.results.some(b =>
        b.id === r.id && b.exitCode !== null && b.exitCode > 0 && b.signal === null && b.failure === null && b.error === null)).map(r => r.id);
      if (recovered.length) a.baseline = { runId: baseline.run.id, recovered };
    }
  } catch (error) {
    a.acceptance = 'invalid'; a.freshness = 'invalid'; a.reasons.push(errorMessage(error));
  }
  return a;
}
export const status = (root: string, feature: string): Promise<Assessment> => assess(root, feature, true);
export interface VerifyOptions {
  baseline?: boolean; signal?: AbortSignal; onCheck?: (check: Check) => void;
}
export async function verify(root: string, feature: string, options: VerifyOptions = {}): Promise<Assessment> {
  if (process.platform === 'win32') throw new SpecError('Verification requires macOS/Linux for process-group cleanup');
  await featureDirectory(root, feature);
  return lock(root, async () => {
    const run: Run = {
      schemaVersion: 1, id: randomUUID(), feature, mode: options.baseline ? 'baseline' : 'verify',
      startedAt: new Date().toISOString(), finishedAt: '', toolHash: await toolHash(), runtime: runtime(),
      spec: null, before: null, after: null, results: [], error: null
    };
    await startRun(root, feature, run.id, run.startedAt);
    try {
      run.spec = await readSpec(root, feature);
      run.before = await snapshot(root, feature);
      const directories: string[] = [];
      for (const check of run.spec.checks) {
        const dir = await safePath(root, check.cwd);
        if (!(await fs.stat(dir)).isDirectory()) throw new SpecError('Directory is not a folder: ' + check.cwd);
        directories.push(dir);
      }
      if (!incomplete(run.spec).length) {
        for (const [i, check] of run.spec.checks.entries()) {
          options.onCheck?.(check);
          run.results.push(await runCheck(check, directories[i]!, options.signal));
        }
      }
      run.after = await snapshot(root, feature);
    } catch (error) { run.error = errorMessage(error); }
    run.finishedAt = new Date().toISOString();
    await finishRun(root, run);
    return assess(root, feature, false);
  });
}
export async function recordReview(root: string, feature: string, decision: 'approve' | 'reject', reviewer: string, note: string): Promise<Assessment> {
  // A local declaration, never an authenticated identity or automatic agent approval.
  return lock(root, async () => {
    const a = await assess(root, feature, false);
    const saved = await loadRun(root, feature);
    if (!saved || !a.run || a.freshness !== 'current' || a.run.mode !== 'verify') {
      throw new SpecError('Review requires a completed, current verification run');
    }
    if (decision === 'approve' && (a.checks === 'failed' || a.checks === 'pending')) {
      throw new SpecError('Cannot approve incomplete or failing checks');
    }
    const review: Review = ReviewSchema.parse({
      schemaVersion: 1, id: randomUUID(), runId: saved.run.id, runHash: saved.hash, feature,
      decision, reviewer, note, recordedAt: new Date().toISOString(), source: 'local'
    });
    await saveReview(root, review);
    return assess(root, feature, false);
  });
}
