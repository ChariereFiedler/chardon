import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Robustness against a corrupted SQLite file: every hook must stay fail-open
 * (exit 0) and write nothing to stdout when CHARDON_DB points at garbage bytes.
 * SQLite rejects the file at the first statement (SQLITE_NOTADB); the hooks
 * must swallow that error like any other DB unavailability.
 */

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

/** Not a valid SQLite header: triggers SQLITE_NOTADB on open/first statement. */
const GARBAGE_DB_CONTENT = "this is definitely not a sqlite database, just garbage bytes\n".repeat(4);

interface HookResult {
  status: number | null;
  stdout: string;
}

function runHookSubprocess(
  hookFile: string,
  payload: string,
  env: Record<string, string>,
): HookResult {
  const result = spawnSync(
    "node",
    ["--experimental-strip-types", join(HOOKS_DIR, hookFile)],
    { input: payload, env: { ...process.env, ...env }, encoding: "utf8" },
  );
  return { status: result.status, stdout: result.stdout };
}

describe("hooks · corrupted CHARDON_DB file", () => {
  let dbFile: string;
  let project: string;
  let env: Record<string, string>;

  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-corrupt-")), "t.db");
    writeFileSync(dbFile, GARBAGE_DB_CONTENT);
    project = mkdtempSync(join(tmpdir(), "proj-"));
    env = { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project };
  });

  it("session-start exits 0 with no stdout output", () => {
    const payload = JSON.stringify({ session_id: "corrupt-1", cwd: project });
    const { status, stdout } = runHookSubprocess("session-start.ts", payload, env);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("post-tool-use exits 0 with no stdout output", () => {
    const payload = JSON.stringify({
      session_id: "corrupt-2",
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_response: { is_error: false },
    });
    const { status, stdout } = runHookSubprocess("post-tool-use.ts", payload, env);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("stop exits 0 with no stdout output", () => {
    const payload = JSON.stringify({ session_id: "corrupt-3", cwd: project });
    const { status, stdout } = runHookSubprocess("stop.ts", payload, env);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("notify exits 0 with no stdout output even when active", () => {
    // CHARDON_ACTIVE=1 forces the hook past its early return so it actually
    // opens the corrupted DB; the alert path must stay silent on failure.
    const payload = JSON.stringify({ session_id: "corrupt-4", tool_name: "Bash", tool_input: { command: "ls" } });
    const { status, stdout } = runHookSubprocess("notify.ts", payload, { ...env, CHARDON_ACTIVE: "1" });
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});
