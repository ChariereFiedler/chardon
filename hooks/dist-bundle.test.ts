import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STOP_BUNDLE = join(root, "dist", "stop.mjs");
const STATUSLINE_BUNDLE = join(root, "dist", "statusline.mjs");
const req = createRequire(import.meta.url);
const { DatabaseSync } = req("node:sqlite") as typeof import("node:sqlite");

// These bugs only reproduce in the esbuild bundle, never in the .ts source — so
// they must exercise the real dist artifacts.
describe("dist bundles — CLI-entry & legacy DB regressions", () => {
  beforeAll(() => {
    execFileSync("node", [join(root, "tools", "build.mjs")], { stdio: "ignore" });
  }, 60_000);

  // The bundle is statusline.mjs, but the old guard only matched .ts/.js — so main()
  // never ran and the status line came out blank through the plugin.
  it("statusline.mjs runs main() and emits a non-empty line", () => {
    const out = execFileSync("node", [STATUSLINE_BUNDLE], {
      env: { ...process.env, CHARDON_DB: join(mkdtempSync(join(tmpdir(), "chardon-sl-")), "sl.db"), CLAUDE_PROJECT_DIR: root },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).toContain(" · ");
  });

  it("runs against a pre-repo token_usage without crashing and self-migrates", () => {
    const dbFile = join(mkdtempSync(join(tmpdir(), "chardon-legacy-")), "legacy.db");
    const project = mkdtempSync(join(tmpdir(), "proj-"));

    // Seed only the drifted table (pre-686a939 schema: no repo, PK on date+origin);
    // openDb() creates every other table on first open.
    const legacy = new DatabaseSync(dbFile);
    legacy.exec(`
      CREATE TABLE token_usage (
        date TEXT NOT NULL, origin TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read INTEGER NOT NULL DEFAULT 0, cache_creation INTEGER NOT NULL DEFAULT 0,
        nb_messages INTEGER NOT NULL DEFAULT 0, nb_sessions INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date, origin)
      );
      INSERT INTO token_usage (date, origin, input_tokens) VALUES ('2026-07-01', 'main', 42);
    `);
    legacy.close();

    let status = 0;
    try {
      execFileSync("node", [STOP_BUNDLE], {
        input: JSON.stringify({ session_id: "z", cwd: project }),
        env: { ...process.env, CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project, CHARDON_OUT_DIR: project },
        stdio: ["pipe", "ignore", "pipe"],
      });
    } catch (e) {
      status = (e as { status?: number }).status ?? 1;
    }
    expect(status).toBe(0);

    // The self-healing migration ran and preserved the legacy row unscoped.
    const after = new DatabaseSync(dbFile);
    const cols = (after.prepare("PRAGMA table_info(token_usage)").all() as { name: string }[]).map((c) => c.name);
    const legacyRow = after.prepare("SELECT repo, input_tokens FROM token_usage WHERE date = '2026-07-01'").get() as
      | { repo: string; input_tokens: number }
      | undefined;
    after.close();
    expect(cols).toContain("repo");
    expect(legacyRow).toMatchObject({ repo: "", input_tokens: 42 });
  });
});
