import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "../lib/db.ts";
import { renderInspect, runInspect } from "./inspect.ts";

describe("inspect", () => {
  it("renderInspect shows counts, redacted samples, and the local guarantees (pure)", () => {
    const md = renderInspect({
      dbPath: "/home/x/.claude/chardon.db",
      repo: "p",
      counts: [{ table: "events", rows: 3 }],
      sampleMeta: ["git push https://[REDACTED]@github.com"],
      purgeHistory: [],
    });
    expect(md).toContain("| events | 3 |");
    expect(md).toContain("[REDACTED]");
    expect(md).toContain("0600");
    expect(md).toContain("weekly LLM synthesis");
    expect(md).toContain("## Purge history");
    expect(md).toContain("(none yet)");
  });

  it("renderInspect lists past purges with date, retention, and rows removed", () => {
    const md = renderInspect({
      dbPath: "/home/x/.claude/chardon.db",
      repo: "p",
      counts: [],
      sampleMeta: [],
      purgeHistory: [{ ts: "2026-07-20T08:00:00.000Z", retentionDays: 90, events: 12, sessions: 3, tokenUsage: 4 }],
    });
    expect(md).toContain("2026-07-20");
    expect(md).toContain("retention 90d");
    expect(md).toContain("12 event(s), 3 session(s), 4 token-usage row(s)");
    expect(md).not.toContain("(none yet)");
  });

  it("runInspect reads the DB and surfaces stored command metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    process.env.CHARDON_DB = join(dir, "c.db");
    const db = openDb();
    writeSession(db, { id: "s1", repo: basename(dir), sessionType: "main" });
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    closeDb(db);

    const { report } = runInspect(dir);
    expect(report).toContain("npm run build");
    expect(report).toContain("| events | 1 |");
  });

  it("runInspect never surfaces another repo's commands under this repo's scope", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    process.env.CHARDON_DB = join(dir, "c.db");
    const db = openDb();
    writeSession(db, { id: "mine", repo: basename(dir), sessionType: "main" });
    writeEvent(db, { sessionId: "mine", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    writeSession(db, { id: "other", repo: "other-private-repo", sessionType: "main" });
    writeEvent(db, {
      sessionId: "other",
      tool: "Bash",
      success: true,
      meta: { cmd: "deploy --to CLIENT-X-PROD" },
    });
    closeDb(db);

    const { report } = runInspect(dir);
    expect(report).toContain("npm run build");
    expect(report).not.toContain("CLIENT-X-PROD");
  });
});
