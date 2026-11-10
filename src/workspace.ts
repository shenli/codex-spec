import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Feature, SpecError, type Snapshot } from './model.js';
import { hash, parseSpec } from './spec.js';

const git = (root: string, args: string[]): string => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
});
export async function repositoryRoot(cwd = process.cwd()): Promise<string> {
  try { return await fs.realpath(git(cwd, ['rev-parse', '--show-toplevel']).trim()); }
  catch { throw new SpecError('Run inside a Git working tree with Git installed'); }
}
export function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
export async function safePath(root: string, relative: string, missing = false): Promise<string> {
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) throw new SpecError('Path escapes repository: ' + relative);
  let current = root;
  for (const part of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new SpecError('Symlink is not allowed: ' + relative); }
    catch (error) { if (!missing || !isMissing(error)) throw error; }
  }
  return absolute;
}
export async function featureDirectory(root: string, feature: string, missing = false): Promise<string> {
  if (!Feature.safeParse(feature).success) throw new SpecError('Use a lowercase hyphenated feature name, up to 80 characters');
  return safePath(root, '.codex-spec/features/' + feature, missing);
}
export async function readSpec(root: string, feature: string) {
  const directory = await featureDirectory(root, feature);
  const file = await safePath(root, path.relative(root, path.join(directory, 'spec.md')));
  return parseSpec(await fs.readFile(file, 'utf8'), feature);
}
export async function scaffold(root: string, feature: string, intent: string): Promise<string> {
  if (!intent.trim()) throw new SpecError('Describe the intended outcome');
  const dir = await featureDirectory(root, feature, true);
  await fs.mkdir(path.dirname(dir), { recursive: true });
  try { await fs.mkdir(dir); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new SpecError('Feature already exists: ' + feature);
    throw e;
  }
  await fs.writeFile(path.join(dir, 'spec.md'),
    '# ' + feature + '\n\n' + intent + '\n\n## Acceptance criteria\n\n### Expected behavior\n\n' + intent +
    '\n\n<!-- Describe a concrete outcome and add Verify: with an inline-code command.\n' +
    'For a human decision, add Review: with the review procedure. -->\n', { flag: 'wx' });
  return dir;
}
export async function features(root: string): Promise<string[]> {
  const dir = await safePath(root, '.codex-spec/features', true);
  try { return (await fs.readdir(dir, { withFileTypes: true })).filter(e => e.isDirectory() && Feature.safeParse(e.name).success).map(e => e.name).sort(); }
  catch (e) { if (isMissing(e)) return []; throw e; }
}
const generated = (p: string): boolean =>
  p.startsWith('.codex-spec/evidence/') || p === '.codex-spec/evidence' ||
  p.startsWith('.codex-spec/.verify.lock/') || p === '.codex-spec/.verify.lock';
export async function snapshot(root: string, feature: string): Promise<Snapshot> {
  let head: string | null = null;
  try { head = git(root, ['rev-parse', '--verify', 'HEAD']).trim(); } catch { /* unborn repository */ }
  if (git(root, ['ls-files', '--stage', '-z']).split('\0').some(l => l.startsWith('160000 '))) {
    throw new SpecError('Submodule fingerprints are not supported; verify inside each submodule');
  }
  const paths = new Set(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean));
  paths.add('.codex-spec/features/' + feature + '/spec.md');
  const files: Snapshot['files'] = {};
  for (const name of [...paths].filter(p => !generated(p)).sort()) {
    try {
      await safePath(root, path.dirname(name));
      const absolute = path.join(root, name), stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) files[name] = { hash: hash(await fs.readlink(absolute)), kind: 'symlink', executable: false };
      else if (stat.isFile()) {
        const digest = createHash('sha256');
        for await (const chunk of createReadStream(absolute)) digest.update(chunk);
        files[name] = { hash: digest.digest('hex'), kind: 'file', executable: Boolean(stat.mode & 0o111) };
      } else throw new SpecError('Unsupported workspace entry: ' + name);
    } catch (error) { if (!isMissing(error)) throw error; }
  }
  return { digest: hash(JSON.stringify(files)), head, files };
}
export function changedFiles(a: Snapshot, b: Snapshot): string[] {
  return [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])].sort()
    .filter(p => JSON.stringify(a.files[p]) !== JSON.stringify(b.files[p]));
}
