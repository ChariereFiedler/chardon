import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
