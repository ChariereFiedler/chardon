import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "./db.ts";
import {
  MIN_SUPPORT_SESSIONS,
  MINING_WINDOW_DAYS,
  mineProcedures,
  renderProcedureSkeleton,
} from "./procedures.ts";

const NOW = new Date("2026-07-24T12:00:00Z");

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-proc-")), "t.db");
  db = openDb();
});
afterEach(() => closeDb(db));

/** Writes one session and its ordered steps. A step is [tool, meta]. */
function seedSession(id: string, repo: string, steps: [string, Record<string, string>][]): void {
  writeSession(db, { id, repo, sessionType: "main" });
  for (const [tool, meta] of steps) {
    writeEvent(db, { sessionId: id, tool, success: true, meta });
  }
}

const EDIT_TEST_GIT: [string, Record<string, string>][] = [
  ["Edit", { file: "/home/u/proj/src/core/billing.ts" }],
  ["Bash", { cmd: "npm test", cmd_class: "test" }],
  ["Bash", { cmd: "git commit -m x", cmd_class: "git" }],
];

describe("mineProcedures", () => {
  it("finds a 3-step pattern repeated in 3 sessions of one repo", () => {
    for (let i = 0; i < MIN_SUPPORT_SESSIONS; i++) {
      seedSession(`s${i}`, "alpha", EDIT_TEST_GIT);
    }
    const candidates = mineProcedures(db, NOW);
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.steps).toEqual(["edit@core", "test", "git"]);
    expect(c.signature).toBe("edit@core > test > git");
    expect(c.supportSessions).toBe(3);
    expect(c.repos).toEqual(["alpha"]);
    expect(c.scope).toBe("local");
    expect(c.score).toBe(9);
    expect(c.examples.length).toBeGreaterThan(0);
    expect(c.examples[0]).toContain("npm test");
  });

  it("ignores a pattern below the session support", () => {
    seedSession("s1", "alpha", EDIT_TEST_GIT);
    seedSession("s2", "alpha", EDIT_TEST_GIT);
    expect(mineProcedures(db, NOW)).toHaveLength(0);
  });

  it("labels a pattern seen in two repos as global", () => {
    seedSession("s1", "alpha", EDIT_TEST_GIT);
    seedSession("s2", "alpha", EDIT_TEST_GIT);
    seedSession("s3", "beta", EDIT_TEST_GIT);
    const [c] = mineProcedures(db, NOW);
    expect(c.scope).toBe("global");
    expect(c.repos).toEqual(["alpha", "beta"]);
  });

  it("skips legacy Bash events without cmd_class and read-style tools", () => {
    for (let i = 0; i < MIN_SUPPORT_SESSIONS; i++) {
      seedSession(`s${i}`, "alpha", [
        ["Read", { file: "/home/u/proj/README.md" }],
        ["Edit", { file: "/home/u/proj/src/core/billing.ts" }],
        ["Bash", { cmd: "legacy command" }],
        ["Bash", { cmd: "npm test", cmd_class: "test" }],
        ["Bash", { cmd: "git commit", cmd_class: "git" }],
      ]);
    }
    const [c] = mineProcedures(db, NOW);
    expect(c.steps).toEqual(["edit@core", "test", "git"]);
  });

  it("keeps only closed patterns (no sub-pattern at equal support)", () => {
    for (let i = 0; i < MIN_SUPPORT_SESSIONS; i++) {
      seedSession(`s${i}`, "alpha", [
        ["Edit", { file: "/home/u/proj/src/core/a.ts" }],
        ["Bash", { cmd: "npm test", cmd_class: "test" }],
        ["Bash", { cmd: "npm run typecheck", cmd_class: "typecheck" }],
        ["Bash", { cmd: "git commit", cmd_class: "git" }],
      ]);
    }
    const candidates = mineProcedures(db, NOW);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].steps).toEqual(["edit@core", "test", "typecheck", "git"]);
  });

  it("windows out events older than MINING_WINDOW_DAYS", () => {
    for (let i = 0; i < MIN_SUPPORT_SESSIONS; i++) {
      seedSession(`s${i}`, "alpha", EDIT_TEST_GIT);
    }
    const beforeWindow = new Date(
      NOW.getTime() + (MINING_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000,
    );
    expect(mineProcedures(db, beforeWindow)).toHaveLength(0);
  });
});

describe("renderProcedureSkeleton", () => {
  it("emits parsable frontmatter and the observed steps", () => {
    const [c] = (() => {
      for (let i = 0; i < MIN_SUPPORT_SESSIONS; i++) {
        seedSession(`s${i}`, "alpha", EDIT_TEST_GIT);
      }
      return mineProcedures(db, NOW);
    })();
    const md = renderProcedureSkeleton(c);
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("name: ");
    expect(md).toContain("edit@core > test > git");
    expect(md).toContain("3 session(s)");
  });
});

describe("mineProcedures noise control", () => {
  it("excludes 'other' Bash steps from patterns", () => {
    for (let i = 0; i < MIN_SUPPORT_SESSIONS; i++) {
      seedSession(`n${i}`, "alpha", [
        ["Bash", { cmd: "ls", cmd_class: "other" }],
        ["Edit", { file: "/home/u/proj/src/core/a.ts" }],
        ["Bash", { cmd: "echo hi", cmd_class: "other" }],
        ["Bash", { cmd: "npm test", cmd_class: "test" }],
        ["Bash", { cmd: "git commit", cmd_class: "git" }],
      ]);
    }
    const candidates = mineProcedures(db, NOW);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].steps).toEqual(["edit@core", "test", "git"]);
  });

  it("collapses consecutive identical steps before mining", () => {
    for (let i = 0; i < MIN_SUPPORT_SESSIONS; i++) {
      seedSession(`r${i}`, "alpha", [
        ["Edit", { file: "/home/u/proj/src/core/a.ts" }],
        ["Edit", { file: "/home/u/proj/src/core/b.ts" }],
        ["Edit", { file: "/home/u/proj/src/core/c.ts" }],
        ["Bash", { cmd: "npm test", cmd_class: "test" }],
        ["Bash", { cmd: "git commit", cmd_class: "git" }],
      ]);
    }
    const candidates = mineProcedures(db, NOW);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].steps).toEqual(["edit@core", "test", "git"]);
  });
});
