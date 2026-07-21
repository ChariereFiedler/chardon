# Chardon — Batch 4 "Config & commands" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the daily report runnable as a CLI and expose it as a `/chardon-daily` slash command; harden config (deep-merge `gitlab`, validate `ticketRegex`).

**Architecture:** Add a `main()` CLI entry to `analyze-daily.ts`; add a `commands/chardon-daily.md` slash command that runs it. Fix `loadConfig` so a partial `gitlab` override deep-merges instead of replacing the whole object, and so an invalid `ticketRegex` falls back to the default.

**Tech Stack:** TypeScript, Vitest, Node builtins.

## Global Constraints

- **English only** (code, comments, strings, tests, docs, commits). See `CLAUDE.md`.
- Genericity, parameterized SQL, `node:sqlite` via `lib/db`, no magic numbers.
- `analyze-daily` `main()` resolves the project from `CLAUDE_PROJECT_DIR ?? process.cwd()`.
- Commits `type(scope): description` ≤ 72 chars; no Claude/AI/LLM mention.

---

### Task 1: harden `loadConfig` (deep gitlab merge + ticketRegex validation)

**Files:**
- Modify: `lib/config.ts`
- Modify: `lib/config.test.ts`

**Interfaces:**
- `loadConfig(projectDir): ChardonConfig` — unchanged signature. New behavior:
  - a partial `.chardon.json` `gitlab` override deep-merges onto the default `gitlab` (so `{ gitlab: { enabled: true } }` keeps the default `projectId`/`tokenEnv`);
  - if the merged `ticketRegex` is not a valid RegExp (constructing `new RegExp(value)` throws), fall back to the default `ticketRegex` (never propagate a broken regex).

- [ ] **Step 1: Add the tests**

```ts
it("deep-merges a partial gitlab override", () => {
  const d = mkdtempSync(join(tmpdir(), "chardon-"));
  writeFileSync(join(d, ".chardon.json"), JSON.stringify({ gitlab: { enabled: true } }));
  const c = loadConfig(d);
  expect(c.gitlab.enabled).toBe(true);
  expect(c.gitlab.tokenEnv).toBe("GITLAB_TOKEN"); // default kept
});

it("falls back to the default ticketRegex when the override is invalid", () => {
  const d = mkdtempSync(join(tmpdir(), "chardon-"));
  writeFileSync(join(d, ".chardon.json"), JSON.stringify({ ticketRegex: "([unclosed" }));
  const c = loadConfig(d);
  expect(c.ticketRegex).toBe("(?:feat|fix)/(\\d+)");
});
```

- [ ] **Step 2: Run → fail** (`cd ~/lab/chardon && npx vitest run lib/config.test.ts`).

- [ ] **Step 3: Implement**

After the shallow merge, deep-merge `gitlab`: `merged.gitlab = { ...defaults.gitlab, ...(override.gitlab ?? {}) }`. Then validate `ticketRegex`: wrap `new RegExp(merged.ticketRegex)` in try/catch; on failure set `merged.ticketRegex = defaults.ticketRegex`. Keep existing behavior otherwise. No magic numbers.

- [ ] **Step 4: Run → success** (`npx vitest run lib/config.test.ts`) — all PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts lib/config.test.ts
git commit -m "fix(lib): deep-merge gitlab config + validate ticketRegex"
```

---

### Task 2: `analyze-daily` CLI entry + `/chardon-daily` command

**Files:**
- Modify: `scripts/analyze-daily.ts` (add a `main()` entry)
- Modify: `scripts/analyze-daily.test.ts` (assert `generateDailyReport` returns a path under the project)
- Create: `commands/chardon-daily.md`

**Interfaces:**
- Consumes: `generateDailyReport({projectDir, now})` (existing).
- Produces: when run directly, `analyze-daily.ts` generates today's report for `CLAUDE_PROJECT_DIR ?? process.cwd()` and prints the written file path to stdout.

- [ ] **Step 1: Add the test (run-as-CLI via subprocess)**

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

it("runs as a CLI and writes a report under the project", () => {
  const dir = mkdtempSync(join(tmpdir(), "proj-"));
  const script = join(dirname(fileURLToPath(import.meta.url)), "analyze-daily.ts");
  const out = execFileSync("npx", ["tsx", script], {
    cwd: dir,
    env: { ...process.env, CHARDON_DB: join(dir, "c.db"), CLAUDE_PROJECT_DIR: dir },
    encoding: "utf8",
  }).trim();
  expect(out).toContain("daily-");
  expect(existsSync(out)).toBe(true);
});
```

- [ ] **Step 2: Run → fail** (`npx vitest run scripts/analyze-daily.test.ts`).

- [ ] **Step 3: Implement the CLI entry**

At the bottom of `analyze-daily.ts`, add a guarded entry: if the module is the process entry point
(`import.meta.url === pathToFileURL(process.argv[1] ?? "").href`), call
`const { path } = await generateDailyReport({ projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), now: new Date() }); console.log(path);`
(`new Date()` is allowed HERE — this is the CLI boundary, not pure logic.) Keep `renderDailyReport` pure and untouched.

- [ ] **Step 4: Run → success** (`npx vitest run scripts/analyze-daily.test.ts`) — PASS.

- [ ] **Step 5: Write `commands/chardon-daily.md`**

```markdown
---
description: Generate and show today's Chardon workflow report.
---

Run the daily workflow report for the current project, then summarize it.

1. Run: `npx tsx ${CLAUDE_PLUGIN_ROOT}/scripts/analyze-daily.ts`
2. Read the file path it printed and open that Markdown report.
3. Summarize the key frictions (toil loops, cold reads, retry storms), the token
   usage, and any cache-efficiency drift. Suggest one concrete improvement.
```

- [ ] **Step 6: Full suite + commit**

Run: `npm test && npm run typecheck` → all green.
```bash
git add scripts/analyze-daily.ts scripts/analyze-daily.test.ts commands/chardon-daily.md
git commit -m "feat(scripts): analyze-daily CLI + /chardon-daily command"
```

---

## Self-Review

- **Spec coverage (Batch 4)**: config hardening (deep gitlab merge + ticketRegex validation, fixing the known Batch 1 Minor) → Task 1; runnable daily report + slash command → Task 2; `commands/` no longer empty → Task 2.
- **Placeholders**: tests are real; the command file is concrete.
- **Type consistency**: `loadConfig` signature unchanged; CLI entry reuses `generateDailyReport`. `new Date()` confined to the CLI boundary.
