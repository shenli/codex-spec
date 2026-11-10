# Verification gate

## Intent

Make codex-spec a portable Codex-native contract and verification toolkit. Agent execution success must never establish acceptance on its own.

## Scope and constraints

- Provide a self-contained repository skill and a dependency-free Node.js helper.
- Validate explicit criterion/check mappings before execution.
- Require passing automated checks against stable inputs; keep manual review unresolved.
- Preserve failure evidence and reject stale or inconsistent receipts.
- Run checks on macOS/Linux with bounded output and finite timeouts. No agent, network, or credential is required for verification.

## Acceptance

- AC-CONTRACT: Empty, ambiguous, mistyped, or incomplete contracts cannot pass.
- AC-EXECUTION: Failures, unavailable commands, timeout, signal, and cancellation cannot pass. Output stays bounded and subprocess descendants are cleaned up.
- AC-FRESHNESS: Contract, source, and HEAD changes invalidate evidence. Corrupt or incomplete result coverage cannot pass.
- AC-BOUNDARIES: Draft/manual criteria stay blocked; symlinked metadata and unsupported submodules are rejected; concurrent verification is locked.
- AC-PORTABILITY: CLI exit codes reflect gate outcomes and copying only the skill directory produces a working helper.

Test mappings are in acceptance.json. These criteria cover automated toolkit behavior. Product/design review and release authorization remain separate human decisions.

## Non-goals

No agent orchestration, signed attestation, remote review identity, Windows process supervision, or submodule recursion in this release.
