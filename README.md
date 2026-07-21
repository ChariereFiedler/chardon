# Chardon

A Claude Code plugin for **workflow monitoring**. It observes the events of a coding
session, stores them in SQLite, and turns them into **daily and weekly reports** of
frictions and velocity, a **live status line**, token-cost analysis, and a
**self-improvement loop** (detect → propose → measure).

Generic: runs on any project, with no dependency on a specific tracker or CI. All hooks
are **fail-open** — they never break a session. No build step and **no required runtime npm
dependencies** — only Node ≥ 22.

## What chardon is (and isn't)

chardon is a **personal, local tool**. Everything lives in a SQLite file on your machine
(`~/.claude/chardon.db`, created `0600`); nothing is synced or aggregated across a team, and
there is no dashboard for anyone but you. The only data that ever leaves the machine is the
**optional** weekly LLM synthesis, which you enable explicitly with an API key. Commands are
**redacted** before storage (`lib/redact.ts`), history is bounded by `/chardon-purge`, and
`/chardon-inspect` shows you exactly what is stored. It is **not** a productivity-surveillance
tool and is deliberately not built to become one.

See the closed improvement loop in action → [`docs/walkthrough.md`](docs/walkthrough.md).

## Performance & overhead (measured, honest)

Each hook runs as a fresh Node process per tool call, so per-call latency matters. Running
the TypeScript source directly (`node --experimental-strip-types`) re-strips the whole import
graph on every spawn — measured **~150 ms/tool-call**. chardon therefore ships **precompiled
bundles** in `dist/*.mjs` (built with esbuild): hooks run as plain `node dist/*.mjs`, which
drops the cost to roughly the **Node-startup floor (~a few tens of ms)** — about a 2–3×
reduction. The remaining cost is Node process startup itself, which is irreducible without a
long-running daemon.

The bundles are committed, so **consumers still install nothing and build nothing** — only
Node ≥ 22. Maintainers rebuild with `npm run build` (also run automatically before tests).
Reproduce the numbers on your machine: `npm run build && node --experimental-strip-types scripts/bench.ts`.

## Status — v1 complete

The full pipeline works end to end:

- 4 hooks collect sessions and tool usage into `~/.claude/chardon.db`;
- token usage is parsed from transcripts; a daily report (frictions, tokens, velocity)
  is generated on every `Stop`, plus an optional weekly LLM synthesis;
- a live status line shows context, subagents, worktrees, and the token budget;
- the **improvement loop** turns frictions into tracked actions and measures their ROI.

Slash commands: `/chardon-daily`, `/chardon-weekly`, `/chardon-improve`.
Suite: 203 passing tests. Architecture details → [`docs/architecture.md`](docs/architecture.md).
Deferred to v1.1 → [Roadmap](#roadmap).

## Installation

> Node **≥ 22** required (`node:sqlite`; stable on Node 24). No *required* runtime
> dependency — hooks run as precompiled `dist/*.mjs` bundles via plain `node`, no install
> or build step. The only optional one is `@anthropic-ai/sdk`, used solely by the weekly
> LLM synthesis; everything else works without it.

```
/plugin marketplace add siliceum/chardon
/plugin install chardon@chardon
```

On activation, the hooks wire themselves automatically (via `hooks/hooks.json`). No
manual copy. Optionally drop a `.chardon.json` at the project root to override defaults.

## Configuration

`.chardon.json` (project root, optional) overrides `config/chardon.default.json`.
Shallow first-level merge.

| Key | Default | Role | Active in Batch 1 |
|-----|---------|------|-------------------|
| `outDir` | `"docs/chardon"` | report destination (relative to the project) | ✅ |
| `ticketRegex` | `"(?:feat|fix)/(\\d+)"` | extract the ticket number from the branch | ✅ |
| `toilExclusions` | `[]` | commands to ignore in toil detection | ✅ |
| `tokenBudgetPerDay` | `0` | token budget (Batch 6) | ⏳ |
| `gitlab` | `{enabled:false,…}` | GitLab status-line integration (Batch 3) | ⏳ |

### Environment variables

| Variable | Effect |
|----------|--------|
| `CHARDON_DB` | DB path (default `~/.claude/chardon.db`) |
| `CLAUDE_PROJECT_DIR` | project root — injected by Claude Code; if absent, the hook does nothing |
| `CHARDON_ACTIVE=1` | enables the `notify` hook's inline toil alerts (otherwise silent) |

## Daily report

Generated on every `Stop`, or by hand:

```bash
npm run build && node dist/analyze-daily.mjs   # also exposed via /chardon-daily
```

Contents: velocity (sessions, tool calls, failures) + frictions (toil loops, cold reads)
over the last 24 h.

## Development

```bash
npm install        # dev tooling only (vitest, typescript) — not needed at runtime
npm test           # vitest run (203 tests)
npm run typecheck  # tsc --noEmit
```

Test strategy → [`TESTING.md`](TESTING.md). Hooks are tested as real subprocesses (stdin +
env), and fail-open is enforced by tests. Working rules → [`CLAUDE.md`](CLAUDE.md).

This repo is itself equipped with the shared [Ronce Racine](https://gitlab.com/tordu-jardin)
base (`.claude/`: dev rules, skills, hooks).

## Architecture (overview)

```
hooks/        collection (SessionStart, PreToolUse Bash, PostToolUse, Stop) — fail-open
  └─> lib/    SQLite storage (db) · redaction (redact) · detection (patterns) · config
scripts/      analysis (analyze-daily: pure render + generation)
config/        defaults; project override .chardon.json
```

Flow: hooks → `chardon.db` (WAL) → `analyze-daily` reads the DB → Markdown report.
Details, data model and invariants → [`docs/architecture.md`](docs/architecture.md).

## Roadmap

| Batch | Contents | Status |
|-------|----------|--------|
| **1** | collect → SQLite → daily report | ✅ done |
| **2** | `token-parser` (token cost, `token_usage` table) | ✅ done |
| **3** | generic live status line + token budget (+ optional GitLab) | ✅ done |
| **4** | config hardening + `/chardon-daily` | ✅ done |
| **5** | `analyze-weekly` (optional LLM synthesis) | ✅ done |
| **6** | improvement loop: `actions` table, ROI measurement, `/chardon-improve` | ✅ done |

**Deferred to v1.1**: populating `ticket_metrics` (ticket lifecycle). The cross-project
"Ronce Racine candidate" signal (a recurring generic friction across projects → a proposed
canonical rule/skill) is now surfaced in the improve digest.

Full design → [`docs/2026-06-25-chardon-plugin-design.md`](docs/2026-06-25-chardon-plugin-design.md).

## Contributing & license

Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) and the working rules in
[`CLAUDE.md`](CLAUDE.md). Security reports: [`SECURITY.md`](SECURITY.md).

Licensed under the [MIT License](LICENSE).
