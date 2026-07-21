# Chardon Batch A — Dormant-signal proposals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn three already-collected-but-unexploited signals — repeated failing Bash commands, slow Bash commands, and frictions a known skill would address — into new proposals in the improvement loop.

**Architecture:** Add three standalone detectors to `lib/patterns.ts` mirroring the existing `detect*` SQL shape, then map each to a new `kind` inside `proposeActions` in `lib/improve.ts`. The `/chardon-improve` digest (`scripts/improve.ts`) already renders any `kind` generically, so the new proposals surface with no render change. No new config, no schema change: thresholds are module constants (consistent with the existing `TOIL_MIN`/`RETRY_MIN`/`COLD_MIN`), and the friction→skill map is a module constant in `lib/improve.ts`.

**Tech Stack:** TypeScript run via `node --experimental-strip-types` (Node ≥ 22), `node:sqlite` via `createRequire`, Vitest.

## Global Constraints

- Node **≥ 22**; run TS with `node --experimental-strip-types`. No new npm dependency. (verbatim: `"node": ">=22"`)
- **Parameterized SQL only** — bind `?`, never interpolate.
- **`node:sqlite` via `createRequire`** — never `import` it (already handled by `lib/db.ts`).
- **English everywhere**; comments only when they add context; no magic numbers (use named constants).
- Read DB path from `CHARDON_DB`; inject the clock; never open the real `~/.claude/chardon.db` in a test.
- Schema is additive/idempotent — **no schema change in this batch**.
- Commits: `type(scope): description` ≤ 72 chars; never mention Claude/AI/LLM.

---

## File Structure

- `lib/patterns.ts` — add `detectFailingCommands`, `detectSlowCommands`, `detectSkillUsage`; add constants `FAIL_MIN`, `SLOW_MIN`, `SLOW_MS`; add interfaces `FailingCommand`, `SlowCommand`.
- `lib/patterns.test.ts` — unit tests for the three detectors.
- `lib/improve.ts` — add `FRICTION_SKILL_MAP`; extend `proposeActions` with `fix-failing-command`, `speed-up-command`, `consider-skill`.
- `lib/improve.test.ts` — unit tests asserting `proposeActions` emits the new kinds. (Create if absent.)
- No change to `scripts/improve.ts` (generic render), `lib/roi.ts` (re-measures by `kind`+`target`), or `lib/schema.sql`.

## Interfaces produced by this batch

```ts
// lib/patterns.ts
export const FAIL_MIN = 3;
export const SLOW_MIN = 3;
export const SLOW_MS = 30_000;
export interface FailingCommand { cmd: string; count: number; }
export interface SlowCommand { cmd: string; count: number; avgMs: number; }
export function detectFailingCommands(db: ChardonDb, repo: string, hoursBack: number): FailingCommand[];
export function detectSlowCommands(db: ChardonDb, repo: string, hoursBack: number): SlowCommand[];
export function detectSkillUsage(db: ChardonDb, repo: string, hoursBack: number): Set<string>;
// lib/improve.ts — new kinds emitted by proposeActions:
//   "fix-failing-command" (failure_cluster), "speed-up-command" (slow_command),
//   "consider-skill" (uncovered_friction)
```

---

### Task 1: Failing-command detector

**Files:**
- Modify: `lib/patterns.ts`
- Test: `lib/patterns.test.ts`

**Interfaces:**
- Consumes: `ChardonDb` (from `./db.ts`), `writeEvent`/`writeSession`/`openDb` in tests.
- Produces: `FAIL_MIN`, `FailingCommand`, `detectFailingCommands`.

- [ ] **Step 1: Write the failing test**

Add to `lib/patterns.test.ts` (import `detectFailingCommands`, `FAIL_MIN` from `./patterns.ts`):

```ts
it("detectFailingCommands clusters a Bash command failing >= FAIL_MIN times", () => {
  for (let i = 0; i < FAIL_MIN; i++)
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run build" } });
  // A successful run of the same command must not count.
  writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run build" } });
  const fails = detectFailingCommands(db, "p", 24);
  expect(fails).toEqual([{ cmd: "npm run build", count: FAIL_MIN }]);
});

it("detectFailingCommands ignores commands below FAIL_MIN failures", () => {
  for (let i = 0; i < FAIL_MIN - 1; i++)
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm test" } });
  expect(detectFailingCommands(db, "p", 24)).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/patterns.test.ts -t "detectFailingCommands"`
Expected: FAIL — `detectFailingCommands is not a function` / import error.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/patterns.ts` (near the other threshold constants and detectors):

```ts
/** Minimum count of the same failing Bash command to flag a failure cluster. */
export const FAIL_MIN = 3;

export interface FailingCommand {
  cmd: string;
  count: number;
}

/**
 * Detects the same Bash command failing (`success = 0`) at least `FAIL_MIN`
 * times within the window. Distinct from a toil loop, which ignores success.
 */
export function detectFailingCommands(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
): FailingCommand[] {
  return db
    .prepare(
      `SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.success = 0
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`,
    )
    .all(repo, `-${hoursBack}`, FAIL_MIN) as unknown as FailingCommand[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/patterns.test.ts -t "detectFailingCommands"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/patterns.ts lib/patterns.test.ts
git commit -m "feat(patterns): detect recurring failing Bash commands"
```

---

### Task 2: Map failing clusters to a proposal

**Files:**
- Modify: `lib/improve.ts`
- Test: `lib/improve.test.ts` (create if absent)

**Interfaces:**
- Consumes: `detectFailingCommands` (Task 1), `severityFor`, `ProposedAction`.
- Produces: `proposeActions` now emits `kind: "fix-failing-command"`, `patternType: "failure_cluster"`.

- [ ] **Step 1: Write the failing test**

Create/extend `lib/improve.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, closeDb, writeSession, writeEvent } from "./db.ts";
import { proposeActions } from "./improve.ts";
import { FAIL_MIN } from "./patterns.ts";

let db: ReturnType<typeof openDb>;
beforeEach(() => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "chardon-")), "t.db");
  db = openDb();
  writeSession(db, { id: "s1", repo: "p", sessionType: "main" });
});
afterEach(() => closeDb(db));

it("proposeActions proposes fix-failing-command for a failing cluster", () => {
  for (let i = 0; i < FAIL_MIN; i++)
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run build" } });
  const a = proposeActions(db, "p", 24).find((x) => x.kind === "fix-failing-command");
  expect(a).toMatchObject({ target: "npm run build", patternType: "failure_cluster", baseline: FAIL_MIN });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/improve.test.ts -t "fix-failing-command"`
Expected: FAIL — no action with that kind.

- [ ] **Step 3: Write minimal implementation**

In `lib/improve.ts`, import the detector and add a loop inside `proposeActions` (after the existing three loops):

```ts
// add to the existing import from "./patterns.ts"
import {
  detectToilLoops,
  detectColdReads,
  detectRetryStorms,
  detectFailingCommands,
} from "./patterns.ts";
```

```ts
  for (const fail of detectFailingCommands(db, repo, hoursBack)) {
    actions.push({
      kind: "fix-failing-command",
      target: fail.cmd,
      patternType: "failure_cluster",
      baseline: fail.count,
      severity: severityFor(fail.count),
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/improve.test.ts -t "fix-failing-command"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/improve.ts lib/improve.test.ts
git commit -m "feat(improve): propose fix-failing-command from failure clusters"
```

---

### Task 3: Slow-command detector

**Files:**
- Modify: `lib/patterns.ts`
- Test: `lib/patterns.test.ts`

**Interfaces:**
- Consumes: `ChardonDb`; `writeEvent` accepts `durationMs` (already supported by `lib/db.ts`, used by `hooks/post-tool-use.ts`).
- Produces: `SLOW_MIN`, `SLOW_MS`, `SlowCommand`, `detectSlowCommands`.

- [ ] **Step 1: Write the failing test**

Add to `lib/patterns.test.ts` (import `detectSlowCommands`, `SLOW_MIN`, `SLOW_MS`):

```ts
it("detectSlowCommands flags a command run >= SLOW_MIN times averaging >= SLOW_MS", () => {
  for (let i = 0; i < SLOW_MIN; i++)
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, durationMs: SLOW_MS + 5_000, meta: { cmd: "npm test" } });
  const slow = detectSlowCommands(db, "p", 24);
  expect(slow).toEqual([{ cmd: "npm test", count: SLOW_MIN, avgMs: SLOW_MS + 5_000 }]);
});

it("detectSlowCommands ignores fast commands even when frequent", () => {
  for (let i = 0; i < SLOW_MIN + 2; i++)
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, durationMs: 500, meta: { cmd: "ls" } });
  expect(detectSlowCommands(db, "p", 24)).toHaveLength(0);
});

it("detectSlowCommands ignores commands with no duration recorded", () => {
  for (let i = 0; i < SLOW_MIN; i++)
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, meta: { cmd: "npm run x" } });
  expect(detectSlowCommands(db, "p", 24)).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/patterns.test.ts -t "detectSlowCommands"`
Expected: FAIL — not a function.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/patterns.ts`:

```ts
/** Minimum number of runs of the same command to consider it a slow drain. */
export const SLOW_MIN = 3;
/** Average duration (ms) at/above which a repeated command is "slow". */
export const SLOW_MS = 30_000;

export interface SlowCommand {
  cmd: string;
  count: number;
  avgMs: number;
}

/**
 * Detects the same Bash command run at least `SLOW_MIN` times with an average
 * duration >= `SLOW_MS`. Rows without `duration_ms` are ignored, so this yields
 * nothing until Claude Code reports command durations.
 */
export function detectSlowCommands(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
): SlowCommand[] {
  return db
    .prepare(
      `SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count,
              AVG(e.duration_ms) AS avgMs
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.duration_ms IS NOT NULL
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ? AND avgMs >= ?
       ORDER BY avgMs DESC
       LIMIT 20`,
    )
    .all(repo, `-${hoursBack}`, SLOW_MIN, SLOW_MS) as unknown as SlowCommand[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/patterns.test.ts -t "detectSlowCommands"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/patterns.ts lib/patterns.test.ts
git commit -m "feat(patterns): detect recurring slow Bash commands"
```

---

### Task 4: Map slow commands to a proposal

**Files:**
- Modify: `lib/improve.ts`
- Test: `lib/improve.test.ts`

**Interfaces:**
- Consumes: `detectSlowCommands` (Task 3).
- Produces: `proposeActions` emits `kind: "speed-up-command"`, `patternType: "slow_command"` (baseline = run count).

- [ ] **Step 1: Write the failing test**

Add to `lib/improve.test.ts` (import `SLOW_MIN`, `SLOW_MS` from `./patterns.ts`):

```ts
it("proposeActions proposes speed-up-command for a slow command", () => {
  for (let i = 0; i < SLOW_MIN; i++)
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: true, durationMs: SLOW_MS + 1_000, meta: { cmd: "npm test" } });
  const a = proposeActions(db, "p", 24).find((x) => x.kind === "speed-up-command");
  expect(a).toMatchObject({ target: "npm test", patternType: "slow_command", baseline: SLOW_MIN });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/improve.test.ts -t "speed-up-command"`
Expected: FAIL — no such action.

- [ ] **Step 3: Write minimal implementation**

In `lib/improve.ts` add `detectSlowCommands` to the `./patterns.ts` import, and add after the failing-command loop:

```ts
  for (const slow of detectSlowCommands(db, repo, hoursBack)) {
    actions.push({
      kind: "speed-up-command",
      target: slow.cmd,
      patternType: "slow_command",
      baseline: slow.count,
      severity: severityFor(slow.count),
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/improve.test.ts -t "speed-up-command"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/improve.ts lib/improve.test.ts
git commit -m "feat(improve): propose speed-up-command from slow commands"
```

---

### Task 5: Skill-adoption gap → consider-skill

**Files:**
- Modify: `lib/patterns.ts` (add `detectSkillUsage`), `lib/improve.ts` (add `FRICTION_SKILL_MAP` + loop)
- Test: `lib/patterns.test.ts`, `lib/improve.test.ts`

**Interfaces:**
- Consumes: friction actions already built in `proposeActions`; `detectSkillUsage` returns the set of skill names invoked in the window.
- Produces: `detectSkillUsage`; `proposeActions` emits `kind: "consider-skill"`, `patternType: "uncovered_friction"`, `target` = recommended skill name.

- [ ] **Step 1: Write the failing tests**

Add to `lib/patterns.test.ts` (import `detectSkillUsage`):

```ts
it("detectSkillUsage returns the set of skills invoked in the window", () => {
  writeEvent(db, { sessionId: "s1", tool: "Skill", success: true, meta: { skill: "systematic-debugging" } });
  const used = detectSkillUsage(db, "p", 24);
  expect(used.has("systematic-debugging")).toBe(true);
  expect(used.has("recurring-bug-root-cause")).toBe(false);
});
```

Add to `lib/improve.test.ts` (import `FAIL_MIN` already present):

```ts
it("proposeActions proposes consider-skill when a mapped friction ran without its skill", () => {
  for (let i = 0; i < FAIL_MIN; i++)
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run build" } });
  const a = proposeActions(db, "p", 24).find((x) => x.kind === "consider-skill");
  expect(a).toMatchObject({ target: "systematic-debugging", patternType: "uncovered_friction" });
});

it("proposeActions does NOT propose consider-skill when the skill was already used", () => {
  for (let i = 0; i < FAIL_MIN; i++)
    writeEvent(db, { sessionId: "s1", tool: "Bash", success: false, meta: { cmd: "npm run build" } });
  writeEvent(db, { sessionId: "s1", tool: "Skill", success: true, meta: { skill: "systematic-debugging" } });
  expect(proposeActions(db, "p", 24).find((x) => x.kind === "consider-skill")).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/patterns.test.ts lib/improve.test.ts -t "skill"`
Expected: FAIL — `detectSkillUsage` undefined / no `consider-skill` action.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/patterns.ts`:

```ts
/** Returns the set of skill names invoked (Skill tool) within the window. */
export function detectSkillUsage(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
): Set<string> {
  const rows = db
    .prepare(
      `SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`,
    )
    .all(repo, `-${hoursBack}`) as unknown as { skill: string }[];
  return new Set(rows.map((r) => r.skill));
}
```

In `lib/improve.ts`, add `detectSkillUsage` to the `./patterns.ts` import, add the map, and add a loop at the END of `proposeActions` (after all friction loops, before `return actions`):

```ts
/**
 * Maps a friction `patternType` to the skill that best addresses it.
 * A recurring mapped friction with no matching Skill event yields a
 * `consider-skill` proposal (deduped by skill name).
 */
const FRICTION_SKILL_MAP: Record<string, string> = {
  failure_cluster: "systematic-debugging",
  retry_storm: "recurring-bug-root-cause",
};
```

```ts
  const usedSkills = detectSkillUsage(db, repo, hoursBack);
  const suggested = new Set<string>();
  for (const action of actions) {
    const skill = FRICTION_SKILL_MAP[action.patternType];
    if (!skill || usedSkills.has(skill) || suggested.has(skill)) continue;
    suggested.add(skill);
    actions.push({
      kind: "consider-skill",
      target: skill,
      patternType: "uncovered_friction",
      baseline: action.baseline,
      severity: severityFor(action.baseline),
    });
  }
```

Note: iterate a snapshot so the pushed `consider-skill` actions are not re-scanned. Replace the `for (const action of actions)` header with `for (const action of [...actions])`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/patterns.test.ts lib/improve.test.ts -t "skill"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/patterns.ts lib/improve.ts lib/patterns.test.ts lib/improve.test.ts
git commit -m "feat(improve): propose consider-skill for uncovered frictions"
```

---

### Task 6: Full suite + live end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (existing 133 + new ones), typecheck clean.

- [ ] **Step 2: Live end-to-end from a clean plugin cache**

Reproduce install conditions (no `node_modules`) and assert the new proposals appear. Run:

```bash
SB=$(mktemp -d); CACHE=$SB/chardon; PROJ=$SB/proj
cp -a . "$CACHE"; rm -rf "$CACHE/node_modules" "$CACHE/.git"
mkdir -p "$PROJ" && (cd "$PROJ" && git init -q && git commit -q --allow-empty -m init && git checkout -q -b feat/1-x)
export CLAUDE_PLUGIN_ROOT="$CACHE" CLAUDE_PROJECT_DIR="$PROJ" CHARDON_DB="$SB/c.db"
emit() { printf '%s' "$1" | node --experimental-strip-types "$CACHE/hooks/$2"; }
emit '{"session_id":"E1","cwd":"'$PROJ'"}' session-start.ts
for i in 1 2 3; do emit '{"session_id":"E1","tool_name":"Bash","tool_input":{"command":"npm run build"},"tool_response":{"is_error":true}}' post-tool-use.ts; done
node --experimental-strip-types "$CACHE/scripts/improve.ts"
```

Expected: the digest lists `fix-failing-command → \`npm run build\`` and, because `failure_cluster` is mapped and no skill was used, `consider-skill → \`systematic-debugging\``.

- [ ] **Step 3: Commit (docs only, if any doc updated)**

If you surface the new frictions in `docs/architecture.md` or `README.md`, commit separately:

```bash
git add docs/architecture.md README.md
git commit -m "docs: document dormant-signal proposals (batch A)"
```

---

## Self-Review notes

- **Spec coverage:** failing-command (Task 1–2), slow-command (Task 3–4), skill-gap (Task 5) — the three Axis-A proposals. Budget/trend/self-tuning/cross-project are **out of scope** (Batches B–D).
- **No render change needed:** `renderImproveDigest` prints `kind`/`target`/`baseline` generically; `roi.ts` re-measures by `kind`+`target`, so ROI works for the new kinds unchanged.
- **duration_ms risk:** `detectSlowCommands` returns nothing until Claude Code reports durations; tests inject `durationMs` explicitly, so they are deterministic regardless.
- **Type consistency:** detector names, `FailingCommand`/`SlowCommand` shapes, and the three `kind` strings are identical across tasks.
