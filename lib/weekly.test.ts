import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb } from "./db.ts";
import { aggregateWeek, buildWeeklyPrompt, callModel } from "./weekly.ts";

describe("weekly", () => {
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });

  it("buildWeeklyPrompt includes a clear no-friction marker when empty", () => {
    const p = buildWeeklyPrompt({ repo: "p", weekStart: "a", weekEnd: "b", toil: [], coldReads: [], tokens: { input: 0, output: 0, cacheRead: 0 } });
    expect(p).toMatch(/no (toil|friction|repeated)/i);
  });

  it("buildWeeklyPrompt lists every toil command and cold read", () => {
    const p = buildWeeklyPrompt({
      repo: "p", weekStart: "a", weekEnd: "b",
      toil: [{ cmd: "npm run build", count: 9 }, { cmd: "git status", count: 5 }],
      coldReads: [{ file: "src/a.ts", count: 4 }],
      tokens: { input: 10, output: 20, cacheRead: 30 },
    });
    for (const s of ["npm run build", "git status", "src/a.ts", "9", "5", "4"]) expect(p).toContain(s);
  });

  it("buildWeeklyPrompt is deterministic and includes the data", () => {
    const p = buildWeeklyPrompt({
      repo: "proj", weekStart: "2026-06-20", weekEnd: "2026-06-26",
      toil: [{ cmd: "npm run build", count: 9 }],
      coldReads: [{ file: "src/big.ts", count: 6 }],
      tokens: { input: 1000, output: 800, cacheRead: 5000 },
    });
    expect(p).toContain("npm run build");
    expect(p).toContain("src/big.ts");
    expect(p).toContain("proj");
    expect(buildWeeklyPrompt({ repo: "p", weekStart: "a", weekEnd: "b", toil: [], coldReads: [], tokens: { input: 0, output: 0, cacheRead: 0 } }))
      .toBe(buildWeeklyPrompt({ repo: "p", weekStart: "a", weekEnd: "b", toil: [], coldReads: [], tokens: { input: 0, output: 0, cacheRead: 0 } }));
  });

  it("callModel returns null without an API key (no throw, no network)", async () => {
    expect(await callModel("hello")).toBeNull();
  });

  // Deterministic aggregateWeek tests: a frozen `now` and rows dated relative to it,
  // so the window bounds never depend on the real system clock.
  const COLS =
    "(date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)";
  const FIXED_NOW = new Date("2026-07-07T12:00:00Z");
  const daysBefore = (n: number) =>
    new Date(FIXED_NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const freshDb = () => {
    process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    return openDb();
  };
  const seed = (db: ReturnType<typeof openDb>, date: string, input: number, output: number) =>
    db.prepare(`INSERT INTO token_usage ${COLS} VALUES (?, 'main', 'p', ?, ?, 0, 0, 0, 0)`).run(date, input, output);

  it("aggregateWeek computes a positive week-over-week token trend", () => {
    const db = freshDb();
    seed(db, daysBefore(0), 100, 100); // this week → 200
    seed(db, daysBefore(10), 50, 50); // prior week → 100
    expect(aggregateWeek(db, "p", FIXED_NOW).tokenTrend).toEqual({ thisWeek: 200, lastWeek: 100, pct: 100 });
    closeDb(db);
  });

  it("aggregateWeek computes a negative trend when spend drops", () => {
    const db = freshDb();
    seed(db, daysBefore(0), 50, 50); // this week → 100
    seed(db, daysBefore(10), 100, 100); // prior week → 200
    expect(aggregateWeek(db, "p", FIXED_NOW).tokenTrend).toEqual({ thisWeek: 100, lastWeek: 200, pct: -50 });
    closeDb(db);
  });

  it("aggregateWeek reports pct null when there is no prior-week data", () => {
    const db = freshDb();
    seed(db, daysBefore(0), 100, 100);
    expect(aggregateWeek(db, "p", FIXED_NOW).tokenTrend).toEqual({ thisWeek: 200, lastWeek: 0, pct: null });
    closeDb(db);
  });
});
