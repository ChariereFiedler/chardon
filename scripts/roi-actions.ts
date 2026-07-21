import { isMainModule } from "../lib/is-main.ts";

import { closeDb, openDb } from "../lib/db.ts";
import { applyAction, measureAction, dropAction } from "../lib/roi.ts";

/** Default measurement window (hours) — same as the daily analysis window. */
const MEASURE_WINDOW_HOURS = 24;

/** Marks a proposed action as applied (you acted on it); returns a summary. */
export function runApply(id: number, now: Date): string {
  const db = openDb();
  try {
    applyAction(db, id, now.toISOString());
    return `Action ${id} marked applied — run measure later to capture its ROI.`;
  } finally {
    closeDb(db);
  }
}

/** Drops a proposal so it is never re-proposed; returns a summary. */
export function runDrop(id: number): string {
  const db = openDb();
  try {
    dropAction(db, id);
    return `Action ${id} dropped — chardon will stop proposing it.`;
  } finally {
    closeDb(db);
  }
}

/** Re-measures an applied action and records its ROI; returns a summary. */
export function runMeasure(id: number, hoursBack: number): string {
  const db = openDb();
  try {
    const r = measureAction(db, id, hoursBack);
    if (!r) return `Action ${id} not found.`;
    return `Action ${id}: friction ${r.baseline} → ${r.after} (reduced by ${r.delta}).`;
  } finally {
    closeDb(db);
  }
}

/** Dispatches `<apply|drop|measure> <id>` to the right handler. */
export function runRoiAction(argv: string[], now: Date): string {
  const [sub, idArg] = argv;
  const id = Number.parseInt(idArg ?? "", 10);
  if (Number.isNaN(id)) return `Usage: <apply|drop|measure> <action-id>`;
  switch (sub) {
    case "apply":
      return runApply(id, now);
    case "drop":
      return runDrop(id);
    case "measure":
      return runMeasure(id, MEASURE_WINDOW_HOURS);
    default:
      return `Unknown action "${sub}". Usage: <apply|drop|measure> <action-id>`;
  }
}

// ---------------------------------------------------------------------------
// CLI entry point: node roi-actions.ts <apply|drop|measure> <id>
// ---------------------------------------------------------------------------

if (isMainModule("roi-actions")) {
  console.log(runRoiAction(process.argv.slice(2), new Date()));
}
