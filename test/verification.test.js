import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSpec } from '../.agents/skills/spec-driven-development/scripts/lib/contract.mjs';
import { repositoryRoot, snapshot } from '../.agents/skills/spec-driven-development/scripts/lib/workspace.mjs';
import { verify, status } from '../.agents/skills/spec-driven-development/scripts/lib/workflow.mjs';
import { runCheck } from '../.agents/skills/spec-driven-development/scripts/lib/runner.mjs';

import { commandLine, specForCheck } from './helpers.js';

const feature = 'example';
const nodeCheck = (script = 'console.log("checked")') => ({ id: 'unit', argv: [process.execPath, '-e', script] });
const contract = (check = nodeCheck()) => specForCheck(check);
async function fixture(t, value = contract()) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'codex-spec-test-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  const directory = await createSpec(root, feature, 'Observable behavior');
  const spec = path.join(directory, 'spec.md');
  await fs.writeFile(spec, value);
  return { root, directory, spec, evidence: path.join(directory, 'evidence.json') };
}

test('scaffold does not overwrite, traverses no paths, and cannot pass as a draft', async t => {
  const { root, spec } = await fixture(t);
  await assert.rejects(createSpec(root, feature, 'overwrite'), /EEXIST/);
  await assert.rejects(createSpec(root, '../escape', 'bad'), /slug/);
  await assert.rejects(createSpec(root, 'empty', ' '), /intent/);
  const value = '# Example\n\n## Acceptance criteria\n\n### Expected behavior\nObservable behavior.\n';
  await fs.writeFile(spec, value);
  const result = await verify(root, feature);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.checks, []);
  assert.equal((await status(root, feature)).status, 'blocked');
});

test('successful checks produce mapped evidence and a fresh verified status', async t => {
  const { root, directory } = await fixture(t);
  assert.equal((await status(root, feature)).status, 'unverified');
  const result = await verify(root, feature);
  assert.equal(result.status, 'verified');
  assert.equal(result.criteria[0].status, 'passed');
  assert.equal(result.checks[0].exitCode, 0);
  assert.match(result.checks[0].stdout, /checked/);
  assert.equal(result.workspace.before.sha256, result.workspace.after.sha256);
  assert.equal((await status(root, feature)).status, 'verified');
  assert.equal(await repositoryRoot(directory), root);
  assert.equal((await verify(root, feature)).status, 'verified');
});

test('nonzero checks fail and a later repair requires a fresh run', async t => {
  const { root, spec } = await fixture(t, contract(nodeCheck('console.error("regression"); process.exit(7)')));
  const failed = await verify(root, feature);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.checks[0].exitCode, 7);
  assert.match(failed.checks[0].stderr, /regression/);
  assert.equal((await status(root, feature)).status, 'failed');
  await fs.writeFile(spec, contract());
  assert.equal((await status(root, feature)).status, 'stale');
  assert.equal((await verify(root, feature)).status, 'verified');
});

test('missing executables, signals and timeouts cannot pass', async t => {
  const { root } = await fixture(t);
  const missing = await runCheck({ id: 'missing', argv: ['codex-spec-no-such-executable'] }, root);
  assert.equal(missing.status, 'failed'); assert.match(missing.error, /ENOENT/);
  const signaled = await runCheck(nodeCheck('process.kill(process.pid, "SIGTERM")'), root);
  assert.equal(signaled.status, 'failed'); assert.equal(signaled.signal, 'SIGTERM');
  const timed = await runCheck({ ...nodeCheck('setInterval(() => {}, 1000)'), timeoutMs: 100 }, root);
  assert.equal(timed.status, 'failed'); assert.equal(timed.timedOut, true);
});

test('timeout kills descendants holding inherited output pipes', async t => {
  const { root } = await fixture(t);
  const script = 'require("node:child_process").spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {stdio:"inherit"});setInterval(()=>{},1000)';
  const result = await runCheck({ ...nodeCheck(script), timeoutMs: 250 }, root);
  assert.equal(result.timedOut, true);
  assert.ok(result.durationMs < 5000);
});

test('cancellation records failure and releases the lock', async t => {
  const { root } = await fixture(t, contract(nodeCheck('setInterval(() => {}, 1000)')));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  t.after(() => clearTimeout(timer));
  const result = await verify(root, feature, { signal: controller.signal });
  assert.equal(result.status, 'failed');
  assert.equal(result.checks[0].aborted, true);
  assert.equal((await status(root, feature)).status, 'failed');
});

test('output is bounded and shell metacharacters are literal arguments', async t => {
  const { root } = await fixture(t);
  const check = nodeCheck('process.stdout.write("x".repeat(100000));process.stderr.write("y".repeat(100000));');
  const output = await runCheck(check, root);
  assert.equal(output.status, 'passed'); assert.equal(output.truncated, true);
  assert.equal(output.stdout.length, 65536); assert.equal(output.stderr.length, 65536);
  const literal = await runCheck({ id: 'literal', argv: [process.execPath, '-e',
    'console.log(process.argv[1])', '; touch injected'] }, root);
  assert.equal(literal.stdout.trim(), '; touch injected');
  await assert.rejects(fs.stat(path.join(root, 'injected')), /ENOENT/);
});

test('manual criteria block the gate even when every automated check passes', async t => {
  const value = contract() + '\n### Design approval\nReview: Maintainer reviews the diff in the PR\n';
  const { root } = await fixture(t, value);
  const result = await verify(root, feature);
  assert.equal(result.checks[0].status, 'passed'); assert.equal(result.status, 'blocked');
  assert.equal(result.criteria[1].status, 'manual-required');
  assert.equal((await status(root, feature)).status, 'blocked');
});

test('all declared checks run and one failing regression check prevents verification', async t => {
  const value = contract() + '\nVerify: `'+commandLine(nodeCheck('process.exit(1)').argv)+'`\n';
  const { root } = await fixture(t, value);
  const result = await verify(root, feature);
  assert.equal(result.status, 'failed');
  assert.equal(result.checks.length, 2);
  assert.equal(result.criteria[0].status, 'failed');
});

for (const kind of ['untracked', 'tracked', 'deleted', 'spec', 'command', 'head']) {
  test('evidence becomes stale after ' + kind + ' changes', async t => {
    const { root, directory, spec } = await fixture(t);
    await fs.writeFile(path.join(root, 'source.js'), 'original\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'baseline'], { cwd: root });
    assert.equal((await verify(root, feature)).status, 'verified');
    if (kind === 'untracked') await fs.writeFile(path.join(root, 'new.js'), 'new');
    if (kind === 'tracked') await fs.writeFile(path.join(root, 'source.js'), 'changed');
    if (kind === 'deleted') await fs.unlink(path.join(root, 'source.js'));
    if (kind === 'spec') await fs.appendFile(path.join(directory, 'spec.md'), '\nNew requirement');
    if (kind === 'command') await fs.writeFile(spec, contract(nodeCheck('console.log("updated check")')));
    if (kind === 'head') execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com',
      'commit', '--allow-empty', '-qm', 'new head'], { cwd: root });
    assert.equal((await status(root, feature)).status, 'stale');
  });
}

test('ignored contracts are still fingerprinted; generated evidence is excluded', async t => {
  const { root, spec, evidence } = await fixture(t);
  await fs.writeFile(path.join(root, '.gitignore'), '.codex-spec/\n');
  const before = await snapshot(root, feature);
  assert.equal((await verify(root, feature)).status, 'verified');
  const after = await snapshot(root, feature);
  assert.equal(before.sha256, after.sha256);
  await fs.appendFile(evidence, '\n');
  assert.equal((await status(root, feature)).status, 'verified');
  await fs.appendFile(spec, '\n');
  assert.equal((await status(root, feature)).status, 'stale');
});

test('checks that modify source invalidate their own evidence', async t => {
  const { root } = await fixture(t, contract(nodeCheck('require("node:fs").writeFileSync("modified.js", "changed")')));
  const result = await verify(root, feature);
  assert.equal(result.checks[0].status, 'passed');
  assert.equal(result.status, 'stale');
  assert.equal((await status(root, feature)).status, 'stale');
});

test('a malformed new run invalidates an earlier passing receipt', async t => {
  const { root, spec, evidence } = await fixture(t);
  await verify(root, feature);
  await fs.writeFile(spec, '# Missing acceptance criteria');
  assert.equal((await verify(root, feature)).status, 'invalid');
  assert.equal(JSON.parse(await fs.readFile(evidence)).status, 'invalid');
  await fs.writeFile(spec, contract());
  assert.equal((await status(root, feature)).status, 'invalid');
});

test('status rejects incomplete or inconsistent evidence instead of trusting a status field', async t => {
  const { root, evidence } = await fixture(t);
  await verify(root, feature);
  const original = JSON.parse(await fs.readFile(evidence));
  for (const mutate of [
    e => { e.checks = []; },
    e => { e.checks[0].exitCode = 7; },
    e => { e.checks[0].argv = ['true']; },
    e => { e.status = 'failed'; },
    e => { e.schemaVersion = 999; }
  ]) {
    const changed = structuredClone(original); mutate(changed);
    await fs.writeFile(evidence, JSON.stringify(changed));
    assert.equal((await status(root, feature)).status, 'invalid');
  }
});

test('concurrent verification is rejected without replacing evidence', async t => {
  const { root, evidence } = await fixture(t);
  await verify(root, feature);
  const before = await fs.readFile(evidence, 'utf8');
  await fs.mkdir(path.join(root, '.codex-spec/.verify.lock'));
  await assert.rejects(verify(root, feature), /locked/);
  assert.equal(await fs.readFile(evidence, 'utf8'), before);
  assert.equal((await status(root, feature)).status, 'blocked');
});

test('metadata symlinks and escaping check directories are rejected', async t => {
  const { root, directory, spec } = await fixture(t);
  await fs.symlink(os.tmpdir(), path.join(root, 'outside'));
  const value = contract({ ...nodeCheck(), cwd: 'outside' });
  await fs.writeFile(spec, value);
  assert.equal((await verify(root, feature)).status, 'invalid');
  await fs.unlink(spec);
  await fs.writeFile(path.join(root, 'external.md'), contract());
  await fs.symlink(path.join(root, 'external.md'), spec);
  assert.equal((await status(root, feature)).status, 'invalid');
  await fs.rm(directory, { recursive: true });
  await fs.symlink(os.tmpdir(), directory);
  await assert.rejects(verify(root, feature), /Symlink/);
});

test('symlinked evidence is refused without overwriting its target', async t => {
  const { root, evidence } = await fixture(t);
  const target = path.join(root, 'keep.txt');
  await fs.writeFile(target, 'keep');
  await fs.symlink(target, evidence);
  await assert.rejects(verify(root, feature), /Symlink/);
  assert.equal(await fs.readFile(target, 'utf8'), 'keep');
});

test('submodules fail closed instead of producing partial fingerprints', async t => {
  const { root } = await fixture(t);
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base'], { cwd: root });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  execFileSync('git', ['update-index', '--add', '--cacheinfo', '160000,' + head + ',submodule'], { cwd: root });
  assert.equal((await verify(root, feature)).status, 'invalid');
});

test('a missing check or malformed later directive prevents all command execution', async t => {
  const command = nodeCheck('require("node:fs").writeFileSync("should-not-run", "bad")');
  const { root, spec } = await fixture(t, contract(command) + '\n### Unfinished outcome\nA required outcome.\n');
  const blocked = await verify(root, feature);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.criteria[1].status, 'unverified');
  assert.deepEqual(blocked.checks, []);
  await assert.rejects(fs.stat(path.join(root, 'should-not-run')), /ENOENT/);
  await fs.writeFile(spec, contract(command) + '\nVerfy: `npm test`\n');
  assert.equal((await verify(root, feature)).status, 'invalid');
  await assert.rejects(fs.stat(path.join(root, 'should-not-run')), /ENOENT/);
});

test('multiple criteria share one check receipt without repeated execution', async t => {
  const { root } = await fixture(t, contract() + '\n### Another outcome\nVerify: `' +
    commandLine(nodeCheck().argv) + '`\n');
  const result = await verify(root, feature);
  assert.equal(result.status, 'verified');
  assert.equal(result.checks.length, 1);
  assert.equal(result.criteria.length, 2);
  assert.deepEqual(result.criteria[0].checks, result.criteria[1].checks);
});

test('quoted commands execute in the specified relative directory', async t => {
  const { root, spec } = await fixture(t);
  await fs.mkdir(path.join(root, 'web app'));
  await fs.writeFile(spec, contract({ ...nodeCheck('console.log(process.cwd())'), cwd: 'web app', timeoutMs: 30000 }));
  const result = await verify(root, feature);
  assert.equal(result.status, 'verified');
  assert.equal(result.checks[0].stdout.trim(), path.join(root, 'web app'));
  assert.equal(result.checks[0].timeoutMs, 30000);
});
