import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb } from "./db.ts";
import { aggregateTranscripts, upsertTokenUsage, detectTokenDrift, tokensForDay, estimateCostUsd, PRICE_PER_M } from "./token-parser.ts";
import { transcriptSlug } from "./config.ts";

let projectDir: string;
let root: string;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  root = mkdtempSync(join(tmpdir(), "projects-"));
  process.env.CHARDON_PROJECTS_DIR = root;
  projectDir = "/home/x/myproj";
  const slugDir = join(root, transcriptSlug(projectDir));
  mkdirSync(slugDir, { recursive: true });
  const line = (ts: string, out: number, cr: number) => JSON.stringify({
    type: "assistant", timestamp: ts,
    message: { usage: { input_tokens: 100, output_tokens: out, cache_read_input_tokens: cr, cache_creation_input_tokens: 10 } },
  });
  writeFileSync(join(slugDir, "s1.jsonl"), `${line("2026-06-26T10:00:00Z", 50, 200)}\n${line("2026-06-26T11:00:00Z", 30, 100)}\n`);
});
afterEach(() => { delete process.env.CHARDON_PROJECTS_DIR; });

describe("detectTokenDrift", () => {
  it("flags a cache-read ratio spike vs the 7-day median", () => {
    // Seed 7 days of history: ratio cache_read/output_tokens = 1 each day
    const db = openDb();
    const ins = db.prepare(
      "INSERT INTO token_usage (date, origin, repo, output_tokens, cache_read) VALUES (?,?,?,?,?)",
    );
    for (const d of [
      "2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22",
      "2026-06-23", "2026-06-24", "2026-06-25",
    ]) {
      ins.run(d, "main", "p", 100, 100); // ratio = 1
    }
    // Today: ratio = 10 (1000 cache / 100 output) — far above median of 1
    ins.run("2026-06-26", "main", "p", 100, 1000);

    const r = detectTokenDrift(db, "p", "main", "2026-06-26");
    expect(r.drift).toBe(true);
    expect(r.ratio).toBe(10);
    expect(r.median).toBe(1);

    closeDb(db);
  });

  it("does not flag when today's ratio is within normal range", () => {
    const db = openDb();
    const ins = db.prepare(
      "INSERT INTO token_usage (date, origin, repo, output_tokens, cache_read) VALUES (?,?,?,?,?)",
    );
    for (const d of [
      "2026-06-19", "2026-06-20", "2026-06-21", "2026-06-22",
      "2026-06-23", "2026-06-24", "2026-06-25",
    ]) {
      ins.run(d, "main", "p", 100, 100); // ratio = 1
    }
    ins.run("2026-06-26", "main", "p", 100, 110); // ratio = 1.1 — within 2x median

    const r = detectTokenDrift(db, "p", "main", "2026-06-26");
    expect(r.drift).toBe(false);

    closeDb(db);
  });
});

describe("token-parser", () => {
  it("aggregates token usage per day for a project", () => {
    const rows = aggregateTranscripts(projectDir);
    const day = rows.find((r) => r.date === "2026-06-26");
    expect(day?.origin).toBe("main");
    expect(day?.repo).toBe("myproj");
    expect(day?.outputTokens).toBe(80);
    expect(day?.cacheRead).toBe(300);
  });

  it("classifies a worktree project as origin=worktree", () => {
    const rows = aggregateTranscripts("/home/x/myproj-wt-2");
    // no transcripts for that slug → empty, but origin classification is by basename
    expect(rows.every((r) => r.origin === "worktree")).toBe(true);
  });

  it("upsert is idempotent on (date, origin, repo)", () => {
    const db = openDb();
    const rows = aggregateTranscripts(projectDir);
    upsertTokenUsage(db, rows);
    upsertTokenUsage(db, rows);
    const n = db.prepare("SELECT COUNT(*) c FROM token_usage").get() as { c: number };
    expect(n.c).toBe(rows.length);
    closeDb(db);
  });

  it("two repos do not mix: each repo's tokens are isolated", () => {
    // Set up a second project directory with its own transcripts.
    const projectDir2 = "/home/x/otherproj";
    const slugDir2 = join(root, transcriptSlug(projectDir2));
    mkdirSync(slugDir2, { recursive: true });
    const line2 = (ts: string, out: number, cr: number) => JSON.stringify({
      type: "assistant", timestamp: ts,
      message: { usage: { input_tokens: 500, output_tokens: out, cache_read_input_tokens: cr, cache_creation_input_tokens: 20 } },
    });
    writeFileSync(join(slugDir2, "s2.jsonl"), `${line2("2026-06-26T12:00:00Z", 200, 800)}\n`);

    const db = openDb();
    upsertTokenUsage(db, aggregateTranscripts(projectDir));
    upsertTokenUsage(db, aggregateTranscripts(projectDir2));

    // Each repo must have its own row with its own totals.
    const myprojRow = db.prepare(
      "SELECT output_tokens FROM token_usage WHERE date = '2026-06-26' AND repo = 'myproj'",
    ).get() as { output_tokens: number } | undefined;
    const otherprojRow = db.prepare(
      "SELECT output_tokens FROM token_usage WHERE date = '2026-06-26' AND repo = 'otherproj'",
    ).get() as { output_tokens: number } | undefined;

    expect(myprojRow?.output_tokens).toBe(80);
    expect(otherprojRow?.output_tokens).toBe(200);

    // detectTokenDrift is scoped per repo — myproj drift must not bleed into otherproj.
    const drift1 = detectTokenDrift(db, "myproj", "main", "2026-06-26");
    const drift2 = detectTokenDrift(db, "otherproj", "main", "2026-06-26");
    // Both have only one day of data, so median = 0 → drift = false.
    expect(drift1.drift).toBe(false);
    expect(drift2.drift).toBe(false);

    closeDb(db);
  });

  it("tokensForDay sums input+output for a repo/origin/date and returns 0 when absent", () => {
    process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    const db = openDb();
    db.prepare(
      `INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       VALUES ('2026-07-07', 'main', 'p', 400, 600, 0, 0, 0, 0)`,
    ).run();
    expect(tokensForDay(db, "p", "main", "2026-07-07")).toBe(1000);
    expect(tokensForDay(db, "p", "main", "2026-07-06")).toBe(0);
    expect(tokensForDay(db, "p", "worktree", "2026-07-07")).toBe(0);
    closeDb(db);
  });

  it("estimateCostUsd applies the per-million rates", () => {
    expect(estimateCostUsd({ input: 1_000_000, output: 0, cacheRead: 0, cacheCreation: 0 })).toBeCloseTo(PRICE_PER_M.input);
    expect(estimateCostUsd({ input: 0, output: 1_000_000, cacheRead: 0, cacheCreation: 0 })).toBeCloseTo(PRICE_PER_M.output);
    expect(estimateCostUsd({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 })).toBe(0);
  });
});
