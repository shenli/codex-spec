# Contracts and evidence

## Files

Use `.codex-spec/features/<slug>/spec.md` for intent, scope, constraints, non-goals, and design decisions. Keep it concise. `acceptance.json` owns stable criterion IDs and check mappings.

Create a draft with `node <skill-directory>/scripts/codex-spec.mjs spec <slug> "<intent>"`. Existing directories are never overwritten. Slugs contain lowercase letters, numbers, and single hyphens, up to 80 characters.

## Acceptance format (schema version 1)

```json
{
  "schemaVersion": 1,
  "feature": "example",
  "state": "ready",
  "criteria": [
    {
      "id": "AC-1",
      "description": "Invalid input is rejected without modifying stored data.",
      "checks": ["input-tests"]
    },
    {
      "id": "AC-2",
      "description": "The proposed public API is acceptable to the maintainer.",
      "manual": "Review the public API diff and record the decision in the PR."
    }
  ],
  "checks": [
    {
      "id": "input-tests",
      "argv": ["node", "--test", "test/input.test.js"],
      "cwd": ".",
      "timeoutMs": 30000
    }
  ]
}
```

- Top-level fields shown above are required. `state` is `draft` or `ready`. Drafts never run checks or pass.
- Define 1–128 criteria and 0–64 checks. IDs are unique within each list: letters/numbers followed by letters/numbers/underscores/hyphens, at most 64 characters.
- Every criterion has a nonempty `description` and exactly one of a nonempty `checks` array or a nonempty `manual` procedure. Duplicate or unknown references are rejected.
- Every check must be referenced by a criterion. All checks are required; no optional/skipped-success checks.
- `argv` is a nonempty array of at most 128 strings; the first is an executable. No implicit shell, glob expansion, piping, or shell interpolation occurs. Use a test script for complex operations. An explicitly declared shell is still executable code and must be reviewed.
- `cwd` is optional, defaults to the repository root, and must be an existing relative directory inside it. Symlinked check directories and metadata paths are refused.
- `timeoutMs` is optional, defaults to 120000, and must be an integer from 1 to 600000.
- Unknown fields are rejected so typos cannot silently weaken the contract. JSON is deliberate: it avoids a YAML parser dependency and ambiguous coercion.

One check can support multiple criteria, but reviewers must confirm that it actually asserts each behavior. A benchmark must exit nonzero when the threshold is missed. A test runner must be configured to fail when its required test set is missing.

## Commands and results

Run the helper from anywhere in the target Git working tree. It finds the repository root.

`verify <slug>` validates the contract, takes a workspace fingerprint, executes the checks sequentially, takes another fingerprint, and writes `evidence.json`. Each check runs with closed stdin, inherited environment, and no implicit shell. Timeouts and cancellation kill the subprocess group; detached processes outside that group are not supervised. Windows verification is not supported in this version.

`status <slug>` reads the contract and evidence, checks their consistency, recomputes the fingerprint, and returns a fresh result without executing commands.

- `verified`: all criteria are automated and all required checks passed against stable inputs.
- `failed`: a check failed, could not start, timed out, or was cancelled.
- `blocked`: a draft, unresolved manual criterion, or verification lock.
- `stale`: inputs changed since or during verification.
- `unverified`: no evidence.
- `invalid`: parsing, validation, incomplete evidence, or infrastructure failure.

`verify` and `status` exit 0 only for `verified`, 1 for other valid nonpassing outcomes, and 2 for invalid/error. Check failure evidence remains available; a new run invalidates an earlier receipt before executing checks.

Manual decisions are deliberately not accepted through a `--approve` flag or self-authored approval JSON. Track human review in the project's review system and report it separately. This release cannot produce an overall `verified` receipt for a contract with manual criteria, even if an external reviewer approves; that is an explicit limit, not a reason to delete a required criterion.

## Evidence format (schema version 1)

A finished receipt contains:

- `runnerVersion`, `runId`, `feature`, `startedAt`, `finishedAt`, `status`, optional `reason`.
- `runtime`: Node.js version, platform, architecture.
- `inputs`: SHA-256 of the exact spec and acceptance files.
- `workspace.before` and `.after`: Git HEAD (null before the first commit), fingerprint, and file count.
- `checks`: ID, arguments, cwd, timeout, timestamps/duration, exit code, signal, timeout/abort flags, startup error, passed/failed result, stdout/stderr, and output truncation flag.
- `criteria`: ID, description, derived passed/failed/manual-required result, and check IDs or manual procedure.

Failures before input validation may lack inputs/workspace. An interrupted run may leave `running` evidence; it cannot pass status. Each output stream is limited to the first 64 KiB. Logs may contain project data emitted by checks; inspect them before sharing.

`evidence.json` is replaced atomically. Archive each receipt externally for history; do not commit a success receipt as permanent proof. Generated evidence is excluded from its own fingerprint.

The fingerprint includes HEAD, tracked and nonignored untracked working-tree content, file paths, executable bits, and symlink targets. It explicitly includes the current spec/acceptance files even when ignored. Submodules are rejected. Ignored files, environment, external symlink contents, dependencies, services, and modifications that occur and are reverted between snapshots are not attested. Use pinned dependencies and an isolated CI job when reproducibility requires those controls. Receipts are unsigned and checks run with normal local permissions: this is not a security boundary against malicious checks or edited receipts.

Only one verification run is permitted per repository. `.codex-spec/.verify.lock/owner.json` identifies its PID and run ID. After a crash or forced kill, confirm that the process has stopped before removing that lock directory and rerunning verification. Do not remove an active run's lock.

Use ignore rules for generated receipts and the lock:

```gitignore
.codex-spec/.verify.lock/
.codex-spec/features/*/evidence.json
.codex-spec/features/*/evidence.json.*.tmp
```
