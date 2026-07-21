import { createRequire } from "node:module";
import { chmodSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dbPath } from "./config.ts";

// node:sqlite loaded via native require: prevents Vite/Vitest from trying to
// resolve/bundle it (it would rewrite "node:sqlite" → "sqlite", which doesn't exist).
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

/**
 * Silences the `node:sqlite` ExperimentalWarning, which Node still emits on 22 and 24.
 *
 * Hooks never showed it only by accident: they end on `process.exit(0)`, which wins the
 * race against the warning's asynchronous emission. Anything that does not exit at once —
 * the status line, refreshed every 30 s — would otherwise print it on every run. Every
 * other warning is preserved and still reaches stderr.
 */
function silenceSqliteExperimentalWarning(): void {
  process.removeAllListeners("warning");
  process.on("warning", (w) => {
    const isSqliteExperimental = w.name === "ExperimentalWarning" && w.message.includes("SQLite");
    if (!isSqliteExperimental) process.stderr.write(`${w.stack ?? `${w.name}: ${w.message}`}\n`);
  });
}
silenceSqliteExperimentalWarning();

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");

/**
 * Schema generation, stamped into `PRAGMA user_version`. Bump when a change is
 * NOT purely additive (a rename or a PRIMARY KEY change that `CREATE TABLE IF
 * NOT EXISTS` cannot reconcile on its own) and pair the bump with reconciliation
 * logic in `openDb`. v2 added `repo` to the `token_usage` primary key.
 */
const SCHEMA_VERSION = 2;

// Re-exported type so consumers can type their variables.
export type ChardonDb = InstanceType<typeof DatabaseSync>;

/**
 * Opens the SQLite database and applies the schema (idempotent).
 * Path resolved via `dbPath()` (env CHARDON_DB or ~/.claude/chardon.db).
 */
export function openDb(): ChardonDb {
  const path = dbPath();
  const db = new DatabaseSync(path);
  // Harden permissions: the DB holds command fragments and file paths. Owner-only
  // (0600) so it is not world-readable on a shared machine. Best-effort — never throw.
  try {
    chmodSync(path, 0o600);
  } catch {
    // Ignore (e.g. path is a special file or filesystem without POSIX perms).
  }
  // busy_timeout first: hooks and analysis scripts open the DB concurrently —
  // without it any lock causes the init to fail.
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  const schema = readFileSync(SCHEMA_PATH, "utf-8");

  // A pre-686a939 token_usage (no repo column) must be renamed away *before* the
  // schema runs, so CREATE TABLE creates the correct table; legacy rows are then
  // copied over. The schema exec carries PRAGMAs, so it cannot run in a
  // transaction — hence the rename happens outside one.
  const needsBackfill = tokenUsageMissingRepo(db);
  if (needsBackfill) db.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy");

  db.exec(schema);

  if (needsBackfill) backfillTokenUsageRepo(db);

  // Stamp the schema generation so future non-additive drifts are detectable.
  // PRAGMA takes no bind parameters; the value is an internal integer constant.
  const stamped = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (stamped !== SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

/** Returns the schema generation stamped in the DB (`PRAGMA user_version`). */
export function schemaVersion(db: ChardonDb): number {
  return (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
}

/**
 * True when a `token_usage` table exists but lacks the `repo` column (a DB
 * created before commit 686a939, which added `repo` to the table's PRIMARY KEY).
 * False for a fresh DB where the table does not exist yet — the schema will
 * create it correctly.
 */
function tokenUsageMissingRepo(db: ChardonDb): boolean {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'")
    .get();
  if (!exists) return false;
  const columns = db.prepare("PRAGMA table_info(token_usage)").all() as { name: string }[];
  return !columns.some((c) => c.name === "repo");
}

/**
 * Copies rows from a renamed legacy `token_usage` into the freshly-created one,
 * scoping them as `repo = ''` (unscoped historical data), then drops the legacy
 * table. `CREATE TABLE IF NOT EXISTS` cannot add a PRIMARY KEY column in place,
 * so a rebuild is the only way; without it every write hits
 * `ON CONFLICT(date, origin, repo)` against a missing column and throws.
 * Wrapped in a transaction so a mid-copy failure leaves the legacy table intact.
 */
function backfillTokenUsageRepo(db: ChardonDb): void {
  db.exec("BEGIN");
  try {
    db.exec(
      `INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`,
    );
    db.exec("DROP TABLE token_usage_legacy");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Closes the SQLite connection, ignoring errors (e.g. double-close). */
export function closeDb(db: ChardonDb): void {
  try {
    db.close();
  } catch {
    // Ignore: double-close or already-closed DB.
  }
}

/**
 * Inserts a session (INSERT OR IGNORE — idempotent on id).
 * Optional fields `gitBranch` and `ticketIid` are accepted but nullable.
 */
export function writeSession(
  db: ChardonDb,
  s: {
    id: string;
    repo: string;
    gitBranch?: string;
    ticketIid?: number;
    sessionType: "main" | "worktree";
  },
): void {
  db.prepare(
    `INSERT OR IGNORE INTO sessions (id, repo, git_branch, ticket_iid, session_type)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(s.id, s.repo, s.gitBranch ?? null, s.ticketIid ?? null, s.sessionType);
}

/**
 * Sets `ended_at` on an existing session.
 * `endedAt` must be an ISO-8601 string.
 */
export function closeSession(db: ChardonDb, id: string, endedAt: string): void {
  db.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(endedAt, id);
}

/**
 * Records a collection outcome for today (`ok` or `failed`) in `hook_health`,
 * so the daily report can surface silent fail-open failures. Uses SQLite's own
 * `date('now')` — this is telemetry, not a value under test. Parameterized.
 */
export function recordHealth(db: ChardonDb, repo: string, ok: boolean): void {
  const col = ok ? "ok" : "failed";
  db.prepare(
    `INSERT INTO hook_health (date, repo, ok, failed)
     VALUES (date('now'), ?, ?, ?)
     ON CONFLICT(date, repo) DO UPDATE SET ${col} = ${col} + 1`,
  ).run(repo, ok ? 1 : 0, ok ? 0 : 1);
}

/** Reads the `(ok, failed)` collection counts for a repo on a given date. */
export function readHealth(db: ChardonDb, repo: string, date: string): { ok: number; failed: number } {
  const row = db
    .prepare(`SELECT ok, failed FROM hook_health WHERE repo = ? AND date = ?`)
    .get(repo, date) as { ok: number; failed: number } | undefined;
  return row ?? { ok: 0, failed: 0 };
}

/**
 * Inserts a tool event into the `events` table.
 * `meta` is serialized to JSON; `success` is converted to a SQLite integer.
 */
export function writeEvent(
  db: ChardonDb,
  e: {
    sessionId: string;
    tool: string;
    success: boolean;
    durationMs?: number;
    meta?: object;
  },
): void {
  db.prepare(
    `INSERT INTO events (session_id, tool, success, duration_ms, meta)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    e.sessionId,
    e.tool,
    e.success ? 1 : 0,
    e.durationMs ?? null,
    JSON.stringify(e.meta ?? {}),
  );
}
