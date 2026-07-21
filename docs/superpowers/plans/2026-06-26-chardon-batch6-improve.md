# Chardon — Batch 6 "Improvement loop" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the loop — turn detected frictions into prioritized, tracked **actions**, measure whether applying them actually reduced the friction (ROI), and surface it all via `/chardon-improve`.

**Architecture:** `lib/improve.ts` proposes actions from the friction data and persists them in the `actions` table (with a baseline). `lib/roi.ts` drives the action lifecycle (`proposed → applied → measured`) and computes the before/after delta. A `scripts/improve.ts` CLI renders the prioritized digest, exposed as `/chardon-improve`.

**Tech Stack:** TypeScript, `node:sqlite`, Vitest. Builtins only.

## Global Constraints

- **English only** (code, comments, strings, tests, docs, commits). See `CLAUDE.md`.
- Generic (zero granit coupling); parameterized SQL; `node:sqlite` via `lib/db`; injected `now`; pure renderers separate from I/O.
- No magic numbers (severity thresholds are named constants). Commits `type(scope): description` ≤ 72 chars; no Claude/AI/LLM mention.
- Uses the existing `actions` table (`id, proposed_at, repo, kind, target, pattern_type, baseline, status, applied_at, after_metric`).

---

### Task 1: `lib/improve.ts` — propose & persist actions

**Files:**
- Create: `lib/improve.ts`
- Test: `lib/improve.test.ts`

**Interfaces:**
- Consumes: `detectToilLoops`/`detectColdReads`/`detectRetryStorms` (`lib/patterns`), `openDb` (`lib/db`).
- Produces:
  - `type Severity = "high" | "medium" | "low"`
  - `interface ProposedAction { kind: string; target: string; patternType: string; baseline: number; severity: Severity }`
  - `severityFor(count: number): Severity` — `high` ≥ `SEV_HIGH` (8), `medium` ≥ `SEV_MEDIUM` (4), else `low` (named constants).
  - `proposeActions(db, repo, hoursBack): ProposedAction[]` — maps frictions to actions: toil_loop → `kind: "automate-command"` (target = cmd), cold_read → `kind: "split-or-summarize"` (target = file), retry_storm → `kind: "investigate-file"` (target = file); `baseline` = the friction count.
  - `persistActions(db, repo, actions): number` — inserts each as `status: "proposed"`, skipping any that already have an open (`proposed`/`applied`) row with the same `(repo, kind, target)`; returns the number inserted.
  - `openActions(db, repo): { id: number; kind: string; target: string; patternType: string; baseline: number; status: string }[]`.

- [ ] **Step 1: Write the tests** (seeded DB)

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "./db.js";
import { severityFor, proposeActions, persistActions, openActions } from "./improve.js";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
  writeSession(db, { id: "s1", repo: "p", sessionType: "main" });
  for (let i = 0; i < 9; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
});
afterEach(() => closeDb(db));

describe("improve", () => {
  it("severityFor maps counts to bands", () => {
    expect(severityFor(9)).toBe("high");
    expect(severityFor(5)).toBe("medium");
    expect(severityFor(2)).toBe("low");
  });

  it("proposeActions turns a toil loop into an automate-command action", () => {
    const a = proposeActions(db, "p", 24).find((x) => x.target === "npm run build");
    expect(a?.kind).toBe("automate-command");
    expect(a?.baseline).toBe(9);
    expect(a?.severity).toBe("high");
  });

  it("persistActions inserts once and dedupes on re-run", () => {
    const acts = proposeActions(db, "p", 24);
    expect(persistActions(db, "p", acts)).toBeGreaterThan(0);
    expect(persistActions(db, "p", acts)).toBe(0); // already open
    expect(openActions(db, "p").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run → fail** (`cd ~/lab/chardon && npx vitest run lib/improve.test.ts`).

- [ ] **Step 3: Implement `lib/improve.ts`** — per the interfaces. Parameterized SQL for the dedupe check and inserts; named severity constants.

- [ ] **Step 4: Run → success** (`npx vitest run lib/improve.test.ts`) — PASS (3 tests). `npx tsc --noEmit` exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/improve.ts lib/improve.test.ts
git commit -m "feat(lib): propose and persist improvement actions"
```

---

### Task 2: `lib/roi.ts` — action lifecycle & ROI

**Files:**
- Create: `lib/roi.ts`
- Test: `lib/roi.test.ts`

**Interfaces:**
- Consumes: `openDb` (`lib/db`), `proposeActions` (`lib/improve`, to recompute the current friction for an action's target).
- Produces:
  - `applyAction(db, id: number, appliedAt: string): void` — sets `status: "applied"`, `applied_at`.
  - `measureAction(db, id: number, hoursBack: number): { baseline: number; after: number; delta: number } | null` — recomputes the current friction count for the action's `(repo, kind, target)`, writes `after_metric`, sets `status: "measured"`, returns the before/after/delta; null if the action does not exist.
  - `roiSummary(db, repo): { kind: string; target: string; baseline: number; after: number; delta: number }[]` — for all `measured` actions of the repo.

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "./db.js";
import { proposeActions, persistActions, openActions } from "./improve.js";
import { applyAction, measureAction, roiSummary } from "./roi.js";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
  writeSession(db, { id: "s1", repo: "p", sessionType: "main" });
  for (let i = 0; i < 9; i++) writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
  persistActions(db, "p", proposeActions(db, "p", 24));
});
afterEach(() => closeDb(db));

describe("roi", () => {
  it("applies then measures an action and computes the delta", () => {
    const id = openActions(db, "p")[0].id;
    applyAction(db, id, "2026-06-26T10:00:00Z");
    const r = measureAction(db, id, 24);
    expect(r).not.toBeNull();
    expect(r!.baseline).toBe(9);
    expect(r!.after).toBe(9);     // same window in the test → no change
    expect(r!.delta).toBe(0);
    expect(roiSummary(db, "p").length).toBe(1);
  });

  it("returns null when measuring an unknown action", () => {
    expect(measureAction(db, 9999, 24)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail** (`npx vitest run lib/roi.test.ts`).

- [ ] **Step 3: Implement `lib/roi.ts`** — recompute the current friction by reusing `proposeActions(db, repo, hoursBack)` and finding the matching `(kind, target)`; if absent, treat current as 0. Parameterized SQL for the updates.

- [ ] **Step 4: Run → success** (`npx vitest run lib/roi.test.ts`) — PASS (2 tests). `npx tsc --noEmit` exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/roi.ts lib/roi.test.ts
git commit -m "feat(lib): action lifecycle + closed-loop ROI measurement"
```

---

### Task 3: `scripts/improve.ts` digest + `/chardon-improve`

**Files:**
- Create: `scripts/improve.ts`
- Test: `scripts/improve.test.ts`
- Create: `commands/chardon-improve.md`

**Interfaces:**
- Consumes: `proposeActions`/`persistActions`/`openActions` (improve), `roiSummary` (roi), `loadConfig`/`repoSlug`/`openDb` (lib).
- Produces:
  - `renderImproveDigest(d: { proposals: ProposedAction[]; open: { kind: string; target: string; status: string }[]; roi: { kind: string; target: string; delta: number }[] }): string` — **pure**; a prioritized digest with severity icons (🔴 high / 🟡 medium / ⚪ low), an "Open actions" list, and a "Measured ROI" section (`delta` shown as friction reduced).
  - `runImprove(opts: { projectDir: string; hoursBack: number }): { digest: string }` — persists fresh proposals, then renders the digest.
  - guarded CLI entry printing the digest.

- [ ] **Step 1: Write the test (pure render)**

```ts
import { describe, it, expect } from "vitest";
import { renderImproveDigest } from "./improve.js";

describe("renderImproveDigest", () => {
  it("renders proposals with severity icons and the ROI section", () => {
    const md = renderImproveDigest({
      proposals: [{ kind: "automate-command", target: "npm run build", patternType: "toil_loop", baseline: 9, severity: "high" }],
      open: [{ kind: "split-or-summarize", target: "src/big.ts", status: "applied" }],
      roi: [{ kind: "automate-command", target: "npm run build", delta: 5 }],
    });
    expect(md).toContain("🔴");
    expect(md).toContain("npm run build");
    expect(md).toContain("src/big.ts");
    expect(md).toMatch(/roi/i);
    expect(md).toContain("5");
  });

  it("handles an empty digest without crashing", () => {
    expect(renderImproveDigest({ proposals: [], open: [], roi: [] })).toMatch(/no/i);
  });
});
```

- [ ] **Step 2: Run → fail** (`npx vitest run scripts/improve.test.ts`).

- [ ] **Step 3: Implement** — `renderImproveDigest` pure; `runImprove` opens DB, `persistActions(proposeActions(...))`, reads `openActions` + `roiSummary`, renders. Guarded CLI entry. Severity → icon map is a named constant.

- [ ] **Step 4: Write `commands/chardon-improve.md`**

```markdown
---
description: Show prioritized workflow improvements and their measured ROI.
---

Show the Chardon improvement digest for the current project, then act on it.

1. Run: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/improve.ts`
2. Read the prioritized proposals (🔴 high / 🟡 medium / ⚪ low) and the measured ROI.
3. Pick the top 🔴 item, propose a concrete change to address it, and — once applied —
   note that a later run will measure whether the friction actually dropped.
```

- [ ] **Step 5: Run → success + full suite** (`npx vitest run scripts/improve.test.ts` then `npm test && npm run typecheck`) — all green.

- [ ] **Step 6: Commit**

```bash
git add scripts/improve.ts scripts/improve.test.ts commands/chardon-improve.md
git commit -m "feat(scripts): /chardon-improve digest (proposals + ROI)"
```

---

## Self-Review

- **Spec coverage (Batch 6)**: `actions` table fed → Task 1 (`persistActions`); closed-loop ROI → Task 2; `/chardon-improve` generic (DB only, no Cycle) → Task 3; severity prioritization 🔴🟡⚪ → Tasks 1+3.
- **Deferred (documented as v1.1)**: `ticket_metrics` population and the cross-project "Ronce Racine candidate" signal — out of this batch; note them in the README roadmap.
- **Placeholders**: real test code; concrete interfaces and command file.
- **Type consistency**: `ProposedAction`/`Severity` (Task 1) consumed by Tasks 2-3; `actions` columns match the schema; `proposeActions` reused by `roi` to recompute current friction.
