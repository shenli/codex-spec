import { z } from 'zod';

export const VERSION = '2.0.0';
export const Feature = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Id = z.string().uuid();
export const CheckSchema = z.object({
  id: z.string(), command: z.string(), argv: z.array(z.string()).min(1),
  cwd: z.string(), timeoutMs: z.number().int().min(1).max(600000)
}).strict();
export const CriterionSchema = z.object({
  id: z.string(), title: z.string(), description: z.string(), line: z.number().int().positive(),
  checks: z.array(z.string()), review: z.string().nullable()
}).strict();
export const SpecSchema = z.object({
  feature: Feature, title: z.string(), hash: Digest,
  criteria: z.array(CriterionSchema).min(1).max(128),
  checks: z.array(CheckSchema).max(64)
}).strict();
export const SnapshotSchema = z.object({
  digest: Digest, head: z.string().nullable(),
  files: z.record(z.string(), z.object({
    hash: Digest, kind: z.enum(['file', 'symlink']), executable: z.boolean()
  }).strict())
}).strict();
export const ResultSchema = z.object({
  id: z.string(), argv: z.array(z.string()), cwd: z.string(), timeoutMs: z.number().int(),
  startedAt: z.string(), durationMs: z.number().nonnegative(),
  exitCode: z.number().int().nullable(), signal: z.string().nullable(),
  failure: z.enum(['timeout', 'interrupted', 'spawn']).nullable(), error: z.string().nullable(),
  stdout: z.string(), stderr: z.string(), truncated: z.boolean()
}).strict();
export const RuntimeSchema = z.object({ node: z.string(), platform: z.string(), arch: z.string() }).strict();
export const RunSchema = z.object({
  schemaVersion: z.literal(1), id: Id, feature: Feature, mode: z.enum(['verify', 'baseline']),
  startedAt: z.string(), finishedAt: z.string(), toolHash: Digest, runtime: RuntimeSchema,
  spec: SpecSchema.nullable(), before: SnapshotSchema.nullable(), after: SnapshotSchema.nullable(),
  results: z.array(ResultSchema).max(64), error: z.string().nullable()
}).strict();
export const PointerSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('running'), id: Id, startedAt: z.string() }).strict(),
  z.object({ state: z.literal('finished'), id: Id, hash: Digest }).strict()
]);
export const ReviewSchema = z.object({
  schemaVersion: z.literal(1), id: Id, runId: Id, runHash: Digest, feature: Feature,
  decision: z.enum(['approve', 'reject']), reviewer: z.string().trim().min(1),
  note: z.string().trim().min(1), recordedAt: z.string(), source: z.literal('local')
}).strict();

export type Check = z.infer<typeof CheckSchema>;
export type Criterion = z.infer<typeof CriterionSchema>;
export type Spec = z.infer<typeof SpecSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Result = z.infer<typeof ResultSchema>;
export type Run = z.infer<typeof RunSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type Gate = 'acceptance' | 'checks';
export interface Assessment {
  feature: string;
  acceptance: 'ready' | 'needs-review' | 'changes-requested' | 'blocked' | 'unverified' | 'stale' | 'invalid';
  checks: 'passed' | 'failed' | 'pending' | 'none';
  freshness: 'current' | 'stale' | 'missing' | 'invalid';
  review: 'not-required' | 'pending' | 'approved' | 'rejected';
  reasons: string[];
  run: Run | null;
  decision: Review | null;
  baseline: { runId: string; recovered: string[] } | null;
  changes: string[];
}
export const passed = (r: Result): boolean =>
  r.exitCode === 0 && r.signal === null && r.failure === null && r.error === null;
export const incomplete = (s: Spec): Criterion[] =>
  s.criteria.filter(c => c.checks.length === 0 && c.review === null);
export function gateExit(a: Assessment, gate: Gate = 'acceptance'): number {
  if (a.acceptance === 'invalid') return 2;
  if (gate === 'checks') return a.freshness === 'current' && a.checks === 'passed' &&
    a.run?.mode === 'verify' && a.run.spec !== null && incomplete(a.run.spec).length === 0 ? 0 : 1;
  return a.acceptance === 'ready' ? 0 : 1;
}
export class SpecError extends Error {
  constructor(message: string, readonly line?: number) {
    super(line ? 'spec.md:' + line + ': ' + message : message);
    this.name = 'SpecError';
  }
}
