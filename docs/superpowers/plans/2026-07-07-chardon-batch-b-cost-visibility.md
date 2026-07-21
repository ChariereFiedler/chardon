# Chardon Batch B — Cost visibility Implementation Plan

**Goal:** Make token cost visible where it matters — warn in the status line when today's usage exceeds the configured budget, and show a week-over-week token trend in the weekly report.

**Scope decision:** The roadmap's axis B also listed token-based *proposals* (`reduce-token-spend`, `investigate-token-growth`) with ROI. Those are **deferred**: chardon's ROI loop (`lib/roi.ts` `measureAction`) re-measures a proposal by re-running `proposeActions(db, repo, hoursBack)`, which is friction-count based and has no access to the daily budget/config. Token proposals need a different baseline (token overage, not a count), a ratio-based severity, and a token-aware re-measure path — a design change worth its own batch. Batch B ships the two **visibility** wins that need none of that: pure render + one aggregation query each, zero proposal/ROI entanglement.

**Tech Stack:** TypeScript via `node --experimental-strip-types` (Node ≥22), `node:sqlite` via `createRequire`, Vitest.

## Global Constraints
- Parameterized SQL only. `node:sqlite` via `createRequire` (untouched). English; no magic numbers. Injected clock in logic (`now`), never `new Date()` in pure functions. Fail-open: the status line must never throw.

## Feature 1 — Status-line over-budget warning
- **File:** `scripts/statusline.ts` (`renderStatusline`), test `scripts/statusline.test.ts`.
- The budget section already renders `💰 {tokensToday}/{tokenBudget}` when `tokenBudget > 0`. Add a `⚠` marker when `tokensToday > tokenBudget`.
- Change: replace the section push with a conditional suffix.

```ts
  if (d.tokenBudget !== undefined && d.tokenBudget > 0) {
    const over = (d.tokensToday ?? 0) > d.tokenBudget ? " ⚠" : "";
    sections.push(`💰 ${d.tokensToday ?? 0}/${d.tokenBudget}${over}`);
  }
```

- Tests: over-budget data → line contains `⚠`; at/under budget → no `⚠`.

## Feature 2 — Week-over-week token trend
- **Files:** `lib/weekly.ts` (`aggregateWeek`, `WeekSummary`), `scripts/analyze-weekly.ts` (`renderWeeklyReport`), tests `lib/weekly.test.ts` + `scripts/analyze-weekly.test.ts`.
- Extend `WeekSummary` with `tokenTrend: { thisWeek: number; lastWeek: number; pct: number | null }` where `thisWeek`/`lastWeek` are `input+output` sums for the current 7-day window and the prior 7-day window (days 8–14), and `pct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null`.
- In `aggregateWeek`, add a second parameterized query for the prior window:
  `WHERE repo = ? AND date >= date('now', ? || ' hours') AND date < date('now', ? || ' hours')` with `-336` and `-168`.
- In `renderWeeklyReport`, under "## Token usage", add: `- Week-over-week: {thisWeek} vs {lastWeek} ({+pct%|−pct%|n/a})`.
- Keep `buildWeeklyPrompt` unchanged (out of scope; the LLM already gets token totals).

## Verification
- Unit: statusline render over/under budget; `aggregateWeek` trend with seeded prior/current-week `token_usage` rows (injected `now`); `renderWeeklyReport` includes the trend line (pure).
- Full suite `npm test` + `npm run typecheck` green.
- Live: seed two weeks of `token_usage`, run `analyze-weekly`, confirm the trend line; set a low `tokenBudgetPerDay` in `.chardon.json`, exceed it, confirm the status line shows `⚠`.
