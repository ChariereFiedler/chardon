# Chardon: Workflow Monitoring Plugin · Design

Status: approved (brainstorming) · 2026-06-25  
Scoping source: [`2026-06-25-monitoring-plugin-scoping.md`](2026-06-25-monitoring-plugin-scoping.md)

## Goal

**Chardon** (`chardon`) is a distributable Claude Code plugin that
observes session work, stores it, analyzes it, and **loops back** to improve the
workflow. Three value axes guide features beyond simple data collection:

1. **Token cost reduction**: make cost visible and actionable.
2. **Workflow analysis**: understand the shape of the work, not just friction.
3. **Self-improvement**: *detect → propose → apply → measure* feedback loop.

The plugin is derived from the `devmetrics` stack of granit-golem, **decoupled** and
**renamed** to be generic (runs on any project, including non-tordu-jardin ones).

### Why a dedicated plugin (and not a Ronce Racine family or an Ardente Forge module)

Monitoring is an orthogonal concern, stateful (SQLite DB), with a minimum runtime
requirement (Node ≥ 22) and its own config: a different *type* of object from Ronce
Racine's stateless generic disciplines, and broader than Ardente Forge's
GitLab/Cycle workflow (which the scoping deliberately decoupled it from). The Claude
Code plugin format natively packages hooks + commands + skills + scripts = exactly
the right inventory, with `/plugin install` for distribution without manual file copying.

## Name

"Chardon" (slug `chardon`). A deliberate user choice: the alliteration
and clarity ("instrument for Claude Code") take precedence over the evocative
register of the family (tordu-jardin / ardente forge / ronce racine), despite the
coupling to the vendor name.

## v1 Scope (complete, Lot 6 included)

Collect → store → analyze (daily + LLM weekly) → live statusline → **improvement
loop**. Estimated ~5-6 days across 6 batches (see §Batches).

**Out of v1**: granit's `daily-improve` in its coupled form (Cycle daemon, hardcoded
granit memories), `cycle-metrics.db`, Cycle sections of the statusline.
A **generic and decoupled** version of the improvement loop (`/chardon-improve`)
is, however, in scope (Batch 6).

## Architecture: plugin packaging

```
chardon/
  .claude-plugin/
    plugin.json            # manifest: name, version, description, author
    marketplace.json       # marketplace entry for `/plugin marketplace add`
  hooks/
    hooks.json             # wiring SessionStart / PreToolUse(Bash) / PostToolUse / Stop
    session-start.ts       # SessionStart → insert session
    post-tool-use.ts       # PostToolUse * → insert event (redacted meta)
    stop.ts                # Stop → close session + triggers analyze-daily
    notify.ts              # PreToolUse Bash → toil alert + live token budget
  lib/                     # storage + detection layer (standalone, testable)
    schema.sql             # idempotent DDL
    db.ts                  # openDb/closeDb/writeSession/closeSession/writeEvent
    redact.ts              # redactSecrets/redactCmd
    patterns.ts            # detectToilLoops/RetryStorms/ColdReads/computeVelocity
    token-parser.ts        # JSONL transcripts → token_usage (+ detectTokenDrift)
    improve.ts             # Batch 6: aggregation of prioritized actions (generic)
    roi.ts                 # Batch 6: closed-loop measurement (before/after an action)
  scripts/
    analyze-daily.ts       # daily Markdown report (generic, outDir configurable)
    analyze-weekly.ts      # LLM synthesis (optional, ANTHROPIC_API_KEY)
    statusline.ts          # live dashboard (ex agents-status, decoupled)
  commands/
    chardon-daily.md        # /chardon-daily, today's report
    chardon-weekly.md       # /chardon-weekly, LLM synthesis
    chardon-improve.md      # /chardon-improve, prioritized action digest (Batch 6)
  config/
    chardon.default.json    # defaults; project override via .chardon.json at its root
  *.test.ts                # Vitest, colocated
  README.md  package.json
```

### Distribution

`/plugin marketplace add <chardon repo>` then `/plugin install chardon`.
On activation, hooks/commands/statusline wire up automatically (via
`hooks.json` + the manifest). Only `.chardon.json` (optional) is placed per project
to override defaults. No manual file copying.

## Data Flow

1. **SessionStart** → `session-start.ts` inserts a `sessions` row (id, repo,
   branch, ticket_iid via configurable regex, type main/worktree).
2. **PostToolUse \*** → `post-tool-use.ts` inserts an `events` row (tool, success,
   duration_ms, JSON meta redacted by `redact.ts`).
3. **PreToolUse Bash** → `notify.ts` detects toil loops in real time + emits
   **token budget** state if `CHARDON_ACTIVE=1`.
4. **Stop** → `stop.ts` sets `ended_at`, then launches `analyze-daily.ts` in
   background → report at `${CHARDON_OUT_DIR}/daily-YYYY-MM-DD.md`.
5. `token-parser.ts` (called by analyze-daily) reads JSONL transcripts from
   `~/.claude/projects/<slug>/` → aggregates into `token_usage`.
6. **statusline.ts** (every 30s) reads transcript + `chardon.db` (+ GitLab if
   enabled) → live ANSI line, including token budget.

DB: `~/.claude/chardon.db`, global, scoped by `repo` column, WAL mode +
`busy_timeout=5000` (concurrent hooks ↔ analysis). Idempotent DDL applied on every
`openDb()`; no DB install step.

## Data Model

Reuses the granit schema (tables `sessions`, `events`, `patterns`,
`ticket_metrics`, `token_usage`; see scoping §2). v1 changes:

- **`ticket_metrics` populated** (granit left it empty): `session_count`,
  `fix_commits` (git log), `ci_failures`, `scope`, time-to-merge, supporting
  axis 2 (ticket lifecycle).
- **`patterns` persisted** when an action is proposed/applied (granit computed it
  on the fly without persisting): supports ROI measurement (axis 3): comparing
  friction before/after over time.
- **New `actions` table** (Batch 6): tracks a recommended action and its follow-up.
  ```sql
  id            INTEGER PK AUTOINCREMENT
  proposed_at   DATETIME DEFAULT now
  repo          TEXT NOT NULL
  kind          TEXT          -- 'enable-hook' | 'split-file' | 'propose-skill' | …
  target        TEXT          -- file/scope/artifact concerned
  pattern_type  TEXT          -- friction targeted (toil_loop, cold_read, retry_storm…)
  baseline      INTEGER       -- friction metric at time of proposal
  status        TEXT          -- 'proposed' | 'applied' | 'measured' | 'dropped'
  applied_at    DATETIME
  after_metric  INTEGER       -- metric after application (ROI measurement)
  ```

**Redaction (PII)**: `meta.cmd` goes through `redactCmd()` (GitLab/GitHub/Jira tokens,
env `*TOKEN*/*KEY*/*SECRET*`, URLs with credentials, JWTs, hex ≥ 32) before storage,
truncated to 60 chars. Unchanged from granit (100% portable).

## Decoupling (vs granit), detailed

| Point | Action |
|-------|--------|
| Names `devmetrics`/`DEVMETRICS` | → `chardon` / `CHARDON_*`; DB `~/.claude/chardon.db`; config `.chardon.json` |
| `token-parser` hardcoded `-home-user-lab-granit-golem` patterns | derived dynamically from `CLAUDE_PROJECT_DIR` (absolute path, `/`→`-`) |
| `statusline` `pgrep … 'granit-golem-wt-'` + `GITLAB_PROJECT_ID='<project-id>'` | worktree pattern derived from project; **GitLab + pgrep optional behind flags**; Cycle sections removed |
| `patterns` granit-specific toil exclusions | externalized in `.chardon.json` (`toilExclusions[]`) |
| ticket regex `(?:feat|fix)/(\d+)` | configurable (`.chardon.json` → `ticketRegex`) |
| outDir `docs/dev-metrics/` | `CHARDON_OUT_DIR`, default `docs/chardon/` |

## The 3 Axes: Features

### Axis 1: Token Cost Reduction

- **Live token budget**: statusline `tokens today / threshold`; `notify.ts` alerts on
  threshold breach (threshold in `.chardon.json`).
- **Cache efficiency**: ratio `cache_read / (input + cache_creation)`; drift alert
  (`detectTokenDrift` existing) → context advice.
- **Cold-read → action**: file read ≥ 3× / session → "split/summarize" suggestion +
  estimated token overhead.
- **Output bloat**: high-output events → recommends enabling Ronce Racine's
  `truncate-output` hooks (cross-plugin loop).
- **Sub-agent ROI**: cost of `Agent` dispatches flagged.
- **Saveable €**: each top friction converted into avoided token cost.

### Axis 2: Workflow Analysis

- **Tool sequences**: mining of recurring chains (friction loops).
- **Ticket lifecycle**: time-to-merge, sessions/ticket, fix_commits,
  ci_failures by scope (via `ticket_metrics`).
- **Phase breakdown**: exploration / editing / testing / debugging.
- **Friction by area**: files/scopes with recurring retry_storms.
- **Velocity trends**: throughput over time, regressions.

### Axis 3: Self-improvement (loop)

- **`/chardon-improve`** (generic, without Cycle): prioritized 🔴🟡⚪ digest from
  `chardon.db` + memory folder (`~/.claude/projects/<slug>/memory`) + git log.
- **Skill/rule proposals**: from a recurring pattern, propose a preventive artifact
  (via LLM `analyze-weekly`, written to a configurable `proposed/` folder).
- **Closed-loop ROI measurement** (differentiator): `actions` table tracks
  baseline → applied → after_metric; the report shows "action X: friction −40%".
- **Loop toward Ronce Racine**: a recurring generic friction across *multiple projects*
  is flagged as a candidate for a Ronce Racine canonical rule/skill.

## Cross-cutting Concerns

- **Runtime**: Node ≥ 22 (`node:sqlite`, experimental 22 / stable 24;
  `--experimental-strip-types`). README documents this; a non-blocking install check
  warns if Node < 22. No npm sqlite fallback.
- **Error handling**: all hooks **fail-open** (exit 0 no matter what):
  a hook never breaks the session. DB unavailable / Node too old →
  silent no-op. Consistent with Ronce Racine's hook policy.
- **Tests**: Vitest. Granit's `*.test.ts` (db, redact, patterns, token-parser,
  analyze-daily) are ported and adapted; new tests for decoupled parts
  (dynamic token-parser, generic statusline) and Batch 6 (improve, roi, actions).
- **Config** `.chardon.json` (project root, optional):
  ```json
  {
    "outDir": "docs/chardon",
    "ticketRegex": "(?:feat|fix)/(\\d+)",
    "tokenBudgetPerDay": 0,
    "toilExclusions": [],
    "gitlab": { "enabled": false, "projectId": "", "tokenEnv": "GITLAB_TOKEN" }
  }
  ```

## Implementation Batches

1. **Portable core**: `plugin.json`/`marketplace.json`, `hooks.json` + 4 hooks,
   `lib/{schema.sql,db.ts,redact.ts,patterns.ts}`, `analyze-daily.ts`, ported tests.
   End-to-end collect→store→report loop.
2. **Generic token-parser**: paths derived from `CLAUDE_PROJECT_DIR`, adapted tests.
3. **Generic statusline**: `agents-status` decoupled (derived worktree pattern,
   optional GitLab/pgrep, Cycle removed), token budget displayed.
4. **Config + commands**: `.chardon.json`, `/chardon-daily`, `/chardon-weekly`,
   configurable exclusions.
5. **LLM analyze-weekly**: weekly synthesis + proposals, optional `ANTHROPIC_API_KEY`.
6. **Improvement loop**: `actions` table, `lib/improve.ts` + `lib/roi.ts`,
   generic `/chardon-improve`, `ticket_metrics` population, cost/workflow report
   enrichments, closed-loop ROI measurement.

## Success Criteria

1. `/plugin install chardon` activates hooks + commands + statusline without
   manual file copying; a project without `.chardon.json` works on defaults.
2. A real session populates `sessions`/`events`/`token_usage`; `Stop` produces a
   daily report in `docs/chardon/`.
3. No residual granit coupling (grep `granit|<project-id>|-home-user-lab` = 0 in
   distributed artifacts); runs on a non-tordu-jardin project.
4. `/chardon-improve` lists prioritized actions; the `actions` table tracks an
   action and its before/after measurement (ROI).
5. The statusline displays the live token budget; `notify` alerts on threshold breach.
6. Vitest green; hooks fail-open (exit 0) verified.
