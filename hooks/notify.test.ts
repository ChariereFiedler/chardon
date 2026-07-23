import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, closeDb, writeSession, writeEvent } from "../lib/db.ts";
import { run } from "./notify.ts";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "notify.ts");

/** Runs the hook and returns { code, stdout }. */
function runHookCapture(payload: string, env: Record<string, string>): { code: number; stdout: string } {
  try {
    const stdout = execFileSync("node", ["--experimental-strip-types", HOOK], {
      input: payload,
      env: { ...process.env, ...env },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { code: 0, stdout };
  } catch (e: any) {
    return { code: e.status ?? 1, stdout: e.stdout ?? "" };
  }
}

describe("notify hook — subprocess smoke tests", () => {
  let dbFile: string, project: string;
  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
  });

  it("exits 0 and is silent when CHARDON_ACTIVE is absent", () => {
    const out = runHookCapture(JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" }, cwd: project }), { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project });
    expect(out.code).toBe(0);
    expect(out.stdout).toBe("");
  });

  it("fail-open on broken JSON", () => {
    expect(runHookCapture("{x", { CHARDON_DB: dbFile }).code).toBe(0);
  });

  it("emits a toil alert on stdout when CHARDON_ACTIVE=1 and a toil loop exists", () => {
    // notify.ts calls repoSlug(CLAUDE_PROJECT_DIR) = basename(project).
    // Seed the DB with that exact slug so the query matches.
    const repo = basename(project);
    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    writeSession(db, { id: "s1", repo, sessionType: "main" });
    // TOIL_MIN = 3 — insert 5 identical commands to be safely above threshold.
    for (let i = 0; i < 5; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    }
    closeDb(db);
    delete process.env.CHARDON_DB;

    const payload = JSON.stringify({ tool_name: "Bash", cwd: project });
    const out = runHookCapture(payload, {
      CHARDON_DB: dbFile,
      CLAUDE_PROJECT_DIR: project,
      CHARDON_ACTIVE: "1",
    });

    expect(out.code).toBe(0);
    expect(out.stdout).toMatch(/toil loop/i);
  });
});

describe("notify hook — in-process run() tests", () => {
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

  it("does not throw and writes nothing when CHARDON_ACTIVE is not set", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_PROJECT_DIR: project };
    delete env.CHARDON_ACTIVE;
    // Capture stdout to verify silence.
    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: string) => { chunks.push(chunk); return true; };
    try {
      expect(() => run({ tool_name: "Bash" }, env)).not.toThrow();
    } finally {
      (process.stdout as any).write = origWrite;
    }
    expect(chunks.join("")).toBe("");
  });

  it("emits a toil alert when CHARDON_ACTIVE=1 and a toil loop exists", () => {
    const repo = basename(project);
    const db = openDb();
    writeSession(db, { id: "s-notify", repo, sessionType: "main" });
    for (let i = 0; i < 5; i++) {
      writeEvent(db, { sessionId: "s-notify", tool: "Bash", success: true, meta: { cmd: "npm test" } });
    }
    closeDb(db);

    const env = { ...process.env, CLAUDE_PROJECT_DIR: project, CHARDON_ACTIVE: "1" };

    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: string) => { chunks.push(chunk); return true; };
    try {
      run({ tool_name: "Bash" }, env);
    } finally {
      (process.stdout as any).write = origWrite;
    }

    expect(chunks.join("")).toMatch(/toil loop/i);
  });

  it("does not throw on garbage input", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project, CHARDON_ACTIVE: "1" };
    expect(() => run("garbage", env)).not.toThrow();
    expect(() => run(null, env)).not.toThrow();
  });

  it("is silent for non-Bash tools when CHARDON_ACTIVE=1", () => {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project, CHARDON_ACTIVE: "1" };

    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: string) => { chunks.push(chunk); return true; };
    try {
      run({ tool_name: "Edit" }, env);
    } finally {
      (process.stdout as any).write = origWrite;
    }
    expect(chunks.join("")).toBe("");
  });
});

describe("notify hook: real-time nudges", () => {
  const FIXED_NOW = new Date("2026-07-23T10:00:00Z");
  const TODAY = "2026-07-23";

  let dbFile: string, project: string, repo: string;
  let savedDb: string | undefined;

  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
    repo = basename(project);
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

  /** Runs run() in-process with a captured stdout; returns what was written. */
  function captureRun(payload: unknown, envOverride: Record<string, string | undefined> = {}): string {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CLAUDE_PROJECT_DIR: project,
      CHARDON_ACTIVE: "1",
      ...envOverride,
    };
    for (const [k, v] of Object.entries(envOverride)) {
      if (v === undefined) delete env[k];
    }
    const chunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: string) => {
      chunks.push(chunk);
      return true;
    };
    try {
      run(payload, env, FIXED_NOW);
    } finally {
      (process.stdout as any).write = origWrite;
    }
    return chunks.join("");
  }

  /** Writes a project-level .chardon.json override. */
  function writeProjectConfig(config: object): void {
    writeFileSync(join(project, ".chardon.json"), JSON.stringify(config));
  }

  function bashPayload(command: string): object {
    return { tool_name: "Bash", tool_input: { command } };
  }

  it("emits the toil alert once per day, then stays silent (dedupe)", () => {
    const db = openDb();
    writeSession(db, { id: "s1", repo, sessionType: "main" });
    for (let i = 0; i < 5; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm test" } });
    }
    closeDb(db);

    expect(captureRun(bashPayload("ls"))).toMatch(/toil loop/i);
    expect(captureRun(bashPayload("ls"))).toBe("");
  });

  it("warns when the command about to run failed repeatedly today", () => {
    writeProjectConfig({ toilExclusions: ["npm run e2e"] });
    const db = openDb();
    writeSession(db, { id: "s1", repo, sessionType: "main" });
    for (let i = 0; i < 3; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run e2e" } });
    }
    closeDb(db);

    const out = captureRun(bashPayload("npm run e2e"));
    expect(out).toContain("[chardon] this command failed 3 times today; consider systematic debugging before rerunning.");
    // Deduped on the second run of the same day.
    expect(captureRun(bashPayload("npm run e2e"))).toBe("");
  });

  it("stays silent when the command does not match a failure cluster", () => {
    writeProjectConfig({ toilExclusions: ["npm run e2e"] });
    const db = openDb();
    writeSession(db, { id: "s1", repo, sessionType: "main" });
    for (let i = 0; i < 3; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run e2e" } });
    }
    closeDb(db);

    expect(captureRun(bashPayload("npm run build"))).toBe("");
  });

  it("warns when the command about to run is a slow drain today", () => {
    writeProjectConfig({ toilExclusions: ["npm run build"] });
    const db = openDb();
    writeSession(db, { id: "s1", repo, sessionType: "main" });
    for (let i = 0; i < 3; i++) {
      writeEvent(db, {
        sessionId: "s1",
        tool: "Bash",
        success: true,
        durationMs: 60_000,
        meta: { cmd: "npm run build" },
      });
    }
    closeDb(db);

    const out = captureRun(bashPayload("npm run build"));
    expect(out).toContain("[chardon] this command averages 60s per run today; consider running it in the background.");
    expect(captureRun(bashPayload("npm run build"))).toBe("");
  });

  it("warns once at 80% of the daily token budget", () => {
    writeProjectConfig({ tokenBudgetPerDay: 1000 });
    const db = openDb();
    db.prepare(
      `INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens)
       VALUES (?, 'main', ?, 800, 50)`,
    ).run(TODAY, repo);
    closeDb(db);

    const out = captureRun(bashPayload("ls"));
    expect(out).toContain("[chardon] token budget warning: 850 of 1000 tokens used today (over 80%).");
    expect(captureRun(bashPayload("ls"))).toBe("");
  });

  it("warns once at 100% of the daily token budget, independent of the 80% nudge", () => {
    writeProjectConfig({ tokenBudgetPerDay: 1000 });
    const db = openDb();
    db.prepare(
      `INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens)
       VALUES (?, 'main', ?, 800, 50)`,
    ).run(TODAY, repo);
    closeDb(db);

    // 80% nudge fires first.
    expect(captureRun(bashPayload("ls"))).toMatch(/over 80%/);

    const db2 = openDb();
    db2.prepare(`UPDATE token_usage SET input_tokens = 1200 WHERE date = ? AND repo = ?`).run(TODAY, repo);
    closeDb(db2);

    const out = captureRun(bashPayload("ls"));
    expect(out).toContain("[chardon] token budget exceeded: 1250 of 1000 tokens used today.");
    expect(captureRun(bashPayload("ls"))).toBe("");
  });

  it("stays silent when the token budget is not configured", () => {
    const db = openDb();
    db.prepare(
      `INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens)
       VALUES (?, 'main', ?, 999999, 0)`,
    ).run(TODAY, repo);
    closeDb(db);

    expect(captureRun(bashPayload("ls"))).toBe("");
  });

  it("emits nothing without CHARDON_ACTIVE even with pending nudges", () => {
    writeProjectConfig({ tokenBudgetPerDay: 1000, toilExclusions: ["npm run e2e"] });
    const db = openDb();
    writeSession(db, { id: "s1", repo, sessionType: "main" });
    for (let i = 0; i < 3; i++) {
      writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run e2e" } });
    }
    db.prepare(
      `INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens)
       VALUES (?, 'main', ?, 2000, 0)`,
    ).run(TODAY, repo);
    closeDb(db);

    expect(captureRun(bashPayload("npm run e2e"), { CHARDON_ACTIVE: undefined })).toBe("");
  });

  it("fails open on an unopenable DB (in-process and as a subprocess)", () => {
    // A directory is not a valid SQLite file: openDb() throws.
    const brokenDb = mkdtempSync(join(tmpdir(), "chardon-broken-"));
    expect(() =>
      captureRun(bashPayload("ls"), { CHARDON_DB: brokenDb }),
    ).not.toThrow();

    const out = runHookCapture(JSON.stringify(bashPayload("ls")), {
      CHARDON_DB: brokenDb,
      CLAUDE_PROJECT_DIR: project,
      CHARDON_ACTIVE: "1",
    });
    expect(out.code).toBe(0);
    expect(out.stdout).toBe("");
  });
});

describe("hooks.json wiring", () => {
  it("guards the notify spawn behind CHARDON_ACTIVE at the shell level", () => {
    const wiringPath = join(dirname(fileURLToPath(import.meta.url)), "hooks.json");
    const wiring = JSON.parse(execFileSync("cat", [wiringPath], { encoding: "utf-8" }));
    const cmd = wiring.hooks.PreToolUse[0].hooks[0].command as string;
    expect(cmd).toContain('"$CHARDON_ACTIVE"');
    expect(cmd).toContain("dist/notify.mjs");
  });
});
