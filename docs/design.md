# Design and trust boundaries

codex-spec defines what a developer must establish before accepting a change. The active Codex session owns discovery, planning, implementation, and repair. The verifier owns contract validation, check execution, evidence persistence, and assessment.

## Implementation

The strict TypeScript modules are deliberately small:

| Module | Responsibility |
| --- | --- |
| `spec.ts` | Marked AST to criteria and deduplicated commands; shell-quote argument parsing |
| `model.ts` | Types, strict Zod evidence schemas, and exit policy |
| `workspace.ts` | Git discovery, safe metadata paths, source fingerprints |
| `runner.ts` | Direct subprocess execution, cancellation, timeouts, bounded output |
| `store.ts` | Exclusive run lock, atomic pointers, append-only run/review records |
| `engine.ts` | Verification, freshness assessment, baseline comparison, review binding |
| `present.ts` | Terminal summaries and Markdown review reports |
| `install.ts` | Portable skill installation without silent replacement |
| `cli.ts` | Arguments and command routing |

The build bundles CLI source and its runtime libraries into `.agents/skills/spec-driven-development/scripts/codex-spec.mjs`. The npm bin imports that bundle. Copying the skill directory is sufficient to run it with Node and Git; no runtime package installation or model credentials are needed.

Use `npm run check:bundle` before rebuilding to detect divergence between the checked-in bundle and TypeScript source. Type checking and tests run against the source build. Third-party notices travel with the skill.

## Acceptance is a derived assessment

Stored evidence does not contain a trusted "completed" flag. The engine derives assessment from the compiled contract, raw process results, current inputs, and a matching review decision.

Automated checks are passed, failed, pending, or absent. Evidence is current, stale, missing, or invalid. Human review is not required, pending, approved, or rejected. The terminal and JSON output expose all three dimensions.

The default gate returns success only for ready acceptance. A manual-only contract can become ready after review, but cannot satisfy the automated checks gate. A criterion with no check and no review blocks execution of the entire contract.

The automated checks gate deliberately does not enforce the human decision. Use the PR system to enforce required reviews in CI.

## Evidence lifecycle

1. Acquire the repository-wide verification lock.
2. Replace the latest pointer with a running marker. Earlier success is no longer applicable.
3. Parse the entire contract and validate working directories before execution.
4. Fingerprint the inputs, execute the distinct checks sequentially, and fingerprint again.
5. Write a new UUID-named record with exclusive creation, then atomically publish its checksum pointer.
6. Derive the assessment from the new record and current inputs.
7. Release the lock.

Baseline runs follow the same lifecycle and also update a baseline pointer. They never grant acceptance. A later run can identify matching commands that had a positive failure exit before and now pass on changed inputs. This observation is not a proof that assertions remained unchanged or were sufficient.

Checks that fail to spawn produce an infrastructure error. Nonzero exits, signals, and per-check timeouts fail the check. Cancellation has a distinct outcome and prevents the run from satisfying either gate. Interruption records failure when possible. An abrupt kill can leave a lock/running marker; neither is treated as success.

Review records have their own UUID and checksum pointer. Each binds to the exact run ID and raw record hash. An approval cannot override failed or incomplete checks. New runs require a fresh decision when the contract calls for review.

## Freshness

A fingerprint includes the content of tracked files and non-ignored untracked files, executable bits, and symlink target strings. The active spec is always included even if ignored. Generated evidence and lock files are excluded.

The digest represents contents, not Git HEAD. Committing the same tree does not expire evidence. The original HEAD is still recorded for traceability. Both the before and after digests must equal the present workspace, and the contract, verifier bundle, Node version, platform, and architecture must match.

This is intentionally conservative: unrelated source changes also expire evidence. There is no manually configured dependency graph to drift.

Excluded inputs include ignored dependencies/build products, Git metadata, environment variables, network services, and contents behind symlinks. Lockfiles are fingerprinted when tracked. The tool does not fingerprint the whole machine, freeze files during execution, or detect a temporary modification that is reverted between snapshots. Use a clean, controlled CI environment for stronger reproducibility.

Submodules are rejected rather than silently omitted; run verification inside each submodule. Metadata and check-directory symlinks are rejected. Source symlink targets are recorded as links rather than followed.

## Process execution

Commands are tokenized and spawned without an implicit shell. The contract rejects shell composition and expansions; project scripts can supply intentional setup. The process inherits the local environment and permissions.

On macOS/Linux, commands run in a process group. Timeout, cancellation, and ordinary parent termination clean up descendants in that group. A deliberately detached process can escape the group; this is not a sandbox. Each stream is capped at 64 KiB, with truncation recorded.

A zero exit is process evidence, not semantic acceptance. Check quality and criterion mappings need engineering judgment. A test may pass without asserting the behavior; baseline results and independent review help expose that risk but cannot eliminate it.

## Local trust and sharing

Run/review files are append-only through the tool, not tamper-proof storage. Checksums and strict schemas detect accidental damage. A writer who can edit the repository can forge both records and hashes or alter the verifier itself.

Review names and references are local declarations. Authentication and protected approval belong in a PR/review platform. The skill records a completed human decision only when explicitly authorized.

Evidence captures command output, which may contain application data. It is ignored by Git by default. Inspect it before uploading a CI artifact or attaching it to a review. Reports omit raw logs but retain paths, criteria, commands, and record identifiers.

## Recovery and installation

If a run is locked, inspect `.codex-spec/.verify.lock/owner.json` and confirm its process has stopped. Only then remove that lock directory and run verification again. Never change a pointer to resurrect an old pass.

Malformed/corrupted evidence returns exit 2. Fix its cause and rerun verification. If history needs cleanup, archive or remove the affected generated evidence directory after ensuring no verification is active. Feature specs are separate and remain intact.

`init` installs an absent skill or recognizes an identical one. It refuses to replace different existing files. Review and back up local skill changes before manually replacing the installation with a newer version. It appends evidence ignore rules and does not modify AGENTS.md.

## Evaluation

The suite tests Markdown authoring, criterion mapping, subprocess behavior, interruption, locks, corrupted evidence, freshness, reviews, portable installation, and real before/after bug/refactor/performance fixtures. CI runs on macOS and Linux with Node 22 and 24, checks the committed bundle, runs the repository contract, and uploads its evidence.

## Execution outcomes and budgets

Schema v2 separates attempted checks in `results` from unscheduled checks in `skipped`. An attempted result has an outcome of passed, failed, or cancelled, validated against its raw process evidence. A skipped entry has only a check ID and a reason; it has no invented start time, exit status, or output.

Cancellation stops scheduling and kills the active process group. Remaining checks are skipped. The CLI does not announce those checks as executing. A pre-cancelled run, including a manual-only contract, cannot be accepted or approved.

Execution remains sequential. The default failure policy continues after an unsuccessful check to collect more diagnostics. `--fail-fast` skips the remainder after the first unsuccessful check.

`--budget 10m` specifies a shared wall-clock budget for the check-execution phase; 10 minutes is the default, with a supported range of 1ms–24h. Per-check timeouts still apply. A shared budget stop cancels active work and prevents further scheduling. Preparation, snapshots, process cleanup, evidence publication, and assessment are outside this execution budget; it is not a hard deadline for the entire CLI invocation. A stopped or partially executed run cannot satisfy either gate.

## Claims and provenance

Assessment exposes `coverage.mapping` independently from `coverage.semantic`. Complete mapping means that criteria name a check or review procedure. Semantic coverage is always `not-assessed` in this version, including when all checks pass or a human decision is recorded. Baseline comparisons remain bounded observations about matching commands.

CLI results include the selected gate and its result. Successful `--gate checks` output is labelled `CHECKS_PASSED`; the complete acceptance and review states remain visible, including pending or rejected review. JSON carries `gate.selected`, `gate.result`, and `gate.exitCode`.

V2 records capture origin as `local-process`, authentication as `unverified`, and local versus CI-reported context. Recognized GitHub Actions run IDs/attempts are contextual hints from environment variables, not authenticated identity. Only allowlisted context fields are recorded; arbitrary environment variables are not collected.

Provenance also declares workspace freshness scope, exclusions, recognized fingerprinted lockfiles, and the absence of installed-dependency/environment capture. A lockfile fingerprint is not evidence that the installed dependency tree matches it. No record produced by this version claims trusted CI or hermetic execution.

## Schema evolution

Writers produce schema v2. Versioned readers strictly validate v1 and v2 and return the original version without rewriting the record. History can contain both. Checksums continue to cover the original raw bytes; loading or listing legacy evidence does not mutate it or its pointers.

V1 lacks explicit skip semantics and provenance. Those facts remain unknown; the reader does not infer them or upgrade the old claim. Old verifier fingerprints normally make legacy evidence stale for current acceptance. A new verification run produces a new v2 record rather than migrating an old success.

Unsupported future versions return an explicit version error. Corrupt known versions remain errors. A newer record must be read by a compatible verifier; the tool does not silently reinterpret or discard unknown fields.

[Evaluation protocol and deferred work](evaluation.md) distinguishes the current regression suite from the controlled product experiment and negative-control prototype still needed.
