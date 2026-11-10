import fs from 'node:fs/promises';
import path from 'node:path';
import { hash } from './spec.js';
import { safePath, isMissing } from './workspace.js';
import { SpecError } from './model.js';

async function entries(dir: string, prefix = ''): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const entry of await fs.readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const name = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new SpecError('Skill resources must not be symlinks');
    if (entry.isDirectory()) for (const [key, digest] of await entries(dir, name)) result.set(key, digest);
    else result.set(name, hash(await fs.readFile(path.join(dir, name))));
  }
  return result;
}
export async function installSkill(root: string, source: string): Promise<{ installed: boolean; path: string }> {
  const destination = await safePath(root, '.agents/skills/spec-driven-development', true);
  const expected = await entries(source);
  let existing: Map<string, string> | null = null;
  try { existing = await entries(destination); } catch (e) { if (!isMissing(e)) throw e; }
  if (existing && [...expected].some(([p, h]) => existing.get(p) !== h)) {
    throw new SpecError('The installed skill differs. Review its local changes before replacing the skill directory.');
  }
  if (!existing) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false });
  }
  const ignore = await safePath(root, '.gitignore', true);
  let content = '';
  try { content = await fs.readFile(ignore, 'utf8'); } catch (e) { if (!isMissing(e)) throw e; }
  const additions = ['.codex-spec/evidence/', '.codex-spec/.verify.lock/'].filter(s => !content.split(/\r?\n/).includes(s));
  if (additions.length) await fs.writeFile(ignore, content + (content.endsWith('\n') || !content ? '' : '\n') + additions.join('\n') + '\n');
  return { installed: !existing, path: destination };
}
