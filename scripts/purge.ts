import { isMainModule } from "../lib/is-main.ts";

import { closeDb, openDb } from "../lib/db.ts";
import { loadConfig } from "../lib/config.ts";
import { purgeOldData, type PurgeResult } from "../lib/retention.ts";

/** Pure render of a purge result (data → string). */
export function renderPurge(retentionDays: number, r: PurgeResult): string {
  return `Purged history older than ${retentionDays} days: ${r.events} event(s), ${r.sessions} session(s), ${r.tokenUsage} token-usage row(s). Database compacted.`;
}

/**
 * Opens the DB, purges rows older than `retentionDays` (from config unless
 * overridden), compacts, and returns a human-readable summary.
 */
export function runPurge(opts: { projectDir: string; now: Date; retentionDays?: number }): { summary: string } {
  const { projectDir, now } = opts;
  const retentionDays = opts.retentionDays ?? loadConfig(projectDir).retentionDays;

  const db = openDb();
  try {
    const result = purgeOldData(db, retentionDays, now);
    return { summary: renderPurge(retentionDays, result) };
  } finally {
    closeDb(db);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (isMainModule("purge")) {
  const { summary } = runPurge({
    projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    now: new Date(),
  });
  console.log(summary);
}
