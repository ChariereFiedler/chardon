import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent, closeSession, recordHealth, readHealth, schemaVersion } from "./db.ts";
import { upsertTokenUsage } from "./token-parser.ts";

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
});
afterEach(() => closeDb(db));

describe("db", () => {
  it("openDb is idempotent (second open does not throw)", () => {
    const db2 = openDb();
    expect(db2).toBeTruthy();
    closeDb(db2);
  });

  it("writeSession + writeEvent persist and can be read back", () => {
    writeSession(db, { id: "s1", repo: "p", gitBranch: "master", sessionType: "main" });
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, durationMs: 12, meta: { cmd: "ls" } });
    const ev = db.prepare("SELECT tool, success, meta FROM events WHERE session_id = 's1'").get() as any;
    expect(ev.tool).toBe("Bash");
    expect(ev.success).toBe(1);
    expect(JSON.parse(ev.meta).cmd).toBe("ls");
  });

  it("repo isolation: two repos do not mix", () => {
    writeSession(db, { id: "a", repo: "p1", sessionType: "main" });
    writeSession(db, { id: "b", repo: "p2", sessionType: "main" });
    const n = db.prepare("SELECT COUNT(*) c FROM sessions WHERE repo = 'p1'").get() as any;
    expect(n.c).toBe(1);
  });

  it("closeSession sets ended_at", () => {
    writeSession(db, { id: "s2", repo: "p", sessionType: "main" });
    closeSession(db, "s2", "2026-06-25T10:00:00Z");
    const s = db.prepare("SELECT ended_at FROM sessions WHERE id = 's2'").get() as any;
    expect(s.ended_at).toBe("2026-06-25T10:00:00Z");
  });

  it("recordHealth accumulates ok/failed for today and readHealth reads them back", () => {
    recordHealth(db, "p", true);
    recordHealth(db, "p", true);
    recordHealth(db, "p", false);
    const today = new Date().toISOString().slice(0, 10);
    expect(readHealth(db, "p", today)).toEqual({ ok: 2, failed: 1 });
    expect(readHealth(db, "p", "1999-01-01")).toEqual({ ok: 0, failed: 0 });
  });

  it("stamps the current schema version on a fresh DB", () => {
    expect(schemaVersion(db)).toBe(2);
  });
});

describe("db migration: token_usage.repo backfill (pre-686a939 DBs)", () => {
  const cols = (db: ReturnType<typeof openDb>): string[] =>
    (db.prepare("PRAGMA table_info(token_usage)").all() as { name: string }[]).map((c) => c.name);

  it("adds repo to a legacy token_usage and preserves existing rows unscoped", () => {
    const path = join(mkdtempSync(join(tmpdir(), "chardon-mig-")), "legacy.db");
    // Recreate the pre-repo schema: PRIMARY KEY (date, origin), no repo column.
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE token_usage (
        date TEXT NOT NULL, origin TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read INTEGER NOT NULL DEFAULT 0, cache_creation INTEGER NOT NULL DEFAULT 0,
        nb_messages INTEGER NOT NULL DEFAULT 0, nb_sessions INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date, origin)
      );
      INSERT INTO token_usage (date, origin, input_tokens, output_tokens, nb_messages, nb_sessions)
      VALUES ('2026-07-01', 'main', 100, 200, 3, 1);
    `);
    legacy.close();

    process.env.CHARDON_DB = path;
    const migrated = openDb();
    try {
      expect(cols(migrated)).toContain("repo");
      const row = migrated
        .prepare("SELECT date, origin, repo, input_tokens FROM token_usage")
        .get() as { date: string; origin: string; repo: string; input_tokens: number };
      expect(row).toMatchObject({ date: "2026-07-01", origin: "main", repo: "", input_tokens: 100 });

      // The crash trigger: ON CONFLICT(date, origin, repo) now has a matching constraint.
      upsertTokenUsage(migrated, [
        { date: "2026-07-01", origin: "main", repo: "chardon", inputTokens: 5, outputTokens: 6, cacheRead: 0, cacheCreation: 0, nbMessages: 1, nbSessions: 1 },
      ]);
      const n = migrated.prepare("SELECT COUNT(*) c FROM token_usage").get() as { c: number };
      expect(n.c).toBe(2); // legacy ('') and new ('chardon') coexist
    } finally {
      closeDb(migrated);
    }
  });

  it("is idempotent: reopening an already-migrated DB is a no-op", () => {
    process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-mig2-")), "ok.db");
    const a = openDb();
    closeDb(a);
    const b = openDb();
    try {
      expect(cols(b)).toContain("repo");
    } finally {
      closeDb(b);
    }
  });

  // Run in a subprocess that does NOT call process.exit: hooks only hid this warning by
  // exiting before its asynchronous emission, so the suppression must hold on its own.
  it("suppresses the node:sqlite ExperimentalWarning without swallowing other warnings", () => {
    const dbFile = join(mkdtempSync(join(tmpdir(), "chardon-warn-")), "w.db");
    const script = `
      process.env.CHARDON_DB = ${JSON.stringify(dbFile)};
      const { openDb, closeDb } = await import(${JSON.stringify(new URL("./db.ts", import.meta.url).href)});
      closeDb(openDb());
      process.emitWarning("canary warning");
      await new Promise((r) => setTimeout(r, 50));
    `;
    const { status, stderr } = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "--eval", script],
      { encoding: "utf-8" },
    );

    expect(status).toBe(0);
    expect(stderr).not.toMatch(/ExperimentalWarning: SQLite/);
    expect(stderr).toMatch(/canary warning/);
  });
});

describe("db file permissions", () => {
  it("creates the DB file owner-only even under a permissive umask", () => {
    // Worker threads (Stryker's vitest runner) cannot change the umask; the
    // assertion still holds there because the file is created with an explicit
    // mode, so the widened umask is a bonus, not a precondition.
    let prev: number | undefined;
    try {
      prev = process.umask(0);
    } catch {
      // Not settable in a worker thread.
    }
    try {
      process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-perm-")), "t.db");
      const db = openDb();
      closeDb(db);
      const { statSync } = nodeRequire("node:fs") as typeof import("node:fs");
      const mode = statSync(process.env.CHARDON_DB).mode & 0o777;
      expect(mode).toBe(0o600);
    } finally {
      if (prev !== undefined) process.umask(prev);
    }
  });
});
