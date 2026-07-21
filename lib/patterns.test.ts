import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "./db.ts";
import { detectToilLoops, detectColdReads, computeVelocity, detectRetryStorms, detectFailingCommands, detectSlowCommands, detectSkillUsage, detectCrossRepoCommands, RETRY_MIN, TOIL_MIN, FAIL_MIN, SLOW_MIN, SLOW_MS } from "./patterns.ts";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
  writeSession(db, { id: "s1", repo: "p", sessionType: "main" });
});
afterEach(() => closeDb(db));

describe("patterns", () => {
  it("detectToilLoops detects a command repeated >= 3 times", () => {
    for (let i = 0; i < 3; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    const loops = detectToilLoops(db, "p", 24, []);
    expect(loops.find((l) => l.cmd === "npm run build")?.count).toBe(3);
  });

  it("detectToilLoops respects exclusions", () => {
    for (let i = 0; i < 3; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "git status" } });
    // Also seed a non-excluded command so the exclusion filter must actively remove items
    for (let i = 0; i < 3; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    const result = detectToilLoops(db, "p", 24, ["git status"]);
    // "git status" is excluded → only "npm run build" remains
    expect(result).toHaveLength(1);
    expect(result[0].cmd).toBe("npm run build");
    expect(result.find((r) => r.cmd === "git status")).toBeUndefined();
  });

  it("detectColdReads detects a file read >= 3 times", () => {
    for (let i = 0; i < 3; i++) writeEvent(db, { sessionId: "s1", tool: "Read", success: true, meta: { file: "src/big.ts" } });
    expect(detectColdReads(db, "p", 24)[0]).toEqual({ file: "src/big.ts", count: 3 });
  });

  it("computeVelocity counts sessions/tools/failures", () => {
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: false });
    const v = computeVelocity(db, "p", 24);
    expect(v.sessions).toBe(1);
    expect(v.failures).toBe(1);
  });

  it("detectRetryStorms flags a file edited >= RETRY_MIN times", () => {
    for (let i = 0; i < RETRY_MIN; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Edit", success: true, meta: { file: "src/a.ts" } });
    }
    const storms = detectRetryStorms(db, "p", 24);
    expect(storms).toHaveLength(1);
    expect(storms[0]).toEqual({ file: "src/a.ts", count: RETRY_MIN });
  });

  it("detectRetryStorms returns empty when edits are below threshold", () => {
    for (let i = 0; i < RETRY_MIN - 1; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Edit", success: true, meta: { file: "src/b.ts" } });
    }
    expect(detectRetryStorms(db, "p", 24)).toHaveLength(0);
  });

  it("window boundary: an event with an old ts is excluded by a 1-hour window", () => {
    // Insert an event with an explicit past timestamp (year 2020) directly via SQL
    db.prepare(
      `INSERT INTO events (session_id, tool, success, ts, meta)
       VALUES ('s1', 'Bash', 1, '2020-01-01T00:00:00Z', '{"cmd":"npm run old"}')`,
    ).run();
    // Also seed 2 more recent events for the same cmd (below TOIL_MIN=3 total in window)
    for (let i = 0; i < 2; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run old" } });
    }
    // With a 1-hour window the 2020 event is excluded → only 2 events → below TOIL_MIN
    expect(detectToilLoops(db, "p", 1, [])).toHaveLength(0);
    // With a very large window the 2020 event is included → 3 events → at TOIL_MIN
    const all = detectToilLoops(db, "p", 24 * 365 * 10, []);
    expect(all.find((l) => l.cmd === "npm run old")?.count).toBe(3);
  });

  it("a command at exactly TOIL_MIN - 1 repetitions is NOT reported", () => {
    for (let i = 0; i < TOIL_MIN - 1; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run lint" } });
    }
    expect(detectToilLoops(db, "p", 24, []).find((l) => l.cmd === "npm run lint")).toBeUndefined();
  });

  it("detectFailingCommands clusters a Bash command failing >= FAIL_MIN times", () => {
    for (let i = 0; i < FAIL_MIN; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run build" } });
    // A successful run of the same command must not count.
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    const fails = detectFailingCommands(db, "p", 24);
    expect(fails).toEqual([{ cmd: "npm run build", count: FAIL_MIN }]);
  });

  it("detectFailingCommands ignores commands below FAIL_MIN failures", () => {
    for (let i = 0; i < FAIL_MIN - 1; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm test" } });
    expect(detectFailingCommands(db, "p", 24)).toHaveLength(0);
  });

  it("detectSlowCommands flags a command run >= SLOW_MIN times averaging >= SLOW_MS", () => {
    for (let i = 0; i < SLOW_MIN; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, durationMs: SLOW_MS + 5_000, meta: { cmd: "npm test" } });
    const slow = detectSlowCommands(db, "p", 24);
    expect(slow).toEqual([{ cmd: "npm test", count: SLOW_MIN, avgMs: SLOW_MS + 5_000 }]);
  });

  it("detectSlowCommands ignores fast commands even when frequent", () => {
    for (let i = 0; i < SLOW_MIN + 2; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, durationMs: 500, meta: { cmd: "ls" } });
    expect(detectSlowCommands(db, "p", 24)).toHaveLength(0);
  });

  it("detectSlowCommands ignores commands with no duration recorded", () => {
    for (let i = 0; i < SLOW_MIN; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run x" } });
    expect(detectSlowCommands(db, "p", 24)).toHaveLength(0);
  });

  it("detectSkillUsage returns the set of skills invoked in the window", () => {
    writeEvent(db, { sessionId: "s1", tool: "Skill", success: true, meta: { skill: "systematic-debugging" } });
    const used = detectSkillUsage(db, "p", 24);
    expect(used.has("systematic-debugging")).toBe(true);
    expect(used.has("recurring-bug-root-cause")).toBe(false);
  });

  it("detectCrossRepoCommands flags a command recurring across repos", () => {
    writeSession(db, { id: "s2", repo: "q", sessionType: "main" });
    for (let i = 0; i < 2; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    for (let i = 0; i < 2; i++) writeEvent(db, { sessionId: "s2", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    expect(detectCrossRepoCommands(db, 24)).toEqual([{ cmd: "npm run build", repos: 2, total: 4 }]);
  });

  it("detectCrossRepoCommands ignores a command confined to a single repo", () => {
    for (let i = 0; i < 5; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run only" } });
    expect(detectCrossRepoCommands(db, 24).find((x) => x.cmd === "npm run only")).toBeUndefined();
  });
});
