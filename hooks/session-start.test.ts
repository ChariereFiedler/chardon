import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, closeDb } from "../lib/db.ts";
import { run } from "./session-start.ts";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "session-start.ts");

/**
 * Runs the hook in a subprocess.
 * `env` defines variables to override; keys absent from `env` but
 * present in `process.env` are inherited, EXCEPT those listed in
 * `unset` (explicitly removed to ensure test isolation).
 */
function runHook(
  payload: string,
  env: Record<string, string>,
  unset: string[] = [],
): number {
  const merged = { ...process.env, ...env };
  for (const key of unset) {
    delete merged[key];
  }
  try {
    execFileSync("node", ["--experimental-strip-types", HOOK], { input: payload, env: merged });
    return 0;
  } catch (e: any) { return e.status ?? 1; }
}

describe("session-start hook — subprocess smoke tests", () => {
  let dbFile: string, project: string;
  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
  });

  it("inserts a session for a valid payload", () => {
    const code = runHook(JSON.stringify({ session_id: "abc", cwd: project }), { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project });
    expect(code).toBe(0);
    // CHARDON_DB must be set on THIS process before opening: passing it to the subprocess
    // env only scopes the hook. Without it, openDb() would hit the real ~/.claude/chardon.db.
    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    try {
      const s = db.prepare("SELECT id FROM sessions WHERE id = 'abc'").get();
      expect(s).toBeTruthy();
    } finally {
      closeDb(db);
    }
  });

  it("fail-open on empty input (exit 0, no exception)", () => {
    expect(runHook("", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });

  it("fail-open on broken JSON", () => {
    expect(runHook("{broken json", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });

  it("exit 0 and no session written when CLAUDE_PROJECT_DIR is absent", () => {
    const envWithoutProject: Record<string, string> = { CHARDON_DB: dbFile };
    const code = runHook(
      JSON.stringify({ session_id: "orphan-sess", cwd: project }),
      envWithoutProject,
      ["CLAUDE_PROJECT_DIR"],
    );
    expect(code).toBe(0);

    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    const row = db
      .prepare("SELECT COUNT(*) AS cnt FROM sessions")
      .get() as { cnt: number };
    closeDb(db);
    expect(row.cnt).toBe(0);
  });
});

describe("session-start hook — in-process run() tests", () => {
  let dbFile: string, project: string;
  let savedDb: string | undefined;

  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
    savedDb = process.env.CHARDON_DB;
    process.env.CHARDON_DB = dbFile;
  });

  afterEach(() => {
    if (savedDb !== undefined) {
      process.env.CHARDON_DB = savedDb;
    } else {
      delete process.env.CHARDON_DB;
    }
  });

  it("inserts a session for a valid input", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    run({ session_id: "sess-1", cwd: project }, env);
    const db = openDb();
    const row = db.prepare("SELECT id, session_type FROM sessions WHERE id='sess-1'").get() as { id: string; session_type: string } | undefined;
    closeDb(db);
    expect(row).toBeTruthy();
    expect(row!.session_type).toBe("main");
  });

  it("sets session_type to worktree for a worktree project dir", () => {
    // Worktree dirs must end with -wt-<digits> exactly (e.g. myrepo-wt-3).
    // mkdtempSync appends random alphanum chars, so we create the dir manually.
    const base = mkdtempSync(join(tmpdir(), "chardon-wt-base-"));
    const wtProject = join(base, "myrepo-wt-3");
    mkdirSync(wtProject, { recursive: true });
    const env = { ...process.env, CLAUDE_PROJECT_DIR: wtProject };
    run({ session_id: "sess-wt", cwd: wtProject }, env);
    const db = openDb();
    const row = db.prepare("SELECT session_type FROM sessions WHERE id='sess-wt'").get() as { session_type: string } | undefined;
    closeDb(db);
    expect(row).toBeTruthy();
    expect(row!.session_type).toBe("worktree");
  });

  it("does not write when CLAUDE_PROJECT_DIR is missing", () => {
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    run({ session_id: "sess-orphan" }, env);
    const db = openDb();
    const count = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    closeDb(db);
    expect(count).toBe(0);
  });

  it("does not throw on malformed input", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    expect(() => run("garbage", env)).not.toThrow();
    expect(() => run(null, env)).not.toThrow();
    expect(() => run(42, env)).not.toThrow();
  });

  it("does not throw when session_id is missing", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
    expect(() => run({ cwd: project }, env)).not.toThrow();
    const db = openDb();
    const count = (db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n;
    closeDb(db);
    expect(count).toBe(0);
  });
});

describe("session-start hook — briefing output (CHARDON_ACTIVE)", () => {
  let dbFile: string, project: string;

  /** Runs the hook in a subprocess and returns its captured stdout. */
  function runHookCapture(payload: string, env: Record<string, string>): string {
    try {
      return execFileSync("node", ["--experimental-strip-types", HOOK], {
        input: payload,
        env: { ...process.env, ...env },
        encoding: "utf-8",
      });
    } catch {
      return "";
    }
  }

  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    try {
      db.prepare("INSERT INTO actions (repo, kind, target, status) VALUES (?, 'enable-hook', 'pre-commit', 'proposed')")
        .run(basename(project));
    } finally {
      closeDb(db);
    }
  });

  it("emits SessionStart JSON with the briefing when CHARDON_ACTIVE=1", () => {
    const out = runHookCapture(
      JSON.stringify({ session_id: "brief-1", cwd: project }),
      { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project, CHARDON_ACTIVE: "1" },
    );
    const parsed = JSON.parse(out) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("open action #1: enable-hook (pre-commit)");
  });

  it("prints nothing without CHARDON_ACTIVE", () => {
    const out = runHookCapture(
      JSON.stringify({ session_id: "brief-2", cwd: project }),
      { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project },
    );
    expect(out).toBe("");
  });

  it("prints nothing when the briefing is empty (no JSON at all)", () => {
    const emptyDb = join(mkdtempSync(join(tmpdir(), "chardon-")), "empty.db");
    const out = runHookCapture(
      JSON.stringify({ session_id: "brief-3", cwd: project }),
      { CHARDON_DB: emptyDb, CLAUDE_PROJECT_DIR: project, CHARDON_ACTIVE: "1" },
    );
    expect(out).toBe("");
  });
});

describe("session-start hook · idempotent replay", () => {
  it("does not duplicate the session when the same payload is replayed", () => {
    const dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    const project = mkdtempSync(join(tmpdir(), "proj-"));
    const payload = JSON.stringify({ session_id: "replay-sess", cwd: project });
    const env = { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project };

    expect(runHook(payload, env)).toBe(0);
    expect(runHook(payload, env)).toBe(0);

    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    try {
      const row = db
        .prepare("SELECT COUNT(*) AS n FROM sessions WHERE id = ?")
        .get("replay-sess") as { n: number };
      // INSERT OR IGNORE on the primary key: a replayed SessionStart is a no-op.
      expect(row.n).toBe(1);
    } finally {
      closeDb(db);
    }
  });
});

describe("session-start — git worktree detection", () => {
  it("classifies a linked git worktree as session_type=worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "chardon-wt-"));
    const mainRepo = join(root, "repo");
    const wt = join(root, "repo-feature");
    mkdirSync(mainRepo);
    const git = (cwd: string, ...args: string[]) =>
      execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
        cwd,
        stdio: "ignore",
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
      });
    git(mainRepo, "init", "-b", "main");
    git(mainRepo, "commit", "--allow-empty", "-m", "init");
    git(mainRepo, "worktree", "add", wt);

    const dbFile = join(root, "t.db");
    run({ session_id: "wt-session" }, { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: wt });

    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    try {
      const row = db
        .prepare("SELECT session_type FROM sessions WHERE id = 'wt-session'")
        .get() as { session_type: string };
      expect(row.session_type).toBe("worktree");
    } finally {
      closeDb(db);
    }
  });
});

describe("session-start — root hash for slug-collision detection", () => {
  it("stores a stable short hash of the project root on the session row", () => {
    const dbFile2 = join(mkdtempSync(join(tmpdir(), "chardon-rh-")), "t.db");
    const projectDir = mkdtempSync(join(tmpdir(), "proj-rh-"));
    run({ session_id: "rh1" }, { CHARDON_DB: dbFile2, CLAUDE_PROJECT_DIR: projectDir });
    process.env.CHARDON_DB = dbFile2;
    const db = openDb();
    try {
      const row = db.prepare("SELECT root_hash FROM sessions WHERE id = 'rh1'").get() as { root_hash: string };
      expect(row.root_hash).toMatch(/^[0-9a-f]{12}$/);
    } finally {
      closeDb(db);
    }
  });
});
