# codex-spec

**Codex implements the change. codex-spec defines and checks what “done” means.**

A Codex-native skill, reviewable spec contracts, and a dependency-free verification runner. Use it for features, bugs, refactors, and performance work where acceptance evidence matters.

This is the **v2 source tree**, a clean redesign around acceptance verification. Use this checkout or copy its skill directory; these instructions do not assume a v2 npm release exists.

## What it does

1. **Spec:** capture intent, constraints, and observable acceptance criteria.
2. **Implement:** let Codex explore, plan, edit, and iterate using its native tools.
3. **Verify:** run explicit checks and associate their results with criteria and a fingerprint of the code and contract.

A successful Codex run means implementation was attempted. Only passing acceptance checks against an unchanged workspace produce `verified`. That label describes automated acceptance coverage, not proof of correctness or permission to merge.

## Start in this repository

Requires Node.js 22+ and Git. Verification supports macOS and Linux.

No dependency installation or API key is needed for the toolkit:

```bash
node src/cli.js spec rate-limiter "Limit each API client to 100 requests per minute"
```

This creates:

```text
.codex-spec/features/rate-limiter/
  spec.md            Intent, constraints, acceptance criteria, and checks
  evidence.json      Written only when verification runs
```

In Codex, invoke the bundled skill:

```text
$spec-driven-development Refine the rate-limiter contract, then implement
it within the agreed scope and run its acceptance checks.
```

Or use native non-interactive Codex:

```bash
codex exec --sandbox workspace-write \
  'Use $spec-driven-development to implement .codex-spec/features/rate-limiter. Follow the contract and run verification.'
```

Codex handles its own authentication, model configuration, permissions, and context. codex-spec does not launch another agent or manage sessions.

Edit `spec.md` to describe each acceptance criterion and its verification command. Then run:

```bash
node src/cli.js verify rate-limiter
node src/cli.js status rate-limiter
```

Both commands print JSON. Verification executes the commands in the contract, so inspect that file as you would a build script.

## A contract example

```markdown
# Rate limiter

Limit each API client to 100 requests per minute.

## Acceptance criteria

### Request limit
The first 100 requests succeed.
Request 101 within the same minute returns HTTP 429.

Verify: `node --test test/rate-limit.test.js`

### Compatibility
Existing API behavior remains compatible.

Verify: `npm test`
```

This is the whole contract. There are no IDs, argument arrays, readiness flags, or second files to maintain. The verifier reads Markdown directly and generates its internal mappings and evidence.

Use one `Verify:` line per command. Commands support ordinary quoting and run without an implicit shell. Identical commands are run once. If a criterion has no command, verification stays blocked until you add one. For human acceptance, use `Review:` followed by a specific procedure; manual review keeps the automated gate blocked.

See the [contract and evidence reference](.agents/skills/spec-driven-development/references/contracts.md) for the full format and limits.

## Use the skill in another repository

Copy the **whole** skill directory, including its scripts and references:

```bash
mkdir -p /path/to/project/.agents/skills
cp -R .agents/skills/spec-driven-development /path/to/project/.agents/skills/
cd /path/to/project
node .agents/skills/spec-driven-development/scripts/codex-spec.mjs \
  spec rate-limiter "Limit each API client to 100 requests per minute"
```

No global install is required. The skill is self-contained. If you prefer the short `codex-spec` command, run `npm link` from this checkout. The npm package entry point uses the same implementation as the skill.

## Verification semantics

| Result | Meaning | Exit code |
| --- | --- | --- |
| `verified` | Every declared automated criterion passed; inputs stayed unchanged | 0 |
| `failed` | A check failed, timed out, was interrupted, or could not start | 1 |
| `blocked` | Missing check/review, manual review outstanding, or active verification lock | 1 |
| `stale` | Code, HEAD, or contract no longer matches the tested inputs | 1 |
| `unverified` | No evidence exists | 1 |
| `invalid` | Invalid contract/evidence or verification infrastructure error | 2 |

`spec`, help, and version exit 0 on success. Usage errors exit 2.

Evidence includes criterion mappings, exact arguments, timestamps, duration, exit codes, signals, bounded stdout/stderr, and before/after workspace hashes. Status recomputes freshness and validates result coverage instead of trusting a saved status label. Running verification replaces the previous receipt atomically; archive receipts in CI for run history.

The fingerprint covers Git HEAD, tracked files (including modifications and deletions), nonignored untracked files, executable bits, symlink targets, and the current contract even if ignored. Generated evidence and the verification lock are excluded. Ignored dependencies/build output, external symlink contents, environment variables, databases, and remote services are outside the fingerprint. This is local, unsigned evidence from trusted checks, not an isolated sandbox or tamper-proof attestation. Submodules fail closed rather than silently receiving partial coverage.

Tests should not modify source files. If they do, evidence becomes stale; fix the check or rerun once the workspace is stable. A passing test only supports the behavior it actually asserts—review the criterion-to-test mapping.

## Development and CI

```bash
npm test
npm run check
node src/cli.js verify verification-gate
npm pack --dry-run
```

The checked-in `verification-gate` contract exercises the toolkit itself. CI runs the tests on Linux and macOS, runs the contract gate, and archives evidence. It requires no Codex credentials.

Keep `AGENTS.md` concise and stable. Read architecture and product documentation when relevant to a task; there is no generated context-refresh cycle.

- [Design decisions and research](docs/design-v2.md)
- [Runnable failure/repair demo](DEMO.md)

MIT.
