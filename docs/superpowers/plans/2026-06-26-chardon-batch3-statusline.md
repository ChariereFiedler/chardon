# Chardon — Batch 3 "Status line" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A generic live status line for Claude Code: project · branch · model+context · active subagents · worktrees · token budget, with optional GitLab.

**Architecture:** A pure `renderStatusline(data)` builds the single ANSI line; separate collector functions gather each part (deterministic ones are unit-tested, I/O-heavy ones stay thin). The entry script assembles `StatuslineData` and prints. Ported from granit's `agents-status.ts`, with the three hardcoded couplings removed.

**Tech Stack:** TypeScript, Vitest, Node builtins.

## Global Constraints

- **English only** (code, comments, strings, tests, commits). See `CLAUDE.md`.
- **Genericity**: NEVER hardcode `granit-golem-wt-`, GitLab id `<project-id>`, or a project path. Derive the worktree match pattern from `basename(CLAUDE_PROJECT_DIR)`; GitLab is OFF unless `config.gitlab.enabled`.
- **DROP** the Cycle-daemon section entirely (granit-only).
- **Testability**: `renderStatusline` is PURE (data → string). Collectors that read time/DB take injected inputs where reasonable; the token-budget collector uses `CHARDON_DB`.
- Parameterized SQL; `node:sqlite` via `createRequire`; no magic numbers.
- Commits `type(scope): description` ≤ 72 chars; no Claude/AI/LLM mention.

**Source to port** (read-only): `~/lab/granit-golem/scripts/dev/agents-status.ts`. Reuse its transcript-context parsing and subagent scan; remove the GitLab-id hardcode, the `pgrep … 'granit-golem-wt-'` hardcode, and the Cycle section.

---

### Task 1: `scripts/statusline.ts` — pure render

**Files:**
- Create: `scripts/statusline.ts`
- Test: `scripts/statusline.test.ts`

**Interfaces:**
- Produces:
  - `interface StatuslineData { project: string; branch: string; model?: string; ctxUsed?: number; ctxMax?: number; subagents: number; worktrees: number; tokensToday?: number; tokenBudget?: number; gitlab?: { mrs: number; issues: number } }`
  - `renderStatusline(d: StatuslineData): string` — single line, ` · `-separated. Sections: `<project>`, `<branch>`, `🧠 <model> <ctxUsed>/<ctxMax>` (only if model+ctx present), `🤖 <subagents>` (only if > 0), `🌳 <worktrees>` (only if > 0), `💰 <tokensToday>/<tokenBudget>` (only if `tokenBudget > 0`), `📥 <mrs>📋 <issues>` (only if `gitlab` present). Omitted sections never render their separator.

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from "vitest";
import { renderStatusline } from "./statusline.js";

describe("renderStatusline", () => {
  it("renders the core sections", () => {
    const s = renderStatusline({ project: "chardon", branch: "main", model: "opus", ctxUsed: 40, ctxMax: 200, subagents: 2, worktrees: 1 });
    expect(s).toContain("chardon");
    expect(s).toContain("main");
    expect(s).toContain("opus");
    expect(s).toContain("40/200");
    expect(s).toContain("🤖 2");
    expect(s).toContain("🌳 1");
  });

  it("omits optional sections when empty/zero", () => {
    const s = renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0 });
    expect(s).not.toContain("🤖");
    expect(s).not.toContain("🌳");
    expect(s).not.toContain("💰");
    expect(s).not.toContain("📥");
    expect(s.startsWith("p · b")).toBe(true);
  });

  it("shows the token budget only when a budget is set", () => {
    expect(renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0, tokensToday: 120000, tokenBudget: 500000 })).toContain("💰 120000/500000");
    expect(renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0, tokensToday: 120000, tokenBudget: 0 })).not.toContain("💰");
  });

  it("shows GitLab only when provided", () => {
    expect(renderStatusline({ project: "p", branch: "b", subagents: 0, worktrees: 0, gitlab: { mrs: 3, issues: 7 } })).toContain("📥 3");
  });
});
```

- [ ] **Step 2: Run → fail** (`cd ~/lab/chardon && npx vitest run scripts/statusline.test.ts`).

- [ ] **Step 3: Implement `renderStatusline`** (pure)

Build an array of section strings, push each section only when its data is present/non-zero, then `join(" · ")`. Emoji prefixes as in the interface. No I/O, no `new Date()`.

- [ ] **Step 4: Run → success** — PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/statusline.ts scripts/statusline.test.ts
git commit -m "feat(scripts): pure status-line renderer"
```

---

### Task 2: status-line collectors + entry

**Files:**
- Modify: `scripts/statusline.ts` (add collectors + a `main()` entry)
- Test: `scripts/statusline.test.ts` (add collector tests for the deterministic ones)
- Modify: `.claude-plugin/plugin.json` (declare the `statusLine` command)

**Interfaces:**
- Consumes: `renderStatusline` (Task 1), `dbPath`/`openDb` + `loadConfig`/`repoSlug` (lib), token_usage table.
- Produces:
  - `projectName(projectDir): string` — `package.json#name` if present, else `basename(projectDir)`.
  - `countWorktrees(projectDir): number` — number of sibling dirs matching `<basename>-wt-*` (pattern derived from the project, NOT `granit-golem-wt-`).
  - `tokensToday(db, origin, today): number` — sum of input+output token_usage for today/origin (parameterized SQL).
  - `countSubagents(): number` — count of recent `/tmp/claude-*/.../tasks/*.output` files (generic Claude Code scan), best-effort.
  - `main(): void` — assembles `StatuslineData` and prints `renderStatusline(...)`. GitLab section only if `config.gitlab.enabled` (best-effort; failure → omit, never throw).

- [ ] **Step 1: Add collector tests (deterministic ones)**

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { projectName, countWorktrees, tokensToday } from "./statusline.js";
import { openDb, closeDb } from "../lib/db.js";

it("projectName prefers package.json name", () => {
  const d = mkdtempSync(join(tmpdir(), "p-"));
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "my-pkg" }));
  expect(projectName(d)).toBe("my-pkg");
});

it("countWorktrees counts sibling <base>-wt-* dirs", () => {
  const parent = mkdtempSync(join(tmpdir(), "ws-"));
  const proj = join(parent, "proj"); mkdirSync(proj);
  mkdirSync(join(parent, "proj-wt-1")); mkdirSync(join(parent, "proj-wt-2"));
  mkdirSync(join(parent, "other"));
  expect(countWorktrees(proj)).toBe(2);
});

it("tokensToday sums today's usage for the origin", () => {
  process.env.CHARDON_DB = join(mkdtempSync(join(tmpdir(), "c-")), "t.db");
  const db = openDb();
  db.prepare("INSERT INTO token_usage (date, origin, input_tokens, output_tokens) VALUES ('2026-06-26','main',100,50)").run();
  expect(tokensToday(db, "main", "2026-06-26")).toBe(150);
  closeDb(db);
});
```

- [ ] **Step 2: Run → fail** (`npx vitest run scripts/statusline.test.ts`).

- [ ] **Step 3: Implement collectors + `main()`**

Port the granit transcript-context parser (model + ctx tokens from the last `usage` block of the project's transcript) and the subagent scan (count files under `/tmp/claude-*/.../tasks/*.output` modified recently). Implement `projectName`, `countWorktrees` (read the project's parent dir, match `^<base>-wt-` where `<base> = basename(projectDir)`), and `tokensToday` (parameterized sum). `main()` reads `CLAUDE_PROJECT_DIR`, builds `StatuslineData`, and prints the line; every collector is best-effort (try/catch → sensible default); GitLab only when `config.gitlab.enabled` (skip otherwise). Register in `.claude-plugin/plugin.json`:
```json
"statusLine": { "type": "command", "command": "npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/statusline.ts", "refreshInterval": 30 }
```

- [ ] **Step 4: Run → success** — PASS. Then full suite + typecheck.

- [ ] **Step 5: Full suite + commit**

Run: `npm test && npm run typecheck` → all green.
```bash
git add scripts/statusline.ts scripts/statusline.test.ts .claude-plugin/plugin.json
git commit -m "feat(scripts): status-line collectors + plugin wiring"
```

---

## Self-Review

- **Spec coverage (Batch 3)**: generic status line → Tasks 1+2; 3 hardcodes removed (project id via gitlab.enabled gate, worktree pattern derived, Cycle dropped) → Task 2; token budget live → Tasks 1+2.
- **Placeholders**: collectors reference the real granit source + concrete decoupling; render tests are real code.
- **Type consistency**: `StatuslineData` (Task 1) consumed by `main()` (Task 2); `tokensToday`/`countWorktrees`/`projectName` signatures fixed; `CHARDON_DB` reused for the budget collector.
