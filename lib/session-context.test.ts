import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, type ChardonDb } from "./db.ts";
import { buildSessionContext } from "./session-context.ts";

const REPO = "myrepo";
const NOW = new Date("2026-07-23T10:00:00Z");
const MS_PER_DAY = 86_400_000;

/** ISO date (YYYY-MM-DD) `daysAgo` days before NOW. */
function dateAgo(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * MS_PER_DAY).toISOString().slice(0, 10);
}

function seedAction(db: ChardonDb, kind: string, target: string | null, status: string, repo = REPO): void {
  db.prepare("INSERT INTO actions (repo, kind, target, status) VALUES (?, ?, ?, ?)").run(repo, kind, target, status);
}

function seedBashEvents(db: ChardonDb, cmd: string, count: number, date: string, repo = REPO): void {
  db.prepare("INSERT OR IGNORE INTO sessions (id, repo, session_type) VALUES (?, ?, 'main')").run(`sess-${repo}`, repo);
  const insert = db.prepare(
    "INSERT INTO events (session_id, ts, tool, success, meta) VALUES (?, ?, 'Bash', 1, ?)",
  );
  for (let i = 0; i < count; i++) {
    insert.run(`sess-${repo}`, `${date} 12:00:0${i % 10}`, JSON.stringify({ cmd }));
  }
}

function seedHealth(db: ChardonDb, date: string, ok: number, failed: number): void {
  db.prepare("INSERT INTO hook_health (date, repo, ok, failed) VALUES (?, ?, ?, ?)").run(date, REPO, ok, failed);
}

describe("buildSessionContext", () => {
  let db: ChardonDb;
  let savedDb: string | undefined;

  beforeEach(() => {
    savedDb = process.env.CHARDON_DB;
    process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-ctx-")), "t.db");
    db = openDb();
  });

  afterEach(() => {
    closeDb(db);
    if (savedDb !== undefined) {
      process.env.CHARDON_DB = savedDb;
    } else {
      delete process.env.CHARDON_DB;
    }
  });

  it("returns null on an empty DB", () => {
    expect(buildSessionContext(db, REPO, NOW)).toBeNull();
  });

  it("lists open actions with id, kind and target", () => {
    seedAction(db, "enable-hook", "pre-commit", "proposed");
    const ctx = buildSessionContext(db, REPO, NOW);
    expect(ctx).toContain("open action #1: enable-hook (pre-commit)");
  });

  it("caps open actions at 3 and ignores dropped/measured and other repos", () => {
    seedAction(db, "enable-hook", "a", "proposed");
    seedAction(db, "split-file", "b", "applied");
    seedAction(db, "propose-skill", "c", "proposed");
    seedAction(db, "enable-hook", "d", "proposed");
    seedAction(db, "enable-hook", "e", "dropped");
    seedAction(db, "enable-hook", "f", "measured");
    seedAction(db, "enable-hook", "g", "proposed", "other-repo");
    const ctx = buildSessionContext(db, REPO, NOW);
    expect(ctx).not.toBeNull();
    const actionLines = ctx!.split("\n").filter((l) => l.startsWith("open action"));
    expect(actionLines).toHaveLength(3);
    expect(ctx).not.toContain("(e)");
    expect(ctx).not.toContain("(f)");
    expect(ctx).not.toContain("(g)");
  });

  it("renders an action without target without empty parens", () => {
    seedAction(db, "enable-hook", null, "proposed");
    const ctx = buildSessionContext(db, REPO, NOW);
    expect(ctx).toContain("open action #1: enable-hook");
    expect(ctx).not.toContain("(");
  });

  it("reports yesterday's top friction when a command repeats enough", () => {
    seedBashEvents(db, "npm test", 5, dateAgo(1));
    seedBashEvents(db, "ls", 3, dateAgo(1));
    const ctx = buildSessionContext(db, REPO, NOW);
    expect(ctx).toContain('yesterday\'s top friction: "npm test" ×5');
  });

  it("ignores friction from today or below the threshold", () => {
    seedBashEvents(db, "npm test", 5, dateAgo(0));
    seedBashEvents(db, "npm run lint", 2, dateAgo(1));
    expect(buildSessionContext(db, REPO, NOW)).toBeNull();
  });

  it("warns after 3 consecutive days with collection failures", () => {
    seedHealth(db, dateAgo(1), 2, 1);
    seedHealth(db, dateAgo(2), 0, 3);
    seedHealth(db, dateAgo(3), 1, 2);
    const ctx = buildSessionContext(db, REPO, NOW);
    expect(ctx).toContain("chardon collection has been failing for 3 days; run with CHARDON_DEBUG=1");
  });

  it("counts a failure streak that includes today", () => {
    seedHealth(db, dateAgo(0), 0, 1);
    seedHealth(db, dateAgo(1), 0, 1);
    seedHealth(db, dateAgo(2), 0, 1);
    seedHealth(db, dateAgo(3), 0, 1);
    const ctx = buildSessionContext(db, REPO, NOW);
    expect(ctx).toContain("failing for 4 days");
  });

  it("stays silent for 2 failing days or a broken streak", () => {
    seedHealth(db, dateAgo(1), 0, 1);
    seedHealth(db, dateAgo(2), 0, 1);
    expect(buildSessionContext(db, REPO, NOW)).toBeNull();

    // Day 3 healthy: the streak is broken even if day 4 failed.
    seedHealth(db, dateAgo(3), 5, 0);
    seedHealth(db, dateAgo(4), 0, 1);
    expect(buildSessionContext(db, REPO, NOW)).toBeNull();
  });

  it("combines sections into at most 6 short lines", () => {
    seedAction(db, "enable-hook", "a", "proposed");
    seedAction(db, "split-file", "b", "applied");
    seedAction(db, "propose-skill", "c", "proposed");
    seedBashEvents(db, "npm test", 4, dateAgo(1));
    seedHealth(db, dateAgo(1), 0, 1);
    seedHealth(db, dateAgo(2), 0, 1);
    seedHealth(db, dateAgo(3), 0, 1);
    const ctx = buildSessionContext(db, REPO, NOW);
    expect(ctx).not.toBeNull();
    const lines = ctx!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.length).toBe(5);
  });
});
