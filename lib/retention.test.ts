import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession } from "./db.ts";
import { purgeOldData, shouldAutoPurge } from "./retention.ts";

let db: ReturnType<typeof openDb>;
const NOW = new Date("2026-07-07T12:00:00Z");
const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
});
afterEach(() => closeDb(db));

describe("purgeOldData", () => {
  it("removes history older than retentionDays and keeps recent rows", () => {
    // Recent (explicit ts within the window).
    writeSession(db, { id: "recent", repo: "p", sessionType: "main" });
    db.prepare(`UPDATE sessions SET started_at = '2026-07-06T00:00:00Z' WHERE id = 'recent'`).run();
    db.prepare(`INSERT INTO events (session_id, tool, success, ts, meta) VALUES ('recent','Bash',1,'2026-07-06T00:00:00Z','{}')`).run();
    // Old (before cutoff = NOW - 90d = 2026-04-08).
    db.prepare(`INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('old','p','2026-03-01T00:00:00Z','main')`).run();
    db.prepare(`INSERT INTO events (session_id, tool, success, ts, meta) VALUES ('old','Bash',1,'2026-03-01T00:00:00Z','{}')`).run();
    db.prepare(`INSERT INTO token_usage (date,origin,repo,input_tokens,output_tokens,cache_read,cache_creation,nb_messages,nb_sessions) VALUES ('2026-03-01','main','p',1,1,0,0,0,0)`).run();
    db.prepare(`INSERT INTO token_usage (date,origin,repo,input_tokens,output_tokens,cache_read,cache_creation,nb_messages,nb_sessions) VALUES ('2026-07-06','main','p',1,1,0,0,0,0)`).run();
    db.prepare(`INSERT INTO nudges (date, repo, kind, target) VALUES ('2026-03-01','p','toil','npm test')`).run();
    db.prepare(`INSERT INTO nudges (date, repo, kind, target) VALUES ('2026-07-06','p','toil','npm test')`).run();

    const r = purgeOldData(db, 90, NOW, "p");
    expect(r).toEqual({ events: 1, sessions: 1, tokenUsage: 1, nudges: 1 });
    expect(count("SELECT COUNT(*) AS c FROM sessions")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM events")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM token_usage")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM nudges")).toBe(1);
  });

  it("only purges the given repo, leaving other repos' history intact", () => {
    for (const repo of ["p", "other"]) {
      db.prepare(`INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('old-${repo}', ?, '2026-03-01T00:00:00Z','main')`).run(repo);
      db.prepare(`INSERT INTO events (session_id, tool, success, ts, meta) VALUES ('old-${repo}','Bash',1,'2026-03-01T00:00:00Z','{}')`).run();
      db.prepare(`INSERT INTO token_usage (date,origin,repo,input_tokens,output_tokens,cache_read,cache_creation,nb_messages,nb_sessions) VALUES ('2026-03-01','main',?,1,1,0,0,0,0)`).run(repo);
      db.prepare(`INSERT INTO nudges (date, repo, kind, target) VALUES ('2026-03-01', ?, 'toil', 'npm test')`).run(repo);
    }

    const r = purgeOldData(db, 90, NOW, "p");

    expect(r).toEqual({ events: 1, sessions: 1, tokenUsage: 1, nudges: 1 });
    expect(count("SELECT COUNT(*) AS c FROM sessions WHERE repo = 'other'")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM events WHERE session_id = 'old-other'")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM token_usage WHERE repo = 'other'")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM nudges WHERE repo = 'other'")).toBe(1);
  });

  it("keeps an old session that still has a recent event (FK safety)", () => {
    db.prepare(`INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('long','p','2026-01-01T00:00:00Z','main')`).run();
    db.prepare(`INSERT INTO events (session_id, tool, success, ts, meta) VALUES ('long','Bash',1,'2026-07-06T00:00:00Z','{}')`).run();
    const r = purgeOldData(db, 90, NOW, "p");
    expect(r.sessions).toBe(0); // referenced by a surviving event → not deleted
    expect(count("SELECT COUNT(*) AS c FROM sessions")).toBe(1);
  });

  it("records a purge_log row on every run, even when nothing was deleted", () => {
    purgeOldData(db, 90, NOW, "p");
    const row = db
      .prepare("SELECT ts, repo, retention_days, events, sessions, token_usage FROM purge_log")
      .get() as Record<string, unknown>;
    expect(row).toEqual({
      ts: NOW.toISOString(),
      repo: "p",
      retention_days: 90,
      events: 0,
      sessions: 0,
      token_usage: 0,
    });
  });

  it("logs the number of rows each purge removed", () => {
    db.prepare(`INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('old','p','2026-03-01T00:00:00Z','main')`).run();
    db.prepare(`INSERT INTO events (session_id, tool, success, ts, meta) VALUES ('old','Bash',1,'2026-03-01T00:00:00Z','{}')`).run();
    purgeOldData(db, 90, NOW, "p");
    const row = db.prepare("SELECT events, sessions, token_usage FROM purge_log").get();
    expect(row).toEqual({ events: 1, sessions: 1, token_usage: 0 });
  });

  it("trims this repo's purge_log entries older than retention, keeping other repos'", () => {
    db.prepare(`INSERT INTO purge_log (ts, repo, retention_days, events, sessions, token_usage) VALUES ('2026-03-01T00:00:00Z','p',90,0,0,0)`).run();
    db.prepare(`INSERT INTO purge_log (ts, repo, retention_days, events, sessions, token_usage) VALUES ('2026-07-06T00:00:00Z','p',90,0,0,0)`).run();
    db.prepare(`INSERT INTO purge_log (ts, repo, retention_days, events, sessions, token_usage) VALUES ('2026-03-01T00:00:00Z','other',90,0,0,0)`).run();

    purgeOldData(db, 90, NOW, "p");

    expect(count("SELECT COUNT(*) AS c FROM purge_log WHERE repo = 'p' AND ts < '2026-04-01'")).toBe(0);
    // Kept: this repo's recent entry plus the row logged by this run.
    expect(count("SELECT COUNT(*) AS c FROM purge_log WHERE repo = 'p'")).toBe(2);
    expect(count("SELECT COUNT(*) AS c FROM purge_log WHERE repo = 'other'")).toBe(1);
  });
});

describe("shouldAutoPurge", () => {
  const seedOldSession = (repo: string) =>
    db.prepare(`INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('old-${repo}', ?, '2026-03-01T00:00:00Z','main')`).run(repo);

  it("is true when the oldest session is past retention and no purge ran in 24h", () => {
    seedOldSession("p");
    expect(shouldAutoPurge(db, 90, NOW, "p")).toBe(true);
  });

  it("is false when a purge for this repo already ran in the last 24h", () => {
    seedOldSession("p");
    purgeOldData(db, 90, new Date(NOW.getTime() - 60 * 60 * 1000), "p");
    expect(shouldAutoPurge(db, 90, NOW, "p")).toBe(false);
  });

  it("is true again once the last purge is more than 24h old", () => {
    seedOldSession("p");
    purgeOldData(db, 365, new Date(NOW.getTime() - 25 * 60 * 60 * 1000), "p");
    expect(shouldAutoPurge(db, 90, NOW, "p")).toBe(true);
  });

  it("is not throttled by another repo's purge", () => {
    seedOldSession("p");
    purgeOldData(db, 90, NOW, "other");
    expect(shouldAutoPurge(db, 90, NOW, "p")).toBe(true);
  });

  it("is false when no session of the repo is older than retention", () => {
    writeSession(db, { id: "recent", repo: "p", sessionType: "main" });
    db.prepare(`UPDATE sessions SET started_at = '2026-07-06T00:00:00Z' WHERE id = 'recent'`).run();
    expect(shouldAutoPurge(db, 90, NOW, "p")).toBe(false);
  });

  it("is false for a repo with no sessions at all", () => {
    expect(shouldAutoPurge(db, 90, NOW, "p")).toBe(false);
  });
});
