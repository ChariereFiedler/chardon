# Chardon — Batch 1 "Core" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end collect → SQLite storage → daily report loop: the 4 hooks write to `chardon.db`, the `Stop` hook generates a Markdown report.

**Architecture:** Pure and testable `lib/` layer (config, db, redact, patterns); thin fail-open hooks that rely on it; an `analyze-daily` script whose rendering is a pure function (DB → Markdown). Code ported from the granit-golem `devmetrics` stack, decoupled and renamed.

**Tech Stack:** TypeScript, `node:sqlite` (Node ≥ 22), Vitest. No npm runtime dependencies (Node builtins only).

## Global Constraints

- **Absolute genericity**: no granit coupling (path `-home-user-lab-granit-golem`, `granit-golem-wt-`, GitLab ID `<project-id>`, `decisions.md`, Cycle daemon) in delivered code.
- **Renaming**: DB `~/.claude/chardon.db` (env override `CHARDON_DB`); env `CHARDON_*`; config `.chardon.json`. Never `devmetrics`/`DEVMETRICS`.
- **Enforced testability**: `lib/db.ts` reads the DB path from `CHARDON_DB`; all time-dependent logic receives `now` as a parameter; rendering (reports) are pure functions separate from I/O; the project slug is derived from `CLAUDE_PROJECT_DIR`.
- **Fail-open**: every hook ends with `process.exit(0)` no matter what; empty/malformed input or an unavailable DB emits no exception or spurious writes.
- **node:sqlite under Vitest**: load via `createRequire(import.meta.url)("node:sqlite")` (Vite otherwise rewrites `node:sqlite` → `sqlite` which is not found). See existing `test/smoke.test.ts`.
- Commits `type(scope): description` ≤ 72 chars, **never** mention Claude/AI/LLM; no magic numbers.
- DB schema already present: `lib/schema.sql` (tables `sessions`, `events`, `patterns`, `ticket_metrics`, `token_usage`, `actions`).

**Source to port** (read-only): `~/lab/granit-golem/scripts/dev/telemetry/{db.ts,redact.ts,patterns.ts}`, `~/lab/granit-golem/scripts/dev/analyze-daily.ts`, `~/lab/granit-golem/.claude/hooks/devmetrics-{session-start,post-tool-use,stop,notify}.ts`.

---

### Task 1: `lib/config.ts` — config & path resolution

**Files:**
- Create: `lib/config.ts`
- Test: `lib/config.test.ts`

**Interfaces:**
- Produces:
  - `interface ChardonConfig { outDir: string; ticketRegex: string; tokenBudgetPerDay: number; toilExclusions: string[]; gitlab: { enabled: boolean; projectId: string; tokenEnv: string } }`
  - `loadConfig(projectDir: string): ChardonConfig` — merges `config/chardon.default.json` (plugin defaults) with `<projectDir>/.chardon.json` if it exists (shallow override).
  - `dbPath(): string` — `process.env.CHARDON_DB ?? join(homedir(), ".claude/chardon.db")`.
  - `repoSlug(projectDir: string): string` — project basename without worktree suffix (e.g. `my-project-wt-3` → `my-project`).
  - `transcriptSlug(projectDir: string): string` — absolute path, `/` → `-` (e.g. `/home/x/p` → `-home-x-p`), to locate `~/.claude/projects/<slug>/`.

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, dbPath, repoSlug, transcriptSlug } from "./config.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("config", () => {
  beforeEach(() => { delete process.env.CHARDON_DB; });

  it("loads plugin defaults without .chardon.json", () => {
    const d = mkdtempSync(join(tmpdir(), "chardon-"));
    const c = loadConfig(d);
    expect(c.outDir).toBe("docs/chardon");
    expect(c.gitlab.enabled).toBe(false);
  });

  it("overrides with project .chardon.json", () => {
    const d = mkdtempSync(join(tmpdir(), "chardon-"));
    writeFileSync(join(d, ".chardon.json"), JSON.stringify({ outDir: "reports", tokenBudgetPerDay: 500000 }));
    const c = loadConfig(d);
    expect(c.outDir).toBe("reports");
    expect(c.tokenBudgetPerDay).toBe(500000);
    expect(c.ticketRegex).toBe("(?:feat|fix)/(\\d+)"); // default preserved
  });

  it("dbPath respects CHARDON_DB", () => {
    process.env.CHARDON_DB = "/tmp/x.db";
    expect(dbPath()).toBe("/tmp/x.db");
  });

  it("repoSlug strips the worktree suffix", () => {
    expect(repoSlug("/home/x/my-project")).toBe("my-project");
    expect(repoSlug("/home/x/my-project-wt-3")).toBe("my-project");
  });

  it("transcriptSlug replaces / with - (generic, no hardcoded granit path)", () => {
    expect(transcriptSlug("/home/x/p")).toBe("-home-x-p");
  });
});
```

- [ ] **Step 2: Run tests → failure** (`cd ~/lab/chardon && npx vitest run lib/config.test.ts`) — Expected: FAIL "Cannot find module ./config.js".

- [ ] **Step 3: Implement `lib/config.ts`**

Write the module conforming to the interfaces above. Details:
- `loadConfig` reads `config/chardon.default.json` (relative to `import.meta.url` → plugin root) via `JSON.parse`, then `<projectDir>/.chardon.json` if present (silent try/catch), merge `{ ...defaults, ...override }`.
- `repoSlug`: `basename(projectDir).replace(/-wt-\d+$/, "")`.
- `transcriptSlug`: `projectDir.replace(/\//g, "-")`.
- No magic numbers: the worktree suffix and config filename are named constants.

- [ ] **Step 4: Run tests → success** (`npx vitest run lib/config.test.ts`) — Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts lib/config.test.ts
git commit -m "feat(lib): config & path resolution (db, slugs)"
```

---

### Task 2: `lib/db.ts` — SQLite access

**Files:**
- Create: `lib/db.ts`
- Test: `lib/db.test.ts`

**Interfaces:**
- Consumes: `dbPath()` (Task 1), `lib/schema.sql`.
- Produces:
  - `openDb(): DatabaseSync` — opens `dbPath()`, applies `schema.sql` (idempotent).
  - `closeDb(db): void`
  - `writeSession(db, s: { id: string; repo: string; gitBranch?: string; ticketIid?: number; sessionType: "main" | "worktree" }): void` (INSERT OR IGNORE)
  - `closeSession(db, id: string, endedAt: string): void` (UPDATE ended_at)
  - `writeEvent(db, e: { sessionId: string; tool: string; success: boolean; durationMs?: number; meta?: object }): void`
  - load `node:sqlite` via `createRequire` (see Global Constraints).

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent, closeSession } from "./db.js";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
});
afterEach(() => closeDb(db));

describe("db", () => {
  it("openDb is idempotent (2nd open does not break)", () => {
    const db2 = openDb();
    expect(db2).toBeTruthy();
    closeDb(db2);
  });

  it("writeSession + writeEvent persist and can be read back", () => {
    writeSession(db, { id: "s1", repo: "p", gitBranch: "master", sessionType: "main" });
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, durationMs: 12, meta: { cmd: "ls" } });
    const ev = db.prepare("SELECT tool, success, meta FROM events WHERE session_id = 's1'").get() as any;
    expect(ev.tool).toBe("Bash");
    expect(ev.success).toBe(1);
    expect(JSON.parse(ev.meta).cmd).toBe("ls");
  });

  it("repo isolation: two repos do not mix", () => {
    writeSession(db, { id: "a", repo: "p1", sessionType: "main" });
    writeSession(db, { id: "b", repo: "p2", sessionType: "main" });
    const n = db.prepare("SELECT COUNT(*) c FROM sessions WHERE repo = 'p1'").get() as any;
    expect(n.c).toBe(1);
  });

  it("closeSession sets ended_at", () => {
    writeSession(db, { id: "s2", repo: "p", sessionType: "main" });
    closeSession(db, "s2", "2026-06-25T10:00:00Z");
    const s = db.prepare("SELECT ended_at FROM sessions WHERE id = 's2'").get() as any;
    expect(s.ended_at).toBe("2026-06-25T10:00:00Z");
  });
});
```

- [ ] **Step 2: Run → failure** (`npx vitest run lib/db.test.ts`) — Expected: FAIL "Cannot find module ./db.js".

- [ ] **Step 3: Implement `lib/db.ts`**

Port `~/lab/granit-golem/scripts/dev/telemetry/db.ts` with these adaptations:
- DB path = `dbPath()` (Task 1), never hardcoded;
- load DDL from `lib/schema.sql` (relative to `import.meta.url`) and `exec` it on open;
- `node:sqlite` via `createRequire(import.meta.url)("node:sqlite")`;
- expose exactly the signature above (camelCase field names on the TS side, snake_case columns on the SQL side);
- parameterized queries only (placeholders), never interpolation (`no-raw-sql-interpolation` rule).

- [ ] **Step 4: Run → success** (`npx vitest run lib/db.test.ts`) — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/db.test.ts
git commit -m "feat(lib): SQLite access (open/write session+event, repo isolation)"
```

---

### Task 3: `lib/redact.ts` — command anonymization

**Files:**
- Create: `lib/redact.ts`
- Test: `lib/redact.test.ts`

**Interfaces:**
- Produces:
  - `redactCmd(cmd: string): string` — redacts secrets and truncates to 60 characters.
  - `redactSecrets(text: string): string` — redacts without truncating.

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from "vitest";
import { redactCmd, redactSecrets } from "./redact.js";

describe("redact", () => {
  it.each([
    ["export GITLAB_TOKEN=glpat-abcdef1234567890abcd", "glpat-"],
    ["curl -H 'Authorization: Bearer ghp_0123456789abcdef0123456789abcdef0123'", "ghp_"],
    ["psql postgres://user:supersecret@host/db", "supersecret"],
  ])("redacts the secret in %s", (input, secret) => {
    expect(redactSecrets(input)).not.toContain(secret);
  });

  it("leaves a harmless command intact", () => {
    expect(redactSecrets("ls -la src/")).toBe("ls -la src/");
  });

  it("redactCmd truncates to 60 characters", () => {
    expect(redactCmd("a".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Run → failure** (`npx vitest run lib/redact.test.ts`) — Expected: FAIL module not found.

- [ ] **Step 3: Implement `lib/redact.ts`**

Port `~/lab/granit-golem/scripts/dev/telemetry/redact.ts` **as-is** (the scoping declares it 100% portable: GitLab/GitHub/Jira token patterns, env `*TOKEN*/*KEY*/*SECRET*`, URLs with credentials, JWTs, hex ≥ 32). Verify that no granit path/identifier appears. Keep the 60-char truncation in `redactCmd` as a named constant.

- [ ] **Step 4: Run → success** (`npx vitest run lib/redact.test.ts`) — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/redact.ts lib/redact.test.ts
git commit -m "feat(lib): secret redaction in commands"
```

---

### Task 4: `lib/patterns.ts` — friction detection

**Files:**
- Create: `lib/patterns.ts`
- Test: `lib/patterns.test.ts`

**Interfaces:**
- Consumes: an open DB (Task 2).
- Produces (all parameterized by `repo` and a `hoursBack` window, plus `exclusions: string[]`):
  - `detectToilLoops(db, repo, hoursBack, exclusions): { cmd: string; count: number }[]` — Bash command repeated ≥ 3×.
  - `detectRetryStorms(db, repo, hoursBack): { file: string; count: number }[]` — edit/bash ≥ 4× on same file.
  - `detectColdReads(db, repo, hoursBack): { file: string; count: number }[]` — read ≥ 3× on same file.
  - `computeVelocity(db, repo, hoursBack): { sessions: number; tools: number; failures: number }`.

- [ ] **Step 1: Write the tests** (direct DB seed)

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "./db.js";
import { detectToilLoops, detectColdReads, computeVelocity } from "./patterns.js";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
  writeSession(db, { id: "s1", repo: "p", sessionType: "main" });
});
afterEach(() => closeDb(db));

describe("patterns", () => {
  it("detectToilLoops identifies a command repeated ≥ 3×", () => {
    for (let i = 0; i < 3; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
    const loops = detectToilLoops(db, "p", 24, []);
    expect(loops.find((l) => l.cmd === "npm run build")?.count).toBe(3);
  });

  it("detectToilLoops respects exclusions", () => {
    for (let i = 0; i < 3; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "git status" } });
    expect(detectToilLoops(db, "p", 24, ["git status"])).toHaveLength(0);
  });

  it("detectColdReads identifies a file read ≥ 3×", () => {
    for (let i = 0; i < 3; i++) writeEvent(db, { sessionId: "s1", tool: "Read", success: true, meta: { file: "src/big.ts" } });
    expect(detectColdReads(db, "p", 24)[0]).toEqual({ file: "src/big.ts", count: 3 });
  });

  it("computeVelocity counts sessions/tools/failures", () => {
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: false });
    const v = computeVelocity(db, "p", 24);
    expect(v.sessions).toBe(1);
    expect(v.failures).toBe(1);
  });
});
```

- [ ] **Step 2: Run → failure** (`npx vitest run lib/patterns.test.ts`).

- [ ] **Step 3: Implement `lib/patterns.ts`**

Port `~/lab/granit-golem/scripts/dev/telemetry/patterns.ts` with these decouplings:
- thresholds (3, 4, 3) are named constants (`TOIL_MIN`, `RETRY_MIN`, `COLD_MIN`);
- **no hardcoded granit exclusions**: `detectToilLoops` receives `exclusions` as a parameter (the granit exclusions `curl … gitlab.com/api`, `~/lab/granit-golem/.env`, `gitlab-cli.ts` are removed);
- parameterized SQL queries (`repo`, time window computed from `hoursBack`), no interpolation;
- the targeted field is read from `json_extract(meta, '$.cmd')` / `'$.file'`.

- [ ] **Step 4: Run → success** (`npx vitest run lib/patterns.test.ts`) — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/patterns.ts lib/patterns.test.ts
git commit -m "feat(lib): toil/retry/cold-read detection + velocity"
```

---

### Task 5: `hooks/session-start.ts` — SessionStart collection

**Files:**
- Create: `hooks/session-start.ts`
- Test: `hooks/session-start.test.ts`

**Interfaces:**
- Consumes: `loadConfig`/`repoSlug` (Task 1), `openDb`/`writeSession` (Task 2).
- Produces: executable hook reading a `SessionStart` payload from stdin, inserting a `sessions` row. Fail-open. Uses `CLAUDE_PROJECT_DIR` for the project.

- [ ] **Step 1: Write the test** (run the hook as a subprocess)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, closeDb } from "../lib/db.js";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "session-start.ts");

function runHook(payload: string, env: Record<string, string>): number {
  try {
    execFileSync("npx", ["tsx", HOOK], { input: payload, env: { ...process.env, ...env } });
    return 0;
  } catch (e: any) { return e.status ?? 1; }
}

describe("session-start hook", () => {
  let dbFile: string, project: string;
  beforeEach(() => {
    dbFile = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
    project = mkdtempSync(join(tmpdir(), "proj-"));
  });

  it("inserts a session for a valid payload", () => {
    const code = runHook(JSON.stringify({ session_id: "abc", cwd: project }), { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project });
    expect(code).toBe(0);
    const db = openDb(); // CHARDON_DB points to dbFile via current process env
    process.env.CHARDON_DB = dbFile;
    const db2 = openDb();
    const s = db2.prepare("SELECT id FROM sessions WHERE id = 'abc'").get();
    expect(s).toBeTruthy();
    closeDb(db); closeDb(db2);
  });

  it("fail-open on empty input (exit 0, no exception)", () => {
    expect(runHook("", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });

  it("fail-open on broken JSON", () => {
    expect(runHook("{not json", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });
});
```

- [ ] **Step 2: Run → failure** (`npx vitest run hooks/session-start.test.ts`) — Expected: FAIL (hook absent → exit ≠ 0 or no session).

- [ ] **Step 3: Implement `hooks/session-start.ts`**

Port `~/lab/granit-golem/.claude/hooks/devmetrics-session-start.ts` with:
- `repo = repoSlug(CLAUDE_PROJECT_DIR)`, `sessionType` = `'worktree'` if the basename matches `/-wt-\d+$/` else `'main'`;
- `ticketIid` extracted from the branch via `new RegExp(config.ticketRegex)` (configurable), not the hardcoded granit regex;
- JSDoc header `@version 0.1.0` + `@last-reviewed 2026-06-25`;
- **fail-open**: entire body in try/catch, unconditional `process.exit(0)` at the end;
- reads stdin via `readFileSync(0, "utf8")`, parses JSON in a try/catch.

- [ ] **Step 4: Run → success** (`npx vitest run hooks/session-start.test.ts`) — Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add hooks/session-start.ts hooks/session-start.test.ts
git commit -m "feat(hooks): session-start collects the session (fail-open)"
```

---

### Task 6: `hooks/post-tool-use.ts` — event collection

**Files:**
- Create: `hooks/post-tool-use.ts`
- Test: `hooks/post-tool-use.test.ts`

**Interfaces:**
- Consumes: `openDb`/`writeEvent` (Task 2), `redactCmd` (Task 3), `repoSlug` (Task 1).
- Produces: `PostToolUse` hook inserting an `events` row (tool, success, duration_ms, redacted meta). Fail-open.

- [ ] **Step 1: Write the test** (same `runHook` helper as Task 5; copy it into this file)

```ts
// ... same imports + runHook as Task 5, HOOK = "post-tool-use.ts" ...
describe("post-tool-use hook", () => {
  it("inserts an event with redacted meta.cmd", () => {
    process.env.CHARDON_DB = dbFile;
    const payload = JSON.stringify({
      session_id: "abc", cwd: project, tool_name: "Bash",
      tool_input: { command: "export TOKEN=glpat-secret1234567890abcd" },
      tool_response: { is_error: false },
    });
    expect(runHook(payload, { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
    const ev = openDb().prepare("SELECT tool, meta FROM events").get() as any;
    expect(ev.tool).toBe("Bash");
    expect(ev.meta).not.toContain("glpat-secret");
  });

  it("fail-open on empty input", () => {
    expect(runHook("", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });
});
```

- [ ] **Step 2: Run → failure** (`npx vitest run hooks/post-tool-use.test.ts`).

- [ ] **Step 3: Implement `hooks/post-tool-use.ts`**

Port `devmetrics-post-tool-use.ts`: extract `tool_name`, `success = !tool_response.is_error`, `duration_ms` if provided; `meta` = `{ cmd: redactCmd(command), file, skill, subagent_type }` depending on the tool; `repo = repoSlug(CLAUDE_PROJECT_DIR)`. Versioned header. Fail-open (final exit 0). No dependencies outside `lib/`.

- [ ] **Step 4: Run → success** (`npx vitest run hooks/post-tool-use.test.ts`) — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/post-tool-use.ts hooks/post-tool-use.test.ts
git commit -m "feat(hooks): post-tool-use collects events (redacted meta)"
```

---

### Task 7: `scripts/analyze-daily.ts` — daily report (pure rendering)

**Files:**
- Create: `scripts/analyze-daily.ts`
- Test: `scripts/analyze-daily.test.ts`

**Interfaces:**
- Consumes: patterns + velocity (Task 4), `openDb` (Task 2), `loadConfig` (Task 1).
- Produces:
  - `renderDailyReport(data: { date: string; velocity: {...}; toil: [...]; coldReads: [...] }): string` — **pure function**, DB-agnostic, returns Markdown.
  - `generateDailyReport(opts: { projectDir: string; now: Date }): { path: string; markdown: string }` — orchestration (reads DB, writes `<outDir>/daily-YYYY-MM-DD.md` file).

- [ ] **Step 1: Write the test** (on the pure renderer, no I/O)

```ts
import { describe, it, expect } from "vitest";
import { renderDailyReport } from "./analyze-daily.js";

describe("renderDailyReport", () => {
  it("produces the expected sections", () => {
    const md = renderDailyReport({
      date: "2026-06-25",
      velocity: { sessions: 2, tools: 40, failures: 3 },
      toil: [{ cmd: "npm run build", count: 5 }],
      coldReads: [{ file: "src/big.ts", count: 4 }],
    });
    expect(md).toContain("2026-06-25");
    expect(md).toContain("npm run build");
    expect(md).toContain("src/big.ts");
    expect(md).toMatch(/v[ée]locit[ée]/i);
  });

  it("handles absence of friction without crashing", () => {
    const md = renderDailyReport({ date: "2026-06-25", velocity: { sessions: 0, tools: 0, failures: 0 }, toil: [], coldReads: [] });
    expect(md).toContain("2026-06-25");
  });
});
```

- [ ] **Step 2: Run → failure** (`npx vitest run scripts/analyze-daily.test.ts`).

- [ ] **Step 3: Implement `scripts/analyze-daily.ts`**

Port `~/lab/granit-golem/scripts/dev/analyze-daily.ts` by **separating rendering from I/O**: `renderDailyReport(data)` pure (Markdown tables, conditional sections); `generateDailyReport({projectDir, now})` reads the DB (velocity + patterns over 24h), calls `renderDailyReport`, writes to `${config.outDir}/daily-${YYYY-MM-DD}.md` (recursive mkdir). `outDir` from `loadConfig`, never `docs/dev-metrics` hardcoded. The date comes from `now` (injected), not an internal `new Date()`.

- [ ] **Step 4: Run → success** (`npx vitest run scripts/analyze-daily.test.ts`) — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/analyze-daily.ts scripts/analyze-daily.test.ts
git commit -m "feat(scripts): daily report (pure rendering + generation)"
```

---

### Task 8: `hooks/stop.ts` + `hooks/notify.ts` — close & alert

**Files:**
- Create: `hooks/stop.ts`, `hooks/notify.ts`
- Test: `hooks/stop.test.ts`, `hooks/notify.test.ts`

**Interfaces:**
- Consumes: `closeSession`/`openDb` (Task 2), `generateDailyReport` (Task 7), `detectToilLoops` (Task 4), `loadConfig` (Task 1).
- Produces: `stop.ts` (Stop → ended_at + generates the report); `notify.ts` (PreToolUse Bash → inline toil alert if `CHARDON_ACTIVE=1`). Both fail-open.

- [ ] **Step 1: Write the tests**

```ts
// hooks/stop.test.ts — runHook (see Task 5), HOOK="stop.ts"
describe("stop hook", () => {
  it("closes the session and exits 0", () => {
    process.env.CHARDON_DB = dbFile;
    const db = openDb();
    db.prepare("INSERT INTO sessions (id, repo, session_type) VALUES ('z','p','main')").run();
    closeDb(db);
    expect(runHook(JSON.stringify({ session_id: "z", cwd: project }), { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project, CHARDON_OUT_DIR: project })).toBe(0);
    const s = openDb().prepare("SELECT ended_at FROM sessions WHERE id='z'").get() as any;
    expect(s.ended_at).toBeTruthy();
  });
  it("fail-open on empty input", () => {
    expect(runHook("", { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project })).toBe(0);
  });
});
```

```ts
// hooks/notify.test.ts — HOOK="notify.ts"
describe("notify hook", () => {
  it("exits 0 and is silent if CHARDON_ACTIVE is not set", () => {
    const out = runHookCapture(JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" }, cwd: project }), { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project });
    expect(out.code).toBe(0);
    expect(out.stdout).toBe("");
  });
  it("fail-open on broken JSON", () => {
    expect(runHookCapture("{x", { CHARDON_DB: dbFile }).code).toBe(0);
  });
});
// runHookCapture: variant of runHook that returns { code, stdout } (execFileSync with stdio pipe)
```

- [ ] **Step 2: Run → failure** (`npx vitest run hooks/stop.test.ts hooks/notify.test.ts`).

- [ ] **Step 3: Implement both hooks**

- `stop.ts` (port `devmetrics-stop.ts`): `closeSession(db, session_id, now)`; then `generateDailyReport({projectDir, now})` on a best-effort basis (try/catch — its failure does not prevent exit 0). No detached subprocess launch (call the function directly). Versioned header. Fail-open.
- `notify.ts` (port `devmetrics-notify.ts`): if `process.env.CHARDON_ACTIVE !== "1"` → immediate exit 0; otherwise `detectToilLoops` on the current session, and if a loop exceeds the threshold, write a short message to stdout. No DB writes. Exclusions from `loadConfig`. Fail-open. (Live token budget is out of Batch 1 scope — Batch 6.)

- [ ] **Step 4: Run → success** (`npx vitest run hooks/stop.test.ts hooks/notify.test.ts`) — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/stop.ts hooks/notify.ts hooks/stop.test.ts hooks/notify.test.ts
git commit -m "feat(hooks): stop (close + report) and notify (toil alert)"
```

---

### Task 9: End-to-end integration check

**Files:**
- Create: `test/integration.test.ts`

**Interfaces:**
- Consumes all previous modules.

- [ ] **Step 1: Write the integration test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), "../hooks");
function hook(name: string, payload: string, env: Record<string, string>) {
  try { execFileSync("npx", ["tsx", join(HOOKS, name)], { input: payload, env: { ...process.env, ...env } }); return 0; }
  catch (e: any) { return e.status ?? 1; }
}

describe("end-to-end integration", () => {
  it("session → events → stop generates a daily report", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    const env = { CHARDON_DB: join(dir, "c.db"), CLAUDE_PROJECT_DIR: dir, CHARDON_OUT_DIR: dir };
    const p = (o: object) => JSON.stringify({ session_id: "e2e", cwd: dir, ...o });
    expect(hook("session-start.ts", p({}), env)).toBe(0);
    expect(hook("post-tool-use.ts", p({ tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { is_error: false } }), env)).toBe(0);
    expect(hook("stop.ts", p({}), env)).toBe(0);
    const out = join(dir, "docs/chardon");
    expect(existsSync(out) && readdirSync(out).some((f) => f.startsWith("daily-"))).toBe(true);
  });
});
```

Note: if `generateDailyReport` uses `loadConfig().outDir` (default `docs/chardon`) rather than `CHARDON_OUT_DIR`, adjust the assertion to match the path actually produced (the test must reflect the behavior implemented in Task 7).

- [ ] **Step 2: Run → success** (`npx vitest run test/integration.test.ts`) — Expected: PASS (report generated).

- [ ] **Step 3: Full suite + typecheck**

Run: `cd ~/lab/chardon && npm test && npm run typecheck`
Expected: all tests PASS, typecheck with no errors.

- [ ] **Step 4: Commit**

```bash
git add test/integration.test.ts
git commit -m "test: end-to-end integration collect → report"
```

---

## Self-Review

- **Spec coverage (Batch 1)**: schema (present); `db.ts` → Task 2; `redact.ts` → Task 3; `patterns.ts` → Task 4; 4 hooks → Tasks 5,6,8; `analyze-daily` → Task 7; config/path decoupling → Task 1; end-to-end flow → Task 9. Batches 2-6 (token-parser, statusline, commands, LLM weekly, improvement loop) = separate plans to follow.
- **Placeholders**: the "port granit X" implementations point to a real source file + precise decouplings + an explicit interface; the tests are real code. No TBD.
- **Type consistency**: `repoSlug`/`transcriptSlug`/`dbPath`/`loadConfig` (Task 1) reused as-is; `openDb`/`writeSession`/`writeEvent`/`closeSession` (Task 2) stable signatures; `renderDailyReport`/`generateDailyReport` (Task 7) consumed by Tasks 8/9. `CHARDON_DB` (DB path) and `CHARDON_OUT_DIR`/`config.outDir` consistent — Task 9 notes the alignment needed depending on Task 7's implementation.
- **Ordering note**: Tasks 1→2→3→4 sequential (lib layer); 5,6 depend on 1-3; 7 depends on 1,2,4; 8 depends on 2,4,7; 9 depends on everything. Execute in order.
