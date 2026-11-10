import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readContract, featurePath, safePath, writeEvidence } from './contract.mjs';
import { snapshot } from './workspace.mjs';
import { runCheck } from './runner.mjs';

export const VERSION = '2.0.0';
export const exitCodeFor = status => status === 'verified' ? 0 : status === 'invalid' ? 2 : 1;

function criteriaResults(contract, checks) {
  return contract.criteria.map(criterion => ({
    id: criterion.id,
    title: criterion.title,
    description: criterion.description,
    status: criterion.pending ? 'unverified' : criterion.manual ? 'manual-required' :
      criterion.checks.every(id => checks.find(check => check.id === id)?.status === 'passed') ? 'passed' : 'failed',
    ...(criterion.pending ? { reason: 'Add Verify or Review for this criterion' } : criterion.manual ? { reason: criterion.manual } : { checks: criterion.checks })
  }));
}
function gate(contract, checks, changed) {
  if (changed) return 'stale';
  if (contract.state === 'draft') return 'blocked';
  if (checks.length !== contract.checks.length || checks.some(check => check.status !== 'passed')) return 'failed';
  if (contract.criteria.some(criterion => criterion.manual)) return 'blocked';
  return 'verified';
}

async function lockPath(root, missing = false) {
  return safePath(root, '.codex-spec/.verify.lock', { missing });
}

export async function verify(root, feature, { signal } = {}) {
  if (process.platform === 'win32') throw new Error('Verification currently requires macOS or Linux (process-group cleanup)');
  const directory = await featurePath(root, feature);
  const lock = await lockPath(root, true);
  try { await fs.mkdir(lock); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Verification already locked; see .codex-spec/.verify.lock/owner.json');
    throw error;
  }
  const evidence = {
    schemaVersion: 2, runnerVersion: VERSION, runId: randomUUID(), feature,
    startedAt: new Date().toISOString(), status: 'running',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    checks: [], criteria: []
  };
  try {
    await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, runId: evidence.runId }));
    // Invalidate a previous pass before any checks or parsing can fail.
    await writeEvidence(root, directory, evidence);
    const initial = await readContract(root, feature);
    evidence.inputs = { specSha256: initial.specHash };
    const before = await snapshot(root, feature);
    evidence.workspace = { before, after: null };
    const directories = [];
    for (const check of initial.contract.checks) {
      const cwd = await safePath(root, check.cwd ?? '.');
      if (!(await fs.stat(cwd)).isDirectory()) throw new Error('Check cwd must be a directory: ' + check.id);
      directories.push(cwd);
    }
    if (initial.contract.state === 'ready') {
      for (let i = 0; i < initial.contract.checks.length; i++) {
        evidence.checks.push(await runCheck(initial.contract.checks[i], directories[i], signal));
      }
    }
    const after = await snapshot(root, feature);
    evidence.workspace.after = after;
    const latest = await readContract(root, feature);
    const changed = before.sha256 !== after.sha256 ||
      initial.specHash !== latest.specHash;
    evidence.criteria = criteriaResults(initial.contract, evidence.checks);
    evidence.status = gate(initial.contract, evidence.checks, changed);
    if (changed) evidence.reason = 'Workspace or contract changed during verification; rerun after changes stop';
    else if (initial.contract.state === 'draft') evidence.reason = 'Add Verify or Review to every acceptance criterion before running checks';
    else if (evidence.status === 'blocked') evidence.reason = 'Manual criteria require separate review; this runner cannot attest human approval';
  } catch (error) {
    evidence.status = 'invalid';
    evidence.reason = error.message;
  } finally {
    evidence.finishedAt = new Date().toISOString();
    try { await writeEvidence(root, directory, evidence); }
    finally { await fs.rm(lock, { recursive: true, force: true }); }
  }
  return evidence;
}

export async function status(root, feature) {
  try {
    const current = await readContract(root, feature);
    try {
      await fs.lstat(await lockPath(root, true));
      return { feature, status: 'blocked', reason: 'Verification lock is present; a run may still be active' };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const evidencePath = await safePath(root, path.relative(root, path.join(current.directory, 'evidence.json')), { missing: true });
    let evidence;
    try { evidence = JSON.parse(await fs.readFile(evidencePath, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return { feature, status: 'unverified', reason: 'No verification evidence' };
      throw error;
    }
    const invalid = reason => ({ feature, status: 'invalid', reason });
    if (evidence.schemaVersion !== 2 || evidence.runnerVersion !== VERSION || evidence.feature !== feature) {
      return invalid('Unsupported or mismatched evidence');
    }
    if (evidence.status === 'running') return invalid('Previous verification did not finish');
    if (evidence.status === 'invalid') return invalid(evidence.reason ?? 'Previous verification failed to run');
    if (evidence.inputs?.specSha256 !== current.specHash) {
      return { feature, status: 'stale', reason: 'Contract changed since verification' };
    }
    const now = await snapshot(root, feature);
    if (evidence.workspace?.before?.sha256 !== now.sha256 || evidence.workspace?.after?.sha256 !== now.sha256) {
      return { feature, status: 'stale', reason: 'Workspace changed since or during verification' };
    }
    if (!Array.isArray(evidence.checks)) return invalid('Evidence is missing checks');
    const expected = current.contract.state === 'draft' ? [] : current.contract.checks;
    if (evidence.checks.length !== expected.length) return invalid('Evidence check coverage is incomplete');
    for (let i = 0; i < expected.length; i++) {
      const result = evidence.checks[i], check = expected[i];
      if (!result || result.id !== check.id || JSON.stringify(result.argv) !== JSON.stringify(check.argv) ||
        result.cwd !== (check.cwd ?? '.') || result.timeoutMs !== (check.timeoutMs ?? 120000) ||
        typeof result.timedOut !== 'boolean' || typeof result.aborted !== 'boolean' ||
        !['passed', 'failed'].includes(result.status)) return invalid('Evidence does not match check ' + check.id);
      const passed = result.exitCode === 0 && result.signal === null && result.error === null &&
        !result.timedOut && !result.aborted;
      if ((result.status === 'passed') !== passed) return invalid('Inconsistent check result: ' + check.id);
    }
    const derived = gate(current.contract, evidence.checks, false);
    if (evidence.status !== derived) return invalid('Evidence summary disagrees with check results');
    return { feature, status: derived, runId: evidence.runId, finishedAt: evidence.finishedAt,
      criteria: criteriaResults(current.contract, evidence.checks), reason: evidence.reason };
  } catch (error) {
    return { feature, status: 'invalid', reason: error.message };
  }
}
