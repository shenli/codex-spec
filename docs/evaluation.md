# Evaluation plan: does codex-spec improve coding outcomes?

Status: proposed protocol. The repository's examples and regression suite validate verifier behavior. They do not establish that codex-spec improves agent correctness, reduces escaped regressions, or saves time. No comparative result is claimed.

## Questions and success criteria

Compare Codex alone with Codex plus codex-spec on the same held-out engineering tasks. Measure whether the additional workflow reduces incorrect acceptance at an acceptable time and resource cost.

Before collecting results, freeze the task set, evaluation scripts, model/configuration, prompts, budgets, sampling policy, and analysis plan. Choose a minimum practical improvement and acceptable overhead with the intended users; do not choose thresholds after seeing results.

## Task set

Start with 12 confirmed, reproducible bugs from realistic repositories, each with a runnable base revision, a minimal public problem statement, visible project tests, and an independently reviewed hidden evaluator. The scenarios below are a collection checklist, not an implemented dataset:

| Scenario | Hidden evaluator should distinguish |
| --- | --- |
| Rate-limit reset boundary | Exhaustion, reset timing, and client isolation |
| Idempotent request handling | Duplicate success without duplicate side effects |
| Concurrent retry | Bounded retries without duplicate commits |
| Crash recovery | Recovery after each durable write boundary |
| Pagination | Stable ordering without omissions or duplicates |
| Time-zone handling | DST transitions and date boundaries |
| Atomic file replacement | Reader consistency and interrupted writes |
| Cache invalidation | Stale reads after update and delete |
| Resource cleanup | No leaked connections or child processes on cancellation |
| Backpressure | Bounded queues with slow consumers |
| API-compatible refactor | Preserved errors, defaults, and edge cases |
| Algorithmic optimization | Correct output within a deterministic work budget |

Where useful, source confirmed tasks from distributed-system-testing as a separate project. Do not merge its runtime into codex-spec. Record each task's source revision, license, reproduction, known failure, and evaluator review. Existing tiny demos remain smoke tests, not substitutes for this task set.

## Experimental controls

- Use the same task revisions, model, reasoning settings, accessible tools, permissions, dependency images, visible tests, and problem statements in both groups.
- Group A uses the ordinary implementation/testing workflow. Group B additionally receives the codex-spec skill and acceptance workflow.
- Count all spec authoring, baseline runs, verification, and repairs against Group B's budget. Do not give either group extra hidden-test feedback.
- Run at least five fresh trials per task and group. Randomize order and pair trials by task/configuration. Record model nondeterminism; a repeated prompt is not a guaranteed identical seed.
- Give each trial an isolated working tree, environment, and artifacts. No shared agent memory, prior solutions, or cross-trial hints.
- Keep hidden tests and expected patches outside the agent's readable workspace. Evaluate only after the agent stops, using a separate process/environment. Verify this boundary rather than relying on a prompt instruction.
- Make only the stated task requirements public. Group B must not receive acceptance criteria derived from hidden assertions that Group A cannot see.
- Start with fully automatable tasks. Human-review tasks require a separate experiment with the same blinded reviewers, rubric, and time accounting in both groups.
- Fix the acceptance decision in advance. For example: A declares completion and its agreed visible checks pass; B reports acceptance ready. A passing checks-only gate is not B's acceptance decision.

## Measurements

| Metric | Definition |
| --- | --- |
| Hidden-test pass rate | Trials passing all hidden behavioral checks / all valid trials |
| Regression escape rate | Accepted trials failing at least one hidden compatibility check / accepted trials with compatibility checks |
| False acceptance rate | Accepted trials failing the hidden evaluator / all accepted trials |
| Time to accepted change | Wall time from trial start to its acceptance decision; report non-accepting trials separately |
| Time to correct accepted change | Time to acceptance among hidden-correct accepted trials, alongside completion rate |
| Resource cost | Reported input/output tokens, tool calls, and observed cost using a dated price/configuration record |
| Workflow overhead | Spec, baseline, verification, and review time, reported separately from implementation time |

Report numerator and denominator, per-task results, run dispersion, and paired differences. Do not silently discard failed or timed-out trials. Publish infrastructure failures separately using a predefined rerun policy. A fast but incorrect acceptance must not improve the time-to-correct metric.

Retain anonymized prompts, configuration, visible test logs, verifier records, acceptance decisions, elapsed times, and hidden evaluation outcomes. Redact secrets; preserve a manifest of what was redacted. Do not invent unavailable token/cost measurements.

## Negative-control prototype

A useful first experiment is a reviewed set of representative violating implementations:

1. Establish a passing implementation and freeze the spec and acceptance test artifacts.
2. Independently review each control: which criterion it violates, which files it changes, and why that mutation represents a meaningful defect.
3. Apply each control in a separate disposable environment using the same frozen tests, runtime, and dependencies.
4. Require the unmodified implementation to pass and the control to fail for the expected behavioral reason.
5. Classify timeout, missing dependencies, crashes, setup errors, and inconclusive assertions separately. A nonzero exit alone is not sufficient detection evidence.
6. Record control ID, criterion mapping, patch hash, test artifact hashes, environment, failure classification, and cleanup result.
7. Report only the tested scope: “detected these representative violations.” Surviving controls identify weak tests; detected controls do not prove complete correctness.

Do not mutate the developer's live workspace or let an agent silently rewrite assertions while applying a control. Compare control detection with false acceptance in the held-out experiment before making it a product gate.

The current verifier does not implement this prototype. It explicitly reports semantic coverage as not-assessed.

## Freshness and performance work

Retain whole-workspace freshness as the default. Before optimizing, measure snapshot and status costs on 1K, 10K, and 100K files, varying file sizes and tracked/untracked ratios. Record hardware, OS/filesystem, Node/Git versions, total bytes, warm/cold-cache conditions, wall time, CPU, actual disk I/O where measurable, and peak memory. Separate fixture generation from measured work.

Do not extrapolate a synthetic file-count result to all monorepos. Compare before/after behavior and cost if changing traversal or concurrency. Add cache invalidation tests before introducing a cache.

A future declared-input scope must always bind the spec and verifier, include relevant lockfiles/configuration, report exclusions, and label the weaker scope prominently. Missing declared inputs must fail closed. Hermetic evidence requires an externally enforced environment and authenticated provenance; it cannot be established by a “hermetic” CLI flag.

Parallel checks are deferred until independence, shared-resource rules, retry semantics, and cancellation tests are explicit. A concurrency limit alone does not isolate databases, ports, or files.

## Evidence authenticity

Current provenance is a local process observation. CI variables can identify a reported run but cannot authenticate it. Future CI evidence consumption should verify an external attestation and its artifact digest, issuer, repository/workflow identity, revision, and trust policy before displaying a trusted status. Unverified metadata must never be promoted solely because it says “CI.”

Keep this integration separate from the deterministic local verifier. The project should consume an established attestation format rather than implement its own signing infrastructure.
