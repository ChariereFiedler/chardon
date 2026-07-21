import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, closeDb } from "../lib/db.ts";
import { run } from "./post-tool-use.ts";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "post-tool-use.ts");

function runHook(payload: string, env: Record<string, string | undefined>): number {
  // Build env by dropping keys set to undefined (allows hiding inherited vars).
  const merged: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }
  try {
    execFileSync("node", ["--experimental-strip-types", HOOK], { input: payload, env: merged });
    return 0;
  } catch (e: any) { return e.status ?? 1; }
}

describe("post-tool-use hook — subprocess smoke tests", () => {
  let dbFile: string, project: string;
  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
  });

  it("inserts an event with redacted meta.cmd", () => {
    process.env.CHARDON_DB = dbFile;
    const payload = JSON.stringify({
      session_id: "abc", cwd: project, tool_name: "Bash",
      tool_input: { command: "export TOKEN=glpat-secret1234567890abcd" },
      tool_response: { is_error: false },
    });
    expect(runHook(payload, { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
    const ev = openDb().prepare("SELECT tool, meta FROM events").get() as any;
    expect(ev.tool).toBe("Bash");
    expect(ev.meta).not.toContain("glpat-secret");
  });

  it("fail-open on empty input", () => {
    expect(runHook("", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });

  it("exit 0 with no write when CLAUDE_PROJECT_DIR is absent", () => {
    const payload = JSON.stringify({
      session_id: "sess-orphan",
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_response: { is_error: false },
    });
    const envWithoutProject = { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: undefined } as Record<string, string | undefined>;
    expect(runHook(payload, envWithoutProject as Record<string, string>)).toBe(0);
    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    const count = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    closeDb(db);
    expect(count).toBe(0);
  });
});

describe("post-tool-use hook — in-process run() tests", () => {
  let dbFile: string, project: string;
  let savedDb: string | undefined;

  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
    savedDb = process.env.CHARDON_DB;
    process.env.CHARDON_DB = dbFile;
  });

  afterEach(() => {
    if (savedDb !== undefined) {
      process.env.CHARDON_DB = savedDb;
    } else {
      delete process.env.CHARDON_DB;
    }
  });

  it("records file meta for Edit tool", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    run(
      { session_id: "s1", tool_name: "Edit", tool_input: { file_path: "src/a.ts" }, tool_response: { is_error: false } },
      env,
    );
    const db = openDb();
    const row = db.prepare("SELECT tool, meta FROM events WHERE session_id='s1'").get() as { tool: string; meta: string };
    closeDb(db);
    expect(row.tool).toBe("Edit");
    expect(JSON.parse(row.meta).file).toBe("src/a.ts");
  });

  it("records skill meta for Skill tool", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    run(
      { session_id: "s2", tool_name: "Skill", tool_input: { skill: "my-skill" }, tool_response: { is_error: false } },
      env,
    );
    const db = openDb();
    const row = db.prepare("SELECT tool, meta FROM events WHERE session_id='s2'").get() as { tool: string; meta: string };
    closeDb(db);
    expect(row.tool).toBe("Skill");
    expect(JSON.parse(row.meta).skill).toBe("my-skill");
  });

  it("records subagent_type meta for Agent tool", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    run(
      { session_id: "s3", tool_name: "Agent", tool_input: { subagent_type: "claude" }, tool_response: { is_error: false } },
      env,
    );
    const db = openDb();
    const row = db.prepare("SELECT tool, meta FROM events WHERE session_id='s3'").get() as { tool: string; meta: string };
    closeDb(db);
    expect(row.tool).toBe("Agent");
    expect(JSON.parse(row.meta).subagent_type).toBe("claude");
  });

  it("records file meta for Read tool", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    run(
      { session_id: "s4", tool_name: "Read", tool_input: { file_path: "lib/foo.ts" }, tool_response: { is_error: false } },
      env,
    );
    const db = openDb();
    const row = db.prepare("SELECT tool, meta FROM events WHERE session_id='s4'").get() as { tool: string; meta: string };
    closeDb(db);
    expect(row.tool).toBe("Read");
    expect(JSON.parse(row.meta).file).toBe("lib/foo.ts");
  });

  it("records success=false for is_error responses", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    run(
      { session_id: "s5", tool_name: "Bash", tool_input: { command: "exit 1" }, tool_response: { is_error: true } },
      env,
    );
    const db = openDb();
    const row = db.prepare("SELECT success FROM events WHERE session_id='s5'").get() as { success: number };
    closeDb(db);
    expect(row.success).toBe(0);
  });

  it("does not throw on garbage input", () => {
    expect(() => run("garbage", process.env)).not.toThrow();
  });

  it("does not throw on null input", () => {
    expect(() => run(null, process.env)).not.toThrow();
  });

  it("does not write when CLAUDE_PROJECT_DIR is missing", () => {
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    run(
      { session_id: "s6", tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { is_error: false } },
      env,
    );
    const db = openDb();
    const count = (db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
    closeDb(db);
    expect(count).toBe(0);
  });
});
