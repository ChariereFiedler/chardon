import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession } from "./db.ts";
import { purgeOldData } from "./retention.ts";

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

    const r = purgeOldData(db, 90, NOW, "p");
    expect(r).toEqual({ events: 1, sessions: 1, tokenUsage: 1 });
    expect(count("SELECT COUNT(*) AS c FROM sessions")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM events")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM token_usage")).toBe(1);
  });

  it("only purges the given repo, leaving other repos' history intact", () => {
    for (const repo of ["p", "other"]) {
      db.prepare(`INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('old-${repo}', ?, '2026-03-01T00:00:00Z','main')`).run(repo);
      db.prepare(`INSERT INTO events (session_id, tool, success, ts, meta) VALUES ('old-${repo}','Bash',1,'2026-03-01T00:00:00Z','{}')`).run();
      db.prepare(`INSERT INTO token_usage (date,origin,repo,input_tokens,output_tokens,cache_read,cache_creation,nb_messages,nb_sessions) VALUES ('2026-03-01','main',?,1,1,0,0,0,0)`).run(repo);
    }

    const r = purgeOldData(db, 90, NOW, "p");

    expect(r).toEqual({ events: 1, sessions: 1, tokenUsage: 1 });
    expect(count("SELECT COUNT(*) AS c FROM sessions WHERE repo = 'other'")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM events WHERE session_id = 'old-other'")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM token_usage WHERE repo = 'other'")).toBe(1);
  });

  it("keeps an old session that still has a recent event (FK safety)", () => {
    db.prepare(`INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('long','p','2026-01-01T00:00:00Z','main')`).run();
    db.prepare(`INSERT INTO events (session_id, tool, success, ts, meta) VALUES ('long','Bash',1,'2026-07-06T00:00:00Z','{}')`).run();
    const r = purgeOldData(db, 90, NOW, "p");
    expect(r.sessions).toBe(0); // referenced by a surviving event → not deleted
    expect(count("SELECT COUNT(*) AS c FROM sessions")).toBe(1);
  });
});
