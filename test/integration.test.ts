import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), "../hooks");

/**
 * Runs a hook via `node --experimental-strip-types` in a subprocess.
 * The hook receives `payload` on stdin and inherits `env`.
 * The working directory is `cwd` (so that a relative `config.outDir` is
 * resolved from the temp project).
 * Returns the exit code (0 = success).
 */
function hook(
  name: string,
  payload: string,
  env: Record<string, string>,
  cwd: string,
): number {
  try {
    execFileSync("node", ["--experimental-strip-types", join(HOOKS, name)], {
      input: payload,
      env: { ...process.env, ...env },
      cwd,
    });
    return 0;
  } catch (e: any) {
    return e.status ?? 1;
  }
}

describe("end-to-end integration", () => {
  it("session → events → stop generates a daily report", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    const env = { CHARDON_DB: join(dir, "c.db"), CLAUDE_PROJECT_DIR: dir };
    const p = (o: object) =>
      JSON.stringify({ session_id: "e2e-integration", cwd: dir, ...o });

    // Step 1: session start
    expect(hook("session-start.ts", p({}), env, dir)).toBe(0);

    // Step 2: tool event (a simulated Bash command)
    expect(
      hook(
        "post-tool-use.ts",
        p({
          tool_name: "Bash",
          tool_input: { command: "ls" },
          tool_response: { is_error: false },
        }),
        env,
        dir,
      ),
    ).toBe(0);

    // Step 3: session stop → generates the daily report
    expect(hook("stop.ts", p({}), env, dir)).toBe(0);

    // Check: the daily report is created under <dir>/docs/chardon/
    const outDir = join(dir, "docs/chardon");
    const files = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.startsWith("daily-")) : [];
    expect(files.length).toBeGreaterThan(0);

    // Assert the report contains the expected ## Velocity section.
    const reportContent = readFileSync(join(outDir, files[0]), "utf-8");
    expect(reportContent).toMatch(/^## Velocity/m);
  });
});
