# Skill Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/chardon-skills` command that mines recurring work procedures from the events history and proposes ready-to-review skills, drafted by `claude -p` when available.

**Architecture:** Pure mining in `lib/procedures.ts` (sequences → n-gram candidates), injectable drafting in `lib/skill-writer.ts` (`claude -p` subprocess with skeleton fallback), orchestration in `scripts/skills.ts` reusing the existing actions/patterns persistence. Spec: `docs/superpowers/specs/2026-07-24-skill-inference-design.md`.

**Tech Stack:** Node ≥ 22, node:sqlite via createRequire, Vitest, esbuild bundles.

## Global Constraints

- Zero runtime npm dependencies; `child_process` only for `claude -p`.
- Parameterized SQL; injected clock (`now`); pure rendering separated from I/O; English; no em dash (U+2014); named constants; new user-facing strings get asserting tests.
- Constants from the spec: `MINING_WINDOW_DAYS = 14`, `MIN_SUPPORT_SESSIONS = 3`, `MIN_PATTERN_LENGTH = 3`, `MAX_PATTERN_LENGTH = 6`, `CLAUDE_P_TIMEOUT_MS = 120_000`.
- README test count is enforced by `tools/validate.ts`: update it in the same commit as new tests.

---

### Task 1: Procedure mining (`lib/procedures.ts`)

**Files:**
- Create: `lib/procedures.ts`, `lib/procedures.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ProcedureCandidate {
    signature: string;            // steps joined by " > "
    steps: string[];              // e.g. ["edit@lib", "test", "git"]
    supportSessions: number;
    repos: string[];              // distinct repos, sorted
    scope: "local" | "global";    // global when repos.length >= 2
    score: number;                // supportSessions * steps.length
    examples: string[][];         // up to 3 real display sequences
  }
  export function mineProcedures(db: ChardonDb, now: Date): ProcedureCandidate[]
  export function renderProcedureSkeleton(c: ProcedureCandidate): string
  ```

- [ ] **Step 1: failing tests** in `lib/procedures.test.ts`. Seed helper writes sessions (with repo) and ordered events (`writeSession`/`writeEvent`); events carry `meta.cmd_class` for Bash and `meta.file` for Edit. Cases:
  - `finds a 3-step pattern repeated in 3 sessions` (edit@src → test → git in 3 sessions of one repo → one candidate, scope local, support 3, score 9).
  - `ignores a pattern below the session support` (2 sessions → no candidate).
  - `labels a pattern seen in two repos as global`.
  - `skips legacy Bash events without cmd_class and read-style tools`.
  - `keeps only closed patterns` (a 4-step pattern with support 3 must not also emit its 3-step sub-patterns at the same support).
  - `windows out events older than MINING_WINDOW_DAYS` (injected now).
  - `renderProcedureSkeleton emits parsable frontmatter and the observed steps`.
- [ ] **Step 2: run, watch fail** (`npx vitest run lib/procedures.test.ts`).
- [ ] **Step 3: implement.** Normalization per event row: Bash + `cmd_class` → the class; Edit/Write + `file` → `edit@` + basename(dirname(file)); everything else skipped. SQL (one query, ordered):
  ```sql
  SELECT e.session_id, s.repo, e.tool, e.meta
  FROM events e JOIN sessions s ON e.session_id = s.id
  WHERE e.ts >= ?
  ORDER BY e.session_id, e.id
  ```
  Cutoff = `new Date(now.getTime() - MINING_WINDOW_DAYS * MS_PER_DAY).toISOString()`. Per session: distinct n-grams (n = 3..6) into a map signature → {sessions:Set, repos:Set, examples (first display slice per session, cap 3)}. Filter support ≥ 3, closed-pattern filter (drop P when a strictly longer candidate Q contains P as a contiguous subsequence with the same support), sort by score desc.
- [ ] **Step 4: green + typecheck.**
- [ ] **Step 5: commit** `feat(procedures): mine recurring work sequences from events`.

### Task 2: Drafting via claude -p (`lib/skill-writer.ts`)

**Files:**
- Create: `lib/skill-writer.ts`, `lib/skill-writer.test.ts`

**Interfaces:**
- Consumes: `ProcedureCandidate` from Task 1.
- Produces:
  ```ts
  export type ClaudeRunner = (bin: string, prompt: string) => string; // throws on failure
  export function resolveClaudeBin(env: NodeJS.ProcessEnv): string | null
  export function buildDraftPrompt(c: ProcedureCandidate, installTarget: string): string
  export function draftSkill(c: ProcedureCandidate, installTarget: string,
    opts?: { runner?: ClaudeRunner; env?: NodeJS.ProcessEnv }): { markdown: string; name: string } | null
  ```
- [ ] **Step 1: failing tests.**
  - `resolveClaudeBin prefers CHARDON_CLAUDE_BIN, falls back to PATH, null when absent` (fake dir on PATH containing an executable `claude`).
  - `draftSkill returns the drafted markdown and extracted name` (runner = stub returning a canned valid file).
  - `falls back to null on malformed output` (no frontmatter / no name line).
  - `falls back to null when the runner throws` (simulates timeout/ENOENT).
  - `buildDraftPrompt embeds signature, support, scope and examples`.
- [ ] **Step 2: watch fail.**
- [ ] **Step 3: implement.** Default runner: `execFileSync(bin, ["-p", prompt], { encoding: "utf-8", timeout: CLAUDE_P_TIMEOUT_MS, stdio: ["ignore","pipe","ignore"] })`. Validation: output trimmed must start with `---` and contain `name: <token>`; extract the name. PATH resolution: `CHARDON_CLAUDE_BIN` if set, else scan `env.PATH` entries for an existing `claude` file (no shell).
- [ ] **Step 4: green + typecheck.** One subprocess test uses a real fake binary: a shell script `claude` writing a canned draft (proves the execFileSync path).
- [ ] **Step 5: commit** `feat(writer): draft inferred skills through claude -p`.

### Task 3: The command (`scripts/skills.ts` + wiring)

**Files:**
- Create: `scripts/skills.ts`, `scripts/skills.test.ts`, `commands/chardon-skills.md`
- Modify: `tools/build.mjs` (add `"scripts/skills.ts"` to the entry list)

**Interfaces:**
- Consumes: Tasks 1-2, plus existing `listInstalledSkills(projectDir, homeDir?)`, `recordSkeleton(db, repo, {skill, patternType, target, baseline, path})`, `loadConfig`, `repoSlug`.
- Produces: `runSkillInference(opts: { projectDir: string; now: Date; homeDir?: string; runner?: ClaudeRunner; env?: NodeJS.ProcessEnv }): { summary: string; proposals: number }` and a CLI entry (`isMainModule("skills")`).
- [ ] **Step 1: failing tests** (temp DB + temp project):
  - `proposes a mined procedure and writes the proposal file` (stub runner; file under `<outDir>/proposed/`, action row kind `infer-skill` target = signature, patterns row via recordSkeleton, summary lists it with its install target).
  - `is idempotent: a second run proposes nothing new`.
  - `skips a candidate whose drafted name is already installed` (seed `.claude/skills/<name>/SKILL.md`).
  - `falls back to the deterministic skeleton without a claude binary` (env without bin; file content = renderProcedureSkeleton output).
  - `global candidates state the home install target`.
- [ ] **Step 2: watch fail.**
- [ ] **Step 3: implement.** Flow: openDb → `mineProcedures` → skip signatures already in `actions` (`SELECT 1 FROM actions WHERE repo = ? AND kind = 'infer-skill' AND target = ?`) → for each kept candidate: draft (or skeleton), skip if drafted name ∈ inventory, write file `proposed/skill-<skillSlug(signature)>.md` (never overwrite), `recordSkeleton`, insert action via the existing `persistActions` path with `{kind: "infer-skill", target: signature, patternType: "recurring_procedure", baseline: supportSessions, severity: severityFor(supportSessions)}` → pure `renderSkillsReport(results)` printed by the CLI. Install target line inside the summary: `.claude/skills/` (local) or `~/.claude/skills/` (global).
- [ ] **Step 4: green + typecheck + `npm run build` (new bundle `dist/skills.mjs`).**
- [ ] **Step 5: commit** `feat(skills): /chardon-skills infers procedures and drafts skills`.

`commands/chardon-skills.md` content:

```markdown
Mine the recurring work procedures Chardon observed and propose skills for them.

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/dist/skills.mjs`
2. Read the proposals it printed: each names a procedure, its support, and the
   drafted skill file under the project's proposed/ directory.
3. Summarize the candidates, open the most supported draft, and help the user
   decide: install it (copy to the stated target), refine it, or drop it with
   /chardon-drop <id>.
```

### Task 3b: Measurable ROI for `infer-skill`

**Files:**
- Modify: `lib/roi.ts` (+ `lib/roi.test.ts`)

- [ ] **Step 1: failing test** `measures an infer-skill action by re-counting the pattern support` (seed a mined pattern at support 3, apply the action, remove the pattern's events, measure → after = 0, delta = -3).
- [ ] **Step 2: watch fail.**
- [ ] **Step 3: implement.** In the measure path, when `kind === "infer-skill"`, compute `after` as the current support of the target signature via `mineProcedures(db, now)` (0 when absent) instead of the proposeActions re-count.
- [ ] **Step 4: green.**
- [ ] **Step 5: commit** `feat(roi): measure inferred procedures by pattern support`.

### Task 4: Digest hint in `/chardon-improve`

**Files:**
- Modify: `scripts/improve.ts` (+ its test)

- [ ] **Step 1: failing test** `mentions pending procedure candidates` (seed a minable DB, digest contains `recurring procedure(s) detected: run /chardon-skills`) and `stays silent with no candidates`.
- [ ] **Step 2: watch fail.**
- [ ] **Step 3: implement.** In `runImprove`, call `mineProcedures(db, now)`, filter signatures not yet in `actions` (same SQL as Task 3), and when > 0 append one line to the digest: `N recurring procedure(s) detected: run /chardon-skills`.
- [ ] **Step 4: green.**
- [ ] **Step 5: commit** `feat(improve): surface pending procedure candidates`.

### Task 5: Docs, bundles and counts

**Files:**
- Modify: `README.md` (commands table + "The eight commands" → "nine" + test count), `docs/architecture.md` (scripts line + proposals note), `CHANGELOG.md` (Unreleased/Added), `dist/` (rebuild)

- [ ] **Step 1:** README: add `| /chardon-skills | mine recurring procedures and draft skills for them |` to the commands table; fix the two "eight commands" occurrences; CHANGELOG entry. Architecture: add `skills` to the scripts line and a paragraph in the proposals section.
- [ ] **Step 2:** `npm run build`; `node --experimental-strip-types tools/validate.ts` green (fix the README test count it reports).
- [ ] **Step 3:** `npm run verify` fully green.
- [ ] **Step 4: commit** `docs: document /chardon-skills` then `chore(build): refresh the committed dist bundles`.
