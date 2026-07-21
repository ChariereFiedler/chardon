import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, closeDb } from "../lib/db.ts";
import { run } from "./stop.ts";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "stop.ts");

function runHook(payload: string, env: Record<string, string>): number {
  try {
    execFileSync("node", ["--experimental-strip-types", HOOK], { input: payload, env: { ...process.env, ...env } });
    return 0;
  } catch (e: any) { return e.status ?? 1; }
}

describe("stop hook — subprocess smoke tests", () => {
  let dbFile: string, project: string;
  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
    // Ensure openDb() in the test uses the correct file.
    process.env.CHARDON_DB = dbFile;
  });

  it("closes the session and exits 0", () => {
    const db = openDb();
    db.prepare("INSERT INTO sessions (id, repo, session_type) VALUES ('z','p','main')").run();
    closeDb(db);
    expect(runHook(JSON.stringify({ session_id: "z", cwd: project }), { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project, CHARDON_OUT_DIR: project })).toBe(0);
    const db2 = openDb();
    const s = db2.prepare("SELECT ended_at FROM sessions WHERE id='z'").get() as any;
    closeDb(db2);
    expect(s.ended_at).toBeTruthy();
  });

  it("fail-open on empty input", () => {
    expect(runHook("", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });
});

describe("stop hook — in-process run() tests", () => {
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

  it("closes an existing session", async () => {
    const db = openDb();
    db.prepare("INSERT INTO sessions (id, repo, session_type) VALUES ('s-stop','repo','main')").run();
    closeDb(db);

    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    await run({ session_id: "s-stop" }, env);

    const db2 = openDb();
    const row = db2.prepare("SELECT ended_at FROM sessions WHERE id='s-stop'").get() as { ended_at: string } | undefined;
    closeDb(db2);
    expect(row?.ended_at).toBeTruthy();
  });

  it("does not throw when report generation fails (best-effort)", async () => {
    // Use a non-existent projectDir — generateDailyReport and aggregateTranscripts will fail
    // but run() must not throw.
    const env = { ...process.env, CLAUDE_PROJECT_DIR: "/nonexistent/path/that/does/not/exist" };
    await expect(run({ session_id: "s-noop" }, env)).resolves.toBeUndefined();
  });

  it("does not throw on malformed input", async () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    await expect(run("garbage", env)).resolves.toBeUndefined();
    await expect(run(null, env)).resolves.toBeUndefined();
  });

  it("does not write when CLAUDE_PROJECT_DIR is missing", async () => {
    // Seed a session so we can verify it stays open.
    const db = openDb();
    db.prepare("INSERT INTO sessions (id, repo, session_type) VALUES ('s-missing','repo','main')").run();
    closeDb(db);

    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    await run({ session_id: "s-missing" }, env);

    const db2 = openDb();
    const row = db2.prepare("SELECT ended_at FROM sessions WHERE id='s-missing'").get() as { ended_at: string | null } | undefined;
    closeDb(db2);
    // session was not closed (ended_at remains null)
    expect(row?.ended_at).toBeNull();
  });
});
