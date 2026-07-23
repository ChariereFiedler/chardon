# Scoping: Claude Code Plugin "devmetrics"

> Exhaustive mapping of the granit-golem telemetry stack  
> Date: 2026-06-25  
> Source root: `~/lab/granit-golem`

---

## 1. Full Artifact Inventory

### 1.1 Claude Code Hooks (`.claude/hooks/`)

| File | Event | Role |
|---|---|---|
| `devmetrics-session-start.ts` | `SessionStart` | INSERT sessions (id, repo, branch, ticket_iid, session_type) |
| `devmetrics-post-tool-use.ts` | `PostToolUse *` | INSERT events (tool, success, duration_ms, redacted meta) |
| `devmetrics-notify.ts` | `PreToolUse Bash` | Detects toil_loops in real time, writes to stdout if DEVMETRICS_ACTIVE=1 |
| `devmetrics-stop.ts` | `Stop *` | UPDATE sessions.ended_at + launches analyze-daily.ts in background |

All hooks are written in pure TypeScript, executed via `node --no-warnings --experimental-strip-types` (Node 24). No build step.

### 1.2 Telemetry Layer (`scripts/dev/telemetry/`)

| File | Role |
|---|---|
| `schema.sql` | Idempotent DDL (5 tables, 6 indexes), applied on every DB open |
| `db.ts` | `openDb()` / `closeDb()` / `writeSession()` / `closeSession()` / `writeEvent()`: DatabaseSync wrapper + idempotent migrations |
| `redact.ts` | `redactSecrets()` + `redactCmd()`: sanitizes bash commands before storage (tokens, passwords, URLs, JWTs, hex strings) |
| `patterns.ts` | SQL queries: `detectToilLoops()`, `detectRetryStorms()`, `detectColdReads()`, `computeVelocity()` + exclusion lists |
| `token-parser.ts` | Parses JSONL transcripts from `~/.claude/projects/`, aggregates by day/origin, upserts into `token_usage`, detects cache_read/output ratio drift |
| `package.json` | `{"type":"module"}`: enables ES modules in this subdirectory |
| `db.test.ts` | Vitest tests: schema, writeSession/Event, idempotence, repo isolation |
| `redact.test.ts` | Redaction pattern tests |
| `patterns.test.ts` | SQL tests for detectToilLoops/RetryStorms/ColdReads/Velocity |
| `token-parser.test.ts` | Tests for aggregateTranscripts, upsertTokenUsage, detectTokenDrift |

### 1.3 Analysis Scripts (`scripts/dev/`)

| File | Role |
|---|---|
| `analyze-daily.ts` | Generates `docs/dev-metrics/daily-YYYY-MM-DD.md`: velocity, frictions, tokens, toil score /20. Exportable as a lib (`generateDailyReport(opts)`). Launched automatically by devmetrics-stop.ts. |
| `analyze-weekly.ts` | Calls Claude API (claude-opus-4-7, 2048 tokens) for a weekly synthesis + generates skill proposals in `.claude/skills/proposed/` |
| `daily-improve.ts` | Interactive CLI (stdout): aggregates daily report, patterns over N days, memory state, stale worktrees, skill proposals, cycle daemon skip patterns, recurring scopes, token cost. Entry point for the `/daily-improve` workflow. |
| `analyze-daily.test.ts` | Tests for Markdown generation (tables, conditional sections) |

### 1.4 Live Statusline (`scripts/dev/agents-status.ts`)

Single script of ~610 lines, invoked by `settings.json#statusLine` every 30 seconds. Displays a single ANSI line:

```
🪨 Project · branch · 🧠 Model ctx_used/ctx_max · 🤖 [actions agents] N agents · 🌳 X/cap worktrees · 📥 X/cap MRs · 🎫 48▶ 2⚙ 6👀 /56 · 💤 N dirty
```

Sections:
- **Project name**: from `package.json#name` or `basename(CLAUDE_PROJECT_DIR)`
- **Branch**: `git rev-parse --abbrev-ref HEAD`
- **Model + context**: parses JSONL transcript for the last usage block
- **Subagents**: scans `/tmp/claude-UID/*/tasks/*.output` (modified < 90s), parses last tool_use
- **Cycle agents**: `pgrep -a -f 'claude' | grep -c 'granit-golem-wt-'` (strong coupling)
- **Worktrees**: `ls` parent dir for `<base>-wt-*`
- **MRs**: GitLab REST API (cached 60s in `/tmp/granit-mrs-UID.json`)
- **Issues**: 4 GitLab HEAD calls (total + ready-to-dev + in-progress + needs-review, cached 5min)

### 1.5 Claude Code Commands (`.claude/commands/`)

| File | devmetrics link |
|---|---|
| `daily-improve.md` | /daily-improve workflow: reads daily report + patterns, executes corrective actions, commits `chore(devmetrics): …` |
| `dispatch-tickets.md` | Indirect reference (mentions cycle metrics, not devmetrics directly) |

Adjacent commands that consume data from scripts related to daily-improve:
- `recidive-root-cause.md`: triggered by `retro-fixes.ts` threshold
- `quality-sweep.md`: reads `review-patterns.ts`
- `add-bug.md`: calls `retro-fixes.ts`

### 1.6 Database

- **Path**: `~/.claude/devmetrics.db` (global, scoped by `repo` column)
- **Initialization**: idempotent DDL applied on every `openDb()`, no manual install step
- **WAL mode** + `busy_timeout = 5000` (concurrent hooks ↔ analysis scripts)
- **Second DB**: `<project_root>/cycle-metrics.db`: belongs to the Cycle daemon (out of devmetrics core scope, but consumed by `daily-improve.ts` for token cost and skip patterns)

### 1.7 Wiring in `settings.json`

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx tsx $CLAUDE_PROJECT_DIR/scripts/dev/agents-status.ts",
    "refreshInterval": 30
  },
  "hooks": {
    "SessionStart": [{ "matcher": "*", "command": "node --no-warnings --experimental-strip-types $CLAUDE_PROJECT_DIR/.claude/hooks/devmetrics-session-start.ts" }],
    "PreToolUse":   [{ "matcher": "Bash", "command": "node --no-warnings --experimental-strip-types $CLAUDE_PROJECT_DIR/.claude/hooks/devmetrics-notify.ts" }],
    "PostToolUse":  [{ "matcher": "*",    "command": "node --no-warnings --experimental-strip-types $CLAUDE_PROJECT_DIR/.claude/hooks/devmetrics-post-tool-use.ts" }],
    "Stop":         [{ "matcher": "*",    "command": "node --no-warnings --experimental-strip-types $CLAUDE_PROJECT_DIR/.claude/hooks/devmetrics-stop.ts" }]
  }
}
```

Env vars read:
- `DEVMETRICS_ACTIVE` (0/1): enables inline toil notifications from `devmetrics-notify.ts`
- `DEVMETRICS_LEVEL` (`full` / `warn_only`): toil loop threshold: 3 (full) or 5 (warn_only)
- `CLAUDE_PROJECT_DIR`: project root (used in all hooks)
- `GITLAB_TOKEN`: for MRs + issues in statusline (optional)
- `GITLAB_PROJECT_ID`: fallback `<project-id>` (strong coupling)
- `WT_BUDGET_CAP`, `MR_BUDGET_CAP`, `CYCLE_MAX_AGENTS`: statusline caps

---

## 2. SQLite Data Model

### Table `sessions`
```sql
id           TEXT PRIMARY KEY          -- Claude Code session_id
started_at   DATETIME DEFAULT now      -- auto
ended_at     DATETIME                  -- updated by devmetrics-stop.ts
repo         TEXT NOT NULL DEFAULT ''  -- basename(CLAUDE_PROJECT_DIR) without -wt-N suffix
git_branch   TEXT                      -- HEAD at startup
ticket_iid   INTEGER                   -- extracted from branch via regex feat|fix\/(\d+)
session_type TEXT DEFAULT 'main'       -- CHECK IN ('main', 'worktree')
```

### Table `events`
```sql
id           INTEGER PK AUTOINCREMENT
session_id   TEXT REFERENCES sessions(id)
ts           DATETIME DEFAULT now
tool         TEXT NOT NULL             -- Bash, Edit, Read, Write, Skill, Agent, ...
success      INTEGER DEFAULT 1         -- 0 if is_error
duration_ms  INTEGER                   -- provided by Claude Code
meta         TEXT DEFAULT '{}'         -- JSON: cmd (redacted), file, skill, subagent_type
```

**PII / Redaction**: the `meta.cmd` field goes through `redactCmd()` before storage. Redaction covers: GitLab/GitHub/Jira tokens, env vars `*TOKEN*/*KEY*/*SECRET*`, URLs with credentials, JWTs, hex strings ≥ 32 chars. The result is truncated to 60 characters.

### Table `patterns`
```sql
id            INTEGER PK AUTOINCREMENT
detected_at   DATETIME DEFAULT now
repo          TEXT NOT NULL DEFAULT ''
cadence       TEXT CHECK IN ('daily','weekly')
pattern_type  TEXT NOT NULL
score         INTEGER DEFAULT 0
context       TEXT DEFAULT '{}'
proposal_path TEXT                     -- path to .claude/skills/proposed/*.md
```
Note: this table is in the schema but **not currently populated** (patterns are computed on the fly via SQL in patterns.ts, not persisted).

### Table `ticket_metrics`
```sql
iid           INTEGER NOT NULL
repo          TEXT NOT NULL
title         TEXT
opened_at     DATETIME
first_session DATETIME
merged_at     DATETIME
session_count INTEGER DEFAULT 0
fix_commits   INTEGER DEFAULT 0
ci_failures   INTEGER DEFAULT 0
scope         TEXT
PRIMARY KEY (iid, repo)
```
Note: present in the schema, not automatically populated.

### Table `token_usage`
```sql
date          TEXT NOT NULL             -- YYYY-MM-DD
origin        TEXT CHECK IN ('main', 'worktree')
input_tokens  INTEGER DEFAULT 0
output_tokens INTEGER DEFAULT 0
cache_read    INTEGER DEFAULT 0
cache_creation INTEGER DEFAULT 0
nb_messages   INTEGER DEFAULT 0
nb_sessions   INTEGER DEFAULT 0
PRIMARY KEY (date, origin)
```
Populated by `token-parser.ts` during daily analysis, from JSONL transcripts in `~/.claude/projects/`.

---

## 3. User Surface: Analysis Commands

| Command | Trigger | Output | Usage |
|---|---|---|---|
| Auto on each Stop | `devmetrics-stop.ts` | `docs/dev-metrics/daily-YYYY-MM-DD.md` | Daily friction report |
| `npx tsx scripts/dev/analyze-daily.ts` | Manual / CLI | Same MD file | Manual regeneration |
| `npx tsx scripts/dev/daily-improve.ts [--days N]` | `/daily-improve` | Structured stdout (console) | Summary + recommended actions |
| `npx tsx scripts/dev/analyze-weekly.ts` | Manual (weekly) | `docs/dev-metrics/weekly-YYYY-WNN.md` + proposals in `.claude/skills/proposed/` | LLM synthesis + skill proposals |
| `npx tsx $PROJECT/scripts/dev/agents-status.ts` | statusLine (every 30s) | ANSI stdout line | Live dashboard at the bottom of the UI |

**Daily report (content)**:
- Velocity: sessions, tool calls, failures, avg duration, main/worktree breakdown
- Frictions: toil_loops (cmd ≥ 3×), retry_storms (edit/bash ≥ 4× same file), cold_reads (read ≥ 3×)
- Filtering patterns on paths that no longer exist (completed worktrees)
- Toil score /20
- Claude token consumption (input/output/cache_read/cache_creation, by origin + total, cache efficiency ratio)
- Drift alert: if cache_read/output ratio > 2× 7-day median

**Daily-improve report (content)**:
- Full daily report (above, extracted from MD file)
- Friction patterns over N days (default 7)
- Memory state at `~/.claude/projects/-home-user-lab-granit-golem/memory/` (EXPIRED / NO_TTL)
- Worktrees to clean up (merged MRs not finalized)
- Pending skill proposals in `.claude/skills/proposed/`
- Cycle daemon skip patterns (reads `cycle-metrics.db`)
- Recurring scopes (`retro-fixes.ts` via git log)
- Token cost (`cycle-metrics.db#agent_runs`)
- Numbered list of recommended actions (🔴/🟡/⚪)

---

## 4. Boundaries: Generic vs Coupled vs Discard

### Entirely Generic (portable as-is)

- `schema.sql`: universal tables, `repo` as partition key
- `db.ts`: no project-specific references
- `redact.ts`: universal redaction patterns (GitLab/GitHub/Jira tokens, JWTs…)
- `patterns.ts`: pure SQL queries, parameterized by `repo` and `hoursBack`; only `TOIL_EXCLUSION_PREFIXES` / `TOIL_EXCLUSION_CONTAINS` lists need parameterization
- `devmetrics-post-tool-use.ts`: generic capture of all events
- `devmetrics-stop.ts`: only the `analyze-daily.ts` script path is hardcoded via `CLAUDE_PROJECT_DIR`
- `devmetrics-session-start.ts`: only the ticket regex `(?:feat|fix)\/(\d+)` is coupled to GitLab convention

### Needs Parameterization (per-project configuration)

| Coupling point | File | Suggested parameter |
|---|---|---|
| Ticket branch regex `(?:feat|fix)\/(\d+)` | `devmetrics-session-start.ts` | `DEVMETRICS_TICKET_REGEX` (env var or config) |
| `MAIN_DIR_PATTERN` / `WORKTREE_DIR_PATTERN` | `token-parser.ts` | Derived from the project's absolute path (computable dynamically from `CLAUDE_PROJECT_DIR`) |
| `TOIL_EXCLUSION_PREFIXES` / `TOIL_EXCLUSION_CONTAINS` | `patterns.ts` | Per-project config file `.devmetrics.json` |
| Output directory `docs/dev-metrics/` | `analyze-daily.ts`, `analyze-weekly.ts` | `DEVMETRICS_OUT_DIR` (env var, default `docs/dev-metrics`) |
| Memory directory `~/.claude/projects/-home-user-lab-granit-golem/memory` | `daily-improve.ts` | Computable from `CLAUDE_PROJECT_DIR` + `~/.claude/projects/` |
| Proposals directory `.claude/skills/proposed/` | `analyze-weekly.ts`, `daily-improve.ts` | Configurable (relative to `CLAUDE_PROJECT_DIR`) |

### Strongly Coupled to granit-golem (to adapt / decouple)

#### Coupling 1, `agents-status.ts`: GitLab project and named worktrees

```typescript
const PROJECT_ID = process.env.GITLAB_PROJECT_ID || '<project-id>'  // hardcoded ID
safeRun("pgrep -a -f 'claude' | grep -c 'granit-golem-wt-'")  // hardcoded name
```

The worktree detection pattern `granit-golem-wt-*` and the GitLab ID `<project-id>` are hardcoded. Resolution: derive the pattern from `CLAUDE_PROJECT_DIR`, make `GITLAB_PROJECT_ID` required (no fallback).

#### Coupling 2, `token-parser.ts`: hardcoded `.claude/projects/` paths

```typescript
const MAIN_DIR_PATTERN = /^-home-user-lab-granit-golem$/
const WORKTREE_DIR_PATTERN = /^-home-user-lab-granit-golem-wt-/
```

These patterns are computed from the project's absolute path (`~/lab/granit-golem` → `-home-user-lab-granit-golem`). Resolution: compute dynamically from `CLAUDE_PROJECT_DIR` by replacing `/` with `-`.

#### Coupling 3, `daily-improve.ts` + `analyze-weekly.ts`: dependency on the Cycle daemon

`daily-improve.ts` imports `openMetricsDb` from `./cycle/metrics` (which opens `cycle-metrics.db` at the project root). `analyze-weekly.ts` uses `@anthropic-ai/sdk` via Anthropic. These two components are not part of the core devmetrics but depend on it in the /daily-improve workflow.

To decouple:
- The "cycle token cost" section of `daily-improve.ts` is optional (try/catch); it can be removed for a standalone plugin
- `analyze-weekly.ts` requires `ANTHROPIC_API_KEY` and the Anthropic SDK

#### Coupling 4, `patterns.ts`: granit-specific exclusions

```typescript
'curl -s "https://gitlab.com/api/v4/projects/<project-id>/pipelin',
"export $(grep -v '^#' ~/lab/granit-golem/.env",
'npx tsx scripts/ci/gitlab-cli.ts',
```

These toil exclusions are project-specific. In a plugin, they must live in a configuration file (`DEVMETRICS_EXCLUSIONS` or `.devmetrics.json`).

### Discard (non-portable)

- GitLab MRs and Issues sections of `agents-status.ts`: specific to GitLab + token + project ID; make optional behind feature flags
- "Cycle agents" section of `agents-status.ts`: coupled to the granit-golem Cycle daemon
- `daily-improve.ts` (entire file): too coupled (memories, worktrees, cycle skip events, retro-fixes on git); to be split into layers in the plugin
- `analyze-weekly.ts`: depends on `@anthropic-ai/sdk` and the Cycle daemon; optional feature

---

## 5. Runtime Dependencies

### Node / TypeScript

| Dependency | Version | Notes |
|---|---|---|
| Node.js | **≥ 24** required | `node:sqlite` is experimental Node 22+, stable in Node 24. `--experimental-strip-types` available Node 22+. |
| `node:sqlite` | Builtin Node 22+ (experimental) | `ExperimentalWarning` in Node < 24 but functional. **Critical: no npm package fallback.** |
| `tsx` / `npx tsx` | Required for `analyze-weekly.ts`, `daily-improve.ts`, statusline | Core hooks use `--experimental-strip-types` (no tsx) |
| `@anthropic-ai/sdk` | For `analyze-weekly.ts` only | Optional feature |

### System Binaries

| Binary | Used in | Required |
|---|---|---|
| `git` | `devmetrics-session-start.ts`, `agents-status.ts`, `retro-fixes.ts` | Yes |
| `jq` | `analyze-weekly.ts`, shell hooks in settings.json | For some features |
| `curl` | `agents-status.ts` (GitLab MRs/issues) | Optional (GitLab feature) |
| `pgrep` | `agents-status.ts` (cycle agents) | Optional |
| `notify-send` | `SubagentStop` hook in settings.json | Optional (Linux desktop) |
| `npx` | Launching analysis scripts from stop hook | Yes |

### Environment Variables

| Variable | Required | Default | Role |
|---|---|---|---|
| `CLAUDE_PROJECT_DIR` | Yes | `process.cwd()` | Project root, injected by Claude Code |
| `DEVMETRICS_ACTIVE` | No | `'0'` | Enables inline toil notifications |
| `DEVMETRICS_LEVEL` | No | `'full'` | Toil threshold: full=3, warn_only=5 |
| `GITLAB_TOKEN` | No | (none) | MRs/Issues in statusline |
| `GITLAB_PROJECT_ID` | No | `'<project-id>'` (coupling!) | GitLab project ID |
| `WT_BUDGET_CAP` | No | `6` | Worktree cap in statusline |
| `MR_BUDGET_CAP` | No | `5` | MR cap in statusline |
| `CYCLE_MAX_AGENTS` | No | `2` | Cycle agent cap in statusline |

---

## 6. Plugin Scoping

### 6.1 Core Pack Scope (v1.0)

The minimal portable pack includes:

```
devmetrics-plugin/
  hooks/
    devmetrics-session-start.ts      # SessionStart: insert session
    devmetrics-post-tool-use.ts      # PostToolUse: insert event
    devmetrics-stop.ts               # Stop: close session + launch analyze
    devmetrics-notify.ts             # PreToolUse Bash: toil alert
  telemetry/
    schema.sql                       # Idempotent DDL
    db.ts                            # openDb/closeDb/writeSession/writeEvent
    redact.ts                        # redactSecrets/redactCmd
    patterns.ts                      # detectToilLoops/RetryStorms/ColdReads/computeVelocity
    token-parser.ts                  # aggregateTranscripts/upsertTokenUsage/detectTokenDrift
  scripts/
    analyze-daily.ts                 # Generates daily-YYYY-MM-DD.md
    agents-status.ts                 # Statusline (generic version, no hardcoded GitLab)
  config/
    .devmetrics.json                 # Toil exclusions, out_dir, ticket_regex, gitlab_project_id
  commands/
    devmetrics-daily.md              # /devmetrics-daily: view today's report
    devmetrics-improve.md            # /devmetrics-improve: improved workflow (without cycle)
  install.ts                         # Install script: copies hooks, patches settings.json
```

### 6.2 Optional Pack v1.1 (LLM feature)

```
  scripts/
    analyze-weekly.ts                # Weekly LLM synthesis: requires ANTHROPIC_API_KEY
```

### 6.3 Out of Plugin Scope

- `daily-improve.ts` (cycle/granit memories coupling): to be rewritten for the plugin
- GitLab MRs/Issues sections of `agents-status.ts`: optional feature flag
- "Cycle agents" section of `agents-status.ts`: specific to the Cycle daemon
- `cycle-metrics.db` and all `scripts/dev/cycle/`: belongs to the separate Cycle plugin
- `retro-fixes.ts` / `review-patterns.ts`: depend on git log and cycle_events respectively

---

## 7. Risks and Effort Estimate

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `node:sqlite` experimental in Node 22, absent in Node < 22 | High | Document Node ≥ 22 required; add install check |
| `token-parser.ts`: hardcoded `-home-user-lab-` patterns + hardcoded tests | Medium | Dynamic computation from `CLAUDE_PROJECT_DIR` (1-2h) |
| `agents-status.ts`: hardcoded `pgrep … grep -c 'granit-golem-wt-'` | Medium | Derive from `basename(CLAUDE_PROJECT_DIR)` (30min) |
| DB contention: hooks open DB concurrently | Low | Already handled: WAL + busy_timeout 5000ms |
| `analyze-weekly.ts` consumes `@anthropic-ai/sdk`: API cost | Low | Optional feature behind flag |
| `daily-improve.ts`: hardcoded memories (`-home-user-lab-granit-golem`) | High | Recompute from `CLAUDE_PROJECT_DIR`; entire section to rewrite |

### Effort Estimate

| Batch | Content | Estimated effort |
|---|---|---|
| **Batch 1: Portable core** | schema.sql, db.ts, redact.ts, patterns.ts, 4 hooks (session-start, post-tool-use, stop, notify), analyze-daily.ts, adapted existing tests, install.ts | **1-2 days** |
| **Batch 2: Generic token-parser** | Replace hardcoded regex patterns with dynamic computation, adapt tests | **2-4h** |
| **Batch 3: Generic agents-status** | Remove hardcoded `granit-golem-wt-` and `<project-id>`, make GitLab optional, extract core statusline section | **4-6h** |
| **Batch 4: Config + commands** | `.devmetrics.json`, `/devmetrics-daily`, `/devmetrics-improve` (without cycle), configurable TOIL_EXCLUSIONS | **4-6h** |
| **Batch 5: Optional analyze-weekly** | Decouple from cycle-metrics.db, make ANTHROPIC_API_KEY optional, adapt tests | **2-4h** |
| **TOTAL** | | **~3-4 days** |

---

## 8. Summary

The granit-golem devmetrics stack is a cohesive, well-separated architecture:
- **Collection layer** (4 Claude Code hooks): 90% generic
- **Storage layer** (SQLite, schema.sql, db.ts): 100% portable
- **Redaction layer** (redact.ts): 100% portable
- **Detection layer** (patterns.ts): 80% portable (exclusion lists to externalize)
- **Analysis layer** (analyze-daily.ts): 90% portable (outDir parameterizable)
- **Live layer** (agents-status.ts): 70% portable (3 hardcodes to fix)
- **Workflow layer** (daily-improve.ts): 60% coupled (cycle daemon, granit memories)

The 3 largest coupling points to decouple are documented in section 4 (Boundaries).
