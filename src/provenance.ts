import type { CurrentRun, Snapshot } from './model.js';

const exclusions = [
  'generated evidence and lock files', 'ignored dependencies and build output',
  'environment variables', 'external services', 'Git metadata', 'contents behind source symlinks'
];
export function provenance(env: NodeJS.ProcessEnv = process.env): CurrentRun['provenance'] {
  const github = env.GITHUB_ACTIONS === 'true';
  const ci = github || (env.CI !== undefined && !['', '0', 'false'].includes(env.CI.toLowerCase()));
  const field = (name: string): string | null => env[name]?.slice(0, 256) ?? null;
  return {
    origin: 'local-process', authentication: 'unverified', context: ci ? 'ci-reported' : 'local',
    ci: ci ? { provider: github ? 'github-actions' : 'unspecified', runId: github ? field('GITHUB_RUN_ID') : null,
      attempt: github ? field('GITHUB_RUN_ATTEMPT') : null } : null,
    freshness: { scope: 'workspace', excluded: [...exclusions] },
    dependencies: { fingerprintedLockfiles: [], installed: 'not-captured' },
    environment: 'not-captured'
  };
}
export function fingerprintedLockfiles(snapshot: Snapshot): string[] {
  return Object.keys(snapshot.files).filter(p =>
    /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum|uv\.lock|poetry\.lock|Gemfile\.lock|composer\.lock)$/.test(p));
}
