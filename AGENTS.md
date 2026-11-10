# Working on codex-spec

- The active product is the repository-local spec-driven-development skill plus its deterministic verifier.
- Canonical runtime code lives in `.agents/skills/spec-driven-development/scripts/`. `src/cli.js` is only the npm entry point. Keep the entire skill portable without dependencies.
- Treat execution success and acceptance verification as separate facts. Never mark manual review or human approval complete based on agent output.
- Preserve criterion-to-check coverage and reject malformed contracts. Changes to code or contracts must invalidate earlier evidence.
- Tests execute in temporary Git repositories and require no network or credentials. Run `npm test` for runtime changes; use the `verification-gate` contract for the full gate.
- Keep documentation relevant to the change. Read `docs/design-v2.md` for architecture decisions.
