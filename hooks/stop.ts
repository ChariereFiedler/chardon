#!/usr/bin/env node
/**
 * Claude Code hook — Stop event.
 * Closes the current session and generates the daily report (best-effort).
 *
 * @version 0.1.0
 * @last-reviewed 2026-06-26
 */

import { readFileSync } from "node:fs";
import { isMainModule } from "../lib/is-main.ts";

import { openDb, closeDb, closeSession } from "../lib/db.ts";
import { generateDailyReport } from "../scripts/analyze-daily.ts";
import { aggregateTranscripts, upsertTokenUsage } from "../lib/token-parser.ts";
import { loadConfig, repoSlug } from "../lib/config.ts";
import { purgeOldData, shouldAutoPurge } from "../lib/retention.ts";
import { debug } from "../lib/debug.ts";

/**
 * Core logic: closes the session and runs best-effort post-processing.
 * Reads project configuration from `env` (not `process.env`).
 * Never throws — all DB/IO errors are caught internally.
 */
export async function run(input: unknown, env: NodeJS.ProcessEnv, runNow: Date = new Date()): Promise<void> {
  try {
    // Propagate CHARDON_DB so openDb() picks up the right file.
    if (env.CHARDON_DB) {
      process.env.CHARDON_DB = env.CHARDON_DB;
    }

    let sessionId = "";
    try {
      if (typeof input !== "object" || input === null) return;
      const event = input as { session_id?: string };
      sessionId = event.session_id ?? "";
    } catch {
      return;
    }

    if (!sessionId) return;

    const projectDir = env.CLAUDE_PROJECT_DIR ?? "";
    if (!projectDir) return;

    const now = runNow.toISOString();

    const db = openDb();
    try {
      closeSession(db, sessionId, now);
    } finally {
      closeDb(db);
    }

    // Aggregate token usage best-effort: failure does not prevent completion.
    try {
      const dbTokens = openDb();
      try {
        upsertTokenUsage(dbTokens, aggregateTranscripts(projectDir));
      } finally {
        closeDb(dbTokens);
      }
    } catch {
      // Fail-open: token aggregation error silently ignored.
    }

    // Generate the daily report best-effort: failure does not prevent completion.
    try {
      await generateDailyReport({ projectDir, now: runNow });
    } catch {
      // Fail-open: report error silently ignored.
    }

    // Opportunistic retention best-effort: purge this repo's history older than
    // retentionDays, at most once a day per repo (throttled via purge_log).
    // VACUUM inside purgeOldData is bounded: local DB, single writer at a time.
    try {
      const retentionDays = loadConfig(projectDir).retentionDays;
      const repo = repoSlug(projectDir);
      const purgeNow = runNow;
      const dbPurge = openDb();
      try {
        if (shouldAutoPurge(dbPurge, retentionDays, purgeNow, repo)) {
          purgeOldData(dbPurge, retentionDays, purgeNow, repo);
        }
      } finally {
        closeDb(dbPurge);
      }
    } catch {
      // Fail-open: retention error silently ignored.
    }
  } catch (err) {
    // Absolute fail-open: any unexpected error is silently ignored (surfaced via CHARDON_DEBUG).
    debug("stop", err);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (isMainModule("stop")) {
  try {
    let parsed: unknown = {};
    try {
      const raw = readFileSync(0, "utf-8");
      parsed = JSON.parse(raw);
    } catch {
      process.exit(0);
    }
    await run(parsed, process.env);
  } catch {
    // Absolute fail-open.
  }
  process.exit(0);
}
