import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "./db.ts";
import { proposeActions, persistActions, openActions } from "./improve.ts";
import { applyAction, measureAction, roiSummary, dropAction, detectRegressions } from "./roi.ts";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
  writeSession(db, { id: "s1", repo: "p", sessionType: "main" });
  for (let i = 0; i < 9; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
  persistActions(db, "p", proposeActions(db, "p", 24));
});
afterEach(() => closeDb(db));

describe("roi", () => {
  it("applies then measures an action and computes the delta", () => {
    const id = openActions(db, "p")[0].id;
    applyAction(db, id, "2026-06-26T10:00:00Z");

    // Verify applyAction actually wrote status='applied' and applied_at
    const row = db.prepare("SELECT status, applied_at FROM actions WHERE id = ?").get(id) as { status: string; applied_at: string };
    expect(row.status).toBe("applied");
    expect(row.applied_at).toBe("2026-06-26T10:00:00Z");

    const r = measureAction(db, id, 24);
    expect(r).not.toBeNull();
    expect(r!.baseline).toBe(9);
    expect(r!.after).toBe(9);     // same window in the test → no change
    expect(r!.delta).toBe(0);
    expect(roiSummary(db, "p").length).toBe(1);
  });

  it("returns null when measuring an unknown action", () => {
    expect(measureAction(db, 9999, 24)).toBeNull();
  });

  it("delta > 0 when friction is genuinely gone at measure time", () => {
    // Use a 0-hour measurement window so the seeded events (current timestamp)
    // fall outside the window → after = 0 → delta = baseline - 0 > 0.
    const id = openActions(db, "p")[0].id;
    applyAction(db, id, "2026-06-26T10:00:00Z");
    const r = measureAction(db, id, 0);
    expect(r).not.toBeNull();
    expect(r!.after).toBe(0);               // no events in a 0-hour window
    expect(r!.baseline).toBeGreaterThan(0);
    expect(r!.delta).toBeGreaterThan(0);    // baseline - 0 > 0
  });

  it("roiSummary orders multiple rows by id and returns correct deltas", () => {
    // Measure the first action (already persisted by beforeEach)
    const id1 = openActions(db, "p")[0].id;
    applyAction(db, id1, "2026-06-26T10:00:00Z");
    measureAction(db, id1, 24);

    // Insert a second action manually with a different target/baseline
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
       VALUES ('p', 'automate-command', 'make lint', 'toil_loop', 3, 'proposed')`,
    ).run();
    const id2 = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
    applyAction(db, id2, "2026-06-26T10:00:00Z");
    measureAction(db, id2, 24);

    const summary = roiSummary(db, "p");
    expect(summary.length).toBe(2);
    // Rows ordered by id → first row corresponds to id1
    expect(summary[0].target).toBe("npm run build");
    expect(summary[1].target).toBe("make lint");
    // Deltas are numbers
    expect(typeof summary[0].delta).toBe("number");
    expect(typeof summary[1].delta).toBe("number");
    // Distinct baselines so ordering matters: id1 has baseline=9, id2 has baseline=3
    expect(summary[0].baseline).toBe(9);
    expect(summary[1].baseline).toBe(3);
  });

  it("measureAction finds NO current friction when kind matches but target differs", () => {
    // There are 9 events for "npm run build" (kind=automate-command, target="npm run build").
    // Insert an action for the SAME kind but a DIFFERENT target ("make test").
    // measureAction should not find a current friction match → after = 0.
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
       VALUES ('p', 'automate-command', 'make test', 'toil_loop', 5, 'applied')`,
    ).run();
    const id = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;

    const r = measureAction(db, id, 24);
    expect(r).not.toBeNull();
    // "make test" does NOT appear in proposeActions (no events for it) → after must be 0.
    // If && were replaced by || the "npm run build" action would match (same kind) → after = 9.
    expect(r!.after).toBe(0);
    expect(r!.baseline).toBe(5);
    expect(r!.delta).toBe(5);
  });

  it("dropAction sets status to dropped", () => {
    const id = openActions(db, "p")[0].id;
    dropAction(db, id);
    const row = db.prepare("SELECT status FROM actions WHERE id = ?").get(id) as { status: string };
    expect(row.status).toBe("dropped");
  });

  it("detectRegressions flags a previously-fixed friction that returned", () => {
    // A past attempt on "npm run build" measured effective (after 1 < baseline 5),
    // but the beforeEach seeds 9 current events → current count 9 >= baseline 5.
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status, after_metric)
       VALUES ('p', 'automate-command', 'npm run build', 'toil_loop', 5, 'measured', 1)`,
    ).run();
    const r = detectRegressions(db, "p", 24).find((x) => x.target === "npm run build");
    expect(r).toMatchObject({ kind: "automate-command", baseline: 5, after: 1, current: 9 });
  });

  it("detectRegressions reports a regressed target once despite multiple measured rows", () => {
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status, after_metric)
       VALUES ('p', 'automate-command', 'npm run build', 'toil_loop', 5, 'measured', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status, after_metric)
       VALUES ('p', 'automate-command', 'npm run build', 'toil_loop', 4, 'measured', 2)`,
    ).run();
    const regs = detectRegressions(db, "p", 24).filter((x) => x.target === "npm run build");
    expect(regs.length).toBe(1);
  });

  it("detectRegressions ignores a fixed friction that has not returned", () => {
    // "make lint" has no current events → not in proposeActions → not a regression.
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status, after_metric)
       VALUES ('p', 'automate-command', 'make lint', 'toil_loop', 5, 'measured', 1)`,
    ).run();
    expect(detectRegressions(db, "p", 24).find((x) => x.target === "make lint")).toBeUndefined();
  });

  it("measureAction finds NO current friction when target matches but kind differs", () => {
    // Seed 9 events for Read tool on "src/big.ts" → cold_read friction for target="src/big.ts".
    for (let i = 0; i < 9; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Read", success: true, meta: { file: "src/big.ts" } });
    }
    // Insert an action for kind="investigate-file" (retry_storm) on "src/big.ts".
    // The cold_read friction has kind="split-or-summarize", NOT "investigate-file".
    db.prepare(
      `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
       VALUES ('p', 'investigate-file', 'src/big.ts', 'retry_storm', 7, 'applied')`,
    ).run();
    const id = (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id;

    const r = measureAction(db, id, 24);
    expect(r).not.toBeNull();
    // "src/big.ts" with kind "investigate-file" has no current friction match.
    // If && were replaced by || the "split-or-summarize" for "src/big.ts" would match (same target).
    expect(r!.after).toBe(0);
    expect(r!.delta).toBeGreaterThan(0);
  });
});
