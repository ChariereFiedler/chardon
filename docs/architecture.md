# Architecture: Chardon

Status: v1 delivered (collection, reports, status line, improvement loop). This document describes what **actually exists** in
the code, the data model, the invariants, and the known limits to lift in later batches.

## Layers

```
┌─ hooks/ ────────────── collection (fail-open, always exit 0) ──────────────┐
│  session-start.ts   SessionStart *      → INSERT sessions                   │
│  post-tool-use.ts   PostToolUse  *      → INSERT events (redacted meta)     │
│  stop.ts            Stop         *      → UPDATE ended_at + daily report     │
│  notify.ts          PreToolUse   Bash   → nudges on stdout + dedupe (opt-in) │
└────────────────────────────┬───────────────────────────────────────────────┘
                             ▼ (import ../lib/*.js)
┌─ lib/ ── pure, testable core ──────────────────────────────────────────────┐
│  config.ts    loadConfig / dbPath / repoSlug / transcriptSlug              │
│  db.ts        openDb / closeDb / writeSession / closeSession / writeEvent  │
│  redact.ts    redactSecrets / redactCmd (7 patterns, truncate 60)          │
│  patterns.ts  detectToilLoops / detectRetryStorms / detectColdReads /      │
│               computeVelocity (parameterized SQL, scoped per repo)         │
│  session-context.ts  buildSessionContext (session-start briefing, pure)    │
│  schema.sql   idempotent DDL (9 tables)                                    │
└────────────────────────────┬───────────────────────────────────────────────┘
                             ▼
                      ~/.claude/chardon.db  (SQLite, WAL, busy_timeout 5s)
                             ▲
┌─ scripts/ ─────────────────┴───────────────────────────────────────────────┐
│  analyze-daily.ts   renderDailyReport (pure) + generateDailyReport (I/O)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

Linear dependency graph, no cycles: `hooks/* → lib/* → node:sqlite`. The only
hook→script dependency is `stop.ts → generateDailyReport` (intentional).

## Data flow

1. **SessionStart** → `session-start` inserts a `sessions` row (id, repo, branch,
   ticket via `ticketRegex`, type main/worktree). When `CHARDON_ACTIVE=1` it also
   emits a read-only briefing as `additionalContext` (open actions, yesterday's top
   friction, collection-failure warning); an empty briefing prints nothing.
2. **PostToolUse** → `post-tool-use` inserts an `events` row (tool, success, duration,
   redacted `meta`). It also does a preventive `writeSession` `INSERT OR IGNORE` to
   satisfy the foreign key if `session-start` did not run.
3. **PreToolUse Bash** → `notify` (when `CHARDON_ACTIVE=1`) reads the DB and emits
   alerts on stdout: toil loop, failing command, slow command, token budget at 80% and
   100%. Each emitted alert writes one dedupe row to `nudges` (at most one alert per
   day per repo/kind/target); it writes nothing else.
4. **Stop** → `stop` sets `ended_at`, then runs `generateDailyReport` (best-effort).
5. `analyze-daily` reads the DB (velocity + frictions over 24 h) and writes
   `<outDir>/daily-YYYY-MM-DD.md`.

## Data model

`schema.sql` creates 9 tables (idempotent). Seven are live in v1; two are defined for
future use.

| Table | Role | Live |
|-------|------|------|
| `sessions` | one Claude Code session (id, repo, branch, ticket, type) | ✅ |
| `events` | one tool usage (tool, success, duration_ms, meta JSON) | ✅ |
| `token_usage` | tokens per day/origin (cost) | ✅ |
| `actions` | recommended action + ROI measurement (baseline → after) | ✅ |
| `nudges` | per-day dedupe of notify-hook alerts (date, repo, kind, target) | ✅ |
| `hook_health` | per-day hook write/failure counts (silent-failure detection) | ✅ |
| `purge_log` | audit trail of retention purges + once-a-day auto-purge throttle | ✅ |
| `patterns` | persisted frictions | ⏳ (actions carries ROI instead) |
| `ticket_metrics` | ticket lifecycle | ⏳ v1.1 |

`events.session_id` references `sessions(id)`; `foreign_keys=ON`. The write order
(session before event, via `INSERT OR IGNORE`) guarantees integrity.

## Invariants (non-negotiable)

- **Absolute genericity**: no project coupling in delivered code (`lib/`, `hooks/`,
  `scripts/`, `config/`, `schema.sql`). Paths/slugs derive from `CLAUDE_PROJECT_DIR`,
  never hardcoded.
- **Fail-open**: every hook calls `process.exit(0)` no matter what (empty/malformed
  input, unavailable DB): no exception, no stray write. A hook never breaks a session.
- **Per-repo isolation**: all data is scoped by the `repo` column; a hook without a
  usable `CLAUDE_PROJECT_DIR` writes nothing (no orphans).
- **Parameterized SQL only**: bound placeholders, never interpolated input.
- **Testability**: DB via `CHARDON_DB`, injected `now` clock, pure report rendering
  (separate from I/O), slug derived from `projectDir`.

## Runtime

- Node **≥ 22** (`node:sqlite` experimental on 22 / stable on 24).
- **No required runtime npm dependencies** (`@anthropic-ai/sdk` is optional, weekly
  synthesis only). The `.ts` under `hooks/`/`lib/`/`scripts/` is the source
  of truth; `npm run build` (esbuild) precompiles it to committed `dist/*.mjs` bundles that
  `hooks.json` and the commands run with plain `node`. This avoids re-stripping types on
  every hook spawn (roughly 2× faster per tool call; see the README's Performance section).
  Tests run against the `.ts` directly; the `hooks-wiring` test runs the built `dist` bundles.
- `node:sqlite` loaded via `createRequire(import.meta.url)`, otherwise Vite/Vitest
  rewrites `node:sqlite` → `sqlite` (not found) at transform time.
- DB in WAL + `busy_timeout=5000` for hooks ↔ analysis concurrency.

## Proposals

`proposeActions` (`lib/improve.ts`) maps each detected friction to an action `kind`:

| Friction (`patternType`) | `kind` |
|--------------------------|--------|
| `toil_loop` | `automate-command` |
| `cold_read` | `split-or-summarize` |
| `retry_storm` | `investigate-file` |
| `failure_cluster` (same Bash cmd failing ≥ `FAIL_MIN`) | `fix-failing-command` |
| `slow_command` (same cmd, avg `duration_ms` ≥ `SLOW_MS`) | `speed-up-command` |
| any mapped friction with its skill unused | `consider-skill` |
| `over_budget` (today's tokens > `tokenBudgetPerDay`) | `reduce-token-spend` |
| `token_growth` (week-over-week ≥ `TREND_ALERT_PCT`) | `investigate-token-growth` |

`persistActions` will not re-propose a `(repo, kind, target)` that was `dropped` or
`measured` without effect (self-tuning). The digest also carries non-action sections:
**Regressions** (a previously-fixed friction whose count climbed back, via `detectRegressions`)
and **Cross-project candidates** (a Bash command recurring across ≥ `CROSS_REPO_MIN` repos via
`detectCrossRepoCommands`, the "Ronce Racine candidate" signal).

ROI (`lib/roi.ts`) re-measures a proposal by re-running `proposeActions` and reading the
friction count for the same `kind`+`target`. For `consider-skill`, `after` drops to 0 once
the underlying friction disappears, so a resolved friction credits the skill even if the
skill was not actually adopted (e.g. the command was simply fixed). Read those ROI rows as
"the friction went away", not "the skill was applied".

## Known limits

- **`ticket_metrics` unpopulated** (v1.1): the table is defined but nothing writes ticket
  lifecycle metrics yet.
- **Retention is opportunistic, not scheduled**: the Stop hook purges the current
  repo's history older than `retentionDays` (default 90) at session end, throttled to
  once a day per repo via `purge_log`; `/chardon-purge` stays the explicit trigger.
  A repo you stop opening is never purged again (no background scheduler).
- **`post-tool-use` forces `session_type='main'`** in its preventive `writeSession`:
  if an event precedes `session-start` in a worktree, the session may be mistyped as
  `main` (theoretical race, minor impact).
- **No schema versioning**: `CREATE TABLE IF NOT EXISTS` only, no `schema_version`
  table or migrations. Any Batch 2+ change must be **additive**, or introduce an
  explicit migration mechanism.
- **Hooks are silent by design**: fail-open emits no error log, so a collection bug is
  invisible without an external debug wrapper. Acceptable (a hook must not pollute the
  session), but worth keeping in mind for diagnosis.

## Tests

The Vitest suite (current count: `npm test`; the README figure is enforced by
`tools/validate.ts`) tests hooks as **real subprocesses**
(`node --experimental-strip-types`, stdin + env), with fail-open enforced by tests.
See [`../TESTING.md`](../TESTING.md).
