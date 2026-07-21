import type { ChardonDb } from "./db.ts";

export interface PurgeResult {
  events: number;
  sessions: number;
  tokenUsage: number;
}

/**
 * Removes history older than `retentionDays` from a repo-agnostic, whole-DB scope,
 * then reclaims space with VACUUM. Order matters for the FK `events.session_id`:
 * old events go first, then sessions that no event still references.
 *
 * The cutoff is derived from the injected `now` (never `new Date()` internally),
 * and every value is bound as a `?` parameter. Returns the number of rows removed.
 */
export function purgeOldData(
  db: ChardonDb,
  retentionDays: number,
  now: Date,
): PurgeResult {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const cutoffDate = cutoff.slice(0, 10);

  const events = db.prepare(`DELETE FROM events WHERE ts < ?`).run(cutoff).changes as number;

  // Only drop sessions no surviving event references (keeps FK integrity).
  const sessions = db
    .prepare(
      `DELETE FROM sessions
       WHERE started_at < ?
         AND id NOT IN (SELECT session_id FROM events WHERE session_id IS NOT NULL)`,
    )
    .run(cutoff).changes as number;

  const tokenUsage = db
    .prepare(`DELETE FROM token_usage WHERE date < ?`)
    .run(cutoffDate).changes as number;

  db.exec("VACUUM");

  return { events, sessions, tokenUsage };
}
