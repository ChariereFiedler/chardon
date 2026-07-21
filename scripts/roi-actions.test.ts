import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "../lib/db.ts";
import { proposeActions, persistActions, openActions } from "../lib/improve.ts";
import { runApply, runDrop, runMeasure, runRoiAction } from "./roi-actions.ts";

const NOW = new Date("2026-07-07T10:00:00Z");
let id: number;

beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  const db = openDb();
  writeSession(db, { id: "s1", repo: "p", sessionType: "main" });
  for (let i = 0; i < 9; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
  persistActions(db, "p", proposeActions(db, "p", 24));
  id = openActions(db, "p")[0].id;
  closeDb(db);
});
afterEach(() => {
  delete process.env.CHARDON_DB;
});

const statusOf = (actionId: number): string => {
  const db = openDb();
  const row = db.prepare("SELECT status FROM actions WHERE id = ?").get(actionId) as { status: string };
  closeDb(db);
  return row.status;
};

describe("roi-actions", () => {
  it("runApply marks the action applied", () => {
    expect(runApply(id, NOW)).toContain("applied");
    expect(statusOf(id)).toBe("applied");
  });

  it("runDrop drops the action", () => {
    expect(runDrop(id)).toContain("dropped");
    expect(statusOf(id)).toBe("dropped");
  });

  it("runMeasure records ROI for an applied action", () => {
    runApply(id, NOW);
    expect(runMeasure(id, 24)).toMatch(/friction \d+ → \d+/);
    expect(statusOf(id)).toBe("measured");
  });

  it("runMeasure reports a missing action", () => {
    expect(runMeasure(99999, 24)).toContain("not found");
  });

  it("runRoiAction dispatches and validates arguments", () => {
    expect(runRoiAction(["apply", String(id)], NOW)).toContain("applied");
    expect(runRoiAction(["bogus", "1"], NOW)).toContain("Unknown");
    expect(runRoiAction(["apply", "abc"], NOW)).toContain("Usage");
  });
});
