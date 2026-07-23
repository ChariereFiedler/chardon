#!/usr/bin/env node
/**
 * Claude Code hook — SessionStart event.
 * Inserts a row into the `sessions` table on each session start.
 *
 * @version 0.1.0
 * @last-reviewed 2026-06-25
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename } from "node:path";
import { isMainModule } from "../lib/is-main.ts";

import { loadConfig, repoSlug, safeRegex } from "../lib/config.ts";
import { openDb, closeDb, writeSession } from "../lib/db.ts";
import { debug } from "../lib/debug.ts";
import { isGitWorktree } from "../lib/git.ts";
import { buildSessionContext } from "../lib/session-context.ts";

/** Pattern that identifies a Claude Code worktree directory. */
const WORKTREE_SUFFIX_PATTERN = /-wt-\d+$/;

/** Git refs are short in practice; cap what reaches the user-supplied regex. */
const MAX_BRANCH_LENGTH = 200;

/** Hex chars kept from the sha256 of the project root (collision detection). */
const ROOT_HASH_LENGTH = 12;

/**
 * Core logic: inserts a session row for the given parsed input.
 * Reads project configuration from `env` (not `process.env`).
 * Never throws — all DB/IO errors are caught internally.
 */
export function run(input: unknown, env: NodeJS.ProcessEnv, now: Date = new Date()): void {
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

    const config = loadConfig(projectDir);

    const repo = repoSlug(projectDir);
    if (!repo) return;

    // A real linked `git worktree` is authoritative; the `-wt-N` sibling-clone
    // naming convention is kept as a fallback for non-worktree clones.
    const sessionType: "worktree" | "main" =
      isGitWorktree(projectDir) || WORKTREE_SUFFIX_PATTERN.test(basename(projectDir))
        ? "worktree"
        : "main";

    // Read the current git branch (silent on failure).
    const gitBranch = (() => {
      try {
        return execSync("git branch --show-current", {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
          cwd: projectDir,
        }).trim();
      } catch {
        return "";
      }
    })();

    // Extract the ticket number from the branch via the configurable regex.
    // loadConfig only lets safeRegex-vetted patterns through; the branch is
    // capped as a second layer against pathological inputs.
    const ticketPattern = safeRegex(config.ticketRegex);
    const ticketMatch = ticketPattern ? gitBranch.slice(0, MAX_BRANCH_LENGTH).match(ticketPattern) : null;
    const ticketIid = ticketMatch ? parseInt(ticketMatch[1], 10) : undefined;

    const db = openDb();
    try {
      writeSession(db, {
        id: sessionId,
        repo,
        gitBranch: gitBranch || undefined,
        ticketIid,
        sessionType,
        // Short root-path hash: lets the daily report detect two different
        // directories silently sharing one repo slug, without storing the path.
        rootHash: createHash("sha256").update(projectDir).digest("hex").slice(0, ROOT_HASH_LENGTH),
      });

      // Session-start briefing: open actions, yesterday's top friction, and a
      // collection-failure warning. Read-only; a non-empty context is handed to
      // Claude Code as SessionStart additionalContext. Errors print nothing.
      if (env.CHARDON_ACTIVE === "1") {
        const context = buildSessionContext(db, repo, now);
        if (context) {
          const output = {
            hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
          };
          process.stdout.write(JSON.stringify(output));
        }
      }
    } finally {
      closeDb(db);
    }
  } catch (err) {
    // Absolute fail-open: any unexpected error is silently ignored (surfaced via CHARDON_DEBUG).
    debug("session-start", err);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (isMainModule("session-start")) {
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
