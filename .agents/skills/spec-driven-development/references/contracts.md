# Writing and verifying specs

## Write one Markdown file

The only hand-edited contract is `.codex-spec/features/<slug>/spec.md`.
Describe intent, constraints, and non-goals in normal Markdown. Put observable
outcomes under `## Acceptance criteria`, with a unique `###` heading for each
criterion and its verification command directly below it.

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

No IDs, JSON, schema version, cross-references, or readiness flag are required.
The verifier compiles the Markdown in memory and generates the IDs and mappings
recorded in evidence. Criterion IDs are derived from their titles and survive
reordering; renaming a title changes its ID. Identical commands with identical
options are run once and their results support each referencing criterion.

Scaffold a feature with `node <skill-directory>/scripts/codex-spec.mjs spec <slug> "<intent>"`.
It creates only spec.md, with an incomplete criterion. Existing directories are
never overwritten. Slugs contain lowercase letters, numbers, and single hyphens,
up to 80 characters. Add real checks before verification can pass.

## Checks and review

Write one `Verify:` line per command, using an inline Markdown code span.
Several Verify lines under one criterion must all pass. Commands default to the
repository root and a two-minute timeout. Optional settings apply to all commands
in that criterion:

```markdown
### Web regression
Existing browser behavior remains compatible.

Verify: `npm test`
Verify: `npm run lint`
Directory: web
Timeout: 30s
```

`Directory:` is a plain relative path (spaces are allowed); it must stay inside
the repository and cannot traverse symlinks. `Timeout:` accepts an integer with
`ms`, `s`, or `m`, from 1ms through 10m.

For human acceptance, use `Review:` followed by a concrete procedure:

```markdown
### API design
The public interface is acceptable to the maintainer.

Review: Inspect the public API diff and record the decision in the PR.
```

Use separate criteria for commands and manual review. Manual criteria always keep
the overall automated gate blocked, even after someone approves externally; the
runner cannot attest a human identity or decision. Never remove a required review
criterion just to make the gate green.

A criterion without Verify or Review keeps the entire spec blocked and prevents
commands from running. Missing acceptance sections, duplicate titles, mixed
Verify/Review, empty directives, misspelled directive labels, and invalid commands
are errors with file/line diagnostics. There is no manual draft-to-ready step.

Use one Acceptance criteria section and up to 128 uniquely named criteria, with
at most 64 distinct commands. Inside it, use level-three headings for criteria;
nested headings are rejected. Keep Verify/Review/Directory/Timeout directives on
their own unindented lines. Other `Label:` lines in this section are rejected to
catch typos; write descriptions as prose instead. Fenced examples, indented code,
and HTML comments are never treated as executable directives.

## Command syntax

Commands are split into argument arrays and run without an implicit shell.
Single/double quotes and escaped spaces work:

```markdown
Verify: `node --test "test/rate limit.test.js"`
```

Pipes, redirection, chaining, environment assignments, and shell expansion are
rejected. Put complex setup in a test script or package script and invoke that
script. Wildcards are passed literally to the executable; there is no shell glob
expansion. Inside single quotes, shell characters are literal. A command with
literal backticks needs a longer Markdown backtick delimiter. An explicitly
invoked shell script still runs as code and should be reviewed.

Review that each command actually asserts its criterion. Benchmarks must exit
nonzero when a threshold is missed, and test runners must fail when a required
test set is missing.

## Run and interpret verification

Run the helper from anywhere in the target Git working tree. It finds the
repository root. `verify <slug>` parses the spec, fingerprints the workspace,
runs checks sequentially, fingerprints again, and writes `evidence.json`.
`status <slug>` validates that evidence against the current spec and workspace
without executing commands.

| Result | Meaning |
| --- | --- |
| `verified` | All criteria are automated; all checks passed against unchanged inputs |
| `failed` | A check failed, could not start, timed out, or was cancelled |
| `blocked` | A criterion lacks a check/review, manual review remains, or a run is locked |
| `stale` | Inputs changed since or during verification |
| `unverified` | No evidence exists |
| `invalid` | Parsing, validation, incomplete evidence, or infrastructure error |

Verify/status exit 0 only for verified, 1 for other valid nonpassing outcomes,
and 2 for invalid/error. A new run invalidates the prior receipt before checking.
Interrupted runs cannot pass. Human approval and release authorization remain
separate from automated verification.

## Generated evidence

Evidence schema version 2 records the feature, run ID, runner/runtime versions,
timestamps, exact spec SHA-256, before/after workspace fingerprints, and criterion
titles/descriptions with generated check mappings. Check results contain exact
arguments, cwd, timeout, duration, exit code, signal, abort/timeout flags, startup
errors, stdout/stderr, and truncation status. Each output stream keeps at most the
first 64 KiB. Failures before parsing may lack inputs/workspace.

Evidence is replaced atomically; do not edit it. Archive receipts externally for
history and inspect check output before sharing. Generated receipts are excluded
from their own fingerprint.

The fingerprint covers HEAD, tracked and nonignored untracked working-tree files,
paths, executable bits, and symlink targets. The current spec is included even
when ignored. Submodules are rejected. Ignored dependencies/build output,
environment, services, external symlink contents, and edits reverted between
snapshots are not attested. Receipts are unsigned; checks use normal local
permissions. Use pinned dependencies and isolated CI when needed.

Verification supports macOS/Linux. It closes stdin and kills subprocess groups
on timeout/cancellation; detached processes outside the group are not supervised.
Only one run is allowed per repository. After a crash, confirm that the process
in `.codex-spec/.verify.lock/owner.json` has stopped before removing that lock and
rerunning. Do not remove a live run's lock.

Suggested ignore rules:

```gitignore
.codex-spec/.verify.lock/
.codex-spec/features/*/evidence.json
.codex-spec/features/*/evidence.json.*.tmp
```
