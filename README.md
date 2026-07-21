<p align="center">
  <img src="assets/header.png" alt="Illustration of purple and gold thistles" width="100%">
</p>

# Chardon

Claude Code plugin that watches how your coding sessions actually go, and tells you what to
fix. Four fail-open hooks record tool usage into a local SQLite file; from that, Chardon
produces a **daily friction report**, a **live status line**, **token-cost tracking**, and an
**improvement loop** that proposes a concrete action and then measures whether it worked.

Generic: no tracker, no CI, no stack assumed. Everything is derived from `CLAUDE_PROJECT_DIR`.

## Why Chardon, not a dashboard?

Most developer-analytics tools answer a manager's question — *how much did the team ship?*
Chardon answers yours: **what did I waste time on today, and what should I change tomorrow?**

That difference decides the whole design. There is no server, no account, no aggregation
across people, nothing to log into. Because the data never leaves your machine, it can afford
to be specific — the actual commands you re-ran, the actual files you re-read — instead of the
anonymized averages a shared dashboard is forced to show.

The loop is closed on purpose. Anything can list frictions; Chardon records a **baseline**
when it proposes a fix and re-counts the same friction after you act, so a suggestion that
changed nothing is visible as such — and is never proposed again.

## The name

*Chardon* is French for **thistle**: it grows in ground nobody tends, it is covered in small
sharp reminders, and pulling it up means going after the root rather than the leaves. Roughly
the job here. It also keeps company with
[Ronce Racine](https://github.com/ChariereFiedler/ronce-racine) ("bramble root"), the shared
engineering-discipline config this repo is itself equipped with.

## Requirements

**Node ≥ 22**, and nothing else. `node:sqlite` ships with Node, hooks run as precompiled
`dist/*.mjs` bundles via plain `node`, and those bundles are committed — so installing Chardon
downloads no dependency and runs no build step.

The one optional dependency is `@anthropic-ai/sdk`, used solely by the weekly LLM synthesis.
Every other feature works without it.

## Installation

```
/plugin marketplace add ChariereFiedler/chardon
/plugin install chardon@chardon
```

Hooks wire themselves on activation (via `hooks/hooks.json`) — nothing to copy by hand. Drop a
`.chardon.json` at your project root to override defaults.

## What a day looks like

Nothing below is a command you have to remember. The four hooks run on their own; you type a
slash command only when you want to *read* something.

### While you work — automatic

`SessionStart` opens a session. Every tool call lands in `events` via `PostToolUse`: Bash
commands **redacted before storage**, file paths, durations, success or failure. The status
line shows the live picture:

```
my-project · feat/412-billing · 🌳 1 · 💰 142000/120000 ⚠
```

Repo, branch, one sibling worktree, and today's token count — flagged `⚠` because it crossed
the budget set in `.chardon.json`. On `Stop`, the daily report is written to `docs/chardon/`.

### Reading the damage — `/chardon-daily`

```markdown
# Dev Metrics — 2026-07-21

## Velocity
- 1 session(s) · 16 tool calls · 0 failure(s)

## Collection health
🟢 healthy — 16 write(s) recorded, 0 failures

## Detected frictions

### Toil loops (same command repeated)
| Command | Repetitions |
|---|---|
| `docker compose up -d && npm run seed` | 4 |
| `npm run test:e2e -- --grep billing` | 3 |

### Cold reads (file re-read often → memory/skill candidate)
| File | Reads |
|---|---|
| `src/billing/invoice-calculator.ts` | 5 |

### Retry storms (same file edited repeatedly)
| File | Edits |
|---|---|
| `src/billing/tax-rules.ts` | 4 |
```

*Collection health* is not decoration. Hooks are fail-open, so a broken hook stays silent by
design — this line is how you find out it went silent.

### Deciding what to change — `/chardon-improve`

```markdown
## Prioritized Proposals

- 🟡 **automate-command** → `docker compose up -d && npm run seed` (baseline: 4)
  ↳ run less often, or add it to `toilExclusions` / script it
- 🟡 **split-or-summarize** → `src/billing/invoice-calculator.ts` (baseline: 5)
  ↳ summarize it into a memory note so it isn't re-read
- 🟡 **investigate-file** → `src/billing/tax-rules.ts` (baseline: 4)
  ↳ edited repeatedly — find the root cause
- 🟡 **consider-skill** → `recurring-bug-root-cause` (baseline: 4)
  ↳ invoke this skill next time the friction appears

## Open Actions

- `#1` [proposed] **automate-command** → `docker compose up -d && npm run seed`
```

Note the last one: the friction was a retry storm, a skill exists for exactly that, and you
did not invoke it. Chardon says so.

### Closing the loop

```
/chardon-apply 1     → Action 1 marked applied — run measure later to capture its ROI.
/chardon-measure 1   → Action 1: friction 4 → 0 (reduced by 4).
/chardon-drop 2      → never propose this one again ("this is normal here")
```

`measure` re-counts the *same* friction and compares it against the baseline captured when
the action was proposed. An action measured as ineffective is never re-proposed, and a
friction that returns after being fixed resurfaces in a **Regressions** section.

## What Chardon detects

Windows are 24 h for the daily report. Every threshold is configurable — raise them to cut
noise, see [Configuration](#configuration).

| Friction | What it means | Default threshold |
|---|---|---|
| **Toil loop** | the same Bash command run over and over | ≥ 3 runs (`toilMin`) |
| **Failing command** | the same command *failing*, not merely repeating | ≥ 3 failures (`failMin`) |
| **Slow command** | the same command repeatedly burning wall-clock | ≥ 3 runs averaging ≥ 30 s (`slowMin`, `slowMs`) |
| **Retry storm** | one file edited again and again — usually a misunderstood root cause | ≥ 4 edits (`retryMin`) |
| **Cold read** | one file re-read but never modified — a memory-note candidate | ≥ 3 reads (`coldMin`) |
| **Cross-project command** | the same friction across several repos — worth a canonical rule or skill | ≥ 2 repos |

## What Chardon proposes

Each proposal carries a **baseline** (the friction count when it was raised) and a severity
(⚪ low, 🟡 medium, 🔴 high), so the digest is ordered by what actually costs you.

| Proposal | Raised when | What it suggests |
|---|---|---|
| `automate-command` | toil loop | script it, run it less, or exclude it |
| `fix-failing-command` | failing command | fix or guard it instead of rerunning |
| `speed-up-command` | slow command | cache, scope, or parallelize it |
| `split-or-summarize` | cold read | summarize the file into a memory note |
| `investigate-file` | retry storm | find the root cause behind the repeated edits |
| `consider-skill` | a friction that maps to a known skill you did not invoke | use that skill next time |
| `reduce-token-spend` | spend over budget | trim context: large re-reads, long transcripts |
| `investigate-token-growth` | week-over-week token jump | check for context churn |

## Commands

| Command | What it does |
|---|---|
| `/chardon-daily` | today's report: velocity, frictions, tokens, collection health |
| `/chardon-weekly` | weekly synthesis and token trend (the LLM step is optional) |
| `/chardon-improve` | prioritized proposals, open actions, measured ROI, regressions |
| `/chardon-apply <id>` | mark an action as applied |
| `/chardon-measure <id>` | re-count the friction and record the delta |
| `/chardon-drop <id>` | drop a proposal for good |
| `/chardon-inspect` | show exactly what is stored locally |
| `/chardon-purge` | delete history older than the retention window |

## What leaves your machine

Nothing, unless you ask for it.

Everything lives in `~/.claude/chardon.db`, created `0600`. Commands are **redacted before
storage** (`lib/redact.ts`): GitLab, GitHub, Anthropic, AWS, Stripe, npm and Slack tokens,
JWTs, `VAR_TOKEN=…` assignments, credentials embedded in URLs, and secrets passed as bare CLI
arguments (`--token …`, `Bearer …`). History is bounded by `retentionDays` and
`/chardon-purge`, and `/chardon-inspect` prints exactly what is stored, scoped to the current
repo.

The single exception is `/chardon-weekly`, whose synthesis step calls the Anthropic API — and
only if you set `ANTHROPIC_API_KEY` yourself.

Chardon is **not** a productivity-surveillance tool, and is deliberately built so it cannot
become one: no row is attributed to a person, and nothing is aggregated across machines.

## Configuration

`.chardon.json` at the project root overrides `config/chardon.default.json`. Top-level keys
are shallow-merged; `thresholds` and `gitlab` are deep-merged, so a partial override keeps the
remaining defaults.

| Key | Default | Role |
|---|---|---|
| `outDir` | `"docs/chardon"` | where reports are written (confined to the project) |
| `ticketRegex` | `"(?:feat\|fix)/(\\d+)"` | pulls a ticket number out of the branch name |
| `toilExclusions` | `[]` | commands to ignore in toil detection |
| `tokenBudgetPerDay` | `0` (off) | the status line flags `⚠` past this many tokens |
| `retentionDays` | `90` | how far back `/chardon-purge` keeps history |
| `thresholds` | see above | detection thresholds — raise them to cut noise |
| `gitlab` | `{enabled: false}` | optional MR and issue counts in the status line |

### Environment variables

| Variable | Effect |
|---|---|
| `CLAUDE_PROJECT_DIR` | project root, injected by Claude Code — without it a hook does nothing |
| `CHARDON_DB` | database path (default `~/.claude/chardon.db`) |
| `CHARDON_DEBUG=1` | trace hook failures to stderr instead of failing silently |
| `CHARDON_ACTIVE=1` | enable the `notify` hook's inline toil alerts |
| `CHARDON_MODEL` | override the model used by the weekly synthesis |

## Performance & overhead (measured)

Each hook is a fresh Node process per tool call, so per-call latency is the whole game.
Running the TypeScript sources directly re-strips the import graph on every spawn. Chardon
therefore ships **precompiled esbuild bundles**, which brings the cost down to roughly the
Node-startup floor. Measured by `scripts/bench.ts` on a 2026 Linux laptop:

```
event write (in-process):        ~0.172 ms/event
hook spawn, source (strip-types): ~123 ms/event
hook spawn, bundle (plain node):  ~56 ms/event
```

Expect roughly a 2× cut, with absolute numbers varying by machine.

What remains is Node process startup, irreducible without a long-running daemon. If that cost
is unacceptable to you, this plugin is not for you — a real trade-off, not a footnote.
Reproduce the numbers yourself:

```bash
npm run build && node --experimental-strip-types scripts/bench.ts
```

## Architecture

```
hooks/     SessionStart · PreToolUse(Bash) · PostToolUse · Stop — all fail-open
  └─> lib/     db (SQLite) · redact · patterns (detection) · improve · roi · config
scripts/   analyze-daily · analyze-weekly · statusline · improve · inspect · purge · roi-actions
dist/      the above, precompiled and committed — what actually runs
```

Flow: hooks → `chardon.db` (WAL) → readers query the DB → Markdown out. Rendering is kept pure
(data → string) and separated from I/O, so it is tested without touching a database.

Data model, invariants and known limits → [`docs/architecture.md`](docs/architecture.md).
Agent-facing working rules → [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md).

## Development

```bash
npm install        # dev tooling only — never needed at runtime
npm run build      # refresh dist/*.mjs (the bundles are committed)
npm test           # 204 tests
npm run typecheck
npm run lint
```

Hooks are tested as **real subprocesses** (stdin + env), and fail-open is asserted rather than
assumed. Test strategy → [`TESTING.md`](TESTING.md).

## Roadmap

v1 is complete: collection, token parsing, daily and weekly reports, status line, and the full
improvement loop — including regression alerts and the cross-project signal.

Deferred: `ticket_metrics` (ticket lifecycle) exists in the schema but is never populated.

## Contributing & license

Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) and the working rules in
[`CLAUDE.md`](CLAUDE.md). Security reports: [`SECURITY.md`](SECURITY.md).

Licensed under the [MIT License](LICENSE).

The header illustration (`assets/header.png`) is AI-generated and is **not** covered by the
MIT License; it is provided for use with this project only.
