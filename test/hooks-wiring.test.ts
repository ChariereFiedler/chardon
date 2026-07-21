import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Validates that the hook commands wired in hooks.json actually run, using the
// EXACT command strings from the manifest (not a hand-written runner). The plugin
// runs hooks with `node --experimental-strip-types` and `.ts` import specifiers, so
// a resolution regression (wrong runtime, a stray `.js` specifier) would surface
// here as ERR_MODULE_NOT_FOUND or a missing DB write.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);

interface HookEntry {
  hooks: { command: string }[];
}
const manifest = JSON.parse(readFileSync(join(ROOT, "hooks/hooks.json"), "utf8")) as {
  hooks: Record<string, HookEntry[]>;
};

function commandFor(event: string): string {
  const cmd = manifest.hooks[event][0].hooks[0].command;
  return cmd.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, ROOT);
}

function runWired(event: string, payload: string, env: Record<string, string>): { stderr: string } {
  let stderr = "";
  try {
    execSync(commandFor(event), { input: payload, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: unknown) {
    stderr = String((e as { stderr?: Buffer }).stderr ?? "");
  }
  return { stderr };
}

describe("hooks.json wiring (real manifest commands)", () => {
  it("SessionStart writes a session via the manifest command (no module-resolution error)", () => {
    const project = mkdtempSync(join(tmpdir(), "proj-"));
    const dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    const { stderr } = runWired("SessionStart", JSON.stringify({ session_id: "wired", cwd: project }), {
      CHARDON_DB: dbFile,
      CLAUDE_PROJECT_DIR: project,
    });
    expect(stderr).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find module/);

    process.env.CHARDON_DB = dbFile;
    const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
    const db = new DatabaseSync(dbFile);
    const row = db.prepare("SELECT id FROM sessions WHERE id = 'wired'").get();
    db.close();
    expect(row).toBeTruthy();
  });

  it("every wired hook command resolves its modules", () => {
    const project = mkdtempSync(join(tmpdir(), "proj-"));
    const dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    for (const event of ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]) {
      const { stderr } = runWired(event, JSON.stringify({ session_id: "w", cwd: project, tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { is_error: false } }), {
        CHARDON_DB: dbFile,
        CLAUDE_PROJECT_DIR: project,
      });
      expect(stderr, `${event} module resolution`).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find module/);
    }
  });
});
