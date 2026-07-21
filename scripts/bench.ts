import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { openDb, closeDb, writeSession, writeEvent } from "../lib/db.ts";

/**
 * Benchmarks the collection overhead so the "per-tool-call cost" claim is measured,
 * not assumed. Reports two numbers:
 *  - the in-process DB write (chardon's marginal cost per event), and
 *  - the full hook spawn (what Claude Code actually waits for — a `node
 *    --experimental-strip-types` process per tool call, which dominates).
 * Run: `node --experimental-strip-types scripts/bench.ts`.
 */
function main(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const proj = mkdtempSync(join(tmpdir(), "chardon-bench-"));
  process.env.CHARDON_DB = join(proj, "b.db");
  process.env.CLAUDE_PROJECT_DIR = proj;

  // 1) In-process event write.
  const db = openDb();
  writeSession(db, { id: "bench", repo: "bench", sessionType: "main" });
  const writeIters = 500;
  const w0 = performance.now();
  for (let i = 0; i < writeIters; i++) {
    writeEvent(db, { sessionId: "bench", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
  }
  const perWriteMs = (performance.now() - w0) / writeIters;
  closeDb(db);

  // 2) Full hook spawn — the real per-tool-call latency Claude Code waits for.
  // Compares the source path (`--experimental-strip-types`, type-stripped every run)
  // against the precompiled bundle (plain `node dist/*.mjs`). Run `npm run build` first.
  const payload = JSON.stringify({ session_id: "bench", tool_name: "Edit", tool_input: { file_path: "x" }, tool_response: {} });
  const spawnIters = 20;

  const timeSpawn = (args: string[]): number => {
    execFileSync("node", args, { input: payload, stdio: ["pipe", "ignore", "ignore"] }); // warm
    const t = performance.now();
    for (let i = 0; i < spawnIters; i++) {
      execFileSync("node", args, { input: payload, stdio: ["pipe", "ignore", "ignore"] });
    }
    return (performance.now() - t) / spawnIters;
  };

  const srcMs = timeSpawn(["--experimental-strip-types", join(root, "hooks", "post-tool-use.ts")]);
  const bundle = join(root, "dist", "post-tool-use.mjs");
  const bundleMs = existsSync(bundle) ? timeSpawn([bundle]) : NaN;

  console.log(`event write (in-process):        ~${perWriteMs.toFixed(3)} ms/event over ${writeIters} iterations`);
  console.log(`hook spawn, source (strip-types): ~${srcMs.toFixed(0)} ms/event over ${spawnIters} iterations`);
  console.log(
    Number.isNaN(bundleMs)
      ? `hook spawn, bundle:               (run \`npm run build\` first)`
      : `hook spawn, bundle (plain node):  ~${bundleMs.toFixed(0)} ms/event over ${spawnIters} iterations`,
  );
}

main();
