import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { hash, safePath } from './contract.mjs';

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  });
}
export async function repositoryRoot(cwd = process.cwd()) {
  try {
    return await fs.realpath(git(cwd, ['rev-parse', '--show-toplevel']).trim());
  } catch {
    throw new Error('Run codex-spec inside a Git working tree with Git installed');
  }
}
const generated = file =>
  /^\.codex-spec\/features\/[a-z0-9]+(?:-[a-z0-9]+)*\/evidence\.json(?:\.[0-9a-f-]+\.tmp)?$/.test(file) ||
  file === '.codex-spec/.verify.lock' || file.startsWith('.codex-spec/.verify.lock/');

export async function snapshot(root, feature) {
  let head = null;
  try { head = git(root, ['rev-parse', '--verify', 'HEAD']).trim(); } catch { /* Unborn repository. */ }
  const index = git(root, ['ls-files', '--stage', '-z']);
  if (index.split('\0').some(line => line.startsWith('160000 '))) {
    throw new Error('Submodules are not supported by the workspace fingerprint; verify in the submodule separately');
  }
  const paths = new Set(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .split('\0').filter(Boolean));
  // These inputs must be included even if a project ignores .codex-spec.
  paths.add('.codex-spec/features/' + feature + '/spec.md');
  paths.add('.codex-spec/features/' + feature + '/acceptance.json');
  const digest = createHash('sha256');
  digest.update(JSON.stringify({ version: 1, head }));
  let fileCount = 0;
  for (const file of [...paths].filter(p => !generated(p)).sort()) {
    const absolute = path.join(root, file);
    let entry;
    try {
      // A tracked symlink itself is hashed as a link, but never traverse a symlinked parent.
      await safePath(root, path.dirname(file));
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) entry = [file, 'symlink', await fs.readlink(absolute)];
      else if (stat.isFile()) entry = [file, 'file', Boolean(stat.mode & 0o111), hash(await fs.readFile(absolute))];
      else throw new Error('Unsupported workspace entry: ' + file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      entry = [file, 'deleted'];
    }
    digest.update(JSON.stringify(entry));
    fileCount++;
  }
  return { head, sha256: digest.digest('hex'), fileCount };
}
