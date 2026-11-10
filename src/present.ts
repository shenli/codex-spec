import { passed, type Assessment } from './model.js';

export const safeText = (value: string): string =>
  value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
const code = (s: string): string => '`' + safeText(s).replaceAll('`', "'").replaceAll('\n', ' ') + '`';
export function human(a: Assessment): string {
  const lines = [
    a.feature + ' — ' + a.acceptance.toUpperCase(),
    'Checks: ' + a.checks + '  |  Evidence: ' + a.freshness + '  |  Review: ' + a.review
  ];
  if (a.run?.spec) {
    const results = new Map(a.run.results.map(r => [r.id, r]));
    for (const c of a.run.spec.criteria) {
      const checks = !c.checks.length ? 'no automated check' : c.checks.every(id => results.has(id) && passed(results.get(id)!)) ? 'checks passed' : 'checks not passed';
      lines.push('  ' + c.title + ': ' + checks + (c.review ? '; review ' + a.review : ''));
    }
    for (const r of a.run.results.filter(r => !passed(r))) {
      lines.push('\nFailed: ' + (a.run.spec.checks.find(c => c.id === r.id)?.command ?? r.id));
      if (r.failure) lines.push('  ' + r.failure);
      const output = (r.error ?? r.stderr.trim()) || r.stdout.trim();
      if (output) lines.push(safeText(output).split('\n').slice(0, 10).join('\n').slice(0, 1600));
    }
    lines.push('\nEvidence: .codex-spec/evidence/' + a.feature + '/runs/' + a.run.id + '.json');
  }
  if (a.baseline) lines.push('Before/after: ' + a.baseline.recovered.length + ' declared check(s) failed in the baseline and pass now.');
  if (a.changes.length) lines.push('Changed inputs: ' + a.changes.slice(0, 8).join(', ') + (a.changes.length > 8 ? ' …' : ''));
  lines.push(...a.reasons.map(r => '\n' + r));
  return safeText(lines.join('\n'));
}
export function markdownReport(a: Assessment): string {
  const lines = [
    '# Verification: ' + safeText(a.feature), '',
    '| Dimension | Result |', '| --- | --- |',
    '| Acceptance | ' + a.acceptance + ' |', '| Automated checks | ' + a.checks + ' |',
    '| Evidence freshness | ' + a.freshness + ' |', '| Human review | ' + a.review + ' |', ''
  ];
  if (a.run?.spec) {
    lines.push('## Criteria', '');
    for (const c of a.run.spec.criteria) {
      const checks = c.checks.map(id => {
        const result = a.run!.results.find(r => r.id === id);
        return (result && passed(result) ? 'passed' : 'not passed') + ': ' + code(a.run!.spec!.checks.find(k => k.id === id)?.command ?? id);
      });
      lines.push('- **' + safeText(c.title).replaceAll('*', '\\*') + '**',
        ...checks.map(c => '  - ' + c), ...(c.review ? ['  - Review: ' + safeText(c.review)] : []));
    }
    lines.push('', '## Evidence', '',
      '- Run: ' + code(a.run.id), '- Mode: ' + a.run.mode,
      '- Spec SHA-256: ' + code(a.run.spec.hash),
      '- Workspace digest: ' + code(a.run.before?.digest ?? 'unavailable'),
      '- Git HEAD at execution: ' + code(a.run.before?.head ?? 'unborn'),
      '- Record: ' + code('.codex-spec/evidence/' + a.feature + '/runs/' + a.run.id + '.json'));
  }
  if (a.decision) lines.push('', '## Recorded review', '',
    safeText(a.decision.reviewer) + ': ' + a.decision.decision + '. ' + safeText(a.decision.note),
    '', 'This is a local recorded declaration; reviewer identity is not authenticated by this tool.');
  if (a.baseline) lines.push('', '## Before/after observation', '',
    a.baseline.recovered.length + ' declared check(s) failed in baseline ' + code(a.baseline.runId) + ' and pass in this run.',
    'The commands match; this does not prove that test assertions remained unchanged or adequately cover the requirements.');
  if (a.reasons.length) lines.push('', '## Next steps', '', ...a.reasons.map(r => '- ' + safeText(r)));
  lines.push('', 'Passing commands are execution evidence. Review the assertions and criterion-to-check mapping before accepting the change.', '');
  return lines.join('\n');
}
