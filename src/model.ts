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
export const LegacyResultSchema = z.object({
  id: z.string(), argv: z.array(z.string()), cwd: z.string(), timeoutMs: z.number().int(),
  startedAt: z.string(), durationMs: z.number().nonnegative(),
  exitCode: z.number().int().nullable(), signal: z.string().nullable(),
  failure: z.enum(['timeout', 'interrupted', 'spawn']).nullable(), error: z.string().nullable(),
  stdout: z.string(), stderr: z.string(), truncated: z.boolean()
}).strict();
export const RuntimeSchema = z.object({ node: z.string(), platform: z.string(), arch: z.string() }).strict();
export const LegacyRunSchema = z.object({
  schemaVersion: z.literal(1), id: Id, feature: Feature, mode: z.enum(['verify', 'baseline']),
  startedAt: z.string(), finishedAt: z.string(), toolHash: Digest, runtime: RuntimeSchema,
  spec: SpecSchema.nullable(), before: SnapshotSchema.nullable(), after: SnapshotSchema.nullable(),
  results: z.array(LegacyResultSchema).max(64), error: z.string().nullable()
}).strict();

export const ResultSchema = LegacyResultSchema.extend({
  outcome: z.enum(['passed', 'failed', 'cancelled'])
}).strict().refine(r => r.outcome === resultOutcome(r), 'Result outcome contradicts its process evidence');
export const SkipReason = z.enum(['cancelled', 'budget', 'fail-fast', 'incomplete']);
export const ExecutionSchema = z.object({
  strategy: z.literal('sequential'), failurePolicy: z.enum(['continue', 'fail-fast']),
  budgetMs: z.number().int().min(1).max(86400000),
  budgetScope: z.literal('check-execution'),
  stopReason: z.enum(['cancelled', 'budget', 'fail-fast']).nullable()
}).strict();
export const ProvenanceSchema = z.object({
  origin: z.literal('local-process'), authentication: z.literal('unverified'),
  context: z.enum(['local', 'ci-reported']),
  ci: z.object({ provider: z.enum(['github-actions', 'unspecified']), runId: z.string().max(256).nullable(),
    attempt: z.string().max(256).nullable() }).strict().nullable(),
  freshness: z.object({ scope: z.literal('workspace'), excluded: z.array(z.string()) }).strict(),
  dependencies: z.object({ fingerprintedLockfiles: z.array(z.string()), installed: z.literal('not-captured') }).strict(),
  environment: z.literal('not-captured')
}).strict();
export const RunSchema = LegacyRunSchema.extend({
  schemaVersion: z.literal(2), results: z.array(ResultSchema).max(64),
  skipped: z.array(z.object({ id: z.string(), reason: SkipReason }).strict()).max(64),
  execution: ExecutionSchema, provenance: ProvenanceSchema
}).strict();

export function readRunRecord(value: unknown): Run {
  if (!value || typeof value !== 'object') throw new SpecError('Evidence must be an object');
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (version === 1) return LegacyRunSchema.parse(value);
  if (version === 2) return RunSchema.parse(value);
  throw new SpecError('Unsupported evidence schema version: ' + String(version) + '; use a compatible verifier to read this history');
}
export function resultOutcome(r: z.infer<typeof LegacyResultSchema>): 'passed' | 'failed' | 'cancelled' {
  if (r.failure === 'interrupted') return 'cancelled';
  return r.exitCode === 0 && r.signal === null && r.failure === null && r.error === null ? 'passed' : 'failed';
}
export function executionStopped(run: Run): boolean {
  return run.schemaVersion === 2 && (run.execution.stopReason !== null || run.skipped.length > 0);
}
export const DEFAULT_BUDGET_MS = 600000;

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
export type CurrentRun = z.infer<typeof RunSchema>;
export type Run = z.infer<typeof LegacyRunSchema> | CurrentRun;
export type StoredResult = z.infer<typeof LegacyResultSchema> | Result;
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
  coverage: { mapping: 'complete' | 'incomplete' | 'unknown'; semantic: 'not-assessed' };
}
export const passed = (r: StoredResult): boolean =>
  r.exitCode === 0 && r.signal === null && r.failure === null && r.error === null;
export const incomplete = (s: Spec): Criterion[] =>
  s.criteria.filter(c => c.checks.length === 0 && c.review === null);
export function gateExit(a: Assessment, gate: Gate = 'acceptance'): number {
  if (a.acceptance === 'invalid') return 2;
  if (gate === 'checks') return a.freshness === 'current' && a.checks === 'passed' &&
    a.run?.mode === 'verify' && !executionStopped(a.run) && a.run.spec !== null && incomplete(a.run.spec).length === 0 ? 0 : 1;
  return a.acceptance === 'ready' ? 0 : 1;
}

export function gateSummary(a: Assessment, selected: Gate = 'acceptance') {
  const exitCode = gateExit(a, selected);
  return {
    selected, exitCode,
    result: exitCode === 2 ? 'GATE_ERROR' : exitCode === 1 ? 'GATE_UNMET' :
      selected === 'checks' ? 'CHECKS_PASSED' : 'ACCEPTANCE_READY'
  };
}

export class SpecError extends Error {
  constructor(message: string, readonly line?: number) {
    super(line ? 'spec.md:' + line + ': ' + message : message);
    this.name = 'SpecError';
  }
}
