import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

import { specForCheck } from './helpers.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const skill = fileURLToPath(new URL('../.agents/skills/spec-driven-development/', import.meta.url));
const run = (cwd, args, entry = cli) => spawnSync(process.execPath, [entry, ...args], { cwd, encoding: 'utf8' });

test('CLI gives actionable errors and propagates verification exit codes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-spec-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(run(root, ['--help']).status, 0);
  assert.equal(run(root, ['--version']).stdout.trim(), '2.0.0');
  assert.equal(run(root, ['spec', 'x', 'intent']).status, 2);
  execFileSync('git', ['init', '-q', root]);
  assert.equal(run(root, ['execute', 'task-1']).status, 2);
  assert.equal(run(root, ['spec', 'example', 'intent', '--force']).status, 2);
  assert.equal(run(root, ['spec', 'example', 'intent']).status, 0);
  assert.equal(run(root, ['status', 'example']).status, 1);
  assert.equal(run(root, ['verify', 'example']).status, 1);
  const directory = path.join(root, '.codex-spec/features/example');
  assert.deepEqual((await fs.readdir(directory)).sort(), ['evidence.json', 'spec.md']);
  await fs.writeFile(path.join(directory, 'spec.md'), specForCheck({ argv: [process.execPath, '-e', 'process.exit(0)'] }));
  assert.equal(run(root, ['verify', 'example']).status, 0);
  assert.equal(run(root, ['status', 'example']).status, 0);
  await fs.writeFile(path.join(root, 'change.txt'), 'change');
  assert.equal(run(root, ['status', 'example']).status, 1);
  await fs.writeFile(path.join(directory, 'spec.md'), '# Missing criteria');
  assert.equal(run(root, ['verify', 'example']).status, 2);
});

test('copying the skill directory alone provides a working standalone toolkit', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-spec-skill-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  const destination = path.join(root, '.agents/skills/spec-driven-development');
  await fs.cp(skill, destination, { recursive: true });
  const standalone = path.join(destination, 'scripts/codex-spec.mjs');
  assert.equal(run(root, ['spec', 'portable', 'Portable contract'], standalone).status, 0);
  const result = run(root, ['verify', 'portable'], standalone);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, 'blocked');
});

test("standalone helper also runs through a symlinked skill directory", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-spec-link-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.symlink(skill, path.join(root, "linked-skill"));
  const result = run(root, ["--version"], path.join(root, "linked-skill/scripts/codex-spec.mjs"));
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "2.0.0");
});
