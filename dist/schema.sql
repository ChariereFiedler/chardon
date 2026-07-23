-- Chardon — SQLite schema (idempotent, applied on every openDb() call).
-- Global DB at ~/.claude/chardon.db (override: CHARDON_DB env var), scoped per `repo` column.
-- WAL mode + busy_timeout for concurrent access between hooks and analysis scripts.
--
-- Data sensitivity classification (per the `secure-logging` rule). No PII is stored.
-- The DB file is created 0600 (owner-only). History is bounded by the purge command
-- (retentionDays). Highest sensitivity is Internal — no secrets or credentials, ever.
--   Public   : repo, tool, success, ts, counts, token totals, dates, status
--   Internal : git_branch, ticket_iid, events.meta (cmd is REDACTED via lib/redact.ts
--              then truncated; file paths truncated to 80 chars; skill/subagent names),
--              hook_health.last_error (redacted via lib/redact.ts then truncated);
--              purge_log (purge timestamps, retention window, per-table removal counts
--              · no PII);
--              nudges.kind, nudges.target (may hold a redacted command);
--              sessions.root_hash (12-hex sha256 prefix of the project root path,
--              for slug-collision detection · the path itself is never stored)
-- Any new column MUST be classified here before it ships.

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
-- NORMAL is the SQLite-recommended durability for WAL: one fewer fsync per write
-- (loses only the last unsynced write on power loss — acceptable for monitoring data).
PRAGMA synchronous = NORMAL;

-- A Claude Code session.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,                 -- Claude Code session_id
  started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at     DATETIME,                         -- set by the Stop hook
  repo         TEXT NOT NULL DEFAULT '',         -- basename(CLAUDE_PROJECT_DIR) without worktree suffix
  git_branch   TEXT,
  ticket_iid   INTEGER,                          -- extracted from branch via configurable ticketRegex
  session_type TEXT NOT NULL DEFAULT 'main' CHECK (session_type IN ('main', 'worktree')),
  root_hash    TEXT                              -- short hash of the project root path (slug-collision detection)
);

-- A tool usage event within a session.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT REFERENCES sessions(id),
  ts          DATETIME DEFAULT CURRENT_TIMESTAMP,
  tool        TEXT NOT NULL,                     -- Bash, Edit, Read, Write, Skill, Agent, ...
  success     INTEGER NOT NULL DEFAULT 1,        -- 0 if is_error
  duration_ms INTEGER,
  meta        TEXT NOT NULL DEFAULT '{}'         -- JSON: cmd (redacted), file, skill, subagent_type
);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_tool ON events(tool);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

-- A detected friction pattern (persisted when an action targets it — ROI tracking).
CREATE TABLE IF NOT EXISTS patterns (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  detected_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  repo          TEXT NOT NULL DEFAULT '',
  cadence       TEXT CHECK (cadence IN ('daily', 'weekly')),
  pattern_type  TEXT NOT NULL,                   -- toil_loop, retry_storm, cold_read, ...
  score         INTEGER NOT NULL DEFAULT 0,
  context       TEXT NOT NULL DEFAULT '{}',
  proposal_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_patterns_repo ON patterns(repo);

-- Ticket lifecycle metrics (populated over time — workflow analysis axis).
CREATE TABLE IF NOT EXISTS ticket_metrics (
  iid           INTEGER NOT NULL,
  repo          TEXT NOT NULL,
  title         TEXT,
  opened_at     DATETIME,
  first_session DATETIME,
  merged_at     DATETIME,
  session_count INTEGER NOT NULL DEFAULT 0,
  fix_commits   INTEGER NOT NULL DEFAULT 0,
  ci_failures   INTEGER NOT NULL DEFAULT 0,
  scope         TEXT,
  PRIMARY KEY (iid, repo)
);

-- Token consumption aggregated by day/origin/repo (token cost axis).
CREATE TABLE IF NOT EXISTS token_usage (
  date           TEXT NOT NULL,                  -- YYYY-MM-DD
  origin         TEXT NOT NULL CHECK (origin IN ('main', 'worktree')),
  repo           TEXT NOT NULL DEFAULT '',       -- repoSlug(projectDir)
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_read     INTEGER NOT NULL DEFAULT 0,
  cache_creation INTEGER NOT NULL DEFAULT 0,
  nb_messages    INTEGER NOT NULL DEFAULT 0,
  nb_sessions    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, origin, repo)
);

-- Recommended action and its closed-loop tracking (self-improvement axis — ROI measurement).
CREATE TABLE IF NOT EXISTS actions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  proposed_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  repo         TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL,                    -- enable-hook | split-file | propose-skill | ...
  target       TEXT,                             -- file/scope/artifact targeted
  pattern_type TEXT,                             -- friction pattern being addressed
  baseline     INTEGER,                          -- friction metric at proposal time
  status       TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'applied', 'measured', 'dropped')),
  applied_at   DATETIME,
  after_metric INTEGER                           -- metric after application (ROI)
);
CREATE INDEX IF NOT EXISTS idx_actions_repo ON actions(repo);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);

-- Real-time nudge dedupe (Internal): one row per alert emitted by the notify
-- hook, keyed by day/repo/kind/target so each alert fires at most once per day.
CREATE TABLE IF NOT EXISTS nudges (
  date   TEXT NOT NULL,                           -- YYYY-MM-DD
  repo   TEXT NOT NULL,
  kind   TEXT NOT NULL,                           -- toil | failing-cmd | slow-cmd | budget-80 | budget-100
  target TEXT NOT NULL,                           -- redacted command, or a fixed marker for budget kinds
  PRIMARY KEY (date, repo, kind, target)
);

-- Audit trail of retention purges (Internal, no PII): one row per purge run,
-- whether triggered explicitly (/chardon-purge) or opportunistically by the Stop
-- hook. Also drives the once-a-day auto-purge throttle (lib/retention.ts).
CREATE TABLE IF NOT EXISTS purge_log (
  id             INTEGER PRIMARY KEY,
  ts             TEXT NOT NULL,                   -- ISO-8601 time of the purge
  repo           TEXT NOT NULL,
  retention_days INTEGER NOT NULL,
  events         INTEGER NOT NULL,                -- rows removed per table
  sessions       INTEGER NOT NULL,
  token_usage    INTEGER NOT NULL
);

-- Collection self-health (Public): counts of successful vs failed hook writes per
-- day/repo, so the daily report can surface silent fail-open failures. A DB that
-- cannot even open is not counted here (nothing to write to) — that path relies on
-- CHARDON_DEBUG stderr instead.
CREATE TABLE IF NOT EXISTS hook_health (
  date       TEXT NOT NULL,
  repo       TEXT NOT NULL DEFAULT '',
  ok         INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,                               -- Internal: last swallowed error, redacted then truncated
  PRIMARY KEY (date, repo)
);
