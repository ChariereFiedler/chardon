import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { openDb, closeDb } from "../lib/db.ts";
import { renderPurge, runPurge } from "./purge.ts";

describe("purge", () => {
  it("renderPurge summarizes rows removed (pure)", () => {
    const s = renderPurge(90, { events: 3, sessions: 1, tokenUsage: 2 });
    expect(s).toContain("older than 90 days");
    expect(s).toContain("3 event(s)");
    expect(s).toContain("1 session(s)");
    expect(s).toContain("2 token-usage row(s)");
  });

  it("runPurge opens the DB, purges old rows of the project's repo, and returns a summary", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    // The purge is scoped to the current project's repo slug (basename of dir).
    const repo = basename(dir);
    process.env.CHARDON_DB = join(dir, "c.db");
    const db = openDb();
    db.prepare(`INSERT INTO sessions (id, repo, started_at, session_type) VALUES ('old',?,'2026-01-01T00:00:00Z','main')`).run(repo);
    db.prepare(`INSERT INTO events (session_id, tool, success, ts, meta) VALUES ('old','Bash',1,'2026-01-01T00:00:00Z','{}')`).run();
    closeDb(db);

    const { summary } = runPurge({ projectDir: dir, now: new Date("2026-07-07T12:00:00Z"), retentionDays: 90 });
    expect(summary).toContain("1 event(s)");
    expect(summary).toContain("1 session(s)");
  });
});
