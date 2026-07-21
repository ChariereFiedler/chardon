#!/usr/bin/env node
/**
 * Claude Code hook — PostToolUse event.
 * Inserts an event into the `events` table: tool, success, duration, redacted meta.
 *
 * @version 0.1.0
 * @last-reviewed 2026-06-25
 */

import { readFileSync } from "node:fs";
import { isMainModule } from "../lib/is-main.ts";

import { openDb, closeDb, writeEvent, writeSession, recordHealth } from "../lib/db.ts";
import { redactCmd } from "../lib/redact.ts";
import { repoSlug } from "../lib/config.ts";
import { debug } from "../lib/debug.ts";

interface PostToolPayload {
  session_id?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    file_path?: string;
    skill?: string;
    subagent_type?: string;
  };
  tool_response?: { is_error?: boolean };
  duration_ms?: number;
}

function buildMeta(payload: PostToolPayload): Record<string, unknown> {
  const tool = payload.tool_name ?? "";
  const input = payload.tool_input ?? {};

  if (tool === "Bash") {
    return { cmd: redactCmd(String(input.command ?? "")) };
  }
  if (["Edit", "Write", "Read"].includes(tool)) {
    return { file: String(input.file_path ?? "").slice(0, 80) };
  }
  if (tool === "Skill") {
    return { skill: String(input.skill ?? "") };
  }
  if (tool === "Agent") {
    return { subagent_type: String(input.subagent_type ?? "") };
  }
  return {};
}

/**
 * Core logic: inserts an event row for the given parsed input.
 * Reads project configuration from `env` (not `process.env`).
 * Never throws — all DB/IO errors are caught internally.
 */
export function run(input: unknown, env: NodeJS.ProcessEnv): void {
  try {
    // Propagate CHARDON_DB so openDb() picks up the right file.
    if (env.CHARDON_DB) {
      process.env.CHARDON_DB = env.CHARDON_DB;
    }

    let payload: PostToolPayload = {};
    try {
      if (typeof input !== "object" || input === null) return;
      payload = input as PostToolPayload;
    } catch {
      return;
    }

    const sessionId = payload.session_id;
    if (!sessionId) return;

    const projectDir = env.CLAUDE_PROJECT_DIR ?? "";
    if (!projectDir) return;

    const repo = repoSlug(projectDir);
    if (!repo) return;

    const tool = payload.tool_name ?? "unknown";
    const success = !(payload.tool_response?.is_error ?? false);
    const durationMs = payload.duration_ms;
    const meta = buildMeta(payload);

    const db = openDb();
    try {
      // Ensure the session exists (INSERT OR IGNORE) before the event (FK).
      writeSession(db, { id: sessionId, repo, sessionType: "main" });
      writeEvent(db, { sessionId, tool, success, durationMs, meta });
      recordHealth(db, repo, true);
    } catch (err) {
      // The DB opened but the write failed — record it so it is not truly silent.
      debug("post-tool-use write", err);
      try {
        recordHealth(db, repo, false);
      } catch {
        // Health is best-effort.
      }
    } finally {
      closeDb(db);
    }
  } catch (err) {
    // Absolute fail-open: any unexpected error is silently ignored (surfaced via CHARDON_DEBUG).
    debug("post-tool-use", err);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (isMainModule("post-tool-use")) {
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
