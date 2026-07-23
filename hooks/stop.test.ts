import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, closeDb } from "../lib/db.ts";
import { run } from "./stop.ts";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "stop.ts");

// The auto-purge path runs VACUUM: slow enough under a loaded vitest worker
// to overrun the default 5 s test timeout.
const PURGE_TEST_TIMEOUT_MS = 20_000;

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

  it("fail-open when the DB path is unusable (auto-purge included)", () => {
    // A directory as DB file: openDb() throws on every access.
    const badDb = mkdtempSync(join(tmpdir(), "chardon-bad-"));
    expect(runHook(JSON.stringify({ session_id: "z", cwd: project }), { CHARDON_DB: badDb, CLAUDE_PROJECT_DIR: project, CHARDON_OUT_DIR: project })).toBe(0);
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

  it("auto-purges history older than retention at session end", async () => {
    const db = openDb();
    const repo = basename(project);
    db.prepare("INSERT INTO sessions (id, repo, session_type) VALUES ('s-live', ?, 'main')").run(repo);
    // Stale session far beyond the default 90-day retention.
    db.prepare("INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('s-stale', ?, '2020-01-01T00:00:00Z', 'main')").run(repo);
    closeDb(db);

    await run({ session_id: "s-live" }, { ...process.env, CLAUDE_PROJECT_DIR: project, CHARDON_OUT_DIR: project });

    const db2 = openDb();
    const stale = db2.prepare("SELECT id FROM sessions WHERE id='s-stale'").get();
    const logs = db2.prepare("SELECT COUNT(*) AS c FROM purge_log WHERE repo = ?").get(repo) as { c: number };
    closeDb(db2);
    expect(stale).toBeUndefined();
    expect(logs.c).toBe(1);
  }, PURGE_TEST_TIMEOUT_MS);

  it("does not auto-purge again the same day (throttle)", async () => {
    const db = openDb();
    const repo = basename(project);
    // A purge already logged moments ago for this repo.
    db.prepare("INSERT INTO purge_log (ts, repo, retention_days, events, sessions, token_usage) VALUES (?, ?, 90, 0, 0, 0)").run(new Date().toISOString(), repo);
    db.prepare("INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('s-stale', ?, '2020-01-01T00:00:00Z', 'main')").run(repo);
    closeDb(db);

    await run({ session_id: "s-stale" }, { ...process.env, CLAUDE_PROJECT_DIR: project, CHARDON_OUT_DIR: project });

    const db2 = openDb();
    const stale = db2.prepare("SELECT id FROM sessions WHERE id='s-stale'").get();
    const logs = db2.prepare("SELECT COUNT(*) AS c FROM purge_log").get() as { c: number };
    closeDb(db2);
    expect(stale).toBeDefined(); // throttled: nothing purged
    expect(logs.c).toBe(1); // no second log row
  }, PURGE_TEST_TIMEOUT_MS);

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
