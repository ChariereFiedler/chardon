import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "./db.ts";
import { severityFor, severityForProposal, actionHint, proposeActions, persistActions, openActions, recordSkeleton, skeletonPaths } from "./improve.ts";
import { FAIL_MIN, SLOW_MIN, SLOW_MS, EDIT_NO_TEST_MIN } from "./patterns.ts";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
  writeSession(db, { id: "s1", repo: "p", sessionType: "main" });
  for (let i = 0; i < 9; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
});
afterEach(() => closeDb(db));

describe("improve", () => {
  it("severityFor maps counts to bands", () => {
    expect(severityFor(9)).toBe("high");
    expect(severityFor(8)).toBe("high");   // exact SEV_HIGH boundary
    expect(severityFor(7)).toBe("medium"); // just below SEV_HIGH
    expect(severityFor(5)).toBe("medium");
    expect(severityFor(4)).toBe("medium"); // exact SEV_MEDIUM boundary
    expect(severityFor(3)).toBe("low");    // just below SEV_MEDIUM
    expect(severityFor(2)).toBe("low");
  });

  it("proposeActions turns a toil loop into an automate-command action", () => {
    const a = proposeActions(db, "p", 24).find((x) => x.target === "npm run build");
    expect(a?.kind).toBe("automate-command");
    expect(a?.baseline).toBe(9);
    expect(a?.severity).toBe("high");
  });

  it("persistActions inserts once and dedupes on re-run", () => {
    const acts = proposeActions(db, "p", 24);
    const firstInsert = persistActions(db, "p", acts);
    expect(firstInsert).toBe(acts.length); // exact count: all inserted
    expect(persistActions(db, "p", acts)).toBe(0); // already open — none re-inserted
    expect(openActions(db, "p").length).toBe(acts.length);
  });

  it("proposeActions maps a cold read to split-or-summarize and a retry storm to investigate-file", () => {
    // Seed COLD_MIN Read events on a file → should produce "split-or-summarize"
    for (let i = 0; i < 4; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Read", success: true, meta: { file: "src/big.ts" } });
    }
    // Seed RETRY_MIN Edit events on a different file → should produce "investigate-file"
    for (let i = 0; i < 4; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Edit", success: true, meta: { file: "src/edit.ts" } });
    }
    const acts = proposeActions(db, "p", 24);

    const coldAction = acts.find((a) => a.target === "src/big.ts");
    expect(coldAction?.kind).toBe("split-or-summarize");
    expect(coldAction?.patternType).toBe("cold_read");       // exact patternType
    expect(coldAction?.baseline).toBe(4);
    expect(coldAction?.severity).toBe("medium");             // 4 >= SEV_MEDIUM

    const stormAction = acts.find((a) => a.target === "src/edit.ts");
    expect(stormAction?.kind).toBe("investigate-file");
    expect(stormAction?.patternType).toBe("retry_storm");    // exact patternType
    expect(stormAction?.baseline).toBe(4);
    expect(stormAction?.severity).toBe("medium");            // 4 >= SEV_MEDIUM
  });

  it("proposeActions sets correct baseline and severity for toil loops", () => {
    // 9 events already seeded for "npm run build" in beforeEach
    const a = proposeActions(db, "p", 24).find((x) => x.target === "npm run build");
    expect(a?.kind).toBe("automate-command");
    expect(a?.patternType).toBe("toil_loop");
    expect(a?.baseline).toBe(9);
    expect(a?.severity).toBe("high"); // 9 >= SEV_HIGH=8
  });

  it("proposeActions proposes fix-failing-command for a failing cluster", () => {
    for (let i = 0; i < FAIL_MIN; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run build" } });
    const a = proposeActions(db, "p", 24).find((x) => x.kind === "fix-failing-command");
    expect(a).toMatchObject({ target: "npm run build", patternType: "failure_cluster", baseline: FAIL_MIN });
  });

  it("proposeActions proposes speed-up-command for a slow command", () => {
    for (let i = 0; i < SLOW_MIN; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, durationMs: SLOW_MS + 1_000, meta: { cmd: "npm test" } });
    const a = proposeActions(db, "p", 24).find((x) => x.kind === "speed-up-command");
    expect(a).toMatchObject({ target: "npm test", patternType: "slow_command", baseline: SLOW_MIN });
  });

  it("proposeActions proposes consider-skill when a mapped friction ran without its skill", () => {
    for (let i = 0; i < FAIL_MIN; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run build" } });
    const a = proposeActions(db, "p", 24).find((x) => x.kind === "consider-skill");
    expect(a).toMatchObject({ target: "systematic-debugging", patternType: "uncovered_friction" });
  });

  it("proposeActions does NOT propose consider-skill when the skill was already used", () => {
    for (let i = 0; i < FAIL_MIN; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run build" } });
    writeEvent(db, { sessionId: "s1", tool: "Skill", success: true, meta: { skill: "systematic-debugging" } });
    expect(proposeActions(db, "p", 24).find((x) => x.kind === "consider-skill")).toBeUndefined();
  });

  it("proposeActions does NOT propose consider-skill for an unmapped friction (toil loop alone)", () => {
    // beforeEach seeds only 9 successful "npm run build" events → a toil loop, which
    // has no FRICTION_SKILL_MAP entry, so no skill should be suggested.
    expect(proposeActions(db, "p", 24).find((x) => x.kind === "consider-skill")).toBeUndefined();
  });

  it("proposeActions respects custom thresholds (a high toilMin suppresses the toil proposal)", () => {
    // beforeEach seeds 9 "npm run build" toil events.
    const strict = { toilMin: 20, retryMin: 4, coldMin: 3, failMin: 3, slowMin: 3, slowMs: 30000 };
    expect(proposeActions(db, "p", 24, undefined, strict).find((x) => x.kind === "automate-command")).toBeUndefined();
    expect(proposeActions(db, "p", 24).find((x) => x.kind === "automate-command")).toBeTruthy();
  });

  it("actionHint gives a concrete next step per kind, empty for unknown", () => {
    expect(actionHint("automate-command", "npm run build")).toContain("toilExclusions");
    expect(actionHint("fix-failing-command", "npm test")).toContain("fix or guard");
    expect(actionHint("consider-skill", "systematic-debugging")).toContain("systematic-debugging");
    expect(actionHint("mystery-kind", "x")).toBe("");
  });

  it("severityForProposal uses percentage bands for token proposals, count bands otherwise", () => {
    expect(severityForProposal("token_growth", 60)).toBe("medium"); // 60% → medium (not high)
    expect(severityForProposal("over_budget", 150)).toBe("high");
    expect(severityForProposal("toil_loop", 60)).toBe("high"); // 60 count → high
    expect(severityForProposal("toil_loop", 3)).toBe("low");
  });

  it("proposeActions proposes reduce-token-spend when today's tokens exceed the budget", () => {
    const acts = proposeActions(db, "p", 24, { budget: 100000, tokensToday: 250000, trendPct: null });
    const a = acts.find((x) => x.kind === "reduce-token-spend");
    // overage = (250000-100000)/100000 = 150% → high severity.
    expect(a).toMatchObject({ target: "daily-tokens", patternType: "over_budget", baseline: 150, severity: "high" });
  });

  it("proposeActions does NOT propose reduce-token-spend under budget or with no budget", () => {
    expect(proposeActions(db, "p", 24, { budget: 100000, tokensToday: 50000, trendPct: null }).find((x) => x.kind === "reduce-token-spend")).toBeUndefined();
    expect(proposeActions(db, "p", 24, { budget: 0, tokensToday: 999999, trendPct: null }).find((x) => x.kind === "reduce-token-spend")).toBeUndefined();
  });

  it("proposeActions proposes investigate-token-growth only when trend >= TREND_ALERT_PCT", () => {
    expect(proposeActions(db, "p", 24, { budget: 0, tokensToday: 0, trendPct: 80 }).find((x) => x.kind === "investigate-token-growth"))
      .toMatchObject({ target: "weekly-tokens", patternType: "token_growth", baseline: 80, severity: "medium" });
    expect(proposeActions(db, "p", 24, { budget: 0, tokensToday: 0, trendPct: 20 }).find((x) => x.kind === "investigate-token-growth")).toBeUndefined();
    expect(proposeActions(db, "p", 24, { budget: 0, tokensToday: 0, trendPct: null }).find((x) => x.kind === "investigate-token-growth")).toBeUndefined();
  });

  const seedEditsWithoutTests = (sessionId: string) => {
    for (let i = 0; i < EDIT_NO_TEST_MIN; i++)
      writeEvent(db, { sessionId, tool: "Edit", success: true, meta: { file: "src/a.ts" } });
    writeEvent(db, { sessionId, tool: "Bash", success: true, meta: { cmd: "ls", cmd_class: "other" } });
  };

  it("proposeActions proposes run-tests-after-edits for a session editing without tests", () => {
    seedEditsWithoutTests("s1");
    const a = proposeActions(db, "p", 24).find((x) => x.kind === "run-tests-after-edits");
    expect(a).toMatchObject({ target: "s1", patternType: "edited_without_tests", baseline: EDIT_NO_TEST_MIN });
  });

  it("proposeActions proposes verify-before-commit for unverified commits", () => {
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "git commit -m 'x'", cmd_class: "git" } });
    const a = proposeActions(db, "p", 24).find((x) => x.kind === "verify-before-commit");
    expect(a).toMatchObject({ target: "git commit", patternType: "unverified_commit", baseline: 1, severity: "low" });
  });

  it("proposeActions does NOT propose verify-before-commit when tests preceded the commit", () => {
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm test", cmd_class: "test" } });
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "git commit -m 'x'", cmd_class: "git" } });
    expect(proposeActions(db, "p", 24).find((x) => x.kind === "verify-before-commit")).toBeUndefined();
  });

  it("consider-skill maps edited_without_tests to test-driven-development", () => {
    seedEditsWithoutTests("s1");
    const a = proposeActions(db, "p", 24).find(
      (x) => x.kind === "consider-skill" && x.target === "test-driven-development",
    );
    expect(a).toMatchObject({ patternType: "uncovered_friction", baseline: EDIT_NO_TEST_MIN });
  });

  it("consider-skill maps unverified_commit to verification-before-completion", () => {
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "git commit -m 'x'", cmd_class: "git" } });
    const a = proposeActions(db, "p", 24).find(
      (x) => x.kind === "consider-skill" && x.target === "verification-before-completion",
    );
    expect(a).toMatchObject({ patternType: "uncovered_friction" });
  });

  it("actionHint covers the method proposal kinds", () => {
    expect(actionHint("run-tests-after-edits", "s1")).toContain("test");
    expect(actionHint("verify-before-commit", "git commit")).toContain("git commit");
  });

  const seedFailures = (cmd: string) => {
    for (let i = 0; i < FAIL_MIN; i++)
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd } });
  };

  it("proposeActions honors a custom skillMap for a mapped friction", () => {
    seedFailures("npm run build");
    const a = proposeActions(db, "p", 24, undefined, undefined, { failure_cluster: "my-debug-skill" })
      .find((x) => x.kind === "consider-skill");
    expect(a?.target).toBe("my-debug-skill");
  });

  it("proposeActions applies an onFail regex to the failing command, over the patternType entry", () => {
    seedFailures("npm test");
    const skillMap = {
      failure_cluster: "systematic-debugging",
      onFail: [{ match: "npm test", skill: "test-first-skill" }],
    };
    const a = proposeActions(db, "p", 24, undefined, undefined, skillMap).find((x) => x.kind === "consider-skill");
    expect(a?.target).toBe("test-first-skill");
  });

  it("proposeActions silently ignores invalid onFail entries (unsafe regex, malformed shape)", () => {
    seedFailures("npm test");
    const skillMap = {
      failure_cluster: "systematic-debugging",
      onFail: [
        { match: "(a+)+$", skill: "never-me" }, // catastrophic shape, rejected by safeRegex
        { match: "npm test" }, // missing skill
        "garbage",
      ],
    } as never;
    const a = proposeActions(db, "p", 24, undefined, undefined, skillMap).find((x) => x.kind === "consider-skill");
    expect(a?.target).toBe("systematic-debugging"); // falls back to the patternType entry
  });

  it("proposeActions keeps consider-skill when the mapped skill is installed", () => {
    seedFailures("npm run build");
    const acts = proposeActions(db, "p", 24, undefined, undefined, undefined, ["systematic-debugging"]);
    expect(acts.find((x) => x.kind === "consider-skill")?.target).toBe("systematic-debugging");
    expect(acts.find((x) => x.kind === "create-skill")).toBeUndefined();
  });

  it("proposeActions requalifies to create-skill when the mapped skill is not installed", () => {
    seedFailures("npm run build");
    const a = proposeActions(db, "p", 24, undefined, undefined, undefined, ["some-other-skill"])
      .find((x) => x.kind === "create-skill");
    expect(a).toMatchObject({ target: "systematic-debugging", patternType: "uncovered_friction", baseline: FAIL_MIN });
    expect(a?.source).toEqual({ patternType: "failure_cluster", target: "npm run build" });
    expect(proposeActions(db, "p", 24, undefined, undefined, undefined, ["some-other-skill"]).find((x) => x.kind === "consider-skill")).toBeUndefined();
  });

  it("proposeActions keeps consider-skill when the inventory is empty (scan failed or no skills found)", () => {
    seedFailures("npm run build");
    const acts = proposeActions(db, "p", 24, undefined, undefined, undefined, []);
    expect(acts.find((x) => x.kind === "consider-skill")?.target).toBe("systematic-debugging");
    expect(acts.find((x) => x.kind === "create-skill")).toBeUndefined();
  });

  it("proposeActions proposes promote-to-canonical for a command recurring across repos", () => {
    writeSession(db, { id: "s2", repo: "q", sessionType: "main" });
    writeEvent(db, { sessionId: "s2", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    const a = proposeActions(db, "p", 24).find((x) => x.kind === "promote-to-canonical");
    expect(a).toMatchObject({ target: "npm run build", patternType: "cross_repo", baseline: 2 });
  });

  it("proposeActions does NOT propose promote-to-canonical for a single-repo command", () => {
    expect(proposeActions(db, "p", 24).find((x) => x.kind === "promote-to-canonical")).toBeUndefined();
  });

  it("actionHint covers the create-skill and promote-to-canonical kinds", () => {
    expect(actionHint("create-skill", "my-skill")).toContain("my-skill");
    expect(actionHint("promote-to-canonical", "npm test", 3)).toBe("recurs across 3 repos: promote a shared rule or skill");
    expect(actionHint("promote-to-canonical", "npm test")).toContain("repos");
  });

  it("recordSkeleton persists one patterns row per path and skeletonPaths maps skill to path", () => {
    const entry = { skill: "fix-build", patternType: "failure_cluster", target: "npm run build", baseline: 3, path: "/out/proposed/skill-npm-run-build.md" };
    recordSkeleton(db, "p", entry);
    recordSkeleton(db, "p", entry); // second call: no duplicate row
    const rows = db.prepare("SELECT COUNT(*) AS c FROM patterns WHERE repo='p'").get() as { c: number };
    expect(rows.c).toBe(1);
    expect(skeletonPaths(db, "p")).toEqual({ "fix-build": "/out/proposed/skill-npm-run-build.md" });
    expect(skeletonPaths(db, "other")).toEqual({});
  });

  const proposedCount = (target: string) =>
    (db.prepare("SELECT COUNT(*) AS c FROM actions WHERE repo='p' AND target=? AND status='proposed'").get(target) as { c: number }).c;

  it("persistActions suppresses a target measured without effect (after_metric >= baseline)", () => {
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status, after_metric)
       VALUES ('p', 'automate-command', 'npm run build', 'toil_loop', 9, 'measured', 9)`,
    ).run();
    persistActions(db, "p", proposeActions(db, "p", 24));
    expect(proposedCount("npm run build")).toBe(0); // ineffective past attempt → not re-proposed
  });

  it("persistActions suppresses a dropped target", () => {
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
       VALUES ('p', 'automate-command', 'npm run build', 'toil_loop', 9, 'dropped')`,
    ).run();
    persistActions(db, "p", proposeActions(db, "p", 24));
    expect(proposedCount("npm run build")).toBe(0);
  });

  it("persistActions still proposes a target whose past fix was effective (may regress)", () => {
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status, after_metric)
       VALUES ('p', 'automate-command', 'npm run build', 'toil_loop', 9, 'measured', 1)`,
    ).run();
    persistActions(db, "p", proposeActions(db, "p", 24));
    expect(proposedCount("npm run build")).toBe(1); // effective → re-proposable
  });
});
