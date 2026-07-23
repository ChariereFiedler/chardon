# Agent guide: Chardon

Doc aimed at an agent (LLM) that **works on** this repo, whichever harness it runs in.
The full working rules live in [`CLAUDE.md`](CLAUDE.md); read it first. What follows is
the subset no agent may violate, restated here so it is never missed.

## What this repo is

A Claude Code plugin for **workflow monitoring**: fail-open hooks collect tool-call events
into a local SQLite DB, which feeds daily/weekly reports, a status line, and an improvement
loop (detect friction → propose an action → measure its ROI). Local and personal by design:
no server, no telemetry, no network at runtime.

Architecture and data model → [`docs/architecture.md`](docs/architecture.md).

## Non-negotiable invariants

- **Fail-open hooks.** Every hook ends with `process.exit(0)`. Empty or malformed stdin, a
  missing `CLAUDE_PROJECT_DIR`, or an unavailable DB MUST exit 0. A hook must never throw,
  block a session, or write on the error path.
- **Generic only.** Never hardcode a project path, repo name, tracker id, or
  `~/.claude/projects/...` slug in `lib/`, `hooks/`, `scripts/`, `config/`, `schema.sql`.
  Derive everything from `CLAUDE_PROJECT_DIR`.
- **Scope by `repo`.** Every row is scoped by the `repo` column. A hook without a usable
  `CLAUDE_PROJECT_DIR` writes nothing; never create orphan rows.
- **Parameterized SQL only.** Bind `?` placeholders; never interpolate a value into a query.
- **`node:sqlite` via `createRequire`.** Load it with
  `createRequire(import.meta.url)("node:sqlite")`; never `import` / `await import` it, as
  Vite/Vitest rewrites `node:sqlite` → `sqlite` and the load fails.
- **No npm SQLite dependency.** Node ≥ 22 ships what is needed.

## Testability

- The DB path comes from `CHARDON_DB`; tests point it at a temp file. Never open the real
  `~/.claude/chardon.db` from a test.
- Inject the clock (`now`). Never call `new Date()` / `Date.now()` inside logic under test.
- Keep report rendering a pure function (data → string), separate from I/O.
- Test hooks as real subprocesses and assert the fail-open path.

## Before claiming work is done

```bash
npm run build      # refresh the committed dist/*.mjs bundles
npm test           # 200 tests
npm run typecheck
npm run lint
git diff --exit-code -- dist   # committed bundles must match source
```

CI enforces the same, plus coverage, mutation testing, and a gitleaks history scan.

## Conventions

- **English everywhere**: comments, JSDoc, user-facing strings, tests, docs, commits.
- Commits: `type(scope): description` (`feat|fix|refactor|test|docs|chore`), first line
  ≤ 72 chars. **Never** mention Claude, AI, or LLM in a commit message. Ask for
  confirmation before committing.
- Schema changes MUST be additive (`CREATE TABLE IF NOT EXISTS`; there is no migration
  mechanism). Bump `PRAGMA user_version` when the shape changes.
- "siliceum" is always lowercase.

## Shared config under `.claude/`

`.claude/rules/`, `.claude/skills/`, `.claude/hooks/`, and `.claude/agents/` are installed
from [Ronce Racine](https://github.com/ChariereFiedler/ronce-racine) and tracked by the
lockfile `.claude/.ronce-racine.json`. Do not hand-edit them; they are refreshed from the
canonical source:

```bash
npx tsx <ronce-racine>/install.ts check   .   # drift vs canonical
npx tsx <ronce-racine>/install.ts install .   # refresh
```

To customize one deliberately, `detach` it rather than editing it in place.
