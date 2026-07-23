import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "../lib/db.ts";
import { openActions } from "../lib/improve.ts";
import { renderImproveDigest, runImprove } from "./improve.ts";

describe("renderImproveDigest", () => {
  it("renders proposals with severity icons and the ROI section", () => {
    const md = renderImproveDigest({
      proposals: [{ kind: "automate-command", target: "npm run build", patternType: "toil_loop", baseline: 9, severity: "high" }],
      open: [{ id: 1, kind: "split-or-summarize", target: "src/big.ts", status: "applied" }],
      roi: [{ kind: "automate-command", target: "npm run build", delta: 5 }],
    });
    expect(md).toContain("🔴");
    expect(md).toContain("npm run build");
    expect(md).toContain("src/big.ts");
    expect(md).toMatch(/roi/i);
    expect(md).toContain("5");
  });

  it("handles an empty digest without crashing", () => {
    expect(renderImproveDigest({ proposals: [], open: [], roi: [] })).toMatch(/no/i);
  });

  it("renders a Regressions section when a fixed friction returned", () => {
    const md = renderImproveDigest({
      proposals: [],
      regressions: [{ kind: "automate-command", target: "npm run build", baseline: 5, current: 9 }],
      open: [],
      roi: [],
    });
    expect(md).toContain("## Regressions");
    expect(md).toContain("**automate-command** → `npm run build` regressed (now 9, baseline was 5)");
  });

  it("renders an actionable hint under each proposal", () => {
    const md = renderImproveDigest({
      proposals: [{ kind: "automate-command", target: "npm run build", patternType: "toil_loop", baseline: 9, severity: "high" }],
      open: [],
      roi: [],
    });
    expect(md).toContain("↳");
    expect(md).toContain("toilExclusions");
  });

  it("renders a create-skill proposal with its hint and skeleton path", () => {
    const md = renderImproveDigest({
      proposals: [{ kind: "create-skill", target: "fix-build", patternType: "uncovered_friction", baseline: 4, severity: "medium" }],
      skeletons: { "fix-build": "/proj/docs/chardon/proposed/skill-npm-run-build.md" },
      open: [],
      roi: [],
    });
    expect(md).toContain("no installed skill covers this friction: draft a `fix-build` skill from the skeleton");
    expect(md).toContain("↳ skeleton: /proj/docs/chardon/proposed/skill-npm-run-build.md");
  });

  it("renders a promote-to-canonical proposal with the repo count in its hint", () => {
    const md = renderImproveDigest({
      proposals: [{ kind: "promote-to-canonical", target: "npm run lint", patternType: "cross_repo", baseline: 3, severity: "low" }],
      open: [],
      roi: [],
    });
    expect(md).toContain("recurs across 3 repos: promote a shared rule or skill");
  });

  it("renders a cross-project candidates section", () => {
    const md = renderImproveDigest({
      proposals: [],
      crossRepo: [{ cmd: "npm run build", repos: 3 }],
      open: [],
      roi: [],
    });
    expect(md).toContain("## Cross-project candidates (Ronce Racine)");
    expect(md).toContain("`npm run build` recurs across 3 repos");
  });
});

describe("runImprove", () => {
  let dbPath: string;
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    dbPath = join(mkdtempSync(join(tmpdir(), "chardon-run-")), "run.db");
    process.env.CHARDON_DB = dbPath;
    db = openDb();
    // Seed a session + toil loop so proposeActions detects friction
    writeSession(db, { id: "s-run", repo: "myproject", sessionType: "main" });
    for (let i = 0; i < 5; i++) {
      writeEvent(db, { sessionId: "s-run", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    }
    closeDb(db);
  });

  afterEach(() => {
    delete process.env.CHARDON_DB;
  });

  it("returns a digest containing the toil target and persists an action row", async () => {
    const { digest } = await runImprove({ projectDir: "/fake/myproject", hoursBack: 24 });

    // Digest should mention the toil target
    expect(digest).toContain("npm run build");

    // An action row should now exist in the DB
    process.env.CHARDON_DB = dbPath;
    const checkDb = openDb();
    try {
      const actions = openActions(checkDb, "myproject");
      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].target).toBe("npm run build");
    } finally {
      closeDb(checkDb);
    }
  });

  it("requalifies an uninstalled mapped skill to create-skill and writes its skeleton", async () => {
    // A real project dir (the skeleton is written under its outDir) and a home
    // dir whose inventory is non-empty but lacks `systematic-debugging`.
    const projectDir = mkdtempSync(join(tmpdir(), "chardon-proj-"));
    const homeDir = mkdtempSync(join(tmpdir(), "chardon-home-"));
    const otherSkill = join(homeDir, ".claude", "skills", "other");
    mkdirSync(otherSkill, { recursive: true });
    writeFileSync(join(otherSkill, "SKILL.md"), "---\nname: other-skill\n---\n");

    process.env.CHARDON_DB = dbPath;
    const db2 = openDb();
    const repo = "myproject"; // repoSlug of the seeded session
    writeSession(db2, { id: "s-fail", repo, sessionType: "main" });
    for (let i = 0; i < 3; i++) {
      writeEvent(db2, { sessionId: "s-fail", tool: "Bash", success: false, meta: { cmd: "npm run build" } });
    }
    closeDb(db2);

    writeFileSync(join(projectDir, ".chardon.json"), JSON.stringify({ repoName: repo }));
    const { digest } = await runImprove({ projectDir, hoursBack: 24, homeDir });

    const skeletonPath = join(projectDir, "docs/chardon", "proposed", "skill-npm-run-build.md");
    expect(digest).toContain("**create-skill** → `systematic-debugging`");
    expect(digest).toContain(`↳ skeleton: ${skeletonPath}`);
    expect(existsSync(skeletonPath)).toBe(true);
  });
});

describe("runImprove: pending procedure candidates", () => {
  it("mentions pending procedure candidates and stays silent once proposed", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "proj-hint-"));
    process.env.CHARDON_DB = join(projectDir, "t.db");
    const db = openDb();
    const repo = basename(projectDir);
    for (let i = 0; i < 3; i++) {
      const id = `hint${i}`;
      writeSession(db, { id, repo, sessionType: "main" });
      writeEvent(db, { sessionId: id, tool: "Edit", success: true, meta: { file: "/p/src/core/a.ts" } });
      writeEvent(db, { sessionId: id, tool: "Bash", success: true, meta: { cmd: "npm test", cmd_class: "test" } });
      writeEvent(db, { sessionId: id, tool: "Bash", success: true, meta: { cmd: "git commit", cmd_class: "git" } });
    }

    const withHint = await runImprove({ projectDir, hoursBack: 24, now: new Date("2026-07-24T12:00:00Z") });
    expect(withHint.digest).toContain("1 recurring procedure(s) detected: run /chardon-skills");

    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
       VALUES (?, 'infer-skill', 'edit@core > test > git', 'recurring_procedure', 3, 'proposed')`,
    ).run(repo);
    const silent = await runImprove({ projectDir, hoursBack: 24, now: new Date("2026-07-24T12:00:00Z") });
    expect(silent.digest).not.toContain("recurring procedure(s) detected");
    closeDb(db);
  });
});
