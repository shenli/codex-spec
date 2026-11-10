import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { VERSION, gateExit, incomplete, SpecError, type Gate } from './model.js';
import { repositoryRoot, scaffold, readSpec, features } from './workspace.js';
import { verify, status, recordReview } from './engine.js';
import { history, errorMessage } from './store.js';
import { installSkill } from './install.js';
import { human, markdownReport, safeText } from './present.js';

const help = `codex-spec — a development companion for Codex

  init                              Install the repo skill and evidence ignore rules
  spec <feature> "<intent>"          Create a readable Markdown spec
  check <feature>                    Validate the spec and preview its commands
  verify <feature> [--baseline]      Run checks and record immutable evidence
  status [feature]                  Check evidence freshness; omit feature to list
  report <feature>                  Write a Markdown report to stdout
  history <feature>                 List previous verification and baseline runs
  review <feature> --decision approve|reject --reviewer "<name>" --note "<reference>"

Options:
  --json                            Machine-readable output (progress goes to stderr)
  --gate acceptance|checks          Exit policy for verify/status (default: acceptance)
  --baseline                        Record before-change results, never acceptance
  --help                            Show this help
  --version                         Show version

Run in a Git project. Node.js >=22. Verification requires macOS/Linux.
Exit: 0 gate satisfied, 1 unmet/pending/stale, 2 invalid input or infrastructure error.
Checks run as reviewed local commands; no API key is needed.
`;
const allowed: Record<string, string[]> = {
  init: ['json'], spec: ['json'], check: ['json'], verify: ['json', 'baseline', 'gate'],
  status: ['json', 'gate'], report: ['json'], history: ['json'],
  review: ['json', 'decision', 'reviewer', 'note']
};
async function main(): Promise<void> {
  let json = process.argv.includes('--json');
  const controller = new AbortController(), interrupt = () => controller.abort();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try {
    const { positionals: pos, values } = parseArgs({
      allowPositionals: true, strict: true, options: {
        json: { type: 'boolean' }, baseline: { type: 'boolean' }, gate: { type: 'string' },
        decision: { type: 'string' }, reviewer: { type: 'string' }, note: { type: 'string' },
        help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' }
      }
    });
    json = values.json ?? false;
    if (values.help || (!pos.length && !values.version)) { console.log(help); return; }
    if (values.version) { console.log(VERSION); return; }
    const [command, feature, intent] = pos;
    if (!command || !allowed[command]) throw new SpecError('Unknown command. Run codex-spec --help.');
    for (const key of Object.keys(values)) if (!allowed[command]!.includes(key)) throw new SpecError('Option --' + key + ' does not apply to ' + command);
    const length = command === 'init' ? 1 : command === 'spec' ? 3 : 2;
    if (pos.length !== length && !(command === 'status' && pos.length === 1)) throw new SpecError('Invalid arguments. Quote the intent as one argument; see --help.');
    if (values.gate && !['acceptance', 'checks'].includes(values.gate)) throw new SpecError('Gate must be acceptance or checks');
    const gate = (values.gate ?? 'acceptance') as Gate;
    const root = await repositoryRoot();
    const print = (value: unknown, text: string): void => console.log(json ? JSON.stringify(value, null, 2) : safeText(text));
    if (command === 'init') {
      const result = await installSkill(root, fileURLToPath(new URL('../', import.meta.url)));
      print(result, (result.installed ? 'Installed' : 'Already installed') + ': ' + result.path + '\nUse $spec-driven-development in Codex.');
    } else if (command === 'spec') {
      const directory = await scaffold(root, feature!, intent!);
      print({ feature, directory }, 'Created ' + directory + '/spec.md\nDescribe the outcomes and add Verify or Review beneath each criterion.');
    } else if (command === 'check') {
      const spec = await readSpec(root, feature!), missing = incomplete(spec);
      print({ spec, complete: !missing.length }, spec.title + ': ' + spec.criteria.length + ' criteria, ' + spec.checks.length + ' checks\n' +
        spec.checks.map(c => '  ' + c.command + '  [' + c.cwd + ', ' + c.timeoutMs / 1000 + 's]').join('\n') +
        (missing.length ? '\nMissing Verify or Review: ' + missing.map(c => c.title).join(', ') : '\nContract is ready to execute.'));
      process.exitCode = missing.length ? 1 : 0;
    } else if (command === 'history') {
      const runs = await history(root, feature!);
      print(runs.map(r => ({ id: r.id, mode: r.mode, startedAt: r.startedAt, error: r.error })),
        runs.length ? runs.map(r => r.startedAt + '  ' + r.mode + '  ' + r.id + (r.error ? '  ERROR' : '')).join('\n') : 'No runs yet.');
    } else if (command === 'status' && !feature) {
      const list = [];
      for (const f of await features(root)) list.push(await status(root, f));
      print(list, list.length ? list.map(human).join('\n\n') : 'No specs yet. Run codex-spec spec <feature> "<intent>".');
      process.exitCode = Math.max(0, ...list.map(a => gateExit(a, gate)));
    } else {
      let a;
      if (command === 'verify') {
        a = await verify(root, feature!, {
          baseline: values.baseline ?? false, signal: controller.signal,
          onCheck: c => process.stderr.write('Checking: ' + safeText(c.command) + '\n')
        });
      } else if (command === 'review') {
        if (!['approve', 'reject'].includes(values.decision ?? '') || !values.reviewer?.trim() || !values.note?.trim()) {
          throw new SpecError('Review needs --decision approve|reject, --reviewer, and --note with the review reference.');
        }
        a = await recordReview(root, feature!, values.decision as 'approve' | 'reject', values.reviewer, values.note);
      } else a = await status(root, feature!);
      print(a, command === 'report' ? markdownReport(a) : human(a));
      process.exitCode = gateExit(a, gate);
    }
  } catch (error) {
    console.error(json ? JSON.stringify({ error: errorMessage(error) }) : 'Error: ' + safeText(errorMessage(error)));
    process.exitCode = 2;
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}
await main();
