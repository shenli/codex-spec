import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseSpec } from './markdown.mjs';

export const hash = data => createHash('sha256').update(data).digest('hex');
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;

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
  const spec = await fs.readFile(specPath, 'utf8');
  return { directory, contract: parseSpec(spec, feature), specHash: hash(spec) };
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
  // The incomplete criterion blocks verification until a real check or review is supplied.
  await fs.writeFile(path.join(directory, 'spec.md'),
    '# ' + feature + '\n\n' + intent + '\n\n## Acceptance criteria\n\n' +
    '### Expected behavior\n\n' + intent + '\n\n' +
    '<!-- Refine this criterion, then add Verify: followed by an inline-code command,\n' +
    'or Review: followed by a specific manual review procedure. -->\n', { flag: 'wx' });
  return directory;
}
