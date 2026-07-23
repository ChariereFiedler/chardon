import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDailyReport, generateDailyReport } from "./analyze-daily.ts";
import { openDb, closeDb, writeSession, writeEvent } from "../lib/db.ts";

describe("renderDailyReport", () => {
  it("produces the expected sections", () => {
    const md = renderDailyReport({
      date: "2026-06-25",
      velocity: { sessions: 2, tools: 40, failures: 3 },
      toil: [{ cmd: "npm run build", count: 5 }],
      coldReads: [{ file: "src/big.ts", count: 4 }],
      retryStorms: [],
      tokens: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, drift: false },
    });
    expect(md).toContain("2026-06-25");
    expect(md).toContain("npm run build");
    expect(md).toContain("src/big.ts");
    expect(md).toMatch(/velocity/i);
  });

  it("handles the absence of frictions without crashing", () => {
    const md = renderDailyReport({ date: "2026-06-25", velocity: { sessions: 0, tools: 0, failures: 0 }, toil: [], coldReads: [], retryStorms: [], tokens: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, drift: false } });
    expect(md).toContain("2026-06-25");
  });

  const baseData = {
    date: "2026-07-07",
    velocity: { sessions: 1, tools: 1, failures: 0 },
    toil: [],
    coldReads: [],
    retryStorms: [],
    tokens: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, drift: false },
  };

  it("flags silent collection failures in the health section", () => {
    const md = renderDailyReport({ ...baseData, health: { ok: 5, failed: 2 } });
    expect(md).toContain("## Collection health");
    expect(md).toContain("2 silent collection failure(s) today (5 ok)");
  });

  it("reports healthy collection when there are no failures", () => {
    const md = renderDailyReport({ ...baseData, health: { ok: 5, failed: 0 } });
    expect(md).toContain("🟢 healthy");
  });

  it("shows the last swallowed error next to the failure count", () => {
    const md = renderDailyReport({
      ...baseData,
      health: { ok: 5, failed: 2, lastError: "SQLITE_BUSY: database is locked" },
    });
    expect(md).toContain("last error: SQLITE_BUSY: database is locked");
  });

  it("omits the last-error line when no error message was captured", () => {
    const md = renderDailyReport({ ...baseData, health: { ok: 5, failed: 2 } });
    expect(md).not.toContain("last error:");
  });

  it("shows an estimated USD cost in the tokens section", () => {
    const md = renderDailyReport({
      ...baseData,
      tokens: { inputTokens: 1_000_000, outputTokens: 0, cacheRead: 0, cacheCreation: 0, drift: false, costUsd: 3 },
    });
    expect(md).toContain("~$3.00 (est.)");
  });

  it("renders the tokens and retry-storms sections", () => {
    const md = renderDailyReport({
      date: "2026-06-26",
      velocity: { sessions: 1, tools: 10, failures: 0 },
      toil: [], coldReads: [],
      retryStorms: [{ file: "src/a.ts", count: 5 }],
      tokens: { inputTokens: 100, outputTokens: 80, cacheRead: 300, cacheCreation: 10, drift: false },
    });
    expect(md).toContain("src/a.ts");
    expect(md).toMatch(/tokens/i);
    expect(md).toContain("300"); // cache read
  });

  it("renders retry storms under ## Detected frictions when toil and coldReads are empty", () => {
    const md = renderDailyReport({
      date: "2026-06-26",
      velocity: { sessions: 1, tools: 5, failures: 0 },
      toil: [],
      coldReads: [],
      retryStorms: [{ file: "src/b.ts", count: 3 }],
      tokens: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, drift: false },
    });
    // The ## Detected frictions header must appear
    expect(md).toContain("## Detected frictions");
    // The retry storms subsection must be present
    expect(md).toContain("### Retry storms");
    expect(md).toContain("src/b.ts");
    // The "no friction" fallback must NOT appear
    expect(md).not.toContain("No friction detected");
  });
});

describe("generateDailyReport — outDir resolved against projectDir", () => {
  let dbFile: string;
  let projectDir: string;
  let originalChardonDb: string | undefined;

  beforeEach(() => {
    // DB in a temp directory separate from projectDir
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-db-")), "t.db");
    // projectDir different from the current working directory
    projectDir = mkdtempSync(join(tmpdir(), "chardon-proj-"));
    originalChardonDb = process.env.CHARDON_DB;
    process.env.CHARDON_DB = dbFile;
  });

  afterEach(() => {
    if (originalChardonDb === undefined) {
      delete process.env.CHARDON_DB;
    } else {
      process.env.CHARDON_DB = originalChardonDb;
    }
  });

  it("writes daily-*.md under <projectDir>/docs/chardon and not under cwd", async () => {
    // Seed: session + event so the DB is not empty
    const db = openDb();
    writeSession(db, { id: "test-sess-outdir", repo: "chardon-proj", sessionType: "main" });
    writeEvent(db, { sessionId: "test-sess-outdir", tool: "Bash", success: true });
    closeDb(db);

    const now = new Date("2026-06-26T12:00:00Z");
    const { path: outPath } = await generateDailyReport({ projectDir, now });

    // The report must be created under projectDir
    const expectedOutDir = join(projectDir, "docs", "chardon");
    expect(existsSync(expectedOutDir)).toBe(true);
    expect(readdirSync(expectedOutDir).some((f) => f.startsWith("daily-"))).toBe(true);

    // The returned path must be under projectDir, not under cwd
    expect(outPath.startsWith(projectDir)).toBe(true);
    expect(outPath.startsWith(process.cwd())).toBe(
      process.cwd() === projectDir, // false because they are two different directories
    );
  });
});

describe("analyze-daily CLI entry", () => {
  it("runs as a CLI and writes a report under the project", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    const script = join(dirname(fileURLToPath(import.meta.url)), "analyze-daily.ts");
    const out = execFileSync("node", ["--experimental-strip-types", script], {
      cwd: dir,
      env: { ...process.env, CHARDON_DB: join(dir, "c.db"), CLAUDE_PROJECT_DIR: dir },
      encoding: "utf8",
    }).trim();
    expect(out).toContain("daily-");
    expect(existsSync(out)).toBe(true);
  });

  it("fails with a clean error message when CHARDON_DB is corrupted", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    const dbFile = join(dir, "corrupt.db");
    // Not a valid SQLite header: triggers SQLITE_NOTADB on the first statement.
    writeFileSync(dbFile, "garbage bytes, not a sqlite database\n".repeat(4));
    const script = join(dirname(fileURLToPath(import.meta.url)), "analyze-daily.ts");
    const result = spawnSync("node", ["--experimental-strip-types", script], {
      cwd: dir,
      env: { ...process.env, CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: dir },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    // A single clean line, not an uncaught stack trace.
    expect(result.stderr).toContain("analyze-daily: cannot generate the report:");
    expect(result.stderr).not.toContain("Uncaught");
    expect(result.stderr).not.toMatch(/^\s+at /m);
  });
});
