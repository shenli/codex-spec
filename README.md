# codex-spec

**Codex can finish a coding task without proving that it meets your requirements.** Tests may miss the behavior you asked for, a passing result may belong to an older revision, and a design decision may still need your review.

codex-spec gives you and Codex a shared definition of done: a readable Markdown spec, explicit acceptance checks, and evidence tied to the code that was checked.

Write what should be true. Let Codex implement it. Verify the outcomes and review what still needs human judgment.

## What you get

- **One editable spec.** Ordinary Markdown with a command or review procedure beneath each acceptance criterion.
- **A Codex skill.** Guides discovery, implementation, regression checks, and repair using the tools already available in your Codex session.
- **Evidence that expires.** Changes to the spec, workspace, verifier, or Node runtime make earlier results stale.
- **Separate answers.** See automated checks, evidence freshness, and human review independently.
- **Before/after results.** Capture a failing baseline for a bug or performance change, then compare the declared checks after implementation.
- **Reviewable history.** Retain run records and export a Markdown report for a pull request.

No model configuration, API key, or agent service is required. The verifier runs locally; Codex handles the coding.

## Try it

Requires Git and Node.js 22 or later. Verification supports macOS and Linux; use Linux/WSL for Windows.

Clone this repository and link the checked-in, self-contained executable:

```sh
git clone https://github.com/shenli/codex-spec.git
cd codex-spec
npm link
```

In the project you want to work on:

```sh
codex-spec init
```

This installs the skill under `.agents/skills/spec-driven-development/` and adds ignore rules for generated evidence. It preserves your `AGENTS.md` and refuses to overwrite an edited skill.

Then ask Codex:

> Use $spec-driven-development to fix the rate limiter. The first 100 requests must succeed; request 101 must return 429. Capture the failing case before changing the implementation.

The skill helps turn the request into a spec, select meaningful checks, implement the change, and verify it. You can also run every step yourself.

## A spec you can edit

`.codex-spec/features/rate-limiter/spec.md`:

```md
# Rate limiter

Limit each client to 100 requests per minute.

## Constraints

Keep the existing API and response format.

## Acceptance criteria

### Enforce the request limit

The first 100 requests succeed; request 101 returns 429.

Verify: `node --test test/rate-limit.test.mjs`

### Preserve existing API behavior

Verify: `npm test`

### Explain rejected requests clearly

Review: Inspect the 429 response and confirm that the retry guidance is actionable.
```

The test files and scripts must exist in your project. The spec names the checks; it does not generate a test or prove that its assertions are sufficient.

A criterion can have both `Verify:` and `Review:`. Commands shared by several criteria run once. IDs and mappings are generated internally—you never maintain a parallel JSON contract.

[Contract syntax and examples](.agents/skills/spec-driven-development/references/contracts.md)

## The development loop

```sh
codex-spec spec rate-limiter "Limit each client to 100 requests per minute"
# Edit the spec and add acceptance tests.

codex-spec check rate-limiter
codex-spec verify rate-limiter --baseline
# Implement the change with Codex.

codex-spec verify rate-limiter
codex-spec status rate-limiter
codex-spec report rate-limiter
```

A baseline never grants acceptance, even if its checks pass. For a bug fix, first write a regression test that fails for the intended reason. After the fix, the tool can report that the same declared command failed before and passes now. Review the test diff too: matching commands do not prove unchanged assertions.

Typical output:

```text
rate-limiter — NEEDS-REVIEW
Checks: passed  |  Evidence: current  |  Review: pending
  Enforce the request limit: checks passed
  Preserve existing API behavior: checks passed
  Explain rejected requests clearly: no automated check; review pending
```

After a person completes the declared review, record their decision:

```sh
codex-spec review rate-limiter --decision approve \
  --reviewer "Alex" --note "PR #42: reviewed response copy and retry guidance"
```

Approval is bound to that exact run. A new run requires a new review; changed inputs make the evidence stale. This is a local declaration, not identity authentication or a replacement for protected PR reviews. The skill never invents a human approval.

## Commands

| Command | Purpose |
| --- | --- |
| `init` | Install the repository skill and evidence ignore rules |
| `spec <feature> "<intent>"` | Scaffold a spec with an unfinished criterion |
| `check <feature>` | Validate the contract and preview commands without executing them |
| `verify <feature>` | Run checks and retain evidence |
| `verify <feature> --baseline` | Capture before-change results |
| `status [feature]` | Reassess current evidence; omit the feature to list all specs |
| `report <feature>` | Print a Markdown review report |
| `history <feature>` | List retained verification runs |
| `review <feature> ...` | Record an approval or rejection with reviewer and reference |

Add `--json` for structured output. Verification progress goes to stderr.

The default gate requires current evidence, passing checks, complete criterion coverage, and any declared review. Use `--gate checks` with `verify` or `status` for an automated CI gate; it still reports pending review separately.

Exit codes: **0** gate satisfied, **1** unmet/pending/stale, **2** invalid input, evidence, or execution infrastructure. Manual-only specs cannot satisfy the automated checks gate.

## What is saved

```text
.codex-spec/
  features/rate-limiter/spec.md       # Commit this
  evidence/rate-limiter/              # Generated; ignored by Git
    latest.json
    baseline.json                    # When a baseline is recorded
    runs/<run-id>.json
    review.json                      # When a review is recorded
    reviews/<review-id>.json
.agents/skills/spec-driven-development/
  SKILL.md
  references/contracts.md
  scripts/codex-spec.mjs              # Self-contained; no runtime npm install
```

Runs retain the compiled criteria, arguments, exit codes, bounded stdout/stderr, timing, runtime identity, and before/after workspace fingerprints. New runs create new records rather than replacing history.

Freshness covers tracked files, non-ignored untracked files, executable bits, symlink targets, and the active spec. It excludes generated evidence, ignored dependencies/build output, Git metadata, and external services. Committing unchanged contents preserves freshness. A check that leaves source changes behind produces stale evidence.

## Use in CI

After checking out the project and installing its dependencies:

```sh
node .agents/skills/spec-driven-development/scripts/codex-spec.mjs \
  verify rate-limiter --gate checks
```

Upload `.codex-spec/evidence/rate-limiter/` as a CI artifact. Keep human approval in your PR review system. Evidence copied to a different workspace/runtime may be stale; use the report and retained record to review the original run.

Commands run with your local permissions. Inspect a spec before executing it. A passing command is only as useful as its assertions; codex-spec checks coverage mappings and records execution, not semantic correctness. Local checksums detect accidental edits, not a malicious writer who can rewrite the evidence and verifier.

[Architecture, boundaries, and recovery](docs/design.md)

## Develop and evaluate

The maintainable source is strict TypeScript in `src/`. The build bundles the parser, schema validation, and CLI into the portable skill executable.

```sh
npm ci --ignore-scripts
npm run check:bundle
npm run check
npm run test:package
npm run demo
```

The demo runs actual before/after bug, refactor, and performance examples in temporary Git projects. The refactor deliberately remains pending human review.

[Walk through the examples](DEMO.md) · [Contributing rules](AGENTS.md)

Native integration follows [Codex repository skills](https://learn.chatgpt.com/docs/build-skills). codex-spec supplies acceptance discipline while Codex explores, plans, edits, and tests the code.
