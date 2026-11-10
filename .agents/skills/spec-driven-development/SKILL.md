---
name: spec-driven-development
description: Define reviewable spec contracts and verify feature, bug, refactor, or performance changes against explicit acceptance criteria using codex-spec. Use for spec-driven work or existing .codex-spec features.
---

# Spec-driven development

Let Codex choose the implementation approach. Use the contract to define the outcome and the verifier to collect evidence.

## Contract

Use one feature directory at `.codex-spec/features/<slug>/` with `spec.md` as the only hand-edited contract. Reuse an existing contract when it matches the request. Keep small tasks small; do not invent phases, task graphs, or mandatory design approvals.

The helper is `scripts/codex-spec.mjs` relative to this skill directory. From the repository root, invoke it with Node.js (22+):

```bash
node <skill-directory>/scripts/codex-spec.mjs spec <slug> "<intent>"
```

Read [contracts.md](references/contracts.md) when authoring a contract or interpreting evidence. Convert the intent into observable criteria under `## Acceptance criteria`. Give each a unique `###` heading and put a `Verify:` inline-code command or a `Review:` procedure directly beneath it. The helper generates IDs and mappings; do not author a second machine-readable contract. Include relevant regressions and constraints; use manual criteria for outcomes that cannot be established by commands. For performance work, have a check enforce a threshold under a documented workload instead of merely printing a measurement.

Resolve material ambiguity using repository evidence and the user's instructions. Record assumptions and design decisions in `spec.md`. Honor approval requirements already established by the user or project; do not add a new approval round solely because this skill is active. Ensure every criterion has a concrete command or review procedure; readiness is derived automatically.

## Implementation

Read `AGENTS.md` and task-relevant documentation. Plan to the level needed by the change and use native Codex tools to implement it. Do not generate a second context hierarchy or force a separate session for each task.

Keep the intended acceptance criteria intact while fixing the code. If scope genuinely changes, update the contract explicitly and explain the changed expectation. Do not weaken tests or silently remove failing criteria to obtain a pass.

## Verification and handoff

Run the helper's `verify <slug>` command on macOS/Linux after implementation. Checks run as local subprocesses with the current user's permissions and environment; review the declared commands before running them. The helper itself needs no API key.

Inspect failing check output, fix the cause within the authorized scope, and rerun verification. Stop to report a blocker when repair needs a decision, unavailable dependency, or work outside the agreed scope. Never substitute an agent's narrative for a check result.

Use `status <slug>` immediately before the handoff to check that evidence still matches the workspace. If code or the contract changed, rerun verification. Do not hand-edit evidence.

Report the change, criterion results, evidence path, and any remaining manual review or limitations. Distinguish implemented-but-unverified work from verified automated acceptance. A `verified` result is not human approval or authorization to merge, publish, or deploy. For manual criteria, surface the specific review procedure and leave the gate blocked; the runner cannot attest a human decision.
