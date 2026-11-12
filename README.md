# codex-spec

**Define done. Verify the change.**

Codex can finish a coding task while important questions remain: do the tests cover the requested behavior, do the results match the latest code, and does anything still need human review?

codex-spec gives you and Codex a shared definition of done. Write acceptance criteria in Markdown, connect them to checks or review procedures, and collect evidence tied to the code that was checked.

It combines a **Codex skill** that guides the development work with a **local verifier** that records results and shows what remains before acceptance. Codex handles exploration, planning, implementation, and repair.

## A spec you can read and edit

Keep the intent, constraints, and acceptance criteria together in `.codex-spec/features/rate-limiter/spec.md`:

```md
# Rate limiter

Limit each client to 100 requests per minute.
Preserve the existing API and response format.

## Acceptance criteria

### Enforce the request limit

The first 100 requests succeed; request 101 returns 429.

Verify: `node --test test/rate-limit.test.mjs`

### Preserve existing API behavior

Verify: `npm test`

### Make retry guidance clear

Review: Inspect the 429 response and confirm that it explains when to retry.
```

A criterion can have checks, a human review procedure, or both. Shared commands run once. IDs and mappings are generated for you.

After verification, the result makes the remaining work explicit:

```text
rate-limiter — NEEDS-REVIEW
Checks: passed  |  Evidence: current  |  Review: pending
Criterion mapping: complete  |  Semantic coverage: not-assessed
  Enforce the request limit: checks passed
  Preserve existing API behavior: checks passed
  Make retry guidance clear: no automated check; review pending
```

The test files and scripts must exist in your project and assert the behavior you need. The verifier runs those checks; the skill helps Codex choose and write them.

[Full contract syntax](.agents/skills/spec-driven-development/references/contracts.md)

## Get started

Requires **Git and Node.js 22+**. Verification runs on macOS and Linux; use Linux/WSL on Windows. No API key, model configuration, or separate agent service is required by codex-spec.

Clone the repository and link the included executable:

```sh
git clone https://github.com/shenli/codex-spec.git
cd codex-spec
npm link
```

From the Git project you want to work on, install the skill:

```sh
codex-spec init
```

This installs `.agents/skills/spec-driven-development/` and adds ignore rules for generated evidence. Your `AGENTS.md` is preserved, and an edited skill is never silently replaced.

Then ask Codex:

> Use $spec-driven-development to fix the rate limiter. The first 100 requests must succeed; request 101 must return 429. Capture the failing case before changing the implementation.

The skill guides Codex through defining the outcomes, inspecting relevant tests, implementing the change, and verifying it.

To try the tool before using it in your own project, run `npm run demo` from this repository. It walks through executable bug, refactor, and performance examples. [See the walkthrough](DEMO.md).

## Work from intent to acceptance

You can also run each step directly:

```sh
codex-spec spec rate-limiter "Limit each client to 100 requests per minute"
# Edit the generated spec and add the acceptance tests.

codex-spec check rate-limiter
codex-spec verify rate-limiter --baseline
# Implement the change with Codex.

codex-spec verify rate-limiter
codex-spec status rate-limiter
codex-spec report rate-limiter
```

For a bug fix or optimization, capture a baseline before changing the implementation. Inspect why the check fails, then run it again after the change. A baseline never grants acceptance, even when its checks pass. The comparison records that matching commands failed before and pass now; review the test diff to confirm the assertions stayed meaningful.

When a person has completed the declared review, record their decision:

```sh
codex-spec review rate-limiter --decision approve \
  --reviewer "Alex" --note "PR #42: reviewed response copy and retry guidance"
```

Use `--decision reject` to record requested changes. Decisions apply to the exact verification run: a new run requires a new review, and changed inputs make the evidence stale. Reviewer names and references are local declarations; protected PR reviews remain the place to enforce authenticated approval.

## What verification establishes

- **Coverage:** every criterion has at least one check or review procedure. An unfinished criterion blocks execution.
- **Check results:** declared commands run with recorded arguments, exit codes, output, and timing.
- **Freshness:** results must match the current spec, workspace, verifier, and Node runtime.
- **Review status:** required human decisions remain pending until explicitly recorded for that run.

A passing command is only as useful as its assertions. codex-spec makes the evidence and remaining decisions visible; developers still assess whether the checks establish the intended behavior.

Changes to tracked files, non-ignored untracked files, executable bits, source symlink targets, or the active spec expire earlier evidence. Committing unchanged contents preserves freshness. A check that leaves source changes behind produces stale evidence.

Ignored dependencies and build output, Git metadata, external services, and contents behind symlinks are outside that fingerprint. Commands run with your local permissions, so inspect unfamiliar specs before executing them. Local checksums detect accidental edits; they do not authenticate evidence against a writer who can also change the verifier.

[Architecture, trust boundaries, and recovery](docs/design.md)


### Execution controls and evidence limits

Checks run sequentially with a shared **10-minute execution budget** by default. Use `--budget 20m` to change it and `--fail-fast` to stop after the first unsuccessful check. Preparation, snapshots, cleanup, and evidence publication are outside that execution budget.

Cancellation and budget exhaustion stop scheduling. Evidence distinguishes attempted checks from skipped checks, with a reason for every skipped command. A partial run cannot satisfy either gate.

`--gate checks` explicitly reports **CHECKS_PASSED** when its gate succeeds. Acceptance and human review remain separate. JSON includes the selected gate, result, and exit code.

Complete criterion mapping does not establish semantic coverage: output explicitly reports **Semantic coverage: not-assessed**. New records also state their workspace scope, excluded inputs, and unauthenticated origin. CI run identifiers are contextual hints, not proof of a trusted executor.

Schema v1 history remains readable without rewriting old records; new runs use schema v2. See the [design notes](docs/design.md) for exact semantics and the [evaluation plan](docs/evaluation.md) for the controlled comparison and negative-control work still needed to measure product value.

## Command reference

| Command | Purpose |
| --- | --- |
| `init` | Install the repository skill and evidence ignore rules |
| `spec <feature> "<intent>"` | Create an editable spec |
| `check <feature>` | Validate the spec and preview commands without running them |
| `verify <feature>` | Run checks and save a new evidence record |
| `verify <feature> --baseline` | Capture before-change results |
| `status [feature]` | Reassess freshness; omit the feature to list all specs |
| `report <feature>` | Print a Markdown report for review |
| `history <feature>` | List previous runs |
| `review <feature> ...` | Record a completed human approval or rejection |

Add `--json` for structured output. Verification progress goes to stderr.

The default acceptance gate requires complete criterion mappings, passing declared checks, current evidence, and any required human approval. Use `--gate checks` with `verify` or `status` when human review is handled separately; it requires at least one automated check and still reports review status.

Exit codes: **0** gate satisfied · **1** unmet, pending, or stale · **2** invalid input, evidence, or execution infrastructure.

## Files and evidence

```text
.codex-spec/
  features/rate-limiter/spec.md       # Editable contract; commit this
  evidence/rate-limiter/              # Generated; ignored by Git
    runs/<run-id>.json                # Retained check results and fingerprints
    reviews/<review-id>.json          # Recorded human decisions
    latest.json                      # Pointer to the latest run
    baseline.json                    # Present after recording a baseline
    review.json                      # Present after recording a review
.agents/skills/spec-driven-development/
  SKILL.md
  references/contracts.md
  scripts/codex-spec.mjs              # Self-contained executable
```

New runs retain history. Use `report` for a readable summary or share the evidence directory for detailed review. Inspect captured application output before sharing it.

## Use in CI

Commit the installed skill with your project. After checkout and dependency installation, run:

```sh
node .agents/skills/spec-driven-development/scripts/codex-spec.mjs \
  verify rate-limiter --gate checks
```

Upload `.codex-spec/evidence/rate-limiter/` as a CI artifact and enforce human approval through your PR review system. Evidence copied to another workspace or runtime may be stale; the report and retained record describe the original run.

## Contribute

The source is strict TypeScript in `src/`. The build produces the self-contained verifier distributed with the skill.

```sh
npm ci --ignore-scripts
npm run check:bundle
npm run check
npm run test:package
```

Tests cover contract parsing, execution failures, stale and damaged evidence, review decisions, portable installation, and the before/after example workflows. CI runs on macOS and Linux with Node 22 and 24.

[Contributing rules](AGENTS.md) · [Architecture](docs/design.md) · [Example workflows](DEMO.md) · [Codex skills](https://learn.chatgpt.com/docs/build-skills)
