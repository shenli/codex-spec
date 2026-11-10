import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const hash = data => createHash('sha256').update(data).digest('hex');
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
function keys(object, allowed, label) {
  assert(object && typeof object === 'object' && !Array.isArray(object), label + ' must be an object');
  for (const key of Object.keys(object)) assert(allowed.includes(key), label + ': unknown field ' + key);
}

export function validateContract(value, feature) {
  keys(value, ['schemaVersion', 'feature', 'state', 'criteria', 'checks'], 'contract');
  assert(value.schemaVersion === 1, 'Unsupported contract schemaVersion');
  assert(value.feature === feature, 'Contract feature must match its directory');
  assert(['draft', 'ready'].includes(value.state), 'state must be draft or ready');
  assert(Array.isArray(value.criteria) && value.criteria.length > 0 && value.criteria.length <= 128,
    'Define between 1 and 128 acceptance criteria');
  assert(Array.isArray(value.checks) && value.checks.length <= 64, 'checks must be an array of at most 64 checks');
  const checkIds = new Set();
  for (const check of value.checks) {
    keys(check, ['id', 'argv', 'cwd', 'timeoutMs'], 'check');
    assert(typeof check.id === 'string' && idPattern.test(check.id) && !checkIds.has(check.id), 'Check IDs must be valid and unique');
    checkIds.add(check.id);
    assert(Array.isArray(check.argv) && check.argv.length > 0 && check.argv.length <= 128 &&
      check.argv.every(a => typeof a === 'string' && !a.includes('\0')) && text(check.argv[0]),
    'argv must be a nonempty array of strings with an executable');
    assert(check.cwd === undefined || (text(check.cwd) && !path.isAbsolute(check.cwd) &&
      !check.cwd.split(/[\\/]/).includes('..')), 'cwd must be a relative path inside the repository');
    assert(check.timeoutMs === undefined || (Number.isInteger(check.timeoutMs) &&
      check.timeoutMs >= 1 && check.timeoutMs <= 600000), 'timeoutMs must be between 1 and 600000');
  }
  const criteriaIds = new Set(), used = new Set();
  for (const criterion of value.criteria) {
    keys(criterion, ['id', 'description', 'checks', 'manual'], 'criterion');
    assert(typeof criterion.id === 'string' && idPattern.test(criterion.id) && !criteriaIds.has(criterion.id), 'Criterion IDs must be valid and unique');
    criteriaIds.add(criterion.id);
    assert(text(criterion.description), 'Each criterion needs a description');
    const automated = Array.isArray(criterion.checks) && criterion.checks.length > 0;
    assert((automated && criterion.manual === undefined) ||
      (criterion.checks === undefined && text(criterion.manual)),
    'Each criterion needs either nonempty checks or a manual review reason');
    if (automated) {
      assert(new Set(criterion.checks).size === criterion.checks.length, 'Duplicate criterion check reference');
      for (const id of criterion.checks) {
        assert(checkIds.has(id), 'Unknown check reference: ' + id);
        used.add(id);
      }
    }
  }
  assert(checkIds.size === used.size, 'Every check must map to at least one criterion');
  return value;
}

// Refuse symlinked metadata, including a symlink in any parent directory.
export async function safePath(root, relative, { missing = false } = {}) {
  const absolute = path.resolve(root, relative);
  assert(absolute === root || absolute.startsWith(root + path.sep), 'Path escapes repository');
  let current = root;
  for (const part of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      assert(!(await fs.lstat(current)).isSymbolicLink(), 'Symlink is not allowed: ' + relative);
    } catch (error) {
      if (missing && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return absolute;
}

export async function featurePath(root, feature, missing = false) {
  assert(typeof feature === 'string' && feature.length <= 80 && slugPattern.test(feature),
    'Feature must be a lowercase hyphenated slug (at most 80 characters)');
  return safePath(root, path.join('.codex-spec', 'features', feature), { missing });
}

export async function readContract(root, feature) {
  const directory = await featurePath(root, feature);
  const specPath = await safePath(root, path.relative(root, path.join(directory, 'spec.md')));
  const acceptancePath = await safePath(root, path.relative(root, path.join(directory, 'acceptance.json')));
  const spec = await fs.readFile(specPath, 'utf8');
  assert(text(spec), 'spec.md must not be empty');
  const raw = await fs.readFile(acceptancePath, 'utf8');
  const contract = validateContract(JSON.parse(raw), feature);
  return { directory, contract, specHash: hash(spec), acceptanceHash: hash(raw) };
}

export async function writeEvidence(root, directory, value) {
  const destination = await safePath(root, path.relative(root, path.join(directory, 'evidence.json')), { missing: true });
  const temporary = destination + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function createSpec(root, feature, intent) {
  assert(text(intent), 'Provide a nonempty intent');
  const directory = await featurePath(root, feature, true);
  await fs.mkdir(path.dirname(directory), { recursive: true });
  await fs.mkdir(directory); // No overwrite or silent reuse.
  const contract = {
    schemaVersion: 1, feature, state: 'draft',
    criteria: [{ id: 'AC-1', description: intent,
      manual: 'Replace with an observable criterion and an automated check, or a specific review procedure.' }],
    checks: []
  };
  await fs.writeFile(path.join(directory, 'spec.md'),
    '# ' + feature + '\n\n## Intent\n\n' + intent +
    '\n\n## Scope and constraints\n\nDefine scope, non-goals, compatibility, and engineering constraints.\n\n' +
    '## Acceptance\n\nThe criterion IDs and check mappings live in acceptance.json. Keep descriptions aligned with this spec.\n\n' +
    '## Review\n\nRecord design decisions and any approval requirements here. State is draft until the contract is concrete.\n',
    { flag: 'wx' });
  await fs.writeFile(path.join(directory, 'acceptance.json'), JSON.stringify(contract, null, 2) + '\n', { flag: 'wx' });
  return directory;
}
