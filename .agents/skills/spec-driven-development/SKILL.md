---
name: spec-driven-development
description: Define readable acceptance specs and verify coding changes with codex-spec. Use when the user requests spec-driven development, acceptance evidence, regression baselines, or work on an existing .codex-spec feature.
---

# Spec-driven development

Help the developer decide what counts as done, then implement and verify the change using the current Codex session.

## Start with the project

1. Read the applicable AGENTS.md instructions and explore the relevant code and existing tests.
2. Find an existing feature under `.codex-spec/features/`, or choose a short lowercase hyphenated name.
3. Use the executable shipped beside this skill: `scripts/codex-spec.mjs`. Resolve it relative to this SKILL.md, and run it with the target Git project as the working directory. In a repository-local installation the command is `node .agents/skills/spec-driven-development/scripts/codex-spec.mjs`.
4. Read [contract syntax](references/contracts.md) when drafting or changing criteria.

## Define the outcome

Create `spec <feature> "<intent>"` when necessary, then edit the generated spec.md. State the problem, relevant constraints, and concrete acceptance outcomes. Keep a small change small; do not generate a separate requirements/plan/tasks document chain.

Give each criterion a `###` heading under `## Acceptance criteria`. Add `Verify:` with an actual project command, `Review:` with a human review procedure, or both.

Inspect the assertions behind each command. A broad test suite or a process that prints "done" is not sufficient evidence for a specific behavior. Add focused tests for boundaries, failure modes, compatibility, or performance budgets as appropriate. Keep manual decisions explicit.

Run `check <feature>` to validate and preview the commands. Review executable commands before running a contract from an unfamiliar source.

If a material requirement is ambiguous, ask a focused question while continuing independent discovery. Do not invent a requirement or approval.

## Establish evidence, then implement

For a bug or measurable optimization, run `verify <feature> --baseline` after adding the relevant test but before changing the implementation. Inspect why it fails. Missing tools, crashes, and timeouts are not evidence that a regression test detects the intended bug.

Use Codex's available planning, editing, and execution tools to implement the change. Follow the project's existing architecture and constraints.

Run `verify <feature>`. Inspect failures, repair the implementation, and verify again. Do not weaken assertions or acceptance criteria just to obtain a pass. When a legitimate requirement changes, explain it and update the spec openly.

Execution is sequential with a shared 10-minute check-execution budget by default. Use `--budget` only when the task needs a different bound; use `--fail-fast` when later checks should not run after a failure. Inspect cancelled and skipped outcomes separately from failed assertions. Honor user cancellation; do not automatically restart work the user stopped.

Use `--json` when machine-readable results help. Progress is on stderr. Exit 1 can mean pending review or stale evidence as well as test failure; inspect the separate dimensions before deciding what to do next.

## Review and hand off

Use `status <feature>` after the final edits and `report <feature>` for a shareable summary. Report:
- which outcomes have automated evidence;
- what changed and which tests ran;
- any pending human review or remaining failures;
- the evidence path and important limits of the checks.

Complete criterion mapping does not establish semantic coverage. The verifier reports semantic coverage as not-assessed; do not describe a passed gate as proof of correctness. CI-reported context is unauthenticated and is not a trusted attestation.

A baseline comparison only establishes that the same declared command failed before and passes now. Inspect changes to the test assertions too.

Never fabricate a human review or use an agent name as a substitute for the requested reviewer. Record `review` only when the user has explicitly supplied or authorized that person's completed decision and its reference. It is a local declaration, not authenticated identity.

Do not call the change accepted while required review is pending, evidence is stale, or any criterion lacks a check/review mapping. After an interrupted process, verification must run again before acceptance; do so only when continuing work is authorized. Do not recover a pass by editing evidence.

## Boundaries

The verifier executes local commands with the session's permissions. It is not a sandbox, CI service, model client, or proof of correctness. It fingerprints source inputs and records check results; ignored dependencies, external services, and a malicious writer remain outside its trust boundary.

Use `--gate checks` for automated CI checks when human approval is handled separately by the project's PR system.
