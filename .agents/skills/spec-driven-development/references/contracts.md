# Writing acceptance specs

The only hand-edited contract is `.codex-spec/features/<feature>/spec.md`. Feature names use lowercase letters, digits, and hyphens, up to 80 characters.

## Minimal example

```md
# Correct the rate-limit boundary

The 100th request is currently rejected. Allow requests 1 through 100.

## Constraints

Preserve the API and client identification rules.

## Acceptance criteria

### Accept exactly 100 requests

Verify: `node --test test/rate-limit.test.mjs`

### Preserve compatibility

Verify: `npm test`
```

The executable does not create these test files. Add assertions that establish the stated outcome.

## Syntax

- Use one H2 heading named `Acceptance criteria` or `Acceptance` (case-insensitive).
- Use a unique H3 heading for each criterion.
- Ordinary paragraphs describe the expected behavior.
- `Verify:` takes exactly one inline-code command. Repeat it for multiple checks.
- `Review:` describes a human procedure. It can accompany automated checks.
- `Directory:` optionally sets a repository-relative working directory for all checks in that criterion.
- `Timeout:` optionally sets their timeout, from `1ms` to `10m`. The default is `2m`.
- Bulleted directives and an emphasized label such as `**Verify:**` are supported.
- Fenced examples, blockquotes, and HTML comments do not declare checks.
- A criterion with neither Verify nor Review remains incomplete and blocks execution.
- Unknown directive-like labels are errors, catching misspellings such as Verfy. Given, When, Then, Note, and Notes are permitted prose labels.

For example:

```md
### Keyboard navigation

Tab moves through all interactive controls in the expected order.

Verify: `npm run test:a11y`
Review: Navigate the settings screen using only the keyboard.

Directory: web
Timeout: 30s
```

Directory and Timeout require at least one Verify command. Keep free-form design notes outside the acceptance section when they do not describe a criterion.

## Commands

Commands are parsed into executable arguments and spawned directly, without an implicit shell.

```md
Verify: `node --test "test/rate limit.test.mjs"`
```

Quotes preserve spaces. Pipes, redirections, shell operators, wildcard expansion, environment expansion, and unfinished quotes are rejected. Put complex setup in a reviewed project script, then name that script:

```md
Verify: `npm run test:integration`
```

A script may itself invoke a shell. Direct spawning is a predictable argument interface, not a security boundary. Checks inherit the local environment. Do not run commands from an untrusted spec without inspection.

Identical argument lists, working directories, and timeouts share one execution across criteria. Different timeouts or directories are separate checks. There is a limit of 128 criteria and 64 distinct checks per spec.

## Useful criteria

**Bug:** write the failing boundary or regression case first, capture a baseline, fix the implementation, rerun the same test.

**Refactor:** run compatibility tests before and after. Add Review for readability or architecture decisions that tests cannot establish.

**Performance:** declare a measurable budget and controlled workload. Prefer deterministic work counters for algorithmic tests; use an appropriate benchmark harness for latency or memory. Record the environment and variability when interpreting measurements.

Avoid criteria like "all tests pass" as the entire requirement. Describe the behavior the tests are intended to establish.

## Review and evidence

`verify` records a new run. The default acceptance gate requires:
1. every criterion has a Verify and/or Review mapping;
2. all declared commands pass;
3. evidence matches the current spec, workspace, runtime, and verifier;
4. required human review is explicitly approved for that run.

`--gate checks` requires at least one passing automated check and complete mappings, but can succeed while review is pending. A baseline never satisfies either gate.

Record a completed human decision with:

```sh
codex-spec review rate-limiter --decision approve --reviewer "Alex" --note "PR #42 review"
```

Use `reject` to record requested changes. This is a local statement bound to the run, not authenticated identity. A new run clears its applicability; changed source makes approval stale.

The generated evidence directory is ignored. Never hand-edit it to change a result. Export the report or upload the evidence directory for review. Logs can contain application output; inspect them before sharing.

## Execution policy and evidence versions

Checks run sequentially with a shared 10-minute check-execution budget. Use `verify <feature> --budget 20m` to change it or add `--fail-fast` to stop after the first unsuccessful check. The budget excludes preparation, snapshots, cleanup, and evidence publication.

Cancellation and shared-budget exhaustion stop scheduling. New records separate attempted results (passed, failed, cancelled) from skipped checks and their reasons. A stopped or partially executed run cannot satisfy either gate, even if the attempted subset passed.

Successful `--gate checks` output is labelled CHECKS_PASSED while still showing full acceptance and review status. Complete criterion mapping is separate from semantic coverage, which remains not-assessed.

New evidence uses schema v2 and declares its workspace scope, exclusions, and unauthenticated origin. CI context comes from environment variables and does not authenticate the run. Schema v1 records remain readable as v1 without rewriting historical bytes; missing provenance and skip semantics remain unknown.
