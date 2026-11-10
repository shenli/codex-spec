# A trustworthy Codex development companion

Developers can author readable acceptance criteria, execute relevant checks, and distinguish current execution evidence from pending human decisions.

## Constraints

Keep the installed skill self-contained. No model credentials or network are required for verification.

## Acceptance criteria

### Maintainable typed source produces the committed portable tool

Verify: `npm run typecheck`
Verify: `npm run check:bundle`

### Acceptance fails closed when evidence is missing, stale, interrupted, or corrupt

Verify: `npm test`

### Developer workflows preserve meaningful before and after checks

The suite exercises bug, refactor, and performance fixtures using unchanged acceptance tests. Required human review remains pending.

Verify: `npm test`

### Installed packages work without runtime dependency downloads

Verify: `npm run test:package`
