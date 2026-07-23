import type { ChardonDb } from "./db.ts";

export interface PurgeResult {
  events: number;
  sessions: number;
  tokenUsage: number;
  nudges: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Minimum delay between two automatic purges of the same repo (once a day). */
const AUTO_PURGE_MIN_INTERVAL_MS = MS_PER_DAY;

/**
 * Removes history older than `retentionDays` for the given `repo` only, then
 * reclaims space with VACUUM. Scoping matters: the DB is shared by every
 * project, and `retentionDays` comes from ONE project's config — applying it
 * DB-wide would destroy other repos' history. Order matters for the FK
 * `events.session_id`: old events go first, then sessions that no event still
 * references. `events` has no `repo` column; it is scoped through its session.
 * `token_usage`, `nudges` and `purge_log` are day/repo scoped and purged directly.
 *
 * Every run is recorded in `purge_log` (even a no-op one: simpler to reason
 * about, and the row doubles as the auto-purge throttle marker).
 *
 * The cutoff is derived from the injected `now` (never `new Date()` internally),
 * and every value is bound as a `?` parameter. Returns the number of rows removed.
 */
export function purgeOldData(
  db: ChardonDb,
  retentionDays: number,
  now: Date,
  repo: string,
): PurgeResult {
  const cutoff = new Date(now.getTime() - retentionDays * MS_PER_DAY).toISOString();
  const cutoffDate = cutoff.slice(0, 10);

  const events = db
    .prepare(
      `DELETE FROM events
       WHERE ts < ?
         AND session_id IN (SELECT id FROM sessions WHERE repo = ?)`,
    )
    .run(cutoff, repo).changes as number;

  // Only drop sessions no surviving event references (keeps FK integrity).
  const sessions = db
    .prepare(
      `DELETE FROM sessions
       WHERE repo = ?
         AND started_at < ?
         AND id NOT IN (SELECT session_id FROM events WHERE session_id IS NOT NULL)`,
    )
    .run(repo, cutoff).changes as number;

  const tokenUsage = db
    .prepare(`DELETE FROM token_usage WHERE repo = ? AND date < ?`)
    .run(repo, cutoffDate).changes as number;

  // Nudge dedupe rows may hold a redacted command: same retention as the rest.
  const nudges = db
    .prepare(`DELETE FROM nudges WHERE repo = ? AND date < ?`)
    .run(repo, cutoffDate).changes as number;

  // The purge audit trail follows the same window; the auto-purge throttle only
  // needs the last 24h, so trimming past retention is always safe.
  db.prepare(`DELETE FROM purge_log WHERE repo = ? AND ts < ?`).run(repo, cutoff);

  db.prepare(
    `INSERT INTO purge_log (ts, repo, retention_days, events, sessions, token_usage)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(now.toISOString(), repo, retentionDays, events, sessions, tokenUsage);

  db.exec("VACUUM");

  return { events, sessions, tokenUsage, nudges };
}

/**
 * True when an opportunistic purge is worth running for `repo`: no purge was
 * logged for it in the last 24h (throttle, whatever its trigger), and at least
 * one of its sessions is older than `retentionDays`. Clock injected via `now`.
 */
export function shouldAutoPurge(
  db: ChardonDb,
  retentionDays: number,
  now: Date,
  repo: string,
): boolean {
  const throttleCutoff = new Date(now.getTime() - AUTO_PURGE_MIN_INTERVAL_MS).toISOString();
  const recentPurge = db
    .prepare(`SELECT 1 FROM purge_log WHERE repo = ? AND ts >= ? LIMIT 1`)
    .get(repo, throttleCutoff);
  if (recentPurge) return false;

  const retentionCutoff = new Date(now.getTime() - retentionDays * MS_PER_DAY).toISOString();
  const staleSession = db
    .prepare(`SELECT 1 FROM sessions WHERE repo = ? AND started_at < ? LIMIT 1`)
    .get(repo, retentionCutoff);
  return staleSession !== undefined;
}
