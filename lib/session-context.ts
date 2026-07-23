import type { ChardonDb } from "./db.ts";
import { TOIL_MIN } from "./patterns.ts";

/** Maximum number of open actions listed in the briefing. */
const MAX_OPEN_ACTIONS = 3;
/** Consecutive failing days before the collection warning fires. */
const FAILING_DAYS_MIN = 3;
/** Backward scan bound for the consecutive-failure streak (days). */
const FAILURE_SCAN_DAYS = 30;
/** Milliseconds in a day. */
const MS_PER_DAY = 86_400_000;

/** ISO date (YYYY-MM-DD) `daysAgo` days before `now`, in UTC. */
function isoDateAgo(now: Date, daysAgo: number): string {
  return new Date(now.getTime() - daysAgo * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Builds the session-start briefing for a repo: open actions, yesterday's top
 * friction, and a warning when collection has been failing for several
 * consecutive days. Read-only, parameterized, pure rendering (data → string).
 * Returns null when there is nothing to say.
 */
export function buildSessionContext(db: ChardonDb, repo: string, now: Date): string | null {
  const lines: string[] = [];

  const actions = db
    .prepare(
      `SELECT id, kind, target FROM actions
       WHERE repo = ? AND status IN ('proposed', 'applied')
       ORDER BY proposed_at DESC, id DESC
       LIMIT ?`,
    )
    .all(repo, MAX_OPEN_ACTIONS) as unknown as { id: number; kind: string; target: string | null }[];
  for (const a of actions) {
    const target = a.target ? ` (${a.target})` : "";
    lines.push(`open action #${a.id}: ${a.kind}${target}`);
  }

  const yesterday = isoDateAgo(now, 1);
  const topFriction = db
    .prepare(
      `SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND s.repo = ?
         AND date(e.ts) = ?
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 1`,
    )
    .get(repo, yesterday, TOIL_MIN) as { cmd: string; count: number } | undefined;
  if (topFriction) {
    lines.push(`yesterday's top friction: "${topFriction.cmd}" ×${topFriction.count}`);
  }

  const failingDays = consecutiveFailingDays(db, repo, now);
  if (failingDays >= FAILING_DAYS_MIN) {
    lines.push(`chardon collection has been failing for ${failingDays} days; run with CHARDON_DEBUG=1`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Length of the consecutive-day streak with `failed > 0` in `hook_health`,
 * ending today or yesterday (today may simply have no writes yet). A day with
 * no failures (or no row) breaks the streak. Bounded by `FAILURE_SCAN_DAYS`.
 */
function consecutiveFailingDays(db: ChardonDb, repo: string, now: Date): number {
  const failedOn = db.prepare("SELECT failed FROM hook_health WHERE repo = ? AND date = ?");
  const hasFailure = (daysAgo: number): boolean => {
    const row = failedOn.get(repo, isoDateAgo(now, daysAgo)) as { failed: number } | undefined;
    return row !== undefined && row.failed > 0;
  };

  const start = hasFailure(0) ? 0 : 1;
  let streak = 0;
  for (let daysAgo = start; daysAgo < start + FAILURE_SCAN_DAYS; daysAgo++) {
    if (!hasFailure(daysAgo)) break;
    streak++;
  }
  return streak;
}
