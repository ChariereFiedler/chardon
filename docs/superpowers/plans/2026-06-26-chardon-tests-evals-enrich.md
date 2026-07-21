# Chardon — Tests & Evals Enrichment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** From a coverage review (v8: hooks 0% [subprocess artifact], statusline 19%, improve 48%, weekly callModel uncovered, thin eval). Enrich the deterministic test coverage and the LLM evaluation harness.

**Baseline:** 70 tests + 1 eval. Coverage: all files 54% lines / 72% branch.

## Global Constraints

- **English only** (code, comments, strings, tests, docs, commits). See `CLAUDE.md`.
- Deterministic; temp DB via `CHARDON_DB`; **no network in `npm test`** (eval stays opt-in under `eval/`, gated on `ANTHROPIC_API_KEY`).
- Pure renderers stay pure; hooks stay fail-open; parameterized SQL; no magic numbers.
- Commits `type(scope): description` ≤ 72 chars; no Claude/AI/LLM mention.

---

### Task 1: Enrich the LLM evaluation harness

**Files:**
- Modify: `eval/weekly.eval.test.ts` (multi-scenario rubrics)
- Modify: `lib/weekly.test.ts` (deterministic prompt contract — runs in `npm test`)
- Modify: `TESTING.md` (document the eval scenarios)

**Interfaces:** consume existing `buildWeeklyPrompt`, `callModel`, `WeekSummary`.

- [ ] **Step 1: Deterministic prompt contract** (in `lib/weekly.test.ts`, no network)

```ts
it("buildWeeklyPrompt includes a clear no-friction marker when empty", () => {
  const p = buildWeeklyPrompt({ repo: "p", weekStart: "a", weekEnd: "b", toil: [], coldReads: [], tokens: { input: 0, output: 0, cacheRead: 0 } });
  expect(p).toMatch(/no (toil|friction|repeated)/i);
});

it("buildWeeklyPrompt lists every toil command and cold read", () => {
  const p = buildWeeklyPrompt({
    repo: "p", weekStart: "a", weekEnd: "b",
    toil: [{ cmd: "npm run build", count: 9 }, { cmd: "git status", count: 5 }],
    coldReads: [{ file: "src/a.ts", count: 4 }],
    tokens: { input: 10, output: 20, cacheRead: 30 },
  });
  for (const s of ["npm run build", "git status", "src/a.ts", "9", "5", "4"]) expect(p).toContain(s);
});
```

- [ ] **Step 2: Multi-scenario eval** — replace the single eval case with a table of scenarios, each gated by `describe.skipIf(!process.env.ANTHROPIC_API_KEY)`:

```ts
const SCENARIOS = [
  { name: "toil-heavy", summary: { repo: "demo", weekStart: "2026-06-20", weekEnd: "2026-06-26", toil: [{ cmd: "npm run build", count: 40 }], coldReads: [], tokens: { input: 1000, output: 800, cacheRead: 5000 } },
    mustMention: "npm run build", mustNotMention: "cold read" },
  { name: "cold-read-heavy", summary: { repo: "demo", weekStart: "2026-06-20", weekEnd: "2026-06-26", toil: [], coldReads: [{ file: "src/huge.ts", count: 15 }], tokens: { input: 1000, output: 800, cacheRead: 5000 } },
    mustMention: "src/huge.ts", mustNotMention: "npm run build" },
  { name: "clean-week", summary: { repo: "demo", weekStart: "2026-06-20", weekEnd: "2026-06-26", toil: [], coldReads: [], tokens: { input: 1000, output: 800, cacheRead: 5000 } },
    mustMention: null, mustNotMention: "src/huge.ts" },
];

describe.skipIf(!process.env.ANTHROPIC_API_KEY)("weekly LLM evaluation", () => {
  it.each(SCENARIOS)("$name: focuses on the real friction, doesn't hallucinate", async ({ summary, mustMention, mustNotMention }) => {
    const out = await callModel(buildWeeklyPrompt(summary));
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThan(8000);
    if (mustMention) expect(out!.toLowerCase()).toContain(mustMention.toLowerCase());
    if (mustNotMention) expect(out!.toLowerCase()).not.toContain(mustNotMention.toLowerCase());
  });
});
```

- [ ] **Step 3: Document** — add the scenario table and the "doesn't hallucinate a friction that isn't present" criterion to the `## LLM task evaluation` section of `TESTING.md`.

- [ ] **Step 4: Run + commit**

Run: `npm test && npm run typecheck` → green (eval excluded). Optionally `npm run eval` (skipped without key).
```bash
git add eval/weekly.eval.test.ts lib/weekly.test.ts TESTING.md
git commit -m "test(eval): multi-scenario rubric + deterministic prompt contract"
```

---

### Task 2: Statusline testability & coverage (19% → high)

**Files:**
- Modify: `scripts/statusline.ts` (make `countSubagents` root injectable; ensure `windowSizeForModel` and the transcript-context parser are exported pure units)
- Modify: `scripts/statusline.test.ts`

**Interfaces:**
- `countSubagents(tasksRoot?: string): number` — reads from `process.env.CHARDON_TASKS_DIR ?? /tmp/claude-<uid>`; the optional/env override makes it testable.
- `windowSizeForModel(model: string): number` — exported pure (e.g. "1m"/"[1m]" → 1_000_000, else default 200_000); named constants.
- `parseTranscriptUsage(text: string): { model?: string; ctxUsed?: number } | null` — exported pure parser of a transcript JSONL tail (extracted from the current inline logic).

- [ ] **Step 1: Write the tests**

```ts
import { windowSizeForModel, parseTranscriptUsage, countSubagents } from "./statusline.js";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("windowSizeForModel detects 1M-context models", () => {
  expect(windowSizeForModel("claude-opus-4-8[1m]")).toBe(1_000_000);
  expect(windowSizeForModel("claude-haiku-4-5")).toBe(200_000);
});

it("parseTranscriptUsage extracts model + context from the last usage block", () => {
  const line = JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 100, cache_read_input_tokens: 4000, output_tokens: 50 } } });
  const r = parseTranscriptUsage(line + "\n");
  expect(r?.model).toBe("claude-opus-4-8");
  expect(r?.ctxUsed).toBeGreaterThan(0);
  expect(parseTranscriptUsage("not json")).toBeNull();
});

it("countSubagents counts fresh task output files under the injected root", () => {
  const root = mkdtempSync(join(tmpdir(), "tasks-"));
  const d = join(root, "sess", "tasks"); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "a.output"), "x"); // fresh
  const old = join(d, "b.output"); writeFileSync(old, "x");
  const longAgo = Date.now() / 1000 - 99999; utimesSync(old, longAgo, longAgo); // stale
  expect(countSubagents(root)).toBe(1);
});
```

- [ ] **Step 2: Run → fail then implement** — extract the three units (export them; `countSubagents` takes an optional root defaulting to the env/`/tmp` path). Keep `main()` wiring intact. If extraction reveals no behavior change, the existing render tests still pass.

- [ ] **Step 3: Run + commit**

Run: `npm test && npm run typecheck` → green.
```bash
git add scripts/statusline.ts scripts/statusline.test.ts
git commit -m "test(statusline): cover model window, transcript parse, subagents"
```

---

### Task 3: In-process hook cores (hooks 0% → real coverage)

**Files:**
- Modify: each `hooks/*.ts` to export a pure-ish `run(input: unknown, env: NodeJS.ProcessEnv): void` core; keep the existing CLI guard reading stdin + calling `run`.
- Modify: each `hooks/*.test.ts` to add IN-PROCESS tests calling `run(...)` directly (covering meta branches), keeping ONE subprocess smoke test per hook for the wiring.

**Interfaces (per hook):**
- `run(input: unknown, env: NodeJS.ProcessEnv): void` — exported; the CLI block parses stdin then calls `run(parsed, process.env)` inside the existing fail-open try/catch.

- [ ] **Step 1: Add in-process tests** (examples)

```ts
// post-tool-use.test.ts — exercise every meta branch in-process
import { run } from "./post-tool-use.js";
import { openDb, closeDb } from "../lib/db.js";
it("records file meta for Edit and skill meta for Skill", () => {
  process.env.CHARDON_DB = dbFile;
  run({ session_id: "s", cwd: project, tool_name: "Edit", tool_input: { file_path: "src/a.ts" }, tool_response: { is_error: false } }, { ...process.env, CLAUDE_PROJECT_DIR: project });
  run({ session_id: "s", cwd: project, tool_name: "Skill", tool_input: { skill: "x" }, tool_response: { is_error: false } }, { ...process.env, CLAUDE_PROJECT_DIR: project });
  const db = openDb();
  const rows = db.prepare("SELECT tool, meta FROM events ORDER BY id").all() as { tool: string; meta: string }[];
  expect(JSON.parse(rows[0].meta).file).toBe("src/a.ts");
  expect(JSON.parse(rows[1].meta).skill).toBe("x");
  closeDb(db);
});
it("run never throws on a malformed input", () => {
  expect(() => run("garbage", process.env)).not.toThrow();
});
```

(Add equivalent in-process tests for `session-start` worktree/ticket extraction, `stop` close + report best-effort, `notify` active alert. Keep the existing subprocess smoke tests.)

- [ ] **Step 2: Refactor each hook** — extract the body into `export function run(input, env)`; the CLI guard does stdin-read + JSON parse (its own try/catch) then `run(parsed, process.env)`, all wrapped so any throw still `process.exit(0)`. `run` itself must not throw (its DB/IO in try/catch); fail-open preserved.

- [ ] **Step 3: Run + commit**

Run: `npm test && npm run typecheck` → green; `npm run coverage` shows hooks > 0%.
```bash
git add hooks/*.ts hooks/*.test.ts
git commit -m "test(hooks): in-process run() cores covering meta branches"
```

---

### Task 4: Fill remaining lib/script branch gaps

**Files:**
- Modify: `lib/improve.test.ts` (cold_read + retry_storm proposal branches)
- Modify: `lib/roi.test.ts` (friction-gone delta > 0; roiSummary ordering)
- Modify: `lib/redact.test.ts` (glrt, Jira ATATT, JWT, hex≥32, env-var variants, non-string)
- Modify: `lib/patterns.test.ts` (window boundary excludes old entries; threshold-minus-one not reported)
- Modify: `scripts/improve.test.ts` (a `runImprove` test on a seeded DB)

- [ ] **Step 1: Write the tests** (representative)

```ts
// lib/improve.test.ts
it("proposeActions maps a cold read to split-or-summarize and a retry storm to investigate-file", () => {
  for (let i = 0; i < 4; i++) writeEvent(db, { sessionId: "s1", tool: "Read", success: true, meta: { file: "src/big.ts" } });
  for (let i = 0; i < 4; i++) writeEvent(db, { sessionId: "s1", tool: "Edit", success: true, meta: { file: "src/edit.ts" } });
  const acts = proposeActions(db, "p", 24);
  expect(acts.find((a) => a.target === "src/big.ts")?.kind).toBe("split-or-summarize");
  expect(acts.find((a) => a.target === "src/edit.ts")?.kind).toBe("investigate-file");
});

// lib/roi.test.ts — friction genuinely gone (separate DB with no recurring events at measure time)
// scripts/improve.test.ts — runImprove persists + renders a digest from a seeded DB
// lib/redact.test.ts — it.each over [glrt-..., ATATT..., eyJ..., <40-hex>, "API_KEY=secret"] asserting redaction
// lib/patterns.test.ts — events with an old ts (insert with an explicit past ts) excluded by a 1-hour window
```

- [ ] **Step 2: Implement the tests.** If a test reveals a REAL production bug, report BLOCKED with the failure (do not silently patch unrelated code).

- [ ] **Step 3: Run + commit**

Run: `npm test && npm run typecheck` → green.
```bash
git add lib/improve.test.ts lib/roi.test.ts lib/redact.test.ts lib/patterns.test.ts scripts/improve.test.ts
git commit -m "test: cover proposal branches, ROI, redaction patterns, windows"
```

---

## Self-Review

- **Coverage targets**: eval (Task 1), statusline 19% (Task 2), hooks 0%-artifact (Task 3), improve/roi/redact/patterns branches (Task 4).
- **No-network invariant**: prompt contract is deterministic (Task 1, normal suite); the real-model scenarios stay in `eval/` (opt-in).
- **Fail-open preserved**: Task 3 keeps each hook's CLI guard + a non-throwing `run`.
- **Placeholders**: real test code throughout; injectable roots/params named.
