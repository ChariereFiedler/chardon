# CLAUDE.md — Chardon

Working rules for this repo. For what the plugin *is* and how to use it, see `README.md`;
for how it's built, see `docs/architecture.md`.

## Non-negotiable invariants

- **Fail-open hooks.** Every hook ends with `process.exit(0)`. Empty/malformed stdin,
  a missing `CLAUDE_PROJECT_DIR`, or an unavailable DB MUST exit 0 — no exception, no
  stray write. NEVER let a hook throw or block a session.
- **Generic only.** NEVER hardcode a project path, repo name, tracker/GitLab id, or
  `~/.claude/projects/...` slug in `lib/`, `hooks/`, `scripts/`, `config/`, `schema.sql`.
  Derive everything from `CLAUDE_PROJECT_DIR`.
- **Scope by `repo`.** Every row is scoped by the `repo` column. A hook without a usable
  `CLAUDE_PROJECT_DIR` writes nothing — NEVER create orphan rows.
- **Parameterized SQL only.** Bind `?` placeholders. NEVER interpolate a value into a
  query string.
- **`node:sqlite` via `createRequire`.** Load it with
  `createRequire(import.meta.url)("node:sqlite")`. NEVER `import` / `await import` it —
  Vite/Vitest rewrites `node:sqlite` → `sqlite` and the load fails.

## Testability (the design depends on it)

- Read the DB path from `CHARDON_DB`; tests point it at a temp file. NEVER open the real
  `~/.claude/chardon.db` from a test.
- Inject the clock (`now`). NEVER call `new Date()` / `Date.now()` inside logic under test.
- Keep report rendering a pure function (data → string), separate from I/O.
- Test hooks as real subprocesses (`node --experimental-strip-types` + stdin + env) and
  assert the fail-open path.

## Runtime & schema

- Node **≥ 22** (`node:sqlite`, `--experimental-strip-types`). NEVER add an npm SQLite dep.
- Schema is idempotent (`CREATE TABLE IF NOT EXISTS`); there is no migration mechanism.
  Schema changes MUST be additive.

## Conventions

- **English everywhere** in this repo (comments, JSDoc, user-facing strings, tests, docs,
  commits). The shared base under `.claude/` comes from Ronce Racine and stays as-is.
- Run `npm test` and `npm run typecheck` before claiming work done; keep the suite green.
  When you change a user-facing string, update its asserting test in the same change.
- Commits: `type(scope): description` (`feat|fix|refactor|test|docs|chore`), ≤ 72 chars.
  NEVER mention Claude/AI/LLM in a commit message. No magic numbers.

## Knowledge routing

| Need | Go to |
|------|-------|
| Architecture, data model, invariants, known limits | `docs/architecture.md` |
| Full v1 design (6 batches, 3 axes) | `docs/2026-06-25-chardon-plugin-design.md` |
| Origin & decoupling from granit-golem | `docs/2026-06-25-monitoring-plugin-scoping.md` |
| Test strategy | `TESTING.md` |
| Plugin manifest + hook wiring | `.claude-plugin/plugin.json`, `hooks/hooks.json` |
| SQLite schema | `lib/schema.sql` |

| Concern | File |
|---------|------|
| Config & path/slug resolution | `lib/config.ts` |
| SQLite access | `lib/db.ts` |
| Secret redaction | `lib/redact.ts` |
| Friction detection + velocity | `lib/patterns.ts` |
| Collection hooks | `hooks/*.ts` |
| Daily report | `scripts/analyze-daily.ts` |

## Don't assume present (not built yet)

v1 is complete (collection, token parsing, daily/weekly reports, status line, and the
improvement loop — including dormant-signal proposals, token-cost proposals, a self-tuning
loop with regression alerts, and the cross-project "Ronce Racine candidate" signal). Still
**not** built — deferred to v1.1: `ticket_metrics` is defined in the schema but never
populated.
