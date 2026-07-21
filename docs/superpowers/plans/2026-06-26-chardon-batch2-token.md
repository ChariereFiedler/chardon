# Chardon — Batch 2 "Token cost" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Parse Claude Code transcripts into the `token_usage` table and surface token cost (and retry storms) in the daily report.

**Architecture:** A new pure `lib/token-parser.ts` reads transcript JSONL files, aggregates token counts per day/origin, upserts into `token_usage`, and detects cache-efficiency drift. `analyze-daily` then reads `token_usage` to add a token section, and finally wires the already-existing `detectRetryStorms`.

**Tech Stack:** TypeScript, `node:sqlite`, Vitest. Builtins only.

## Global Constraints

- **English only** (code, comments, JSDoc, user-facing strings, tests, docs, commits) — see `CLAUDE.md`.
- **Absolute genericity**: NEVER hardcode a project path or `-home-user-lab-...` slug. Derive the transcript directory from `transcriptSlug(CLAUDE_PROJECT_DIR)` (`lib/config.ts`).
- **Testability**: the transcripts root MUST be overridable via env `CHARDON_PROJECTS_DIR` (default `~/.claude/projects`), so tests read from a temp fixture dir; `now` is injected, never `new Date()` in logic under test.
- **Parameterized SQL only**; `node:sqlite` via `createRequire`.
- DB path via `CHARDON_DB`. Schema already has `token_usage(date, origin, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)` with PK `(date, origin)`.
- Commits `type(scope): description` ≤ 72 chars; NEVER mention Claude/AI/LLM; no magic numbers.

**Source to port** (read-only): `~/lab/granit-golem/scripts/dev/telemetry/token-parser.ts` and its test `token-parser.test.ts`. The granit version hardcodes `MAIN_DIR_PATTERN = /^-home-user-lab-granit-golem$/` and `WORKTREE_DIR_PATTERN` — these MUST be replaced by dynamic derivation from `CLAUDE_PROJECT_DIR`.

---

### Task 1: `lib/token-parser.ts` — transcript aggregation

**Files:**
- Create: `lib/token-parser.ts`
- Test: `lib/token-parser.test.ts`
- Create fixtures under: `test/fixtures/transcripts/`

**Interfaces:**
- Consumes: `transcriptSlug`/`repoSlug` (`lib/config.ts`), `openDb` (`lib/db.ts`).
- Produces:
  - `interface DayUsage { date: string; origin: "main" | "worktree"; inputTokens: number; outputTokens: number; cacheRead: number; cacheCreation: number; nbMessages: number; nbSessions: number }`
  - `projectsDir(): string` — `process.env.CHARDON_PROJECTS_DIR ?? join(homedir(), ".claude/projects")`.
  - `aggregateTranscripts(projectDir: string): DayUsage[]` — reads JSONL transcripts under `projectsDir()/<transcriptSlug(projectDir)>/`, sums the `usage` blocks of assistant messages grouped by calendar day (from each entry's timestamp); `origin` is `"worktree"` if `basename(projectDir)` matches `/-wt-\d+$/`, else `"main"`.
  - `upsertTokenUsage(db, rows: DayUsage[]): void` — UPSERT into `token_usage` (`INSERT ... ON CONFLICT(date,origin) DO UPDATE`).
  - `detectTokenDrift(db, repoOrigin: "main" | "worktree", today: string): { drift: boolean; ratio: number; median: number }` — compares today's `cache_read/output_tokens` ratio against the 7-day median; `drift` if ratio > 2× median.

- [ ] **Step 1: Write the fixtures + tests**

Create two small transcript fixtures (JSONL, one assistant message each with a `usage` block) under `test/fixtures/transcripts/<slug>/`. The test builds a temp projects dir, copies/points a slug dir at fixtures via `CHARDON_PROJECTS_DIR`.

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb } from "./db.js";
import { aggregateTranscripts, upsertTokenUsage, detectTokenDrift } from "./token-parser.js";
import { transcriptSlug } from "./config.js";

let projectDir: string;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  const root = mkdtempSync(join(tmpdir(), "projects-"));
  process.env.CHARDON_PROJECTS_DIR = root;
  projectDir = "/home/x/myproj";
  const slugDir = join(root, transcriptSlug(projectDir));
  mkdirSync(slugDir, { recursive: true });
  const line = (ts: string, out: number, cr: number) => JSON.stringify({
    type: "assistant", timestamp: ts,
    message: { usage: { input_tokens: 100, output_tokens: out, cache_read_input_tokens: cr, cache_creation_input_tokens: 10 } },
  });
  writeFileSync(join(slugDir, "s1.jsonl"), line("2026-06-26T10:00:00Z", 50, 200) + "\n" + line("2026-06-26T11:00:00Z", 30, 100) + "\n");
});
afterEach(() => { delete process.env.CHARDON_PROJECTS_DIR; });

describe("token-parser", () => {
  it("aggregates token usage per day for a project", () => {
    const rows = aggregateTranscripts(projectDir);
    const day = rows.find((r) => r.date === "2026-06-26");
    expect(day?.origin).toBe("main");
    expect(day?.outputTokens).toBe(80);
    expect(day?.cacheRead).toBe(300);
  });

  it("classifies a worktree project as origin=worktree", () => {
    const rows = aggregateTranscripts("/home/x/myproj-wt-2");
    // no transcripts for that slug → empty, but origin classification is by basename
    expect(rows.every((r) => r.origin === "worktree")).toBe(true);
  });

  it("upsert is idempotent on (date, origin)", () => {
    const db = openDb();
    const rows = aggregateTranscripts(projectDir);
    upsertTokenUsage(db, rows);
    upsertTokenUsage(db, rows);
    const n = db.prepare("SELECT COUNT(*) c FROM token_usage").get() as { c: number };
    expect(n.c).toBe(rows.length);
    closeDb(db);
  });
});
```

- [ ] **Step 2: Run → fail** (`cd ~/lab/chardon && npx vitest run lib/token-parser.test.ts`).

- [ ] **Step 3: Implement `lib/token-parser.ts`**

Port the granit `token-parser.ts`, replacing the hardcoded dir patterns: the transcript directory is `join(projectsDir(), transcriptSlug(projectDir))`, and `origin` is derived from the worktree suffix on `basename(projectDir)`. Read every `*.jsonl` in that dir line by line; for each assistant entry with a `usage` block, add `input_tokens`/`output_tokens`/`cache_read_input_tokens`/`cache_creation_input_tokens` to the bucket for the entry's calendar day (UTC `YYYY-MM-DD` from `timestamp`); count messages and distinct session files. `upsertTokenUsage` uses parameterized `INSERT ... ON CONFLICT(date,origin) DO UPDATE SET`. `detectTokenDrift` runs a parameterized query over the last 7 days. No magic numbers (the drift factor 2 and window 7 are named constants).

- [ ] **Step 4: Run → success** (`npx vitest run lib/token-parser.test.ts`) — PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/token-parser.ts lib/token-parser.test.ts test/fixtures/transcripts
git commit -m "feat(lib): token-parser aggregates transcript usage"
```

---

### Task 2: Wire token usage + retry storms into the daily report

**Files:**
- Modify: `scripts/analyze-daily.ts`
- Modify: `scripts/analyze-daily.test.ts`
- Modify: `hooks/stop.ts` (run aggregation before the report)

**Interfaces:**
- Consumes: `aggregateTranscripts`/`upsertTokenUsage`/`detectTokenDrift` (Task 1), `detectRetryStorms` (`lib/patterns.ts`).
- Produces: extends `DailyReportData` with `tokens` and `retryStorms`; `renderDailyReport` gains a Tokens section and a Retry storms table.

- [ ] **Step 1: Extend the pure-render test**

```ts
it("renders the tokens and retry-storms sections", () => {
  const md = renderDailyReport({
    date: "2026-06-26",
    velocity: { sessions: 1, tools: 10, failures: 0 },
    toil: [], coldReads: [],
    retryStorms: [{ file: "src/a.ts", count: 5 }],
    tokens: { inputTokens: 100, outputTokens: 80, cacheRead: 300, cacheCreation: 10, drift: false },
  });
  expect(md).toContain("src/a.ts");
  expect(md).toMatch(/tokens/i);
  expect(md).toContain("300"); // cache read
});
```

- [ ] **Step 2: Run → fail** (`npx vitest run scripts/analyze-daily.test.ts`) — the new test fails (fields/sections missing).

- [ ] **Step 3: Implement**

Extend `DailyReportData` with `retryStorms: RetryStorm[]` and `tokens: { inputTokens; outputTokens; cacheRead; cacheCreation; drift: boolean }`. In `renderDailyReport`, add:
- a `## Tokens` section: a line `input N · output N · cache read N · cache creation N` and, if `drift`, a `⚠️ cache efficiency drift` note;
- a `### Retry storms (same file edited repeatedly)` table `| File | Edits |` when `retryStorms` is non-empty.
In `generateDailyReport`, call `detectRetryStorms(db, repo, ANALYSIS_WINDOW_HOURS)`, read today's `token_usage` row(s) for the project's origin (summed), and `detectTokenDrift`. Keep existing sections. Update the older test cases to pass the two new fields (empty/zero).
In `hooks/stop.ts`, before `generateDailyReport`, run `upsertTokenUsage(db, aggregateTranscripts(projectDir))` in its own try/catch (best-effort, never blocks exit 0).

- [ ] **Step 4: Run → success** (`npx vitest run scripts/analyze-daily.test.ts hooks/stop.test.ts`) — PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npm test && npm run typecheck` → all green.
```bash
git add scripts/analyze-daily.ts scripts/analyze-daily.test.ts hooks/stop.ts
git commit -m "feat(scripts): daily report shows tokens and retry storms"
```

---

## Self-Review

- **Spec coverage (Batch 2)**: token_usage parser → Task 1; token cost + retry storms in report → Task 2; `transcriptSlug` now used → Task 1; `detectRetryStorms` now wired → Task 2.
- **Placeholders**: port instructions reference the real granit source + concrete decoupling; tests are real code.
- **Type consistency**: `DayUsage` (Task 1) consumed by Task 2; `RetryStorm` reused from `lib/patterns.ts`; `CHARDON_PROJECTS_DIR` is the testability override mirroring `CHARDON_DB`.
