# Try the workflows

From this repository, run:

```sh
npm run demo
```

The demo uses the checked-in executable, Node, and Git. It creates three temporary repositories, executes checks before and after real implementation changes, and prints the location of each retained project and its evidence. No API key or running Codex session is required.

## Bug: an off-by-one rate limit

```sh
node scripts/demo.mjs bug
```

The initial implementation rejects request 100. The acceptance test checks requests 1–100 and request 101. The baseline fails; changing `count < 100` to `count <= 100` makes the same test pass.

The result is ready, with a before/after observation linked to the baseline run.

## Refactor: preserve price calculations

```sh
node scripts/demo.mjs refactor
```

The checks cover empty baskets, quantities, discounts, and rounding. They pass before and after extracting the subtotal calculation.

The result is needs-review because the spec also asks a person to inspect readability and the public API. The demo does not manufacture that approval. Both runs remain available in history.

## Performance: reduce repeated key reads

```sh
node scripts/demo.mjs performance
```

The fixture groups 1,000 records into 100 groups. A getter counts key reads, giving the acceptance check a deterministic budget of at most 2,000 reads.

The repeated-filter implementation exceeds the budget. A single-pass implementation meets it while preserving the checked output. This measures algorithmic work, not a claim about production latency or memory.

## Inspect a retained project

The demo prints each temporary path. Enter it, then use the linked executable:

```sh
codex-spec status bug
codex-spec history bug
codex-spec report bug
```

Edit `implementation.mjs` and ask for status again: the old evidence is stale. Run verify after completing the change to produce a new record.

For the refactor, perform the declared review before recording a decision with `review --decision approve --reviewer ... --note ...`.

The fixture definitions are in [examples/workflows.mjs](examples/workflows.mjs). Tests run the same examples and assert the expected assessments.
