# Chardon — Batch 5 "Weekly LLM synthesis" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An optional weekly report that summarizes the week's frictions/tokens via the Claude API and proposes improvements, exposed as `/chardon-weekly`.

**Architecture:** Pure helpers (`buildWeeklyPrompt` aggregates a week of DB data into a prompt; `renderWeeklyReport` wraps the model output in Markdown) plus a thin `callModel` that lazily imports `@anthropic-ai/sdk` and is gated on `ANTHROPIC_API_KEY`. The orchestration reads the DB, calls the model, and writes the report. The LLM call is the only network part and is never exercised in unit tests.

**Tech Stack:** TypeScript, `node:sqlite`, Vitest, **`@anthropic-ai/sdk` (optional, lazy)**.

## Global Constraints

- **English only** (code, comments, strings, tests, docs, commits). See `CLAUDE.md`.
- **Model `claude-opus-4-8`** (the current default). NEVER downgrade the model.
- **Use the official SDK** `@anthropic-ai/sdk` via `client.messages.create({ model, max_tokens, messages })` — NEVER raw fetch. Lazy-import it (`await import("@anthropic-ai/sdk")`) so the core stays dependency-free; add it to `optionalDependencies`.
- **No network in unit tests**: `callModel` is mocked or skipped; only pure helpers are unit-tested. `ANTHROPIC_API_KEY` absent → `callModel` returns null and the feature degrades gracefully (no throw).
- Parameterized SQL; `node:sqlite` via `lib/db`; injected `now`; pure renderers separate from I/O.
- Generic (zero granit coupling); no magic numbers. Commits `type(scope): description` ≤ 72 chars; no Claude/AI/LLM mention in the commit message.

---

### Task 1: `lib/weekly.ts` — aggregation, prompt, and model call

**Files:**
- Create: `lib/weekly.ts`
- Test: `lib/weekly.test.ts`
- Modify: `package.json` (add `optionalDependencies: { "@anthropic-ai/sdk": "^0.x" }`)

**Interfaces:**
- Consumes: `openDb`/`closeDb` (`lib/db`), `repoSlug` (`lib/config`), `patterns`/`token_usage` tables.
- Produces:
  - `interface WeekSummary { repo: string; weekStart: string; weekEnd: string; toil: { cmd: string; count: number }[]; coldReads: { file: string; count: number }[]; tokens: { input: number; output: number; cacheRead: number } }`
  - `aggregateWeek(db, repo, now: Date): WeekSummary` — sums the last 7 days from `events`/`token_usage` (parameterized SQL; reuses `lib/patterns` detectors with a 168-hour window).
  - `buildWeeklyPrompt(s: WeekSummary): string` — **pure**; a deterministic prompt asking for a short synthesis + up to 3 concrete workflow improvements.
  - `callModel(prompt: string): Promise<string | null>` — returns the model's text, or **null** if `ANTHROPIC_API_KEY` is unset or `@anthropic-ai/sdk` is not installed (lazy import in a try/catch). Uses `model: "claude-opus-4-8"`, `max_tokens: 4096`.

- [ ] **Step 1: Write the tests** (pure prompt + graceful no-key)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildWeeklyPrompt, callModel } from "./weekly.js";

describe("weekly", () => {
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });

  it("buildWeeklyPrompt is deterministic and includes the data", () => {
    const p = buildWeeklyPrompt({
      repo: "proj", weekStart: "2026-06-20", weekEnd: "2026-06-26",
      toil: [{ cmd: "npm run build", count: 9 }],
      coldReads: [{ file: "src/big.ts", count: 6 }],
      tokens: { input: 1000, output: 800, cacheRead: 5000 },
    });
    expect(p).toContain("npm run build");
    expect(p).toContain("src/big.ts");
    expect(p).toContain("proj");
    expect(buildWeeklyPrompt({ repo: "p", weekStart: "a", weekEnd: "b", toil: [], coldReads: [], tokens: { input: 0, output: 0, cacheRead: 0 } }))
      .toBe(buildWeeklyPrompt({ repo: "p", weekStart: "a", weekEnd: "b", toil: [], coldReads: [], tokens: { input: 0, output: 0, cacheRead: 0 } }));
  });

  it("callModel returns null without an API key (no throw, no network)", async () => {
    expect(await callModel("hello")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail** (`cd ~/lab/chardon && npx vitest run lib/weekly.test.ts`).

- [ ] **Step 3: Implement `lib/weekly.ts`**

`aggregateWeek` runs parameterized queries over a 168-hour window (named constant `WEEK_HOURS = 168`). `buildWeeklyPrompt` builds a plain deterministic string (no clock, no I/O). `callModel`:
```ts
export async function callModel(prompt: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let Anthropic: typeof import("@anthropic-ai/sdk").default;
  try { ({ default: Anthropic } = await import("@anthropic-ai/sdk")); }
  catch { return null; } // SDK not installed — feature optional
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n") || null;
}
```
Add `@anthropic-ai/sdk` to `optionalDependencies` in `package.json` (do not add to `dependencies`).

- [ ] **Step 4: Run → success** (`npx vitest run lib/weekly.test.ts`) — PASS (2 tests). Then `npx tsc --noEmit` (if the SDK type import fails to resolve because it's not installed, change the `callModel` import typing to `any`/`unknown` so typecheck passes without the package present).

- [ ] **Step 5: Commit**

```bash
git add lib/weekly.ts lib/weekly.test.ts package.json
git commit -m "feat(lib): weekly aggregation + prompt + optional model call"
```

---

### Task 2: `scripts/analyze-weekly.ts` + `/chardon-weekly`

**Files:**
- Create: `scripts/analyze-weekly.ts`
- Test: `scripts/analyze-weekly.test.ts`
- Create: `commands/chardon-weekly.md`

**Interfaces:**
- Consumes: `aggregateWeek`/`buildWeeklyPrompt`/`callModel` (Task 1), `loadConfig`/`repoSlug` (lib), `openDb` (lib).
- Produces:
  - `renderWeeklyReport(weekEnd: string, summary: WeekSummary, synthesis: string | null): string` — **pure**; Markdown with the week's numbers and, if `synthesis` is non-null, an `## AI synthesis` section, else a `> Set ANTHROPIC_API_KEY to enable the weekly synthesis.` note.
  - `generateWeeklyReport(opts: { projectDir: string; now: Date }): Promise<{ path: string; markdown: string }>` — aggregates, calls the model (best-effort), renders, writes `<outDir>/weekly-YYYY-Www.md`.
  - CLI entry (guarded, like analyze-daily) printing the path.

- [ ] **Step 1: Write the test** (pure render, both branches)

```ts
import { describe, it, expect } from "vitest";
import { renderWeeklyReport } from "./analyze-weekly.js";

const summary = { repo: "p", weekStart: "2026-06-20", weekEnd: "2026-06-26", toil: [], coldReads: [], tokens: { input: 1, output: 2, cacheRead: 3 } };

describe("renderWeeklyReport", () => {
  it("includes the synthesis when present", () => {
    const md = renderWeeklyReport("2026-06-26", summary, "Reduce rebuilds by caching.");
    expect(md).toMatch(/synthesis/i);
    expect(md).toContain("Reduce rebuilds");
  });
  it("notes the missing key when synthesis is null", () => {
    expect(renderWeeklyReport("2026-06-26", summary, null)).toMatch(/ANTHROPIC_API_KEY/);
  });
});
```

- [ ] **Step 2: Run → fail** (`npx vitest run scripts/analyze-weekly.test.ts`).

- [ ] **Step 3: Implement**

`renderWeeklyReport` is pure (no I/O, no `new Date()`). `generateWeeklyReport` resolves `outDir` against `projectDir` (absolute-or-joined, like analyze-daily), computes the ISO week label `YYYY-Www` from `now`, and writes the file (mkdir recursive). The model call is best-effort: if `callModel` returns null, the report still generates with the missing-key note. CLI entry guarded by `import.meta.url === pathToFileURL(process.argv[1] ?? "").href`.

- [ ] **Step 4: Write `commands/chardon-weekly.md`**

```markdown
---
description: Generate this week's Chardon synthesis (LLM, optional).
---

Generate the weekly workflow synthesis for the current project, then summarize it.

1. Run: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/analyze-weekly.ts`
2. Open the Markdown report it printed.
3. If an AI synthesis is present, relay its top improvement suggestions; otherwise
   tell the user to set `ANTHROPIC_API_KEY` to enable the synthesis.
```

- [ ] **Step 5: Run → success + full suite** (`npx vitest run scripts/analyze-weekly.test.ts` then `npm test && npm run typecheck`) — all green.

- [ ] **Step 6: Commit**

```bash
git add scripts/analyze-weekly.ts scripts/analyze-weekly.test.ts commands/chardon-weekly.md
git commit -m "feat(scripts): weekly report + /chardon-weekly command"
```

---

## Self-Review

- **Spec coverage (Batch 5)**: weekly LLM synthesis → Tasks 1+2; `/chardon-weekly` → Task 2; optional/graceful without key or SDK → Task 1 (`callModel` null path) + Task 2 (render note).
- **Placeholders**: real test code; concrete `callModel` body and command file.
- **Type consistency**: `WeekSummary` (Task 1) consumed by Task 2; `callModel` returns `string | null`; model id `claude-opus-4-8` fixed; `optionalDependencies` keeps the core dependency-free.
