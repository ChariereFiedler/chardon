# Test strategy: Chardon

Framework: **Vitest**. `npm test` = `vitest run`, `npm run test:watch` during dev.

## Principles

- **Deterministic**: no test depends on the real clock or randomness. Time is injected
  (a `now` parameter), never `Date.now()` inside the logic under test.
- **System-isolated**: no test touches `~/.claude/chardon.db`. Each test points
  `CHARDON_DB` at a temp file (or `:memory:`); see `lib/db.ts`, which MUST read the DB
  path from the env (a testability requirement).
- **No network**: the LLM layer (`analyze-weekly`) and GitLab (status line) are mocked
  or flag-disabled in tests. No API calls in unit tests.
- **Fail-open enforced**: for each hook, a test asserts that empty/malformed input
  yields `exit 0` with no exception and no stray write.

## Levels

### 1. Unit: `lib/` layer (the bulk of coverage)

| Module | What is tested |
|--------|----------------|
| `db.ts` | idempotent schema (double `openDb` without error), `writeSession`/`writeEvent`/`closeSession`, **per-repo isolation** (two repos do not mix) |
| `redact.ts` | case table: GitLab/GitHub/Jira tokens, `*TOKEN*/*KEY*/*SECRET*` env vars, credentialed URLs, JWT, hex ≥ 32 → redacted; normal text → intact; truncation to 60 |
| `patterns.ts` | on a seeded DB: `detectToilLoops` (cmd ≥ 3×), `detectRetryStorms` (≥ 4× same file), `detectColdReads` (read ≥ 3×), `computeVelocity`; respects `toilExclusions` |
| `token-parser.ts` | JSONL fixtures (`test/fixtures/`) → daily/origin aggregation, `token_usage` upsert, `detectTokenDrift`; **project slug derivation** from any `CLAUDE_PROJECT_DIR` (anti-hardcode) |
| `improve.ts` | action prioritization (🔴🟡⚪) from a seeded DB + mocked git log |
| `roi.ts` | an `action` lifecycle: `proposed → applied → measured`, before/after delta computation |

### 2. Hooks (`hooks/`): fail-open + effect

Each hook is run as a subprocess with a JSON payload on stdin and `CHARDON_DB` pointed at
a temp DB:
- **valid payload** → the expected write is present in the DB (session/event, etc.);
- **empty / broken JSON / unavailable DB** → `exit 0`, no exception, no write.

### 3. Scripts (`scripts/`): deterministic output

- `analyze-daily.ts`: on a seeded DB, the generated Markdown contains the expected
  sections (velocity, frictions, tokens, score). The **render function is pure**
  (DB → string), tested without file I/O.
- `statusline.ts`: rendering of the ANSI line from fixtures (transcript + DB), GitLab
  disabled; each missing optional section does not break the line.

## Fixtures

`test/fixtures/`: sample JSONL transcripts, and helpers (`tmpDb()` creating a throwaway
DB and pointing `CHARDON_DB` at it, `seed()` inserting typical sessions/events).

## Coverage target

- `lib/`: high (pure core logic, easy to cover).
- `hooks/`: **fail-open is enforced by test** (non-negotiable); the nominal effect covered.
- `scripts/`: pure render functions covered; I/O orchestration best-effort.

## Testability requirements imposed on the design

1. `db.ts` reads the DB path from `CHARDON_DB` (default `~/.claude/chardon.db`).
2. Any time-dependent logic receives `now` as a parameter.
3. Renderings (daily report, status line) are **pure functions** separate from I/O.
4. Slug/worktree resolution derives from `CLAUDE_PROJECT_DIR`, never a hardcoded path.

> Note: `token-parser`, `improve`, `roi`, `statusline` land in batches 2-6; their rows
> above describe the intended coverage, not yet-existing tests.

## LLM task evaluation

The LLM boundary in `scripts/analyze-weekly.ts` is injectable via the `ModelFn` type
(exported from `lib/weekly.ts`). `generateWeeklyReport` accepts an optional `model`
parameter that defaults to the real `callModel`; tests pass a synchronous stub instead.

- **Normal suite** (`npm test`): uses a stub model: no network call, no `ANTHROPIC_API_KEY`
  required. The `eval/` directory is excluded from the default `include` globs in
  `vitest.config.ts`. Two deterministic prompt-contract tests run here (see below).
- **Eval suite** (`npm run eval`): runs `eval/weekly.eval.test.ts` with three scenarios
  against the real model, each gated by `describe.skipIf(!process.env.ANTHROPIC_API_KEY)`.
  Without a key the suite reports as skipped, not failed.
- **Output length**: the synthesis returned by the model is capped at `SYNTHESIS_MAX_CHARS`
  (8000 characters) inside `renderWeeklyReport` before being included in the report. The
  cap is applied by a named constant; excess text is replaced with `… (truncated)`.
  `renderWeeklyReport` remains a pure function.

### Prompt-contract tests (deterministic, no network)

These tests live in `lib/weekly.test.ts` and run as part of `npm test`:

| Test | What it checks |
|------|---------------|
| empty summary → no-friction marker | `buildWeeklyPrompt` with empty toil and coldReads must include text matching `/no (toil\|friction\|repeated)/i` |
| populated summary → all data present | every toil command, cold-read file, and count must appear verbatim in the prompt |

### Eval scenarios (`eval/weekly.eval.test.ts`)

| Scenario | Input shape | `mustMention` | `mustNotMention` |
|----------|-------------|---------------|-----------------|
| `toil-heavy` | 1 toil cmd × 40, no cold reads | `"npm run build"` | `"cold read"` |
| `cold-read-heavy` | no toil, 1 cold-read file × 15 | `"src/huge.ts"` | `"npm run build"` |
| `clean-week` | no toil, no cold reads | _(none)_ | `"src/huge.ts"` |

**No-hallucination criterion**: each scenario asserts that `mustNotMention` is absent from
the model output. For example, the `cold-read-heavy` scenario must NOT mention
`"npm run build"` (which is not present in the input), and `clean-week` must NOT mention
`"src/huge.ts"`. This ensures the model does not invent friction that isn't in the data.

## Coverage

`npm run coverage` runs the suite with the v8 provider (requires `@vitest/coverage-v8`,
declared in `devDependencies`) and writes a report to `coverage/` (git-ignored), covering
`lib/`, `scripts/`, and `hooks/`. The `eval/` directory and `*.test.ts` files are excluded.
