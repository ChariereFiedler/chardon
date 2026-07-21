# Chardon — Test Strategy & LLM Evaluation Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** From the test audit — make the LLM task testable and evaluable, fill the highest-value coverage gaps, strengthen weak assertions, and add coverage tooling.

**Architecture:** Make the model boundary injectable so the weekly orchestration is testable with a stub; add a deterministic contract + an opt-in real-model evaluation harness; add unit tests for the untested pure pipeline (`aggregateWeek`, `detectTokenDrift`, `detectRetryStorms`, `isoWeekLabel`); configure v8 coverage.

**Tech Stack:** TypeScript, Vitest, Node builtins; `@anthropic-ai/sdk` (optional, eval only).

## Global Constraints

- **English only** (code, comments, strings, tests, docs, commits). See `CLAUDE.md`.
- **No network in the normal suite** (`npm test`). The real-model eval is a SEPARATE opt-in run, gated on `ANTHROPIC_API_KEY`, skipped otherwise.
- Injected `now`; pure renderers; parameterized SQL; `node:sqlite` via `lib/db`; no magic numbers.
- Commits `type(scope): description` ≤ 72 chars; no Claude/AI/LLM mention.

---

### Task 1: Make the LLM task testable + evaluable

**Files:**
- Modify: `scripts/analyze-weekly.ts` (inject the model fn; export `isoWeekLabel`; cap synthesis length)
- Modify: `scripts/analyze-weekly.test.ts` (e2e with stub model; non-empty render; length guard; isoWeekLabel)
- Modify: `lib/weekly.ts` (export a `ModelFn` type)
- Create: `eval/weekly.eval.test.ts` (opt-in real-model evaluation)
- Modify: `package.json` (`"eval": "vitest run eval"`; exclude `eval/` from the default `test` run)
- Modify: `vitest.config.ts` (default `include` excludes `eval/**`)
- Modify: `TESTING.md` (add the "LLM task evaluation" section)

**Interfaces:**
- Produces:
  - `type ModelFn = (prompt: string) => Promise<string | null>` (export from `lib/weekly.ts`).
  - `generateWeeklyReport(opts: { projectDir: string; now: Date; model?: ModelFn }): Promise<{ path: string; markdown: string }>` — `model` defaults to `callModel`. The synthesis is capped at `SYNTHESIS_MAX_CHARS` (named constant, e.g. 8000) before rendering.
  - `isoWeekLabel(date: Date): string` is exported.

- [ ] **Step 1: Write the tests** (in `scripts/analyze-weekly.test.ts`, add)

```ts
import { generateWeeklyReport, renderWeeklyReport, isoWeekLabel } from "./analyze-weekly.js";
import { openDb, closeDb, writeSession, writeEvent } from "../lib/db.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("generateWeeklyReport runs end-to-end with an injected stub model (no network)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proj-"));
  process.env.CHARDON_DB = join(dir, "c.db");
  const db = openDb();
  writeSession(db, { id: "s1", repo: "proj", sessionType: "main" });
  for (let i = 0; i < 9; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
  closeDb(db);
  const stub = async () => "Synthesis: cache the build to cut toil.";
  const { path, markdown } = await generateWeeklyReport({ projectDir: dir, now: new Date("2026-06-26T12:00:00Z"), model: stub });
  expect(markdown).toContain("## AI synthesis");
  expect(markdown).toContain("cache the build");
  expect(readFileSync(path, "utf8")).toBe(markdown);
});

it("caps an oversized synthesis", () => {
  const long = "x".repeat(50000);
  const md = renderWeeklyReport("2026-06-26", { repo: "p", weekStart: "a", weekEnd: "b", toil: [], coldReads: [], tokens: { input: 0, output: 0, cacheRead: 0 } }, long);
  expect(md.length).toBeLessThan(20000);
});

it("isoWeekLabel handles a year-boundary date", () => {
  expect(isoWeekLabel(new Date("2026-12-31T00:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
});
```

- [ ] **Step 2: Run → fail** (`cd ~/lab/chardon && npx vitest run scripts/analyze-weekly.test.ts`).

- [ ] **Step 3: Implement**

- Export `type ModelFn` from `lib/weekly.ts`.
- `generateWeeklyReport` gains `model: ModelFn = callModel`; call `model(prompt).catch(() => null)`; cap the synthesis at `SYNTHESIS_MAX_CHARS` (named constant) inside `renderWeeklyReport` (truncate with a `… (truncated)` marker) — keep `renderWeeklyReport` pure.
- Export `isoWeekLabel`.

- [ ] **Step 4: Create the opt-in real-model eval** `eval/weekly.eval.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildWeeklyPrompt, callModel } from "../lib/weekly.js";

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;

// Opt-in evaluation: only runs when ANTHROPIC_API_KEY is set (real model call).
describe.skipIf(!HAS_KEY)("weekly LLM evaluation", () => {
  it("the synthesis names the dominant friction and proposes an action", async () => {
    const prompt = buildWeeklyPrompt({
      repo: "demo", weekStart: "2026-06-20", weekEnd: "2026-06-26",
      toil: [{ cmd: "npm run build", count: 30 }],
      coldReads: [{ file: "src/huge.ts", count: 12 }],
      tokens: { input: 100000, output: 50000, cacheRead: 800000 },
    });
    const out = await callModel(prompt);
    expect(out).not.toBeNull();
    // Rubric: mentions the dominant toil command and offers at least one suggestion verb.
    expect(out!.toLowerCase()).toContain("npm run build");
    expect(out!).toMatch(/\b(cache|script|automate|extract|split|reduce|alias)\b/i);
    expect(out!.length).toBeLessThan(8000);
  });
});
```

- [ ] **Step 5: Wire the eval split**

- `vitest.config.ts`: set `test.include` to `["lib/**/*.test.ts", "hooks/**/*.test.ts", "scripts/**/*.test.ts", "test/**/*.test.ts"]` (i.e. NOT `eval/**`).
- `package.json`: add `"eval": "vitest run eval"`; `test` stays `vitest run` (now excludes eval via the include).

- [ ] **Step 6: Document** — add a "## LLM task evaluation" section to `TESTING.md`: the model boundary is injectable (`ModelFn`); the normal suite uses a stub (no network); `npm run eval` runs the real-model rubric eval, skipped without `ANTHROPIC_API_KEY`; output is length-capped.

- [ ] **Step 7: Run + commit**

Run: `npm test && npm run typecheck` → green (eval skipped/excluded).
```bash
git add scripts/analyze-weekly.ts scripts/analyze-weekly.test.ts lib/weekly.ts eval/weekly.eval.test.ts package.json vitest.config.ts TESTING.md
git commit -m "test(weekly): injectable model + e2e stub + opt-in LLM eval"
```

---

### Task 2: Fill high-value coverage gaps (pure pipeline + hooks)

**Files:**
- Modify: `lib/weekly.test.ts` (add `aggregateWeek` tests)
- Modify: `lib/token-parser.test.ts` (add `detectTokenDrift` tests)
- Modify: `lib/patterns.test.ts` (add a direct `detectRetryStorms` test)
- Modify: `hooks/notify.test.ts` (add the `CHARDON_ACTIVE=1` alert test)
- Modify: `test/integration.test.ts` (read the report content, not just existence)

**Interfaces:** consume existing exports only.

- [ ] **Step 1: Write the tests**

```ts
// lib/weekly.test.ts — aggregateWeek over a seeded DB + fixed now
import { aggregateWeek } from "./weekly.js";
import { openDb, closeDb, writeSession, writeEvent } from "./db.js";
it("aggregateWeek sums frictions and tokens for the repo over the week", () => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "c-")), "t.db");
  const db = openDb();
  writeSession(db, { id: "s1", repo: "p", sessionType: "main" });
  for (let i = 0; i < 9; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
  const s = aggregateWeek(db, "p", new Date("2026-06-26T12:00:00Z"));
  expect(s.repo).toBe("p");
  expect(s.toil.find((t) => t.cmd === "npm run build")?.count).toBe(9);
  closeDb(db);
});
```

```ts
// lib/token-parser.test.ts — detectTokenDrift
import { detectTokenDrift } from "./token-parser.js";
import { openDb, closeDb } from "./db.js";
it("detectTokenDrift flags a cache-read ratio spike vs the median", () => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "c-")), "t.db");
  const db = openDb();
  const ins = db.prepare("INSERT INTO token_usage (date, origin, output_tokens, cache_read) VALUES (?,?,?,?)");
  for (const d of ["2026-06-19","2026-06-20","2026-06-21","2026-06-22","2026-06-23","2026-06-24","2026-06-25"]) ins.run(d, "main", 100, 100);
  ins.run("2026-06-26", "main", 100, 1000); // today: ratio 10 vs median 1
  const r = detectTokenDrift(db, "main", "2026-06-26");
  expect(r.drift).toBe(true);
  closeDb(db);
});
```

```ts
// lib/patterns.test.ts — direct retry storm
it("detectRetryStorms flags a file edited >= RETRY_MIN times", () => {
  for (let i = 0; i < 4; i++) writeEvent(db, { sessionId: "s1", tool: "Edit", success: true, meta: { file: "src/a.ts" } });
  expect(detectRetryStorms(db, "p", 24)[0]).toEqual({ file: "src/a.ts", count: 4 });
});
```

```ts
// hooks/notify.test.ts — active alert
it("emits a toil alert on stdout when CHARDON_ACTIVE=1 and a loop exists", () => {
  process.env.CHARDON_DB = dbFile;
  const db = openDb();
  db.prepare("INSERT INTO sessions (id, repo, session_type) VALUES ('s','p','main')").run();
  const ev = db.prepare("INSERT INTO events (session_id, tool, success, meta) VALUES ('s','Bash',1,?)");
  for (let i = 0; i < 5; i++) ev.run(JSON.stringify({ cmd: "npm run build" }));
  closeDb(db);
  const out = runHookCapture(JSON.stringify({ tool_name: "Bash", cwd: project }), { CHARDON_DB: dbFile, CLAUDE_PROJECT_DIR: project, CHARDON_ACTIVE: "1" });
  expect(out.code).toBe(0);
  expect(out.stdout).toMatch(/toil loop/i);
});
```

- [ ] **Step 2: Run → fail then implement** — these are pure test additions; if a test reveals a real bug (e.g. `detectTokenDrift` median), STOP and report BLOCKED rather than fixing another module silently. Otherwise the production code already supports them.

- [ ] **Step 3: Strengthen the integration assertion** — in `test/integration.test.ts`, after asserting the `daily-*.md` exists, read it and assert it contains a known section (e.g. `## Velocity`).

- [ ] **Step 4: Run + commit**

Run: `npm test && npm run typecheck` → green.
```bash
git add lib/weekly.test.ts lib/token-parser.test.ts lib/patterns.test.ts hooks/notify.test.ts test/integration.test.ts
git commit -m "test: cover aggregateWeek, token drift, retry storms, notify alert"
```

---

### Task 3: Coverage tooling

**Files:**
- Modify: `vitest.config.ts` (coverage block)
- Modify: `package.json` (`"coverage": "vitest run --coverage"`, add `@vitest/coverage-v8` to devDependencies)
- Modify: `TESTING.md` (document `npm run coverage`)

- [ ] **Step 1: Configure** `vitest.config.ts`:
```ts
coverage: {
  provider: "v8",
  reporter: ["text", "html"],
  include: ["lib/**", "scripts/**", "hooks/**"],
  exclude: ["**/*.test.ts", "eval/**"],
},
```
Add `"coverage": "vitest run --coverage"` to `package.json` scripts and `"@vitest/coverage-v8": "^2.0.0"` to devDependencies. (Do not run `npm install`; the dependency is declared for whoever runs coverage. If `npm run coverage` cannot run without it, note that in the report rather than installing.)

- [ ] **Step 2: Document** in `TESTING.md`: `npm run coverage` (HTML report under `coverage/`, git-ignored). Confirm `coverage/` is in `.gitignore` (it already is).

- [ ] **Step 3: Run + commit**

Run: `npm test && npm run typecheck` → green (coverage config does not affect the normal run).
```bash
git add vitest.config.ts package.json TESTING.md
git commit -m "test: configure v8 coverage reporting"
```

---

## Self-Review

- **Audit coverage**: LLM testability/eval (rec 1,3,9,14) → Task 1; aggregateWeek/detectTokenDrift/detectRetryStorms (rec 2,5,6) + notify (rec 11) + integration assertion → Task 2; coverage tooling (rec 4) → Task 3. `isoWeekLabel` (rec 10) → Task 1.
- **No-network invariant**: the real-model eval is in `eval/`, excluded from `npm test`, skipped without `ANTHROPIC_API_KEY`.
- **Placeholders**: real test code throughout; `ModelFn` typed; named constant `SYNTHESIS_MAX_CHARS`.
