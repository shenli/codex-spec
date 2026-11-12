# Verification evidence foundations

Developers can distinguish executed, cancelled, and unscheduled checks, see exactly which gate passed, and understand the scope and origin of evidence without inferring semantic correctness or authenticated CI trust.

## Constraints

Keep workspace freshness conservative and execution sequential. Preserve raw historical records. Do not claim that passing checks prove requirements or that CI environment variables authenticate a run.

## Acceptance criteria

### Cancellation stops scheduling

After cancellation, no later check is announced or spawned. The active check is cancelled and unscheduled checks have explicit skip reasons without invented execution timestamps.

Verify: `node --test test/foundations.test.mjs`

### Check execution has a bounded budget and explicit failure policy

A shared execution budget stops the active check and skips the remaining checks. Continue is the default; fail-fast is opt-in. Neither an interrupted nor a partially executed run satisfies either gate or accepts human approval.

Verify: `node --test test/foundations.test.mjs`

### Gate success does not imply semantic correctness

Terminal and JSON output explicitly identify the selected gate. A passing checks gate can coexist with pending or rejected review. Contract mapping and semantic coverage are reported separately.

Verify: `node --test test/foundations.test.mjs`

### Evidence describes provenance and supports versioned reading

New records describe observed execution context, unauthenticated origin, and fingerprint exclusions. Version 1 history remains readable without mutation; unsupported schemas fail with a clear version error.

Verify: `node --test test/foundations.test.mjs`

### The portable tool matches its maintainable source

Verify: `npm run check:bundle`
