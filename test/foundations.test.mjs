import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { verify, status, gateExit, recordReview, history, readRunRecord, hash, provenance } from '../.build/index.mjs';
import { fixture, write, contract, cli, cliPath, specPath } from './helpers.mjs';
const two = 'Verify: `node first.mjs`\nVerify: `node later.mjs`';
async function twoChecks(t, first = 'setInterval(()=>{},1000)') {
  const root = await fixture(t, two);
  await write(root, 'first.mjs', first);
  await write(root, 'later.mjs', 'import fs from "node:fs";fs.writeFileSync(".codex-spec/evidence/later-ran","yes");');
  return root;
}
async function assertNotRun(root) {
  await assert.rejects(fs.stat(path.join(root, '.codex-spec/evidence/later-ran')), /ENOENT/);
}
test('cancellation stops announcements and scheduling; skipped checks have no execution timestamp', async t => {
  const root = await twoChecks(t), c = new AbortController(), announced = [];
  const a = await verify(root, 'example', {
    signal: c.signal, onCheck: check => { announced.push(check.id); setTimeout(() => c.abort(), 100); }
  });
  assert.equal(announced.length, 1); assert.equal(a.run.results.length, 1);
  assert.equal(a.run.results[0].outcome, 'cancelled');
  assert.equal(a.run.execution.stopReason, 'cancelled');
  assert.deepEqual(a.run.skipped, [{ id: a.run.spec.checks[1].id, reason: 'cancelled' }]);
  assert.equal(a.acceptance, 'blocked'); assert.equal(gateExit(a, 'checks'), 1);
  await assertNotRun(root);
  await assert.rejects(recordReview(root, 'example', 'approve', 'R', 'review'), /incomplete|failing/);
});
test('cancellation before scheduling starts no checks, including manual-only work', async t => {
  const root = await twoChecks(t), c = new AbortController(); c.abort();
  let announced = 0;
  let a = await verify(root, 'example', { signal: c.signal, onCheck: () => announced++ });
  assert.equal(announced, 0); assert.equal(a.run.results.length, 0); assert.equal(a.run.skipped.length, 2);
  assert.equal(gateExit(a), 1); await assertNotRun(root);
  await write(root, specPath, contract('Review: inspect'));
  a = await verify(root, 'example', { signal: c.signal });
  assert.equal(a.acceptance, 'blocked');
  await assert.rejects(recordReview(root, 'example', 'approve', 'R', 'review'), /incomplete|failing/);
});
test('shared execution budget cancels active work and skips the remainder', async t => {
  const root = await twoChecks(t);
  const a = await verify(root, 'example', { budgetMs: 100 });
  assert.equal(a.run.execution.stopReason, 'budget');
  assert.equal(a.run.execution.budgetScope, 'check-execution');
  assert.equal(a.run.results.length, 1); assert.equal(a.run.results[0].outcome, 'cancelled');
  assert.equal(a.run.skipped[0].reason, 'budget'); assert.equal(gateExit(a), 1);
  await assertNotRun(root);
});
test('continue remains default; fail-fast skips rather than fabricating results', async t => {
  const root = await twoChecks(t, 'process.exit(1)');
  let a = await verify(root, 'example', { failurePolicy: 'fail-fast' });
  assert.equal(a.run.execution.stopReason, 'fail-fast');
  assert.equal(a.run.results[0].outcome, 'failed'); assert.equal(a.run.skipped[0].reason, 'fail-fast');
  await assertNotRun(root);
  a = await verify(root, 'example');
  assert.equal(a.run.execution.failurePolicy, 'continue'); assert.equal(a.run.results.length, 2);
  assert.equal(a.run.results[1].outcome, 'passed'); assert.equal(a.run.skipped.length, 0);
});
test('a per-check timeout can continue, while a shared budget always stops scheduling', async t => {
  const root = await twoChecks(t);
  await write(root, specPath, contract(two + '\nTimeout: 50ms'));
  const a = await verify(root, 'example', { budgetMs: 2000 });
  assert.equal(a.run.results.length, 2); assert.equal(a.run.results[0].failure, 'timeout');
  assert.equal(a.run.results[0].outcome, 'failed'); assert.equal(a.run.execution.stopReason, null);
});
test('v2 provenance is explicit and never authenticates environment-reported CI', async t => {
  const root = await fixture(t); await write(root, 'package-lock.json', '{}');
  const a = await verify(root, 'example');
  assert.equal(a.run.schemaVersion, 2);
  assert.equal(a.run.provenance.origin, 'local-process');
  assert.equal(a.run.provenance.authentication, 'unverified');
  assert.deepEqual(a.run.provenance.dependencies.fingerprintedLockfiles, ['package-lock.json']);
  assert.equal(a.run.provenance.environment, 'not-captured');
  assert.equal(a.coverage.mapping, 'complete'); assert.equal(a.coverage.semantic, 'not-assessed');
  const p = provenance({ CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2', SECRET: 'never capture' });
  assert.equal(p.context, 'ci-reported'); assert.equal(p.authentication, 'unverified');
  assert.deepEqual(p.ci, { provider: 'github-actions', runId: '123', attempt: '2' });
  assert.equal(JSON.stringify(p).includes('never capture'), false);
});
test('a vacuous test maps a criterion but never establishes semantic coverage', async t => {
  const root = await fixture(t); await write(root, 'check.mjs', 'import assert from "node:assert/strict"; assert.ok(true);');
  const a = await verify(root, 'example');
  assert.equal(a.checks, 'passed'); assert.equal(a.coverage.mapping, 'complete');
  assert.equal(a.coverage.semantic, 'not-assessed');
});
test('checks gate labels do not turn pending or rejected reviews into full acceptance', async t => {
  const root = await fixture(t, 'Verify: `node check.mjs`\nReview: Inspect the behavior.');
  let r = cli(root, 'verify', 'example', '--gate', 'checks', '--json');
  let a = JSON.parse(r.stdout);
  assert.equal(r.status, 0); assert.equal(a.gate.result, 'CHECKS_PASSED');
  assert.equal(a.acceptance, 'needs-review'); assert.equal(a.review, 'pending');
  const human = cli(root, 'status', 'example', '--gate', 'checks');
  assert.match(human.stdout, /CHECKS_PASSED/); assert.match(human.stdout, /Acceptance: NEEDS-REVIEW/);
  assert.match(human.stdout, /Semantic coverage: not-assessed/);
  cli(root, 'review', 'example', '--decision', 'reject', '--reviewer', 'R', '--note', 'Needs work');
  a = JSON.parse(cli(root, 'status', 'example', '--gate', 'checks', '--json').stdout);
  assert.equal(a.gate.result, 'CHECKS_PASSED'); assert.equal(a.acceptance, 'changes-requested');
  assert.equal(cli(root, 'status', 'example').status, 1);
});
test('CLI validates execution options and reports a budget stop separately from test failure', async t => {
  const root = await twoChecks(t);
  const r = cli(root, 'verify', 'example', '--budget', '100ms', '--json');
  assert.equal(r.status, 1, r.stderr); const a = JSON.parse(r.stdout);
  assert.equal(a.run.execution.stopReason, 'budget'); assert.equal(a.run.skipped[0].reason, 'budget');
  for (const budget of ['0s', '25h', 'garbage', '-1ms']) assert.equal(cli(root, 'verify', 'example', '--budget', budget).status, 2);
  assert.equal(cli(root, 'status', 'example', '--fail-fast').status, 2);
  await assertNotRun(root);
});
test('versioned readers retain v1 history bytes and reject unknown versions clearly', async t => {
  const root = await fixture(t);
  const raw = await fs.readFile(new URL('./fixtures/run-v1.json', import.meta.url), 'utf8');
  const legacy = readRunRecord(JSON.parse(raw));
  assert.equal(legacy.schemaVersion, 1); assert.equal('provenance' in legacy, false);
  const base = path.join(root, '.codex-spec/evidence/example');
  await fs.mkdir(path.join(base, 'runs'), { recursive: true });
  const record = path.join(base, 'runs', legacy.id + '.json');
  await fs.writeFile(record, raw);
  await fs.writeFile(path.join(base, 'latest.json'), JSON.stringify({ state: 'finished', id: legacy.id, hash: hash(raw) }));
  assert.equal((await history(root, 'example'))[0].schemaVersion, 1);
  assert.equal((await status(root, 'example')).acceptance, 'stale');
  assert.equal(await fs.readFile(record, 'utf8'), raw);
  await verify(root, 'example');
  assert.deepEqual(new Set((await history(root, 'example')).map(r => r.schemaVersion)), new Set([1, 2]));
  assert.equal(await fs.readFile(record, 'utf8'), raw);
  assert.throws(() => readRunRecord({ ...JSON.parse(raw), schemaVersion: 99 }), /Unsupported evidence schema version: 99/);
});
test('strict result outcome and skipped coverage validation reject contradictory records', async t => {
  const root = await fixture(t), a = await verify(root, 'example');
  assert.throws(() => readRunRecord({ ...a.run, results: [{ ...a.run.results[0], outcome: 'failed' }] }), /contradicts/);
  const corrupt = { ...a.run, skipped: [{ id: 'unknown-check', reason: 'cancelled' }] };
  const raw = JSON.stringify(corrupt), base = path.join(root, '.codex-spec/evidence/example');
  await fs.writeFile(path.join(base, 'runs', a.run.id + '.json'), raw);
  await fs.writeFile(path.join(base, 'latest.json'), JSON.stringify({ state: 'finished', id: a.run.id, hash: hash(raw) }));
  assert.equal((await status(root, 'example')).acceptance, 'invalid');
});
for (const signal of ['SIGINT', 'SIGTERM']) test('real CLI ' + signal + ' stops the process group and does not start the next check', async t => {
  const root = await twoChecks(t,
    'import {spawn} from "node:child_process";import fs from "node:fs";spawn(process.execPath,["descendant.mjs"],{stdio:"inherit"});fs.writeFileSync(".codex-spec/evidence/started","yes");setInterval(()=>{},1000);');
  await write(root, 'descendant.mjs',
    'import fs from "node:fs";setTimeout(()=>fs.writeFileSync(".codex-spec/evidence/leaked","yes"),1500);');
  const child = spawn(process.execPath, [cliPath, 'verify', 'example', '--json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c);
  const done = new Promise(resolve => child.on('close', resolve));
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const started = path.join(root, '.codex-spec/evidence/started');
  for (let i = 0; i < 200; i++) {
    if (await fs.stat(started).then(() => true, () => false)) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  await fs.stat(started); child.kill(signal);
  assert.equal(await done, 1, err);
  const a = JSON.parse(out); assert.equal(a.run.results[0].outcome, 'cancelled');
  assert.equal(a.run.skipped[0].reason, 'cancelled'); assert.equal((err.match(/Checking:/g) ?? []).length, 1);
  await new Promise(resolve => setTimeout(resolve, 1600));
  await assert.rejects(fs.stat(path.join(root, '.codex-spec/evidence/leaked')), /ENOENT/);
  await assert.rejects(fs.stat(path.join(root, '.codex-spec/.verify.lock')), /ENOENT/);
  await assertNotRun(root);
});
