import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-spec-demo-'));
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
function run(args, expectedExit) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, expectedExit, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
execFileSync('git', ['init', '-q', root]);
run(['spec', 'double', 'Double a number without changing its sign'], 0);
await fs.writeFile(path.join(root, 'double.cjs'), 'module.exports = n => n + 1;\n');
await fs.writeFile(path.join(root, 'double.test.cjs'),
  'const test = require("node:test"); const assert = require("node:assert/strict");\n' +
  'const double = require("./double.cjs");\n' +
  'test("doubles positive, negative, and zero values", () => {\n' +
  '  assert.equal(double(2), 4); assert.equal(double(-3), -6); assert.equal(double(0), 0);\n});\n');
await fs.writeFile(path.join(root, '.codex-spec/features/double/spec.md'),
'# Double a number\n\n## Acceptance criteria\n\n### Correct results\nDouble positive, negative, and zero values.\n\n' +
'Verify: `node --test double.test.cjs`\nTimeout: 10s\n');
const failed = run(['verify', 'double'], 1);
assert.equal(failed.status, 'failed');
await fs.writeFile(path.join(root, 'double.cjs'), 'module.exports = n => n * 2;\n');
const verified = run(['verify', 'double'], 0);
assert.equal(verified.status, 'verified');
assert.equal(run(['status', 'double'], 0).status, 'verified');
await fs.appendFile(path.join(root, 'double.cjs'), '// A later change requires another run.\n');
const stale = run(['status', 'double'], 1);
assert.equal(stale.status, 'stale');
console.log(JSON.stringify({
  results: [failed.status, verified.status, stale.status], directory: root,
  evidence: path.join(root, '.codex-spec/features/double/evidence.json')
}, null, 2));
