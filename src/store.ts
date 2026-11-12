import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PointerSchema, ReviewSchema, RunSchema, readRunRecord, SpecError, type CurrentRun, type Run, type Review } from './model.js';
import { hash } from './spec.js';
import { safePath, isMissing, featureDirectory } from './workspace.js';

export const errorMessage = (e: unknown): string => e instanceof Error ? e.message : String(e);
async function location(root: string, feature: string): Promise<string> {
  await featureDirectory(root, feature);
  return safePath(root, '.codex-spec/evidence/' + feature, true);
}
async function json(root: string, relative: string): Promise<unknown> {
  const file = await safePath(root, relative);
  if ((await fs.stat(file)).size > 32 * 1024 * 1024) throw new SpecError('Evidence exceeds 32 MiB');
  return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
}
async function write(root: string, file: string, value: unknown, immutable = false): Promise<string> {
  const destination = await safePath(root, path.relative(root, file), true);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const text = JSON.stringify(value, null, 2) + '\n';
  if (immutable) await fs.writeFile(destination, text, { flag: 'wx', mode: 0o600 });
  else {
    const temporary = destination + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, text, { flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, destination);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  return hash(text);
}
export async function lock<T>(root: string, action: () => Promise<T>): Promise<T> {
  const dir = await safePath(root, '.codex-spec/.verify.lock', true);
  await fs.mkdir(path.dirname(dir), { recursive: true });
  try { await fs.mkdir(dir); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new SpecError('A run is locked. Inspect .codex-spec/.verify.lock/owner.json; remove the lock only after its process has stopped.');
    throw e;
  }
  const token = randomUUID();
  try {
    await fs.writeFile(path.join(dir, 'owner.json'), JSON.stringify({ token, pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' });
    return await action();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
export async function locked(root: string): Promise<boolean> {
  try { await fs.lstat(await safePath(root, '.codex-spec/.verify.lock', true)); return true; }
  catch (e) { if (isMissing(e)) return false; throw e; }
}
export async function startRun(root: string, feature: string, id: string, startedAt: string): Promise<void> {
  const dir = await location(root, feature);
  await write(root, path.join(dir, 'latest.json'), { state: 'running', id, startedAt });
}
export async function finishRun(root: string, run: CurrentRun): Promise<void> {
  RunSchema.parse(run);
  const dir = await location(root, run.feature);
  const digest = await write(root, path.join(dir, 'runs', run.id + '.json'), run, true);
  const pointer = { state: 'finished', id: run.id, hash: digest } as const;
  await write(root, path.join(dir, 'latest.json'), pointer);
  if (run.mode === 'baseline') await write(root, path.join(dir, 'baseline.json'), pointer);
}
export async function loadRun(root: string, feature: string, which = 'latest'): Promise<{ run: Run; hash: string } | null> {
  const dir = await location(root, feature);
  let pointer;
  try { pointer = PointerSchema.parse(await json(root, path.relative(root, path.join(dir, which + '.json')))); }
  catch (e) { if (isMissing(e)) return null; throw new SpecError('Invalid evidence pointer: ' + errorMessage(e)); }
  if (pointer.state === 'running') throw new SpecError('The last run did not finish; rerun verification');
  const file = await safePath(root, path.relative(root, path.join(dir, 'runs', pointer.id + '.json')));
  if ((await fs.stat(file)).size > 32 * 1024 * 1024) throw new SpecError('Evidence exceeds 32 MiB');
  const raw = await fs.readFile(file, 'utf8');
  if (hash(raw) !== pointer.hash) throw new SpecError('Evidence checksum mismatch; rerun verification');
  const run = readRunRecord(JSON.parse(raw));
  if (run.id !== pointer.id || run.feature !== feature) throw new SpecError('Evidence identity mismatch');
  return { run, hash: pointer.hash };
}
export async function history(root: string, feature: string): Promise<Run[]> {
  const dir = await location(root, feature), runs = path.join(dir, 'runs');
  await safePath(root, path.relative(root, runs), true);
  let names: string[];
  try { names = await fs.readdir(runs); } catch (e) { if (isMissing(e)) return []; throw e; }
  const result: Run[] = [];
  for (const name of names.filter(n => /^[a-f0-9-]{36}\.json$/.test(n))) {
    const run = readRunRecord(await json(root, path.relative(root, path.join(runs, name))));
    if (run.feature !== feature || name !== run.id + '.json') throw new SpecError('History identity mismatch');
    result.push(run);
  }
  return result.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
}
const ReviewPointer = z.object({ id: z.string().uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export async function saveReview(root: string, review: Review): Promise<void> {
  ReviewSchema.parse(review);
  const dir = await location(root, review.feature);
  const digest = await write(root, path.join(dir, 'reviews', review.id + '.json'), review, true);
  await write(root, path.join(dir, 'review.json'), { id: review.id, hash: digest });
}
export async function loadReview(root: string, feature: string): Promise<Review | null> {
  const dir = await location(root, feature);
  let pointer;
  try { pointer = ReviewPointer.parse(await json(root, path.relative(root, path.join(dir, 'review.json')))); }
  catch (e) { if (isMissing(e)) return null; throw e; }
  const file = await safePath(root, path.relative(root, path.join(dir, 'reviews', pointer.id + '.json')));
  if ((await fs.stat(file)).size > 32 * 1024 * 1024) throw new SpecError('Evidence exceeds 32 MiB');
  const raw = await fs.readFile(file, 'utf8');
  if (hash(raw) !== pointer.hash) throw new SpecError('Review checksum mismatch');
  const review = ReviewSchema.parse(JSON.parse(raw));
  if (review.id !== pointer.id || review.feature !== feature) throw new SpecError('Review identity mismatch');
  return review;
}
