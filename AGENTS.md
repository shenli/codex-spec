# Working on codex-spec

- The product is a Codex skill plus a deterministic acceptance verifier. Optimize for developers understanding what remains before accepting a change.
- Canonical runtime source is strict TypeScript in `src/`. Run `npm run build` to regenerate the portable skill executable. Never hand-edit the generated bundle.
- Keep `spec.md` the only hand-edited contract. Parse Markdown with Marked, commands with shell-quote, and persisted evidence with strict Zod schemas.
- Keep automated checks, freshness, and human review independent. Never infer human approval from agent output or test success.
- Review check quality: a command exiting zero is not proof of an acceptance criterion. Preserve before/after tests when fixing a regression.
- Evidence records are append-only through the tool. New runs invalidate old approvals. Changes to relevant contents must invalidate freshness.
- Tests use temporary Git repositories without network or credentials. Run `npm run check` for runtime changes. Check `npm run check:bundle` before a rebuild when assessing committed bundle drift.
- Use the repository's `verification-gate` spec for the complete acceptance check. Review `docs/design.md` when changing evidence semantics or process execution.
- Keep the skill directory independently portable, with its third-party notices. Do not add runtime package installation, model credentials, or a parallel agent execution engine.
