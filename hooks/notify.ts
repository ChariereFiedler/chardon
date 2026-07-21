#!/usr/bin/env node
/**
 * Claude Code hook — PreToolUse (Bash) event.
 * Detects toil loops and alerts on stdout when CHARDON_ACTIVE=1.
 *
 * @version 0.1.0
 * @last-reviewed 2026-06-26
 */

import { readFileSync } from "node:fs";
import { isMainModule } from "../lib/is-main.ts";

import { openDb, closeDb } from "../lib/db.ts";
import { detectToilLoops } from "../lib/patterns.ts";
import { loadConfig, repoSlug } from "../lib/config.ts";
import { debug } from "../lib/debug.ts";

/**
 * Core logic: detects toil loops and writes an alert to stdout when active.
 * Reads project configuration from `env` (not `process.env`).
 * Never throws — all DB/IO errors are caught internally.
 */
export function run(input: unknown, env: NodeJS.ProcessEnv): void {
  try {
    // Propagate CHARDON_DB so openDb() picks up the right file.
    if (env.CHARDON_DB) {
      process.env.CHARDON_DB = env.CHARDON_DB;
    }

    // Exit immediately if monitoring is not enabled.
    if (env.CHARDON_ACTIVE !== "1") return;

    let projectDir = "";
    let repo = "";

    try {
      projectDir = env.CLAUDE_PROJECT_DIR ?? "";
      if (!projectDir) return;
      repo = repoSlug(projectDir);
    } catch {
      return;
    }

    // Parse the PreToolUse payload.
    let toolName = "";
    try {
      if (typeof input !== "object" || input === null) return;
      const event = input as { tool_name?: string };
      toolName = event.tool_name ?? "";
    } catch {
      return;
    }

    // Only analyse Bash calls.
    if (toolName !== "Bash") return;

    const config = loadConfig(projectDir);

    /** Analysis window for live-session toil detection (hours). */
    const TOIL_WINDOW_HOURS = 2;

    const db = openDb();
    try {
      const loops = detectToilLoops(db, repo, TOIL_WINDOW_HOURS, config.toilExclusions);
      if (loops.length > 0) {
        const top = loops[0];
        process.stdout.write(
          `\n⚠️  [chardon] toil loop: "${top.cmd}" ×${top.count} in ${TOIL_WINDOW_HOURS}h: consider a script or dedicated skill.\n`,
        );
      }
    } finally {
      closeDb(db);
    }
  } catch (err) {
    // Absolute fail-open: never surface an error, but leave a trace under CHARDON_DEBUG.
    debug("notify", err);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (isMainModule("notify")) {
  try {
    let parsed: unknown = {};
    try {
      const raw = readFileSync(0, "utf-8");
      parsed = JSON.parse(raw);
    } catch {
      process.exit(0);
    }
    run(parsed, process.env);
  } catch {
    // Absolute fail-open.
  }
  process.exit(0);
}
