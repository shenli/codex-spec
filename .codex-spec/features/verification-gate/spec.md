# Verification gate

Make codex-spec a portable Codex-native contract and verification toolkit.
Agent execution success must never establish acceptance on its own.

## Scope and constraints

Use a single readable Markdown contract and a dependency-free Node.js helper.
Run checks on macOS/Linux with bounded output and finite timeouts.
Verification requires no agent, network, or credential.

## Acceptance criteria

### Readable contracts

Developers write ordinary criterion headings, descriptions, and verification
commands in spec.md. They do not maintain IDs, argument arrays, readiness fields,
or a second acceptance file. Invalid or ambiguous directives cannot pass.
Generated identities remain stable when criteria move, and code examples never
execute.

Verify: `node --test test/markdown.test.js`

### Reliable execution

Failures, unavailable commands, timeout, signals, and cancellation cannot pass.
Output stays bounded and subprocess descendants are cleaned up.

Verify: `node --test test/verification.test.js`

### Fresh evidence

Contract, source, and HEAD changes invalidate evidence. Corrupt or incomplete
result coverage cannot pass. Missing checks and manual criteria remain blocked.

Verify: `node --test test/verification.test.js`

### Workspace boundaries

Symlinked metadata and unsupported submodules are rejected. Concurrent
verification runs are locked.

Verify: `node --test test/verification.test.js`

### Portable workflow

The CLI creates only spec.md, returns gate exit codes, and works when the whole
skill directory is copied or symlinked into another project.

Verify: `node --test test/cli.test.js`

## Non-goals

No agent orchestration, signed attestation, remote review identity, Windows
process supervision, or submodule recursion in this release. Product/design
review and release authorization remain separate human decisions.
