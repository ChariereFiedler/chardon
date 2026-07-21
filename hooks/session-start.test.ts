import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, closeDb } from "../lib/db.ts";
import { run } from "./session-start.ts";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "session-start.ts");

/**
 * Runs the hook in a subprocess.
 * `env` defines variables to override; keys absent from `env` but
 * present in `process.env` are inherited, EXCEPT those listed in
 * `unset` (explicitly removed to ensure test isolation).
 */
function runHook(
  payload: string,
  env: Record<string, string>,
  unset: string[] = [],
): number {
  const merged = { ...process.env, ...env };
  for (const key of unset) {
    delete merged[key];
  }
  try {
    execFileSync("node", ["--experimental-strip-types", HOOK], { input: payload, env: merged });
    return 0;
  } catch (e: any) { return e.status ?? 1; }
}

describe("session-start hook — subprocess smoke tests", () => {
  let dbFile: string, project: string;
  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
  });

  it("inserts a session for a valid payload", () => {
    const code = runHook(JSON.stringify({ session_id: "abc", cwd: project }), { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project });
    expect(code).toBe(0);
    // CHARDON_DB must be set on THIS process before opening: passing it to the subprocess
    // env only scopes the hook. Without it, openDb() would hit the real ~/.claude/chardon.db.
    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    try {
      const s = db.prepare("SELECT id FROM sessions WHERE id = 'abc'").get();
      expect(s).toBeTruthy();
    } finally {
      closeDb(db);
    }
  });

  it("fail-open on empty input (exit 0, no exception)", () => {
    expect(runHook("", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });

  it("fail-open on broken JSON", () => {
    expect(runHook("{broken json", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });

  it("exit 0 and no session written when CLAUDE_PROJECT_DIR is absent", () => {
    const envWithoutProject: Record<string, string> = { CHARDON_DB: dbFile };
    const code = runHook(
      JSON.stringify({ session_id: "orphan-sess", cwd: project }),
      envWithoutProject,
      ["CLAUDE_PROJECT_DIR"],
    );
    expect(code).toBe(0);

    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    const row = db
      .prepare("SELECT COUNT(*) AS cnt FROM sessions")
      .get() as { cnt: number };
    closeDb(db);
    expect(row.cnt).toBe(0);
  });
});

describe("session-start hook — in-process run() tests", () => {
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

  it("inserts a session for a valid input", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    run({ session_id: "sess-1", cwd: project }, env);
    const db = openDb();
    const row = db.prepare("SELECT id, session_type FROM sessions WHERE id='sess-1'").get() as { id: string; session_type: string } | undefined;
    closeDb(db);
    expect(row).toBeTruthy();
    expect(row!.session_type).toBe("main");
  });

  it("sets session_type to worktree for a worktree project dir", () => {
    // Worktree dirs must end with -wt-<digits> exactly (e.g. myrepo-wt-3).
    // mkdtempSync appends random alphanum chars, so we create the dir manually.
    const base = mkdtempSync(join(tmpdir(), "chardon-wt-base-"));
    const wtProject = join(base, "myrepo-wt-3");
    mkdirSync(wtProject, { recursive: true });
    const env = { ...process.env, CLAUDE_PROJECT_DIR: wtProject };
    run({ session_id: "sess-wt", cwd: wtProject }, env);
    const db = openDb();
    const row = db.prepare("SELECT session_type FROM sessions WHERE id='sess-wt'").get() as { session_type: string } | undefined;
    closeDb(db);
    expect(row).toBeTruthy();
    expect(row!.session_type).toBe("worktree");
  });

  it("does not write when CLAUDE_PROJECT_DIR is missing", () => {
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    run({ session_id: "sess-orphan" }, env);
    const db = openDb();
    const count = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    closeDb(db);
    expect(count).toBe(0);
  });

  it("does not throw on malformed input", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    expect(() => run("garbage", env)).not.toThrow();
    expect(() => run(null, env)).not.toThrow();
    expect(() => run(42, env)).not.toThrow();
  });

  it("does not throw when session_id is missing", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    expect(() => run({ cwd: project }, env)).not.toThrow();
    const db = openDb();
    const count = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    closeDb(db);
    expect(count).toBe(0);
  });
});
