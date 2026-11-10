# Design: define completion, leave implementation to Codex

Research and implementation review: 2026-11-10.

## Findings

The v1 executor marked a successful Codex process as `completed`. Phase execution printed success after iterating tasks, including failed or skipped tasks. Planning/spec generation used an OpenAI Chat Completions client with a hard-coded `gpt-4` default, while implementation used a separate Codex CLI path. Generated context files were injected into repository instructions. The repository had no tests despite a configured Vitest command.

These are code findings. They do not establish user adoption, productivity, or model quality; the numeric ratings in the supplied feedback are opinions, not measurements.

Current official guidance confirms that Codex supports native non-interactive execution, JSONL events, final-message files, and JSON Schema-constrained output. These are sufficient integration points if future automation needs them; there is no need for this toolkit to supply a second agent runtime. See [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode).

Official guidance also documents repository-local `.agents/skills` discovery and progressive loading of skill instructions/resources. A portable skill fits this project's reusable methodology. See [Build skills](https://learn.chatgpt.com/docs/build-skills).

This redesign does not depend on the feedback's particular platform announcement date or Goals availability.

## Decisions

**Skill first.** One self-contained skill owns contract refinement, native implementation, verification, and evidence handoff. Its scripts use Node built-ins. The optional npm command is a thin entry point into the exact same helper. No model pin, SDK dependency, credentials, context manager, or session scheduler is needed.

**One readable contract.** Developers edit only `spec.md`: acceptance headings, prose, and inline-code Verify commands or Review procedures. A deterministic parser generates IDs and mappings in memory; there is no second authored or cached contract. A narrow command-line lexer supports quotes without an implicit shell. Duplicate titles, malformed directives, and shell operators are rejected. Missing checks block all execution, and manual review remains nonpassing. Evidence schema version 2 binds results to the exact Markdown bytes.

**Evidence before status.** Check exit codes are evidence for the explicitly mapped tests, not evidence that an agent finished a task. All required automated checks must pass; manual review remains unresolved. Code/spec hashes bind a receipt to evaluated inputs. Status derives and validates the result, then compares current inputs.

**Trusted local execution.** Checks run as structured argv with bounded output, finite timeout, closed stdin, and subprocess-group cleanup. A repository lock prevents competing verifier runs. This is operational reliability, not containment of adversarial commands. Evidence is unsigned. The fingerprint deliberately excludes generated evidence, ignored dependencies/build output, and external state. Source-changing checks invalidate their run. Submodules fail closed until recursive coverage has a clear contract.

**No invented approval.** Contract readiness, automated verification, independent review, and authorization to merge are different facts. User/project approval requirements are honored by the skill; PR review remains the human authority. The helper cannot attest manual criteria and therefore never returns verified for them.

**Clean replacement.** There are no existing users requiring compatibility. Remove the old runtime, generated-context workflow, and example instead of maintaining migration machinery. Git history preserves the previous design.

## What would justify more infrastructure

Add signed CI receipts, review identity binding, historical evidence storage, or cross-session conflict detection only when concrete use cases need them. A native SDK or app-server client may then be appropriate for a product that truly owns agent sessions. Adding a CLI wrapper solely to split Markdown plans into repeated runs would not improve this project's central guarantee.

## Validation

The automated suite uses temporary Git repositories and real subprocesses. It checks contract validation, command failure, timeouts/descendant cleanup, cancellation, output limits, symlink handling, concurrent locks, source/contract/HEAD changes, corrupted evidence, CLI exit codes, and standalone skill portability. The checked-in verification contract provides a runnable acceptance gate for the toolkit itself.

CI is configured for Linux/macOS and Node 22/24. Local validation is reported separately; a configured matrix is not evidence those remote jobs have already run.
