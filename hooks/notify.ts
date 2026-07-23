#!/usr/bin/env node
/**
 * Claude Code hook: PreToolUse (Bash) event.
 * Emits real-time nudges on stdout when CHARDON_ACTIVE=1: toil loops, failure
 * clusters, slow drains, and daily token budget thresholds. Each nudge fires at
 * most once per day per repo/kind/target (deduped via the `nudges` table).
 *
 * @version 0.2.0
 * @last-reviewed 2026-07-23
 */

import { readFileSync } from "node:fs";
import { isMainModule } from "../lib/is-main.ts";

import { openDb, closeDb, registerNudge, type ChardonDb } from "../lib/db.ts";
import { detectToilLoops, detectFailingCommands, detectSlowCommands } from "../lib/patterns.ts";
import { loadConfig, repoSlug, repoOrigin, type ChardonConfig } from "../lib/config.ts";
import { tokensForDay } from "../lib/token-parser.ts";
import { redactCmd } from "../lib/redact.ts";
import { debug } from "../lib/debug.ts";

/** Analysis window for live-session toil detection (hours). */
const TOIL_WINDOW_HOURS = 2;
/** Analysis window for the day's failure clusters and slow drains (hours). */
const DAY_WINDOW_HOURS = 24;
/** Fraction of the daily token budget at which the early warning fires. */
const BUDGET_WARN_RATIO = 0.8;
/** Milliseconds per second, for the slow-command average display. */
const MS_PER_SECOND = 1000;
/** Fixed nudge target for budget kinds (the kind already carries the threshold). */
const BUDGET_TARGET = "tokens";

/** Alert for a toil loop, deduped per day on the looping command. */
function toilAlert(db: ChardonDb, repo: string, today: string, config: ChardonConfig): string | null {
  const loops = detectToilLoops(db, repo, TOIL_WINDOW_HOURS, config.toilExclusions);
  if (loops.length === 0) return null;
  const top = loops[0];
  if (!registerNudge(db, { date: today, repo, kind: "toil", target: top.cmd })) return null;
  return `⚠️  [chardon] toil loop: "${top.cmd}" ×${top.count} in ${TOIL_WINDOW_HOURS}h: consider a script or dedicated skill.`;
}

/** Alert when the command about to run matches one of today's failure clusters. */
function failingAlert(db: ChardonDb, repo: string, today: string, cmd: string, config: ChardonConfig): string | null {
  const clusters = detectFailingCommands(db, repo, DAY_WINDOW_HOURS, config.thresholds.failMin);
  const match = clusters.find((c) => c.cmd === cmd);
  if (!match) return null;
  if (!registerNudge(db, { date: today, repo, kind: "failing-cmd", target: cmd })) return null;
  return `⚠️  [chardon] this command failed ${match.count} times today; consider systematic debugging before rerunning.`;
}

/** Alert when the command about to run is one of today's slow drains. */
function slowAlert(db: ChardonDb, repo: string, today: string, cmd: string, config: ChardonConfig): string | null {
  const drains = detectSlowCommands(db, repo, DAY_WINDOW_HOURS, config.thresholds.slowMin, config.thresholds.slowMs);
  const match = drains.find((d) => d.cmd === cmd);
  if (!match) return null;
  if (!registerNudge(db, { date: today, repo, kind: "slow-cmd", target: cmd })) return null;
  const avgSeconds = Math.round(match.avgMs / MS_PER_SECOND);
  return `⚠️  [chardon] this command averages ${avgSeconds}s per run today; consider running it in the background.`;
}

/** Alert once per day per threshold (80%, 100%) when today's tokens cross the budget. */
function budgetAlert(
  db: ChardonDb,
  repo: string,
  today: string,
  projectDir: string,
  config: ChardonConfig,
): string | null {
  const budget = config.tokenBudgetPerDay;
  if (budget <= 0) return null;
  const tokensToday = tokensForDay(db, repo, repoOrigin(projectDir), today);
  if (tokensToday >= budget) {
    if (!registerNudge(db, { date: today, repo, kind: "budget-100", target: BUDGET_TARGET })) return null;
    return `⚠️  [chardon] token budget exceeded: ${tokensToday} of ${budget} tokens used today.`;
  }
  if (tokensToday >= budget * BUDGET_WARN_RATIO) {
    if (!registerNudge(db, { date: today, repo, kind: "budget-80", target: BUDGET_TARGET })) return null;
    return `⚠️  [chardon] token budget warning: ${tokensToday} of ${budget} tokens used today (over 80%).`;
  }
  return null;
}

/**
 * Core logic: detects live friction (toil, failures, slow drains, token budget)
 * and writes at most one alert per day per signal to stdout when active.
 * Reads project configuration from `env` (not `process.env`); the clock is
 * injected via `now` (the CLI entry point passes the real clock).
 * Never throws: all DB/IO errors are caught internally.
 */
export function run(input: unknown, env: NodeJS.ProcessEnv, now: Date = new Date()): void {
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
    let command = "";
    try {
      if (typeof input !== "object" || input === null) return;
      const event = input as { tool_name?: string; tool_input?: { command?: string } };
      toolName = event.tool_name ?? "";
      command = String(event.tool_input?.command ?? "");
    } catch {
      return;
    }

    // Only analyse Bash calls.
    if (toolName !== "Bash") return;

    const config = loadConfig(projectDir);
    const today = now.toISOString().slice(0, 10);
    // Events store commands redacted; match the incoming command the same way.
    const cmd = redactCmd(command);

    const db = openDb();
    try {
      const alerts = [
        toilAlert(db, repo, today, config),
        cmd ? failingAlert(db, repo, today, cmd, config) : null,
        cmd ? slowAlert(db, repo, today, cmd, config) : null,
        budgetAlert(db, repo, today, projectDir, config),
      ].filter((a): a is string => a !== null);

      if (alerts.length > 0) {
        process.stdout.write(`\n${alerts.join("\n")}\n`);
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
    run(parsed, process.env, new Date());
  } catch {
    // Absolute fail-open.
  }
  process.exit(0);
}
