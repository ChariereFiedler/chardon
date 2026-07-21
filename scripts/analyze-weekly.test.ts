import { describe, it, expect } from "vitest";
import { renderWeeklyReport, generateWeeklyReport, isoWeekLabel } from "./analyze-weekly.ts";
import { openDb, closeDb, writeSession, writeEvent } from "../lib/db.ts";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const summary = { repo: "p", weekStart: "2026-06-20", weekEnd: "2026-06-26", toil: [], coldReads: [], tokens: { input: 1, output: 2, cacheRead: 3 } };

describe("renderWeeklyReport", () => {
  it("includes the synthesis when present", () => {
    const md = renderWeeklyReport("2026-06-26", summary, "Reduce rebuilds by caching.");
    expect(md).toMatch(/synthesis/i);
    expect(md).toContain("Reduce rebuilds");
  });
  it("notes the missing key when synthesis is null", () => {
    expect(renderWeeklyReport("2026-06-26", summary, null)).toMatch(/ANTHROPIC_API_KEY/);
  });
  it("renders a week-over-week token trend line when present", () => {
    const s = { ...summary, tokenTrend: { thisWeek: 200, lastWeek: 100, pct: 100 } };
    expect(renderWeeklyReport("2026-06-26", s, null)).toContain("Week-over-week: 200 vs 100 (+100%)");
  });
  it("labels a negative trend with a minus sign", () => {
    const s = { ...summary, tokenTrend: { thisWeek: 100, lastWeek: 200, pct: -50 } };
    expect(renderWeeklyReport("2026-06-26", s, null)).toContain("Week-over-week: 100 vs 200 (-50%)");
  });
  it("labels the trend n/a when there is no prior-week data", () => {
    const s = { ...summary, tokenTrend: { thisWeek: 200, lastWeek: 0, pct: null } };
    expect(renderWeeklyReport("2026-06-26", s, null)).toContain("Week-over-week: 200 vs 0 (n/a)");
  });
});

it("generateWeeklyReport runs end-to-end with an injected stub model (no network)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proj-"));
  process.env.CHARDON_DB = join(dir, "c.db");
  const db = openDb();
  writeSession(db, { id: "s1", repo: "proj", sessionType: "main" });
  for (let i = 0; i < 9; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
  closeDb(db);
  const stub = async () => "Synthesis: cache the build to cut toil.";
  const { path, markdown } = await generateWeeklyReport({ projectDir: dir, now: new Date("2026-06-26T12:00:00Z"), model: stub });
  expect(markdown).toContain("## AI synthesis");
  expect(markdown).toContain("cache the build");
  expect(readFileSync(path, "utf8")).toBe(markdown);
});

it("caps an oversized synthesis", () => {
  const long = "x".repeat(50000);
  const md = renderWeeklyReport("2026-06-26", { repo: "p", weekStart: "a", weekEnd: "b", toil: [], coldReads: [], tokens: { input: 0, output: 0, cacheRead: 0 } }, long);
  expect(md.length).toBeLessThan(20000);
});

it("isoWeekLabel handles a year-boundary date", () => {
  expect(isoWeekLabel(new Date("2026-12-31T00:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
});
