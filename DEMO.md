# Try the verification loop

Run from this checkout with Node.js 22+ and Git on macOS or Linux:

```bash
node scripts/demo.mjs
```

No packages, model calls, or credentials are required. The demo creates a temporary Git repository with a deliberately incorrect number-doubling function and real assertions for positive, negative, and zero inputs.

It verifies three observable transitions:

1. The incorrect implementation fails the declared acceptance check: `failed`, exit 1.
2. The repaired implementation passes, and a fresh status check agrees: `verified`, exit 0.
3. A subsequent code edit invalidates the receipt: `stale`, exit 1.

The output prints the temporary repository and evidence paths so you can inspect the exact commands, test output, criteria, and workspace hashes. The temporary repository is retained for inspection. Rerun verification there using the absolute path to this checkout's `src/cli.js` to produce fresh evidence after the final edit.

For a real feature, use `$spec-driven-development` in Codex, define meaningful criteria, implement the change, and run the same verifier. The demo's automatic repair is a deterministic demonstration, not a replacement agent loop.
