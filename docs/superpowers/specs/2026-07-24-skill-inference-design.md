# Skill inference from monitoring data

Date: 2026-07-24 · Status: approved design, pending implementation plan

## Problem

Chardon's skill loop is reactive and statically mapped: a friction type points to a
skill name via `skillMap`, and `create-skill` only fires when that mapped skill is
missing. Nothing discovers the user's actual recurring procedures (the ordered
sequences of commands and edits repeated session after session) and turns them into
skill proposals. The monitoring data already contains those sequences.

## Goal

A dedicated `/chardon-skills` command that mines recurring work procedures from the
events history and proposes ready-to-review skills, drafted by `claude -p` when the
Claude Code CLI is available and falling back to a deterministic skeleton otherwise.

Non-goals: automatic installation of skills (the user always reviews and installs by
hand); real-time inference (this is a batch command); any new npm dependency.

## Pipeline

### 1. Deterministic mining (`lib/procedures.ts`, pure, no I/O)

- Window: the last 14 days of events (`MINING_WINDOW_DAYS = 14`), read per session
  in event order, repo-scoped, parameterized SQL.
- Normalization: each event becomes a step token. Bash events use their
  `meta.cmd_class` (`test`, `typecheck`, `lint`, `build`, `git`, `pkg`, `other`);
  Edit/Write events become `edit@<parent-directory-basename>` (directory, not file:
  it generalizes across files of one area). Events without `cmd_class` (legacy) and
  Read/Grep-style tools are skipped.
- Candidate extraction: n-grams of 3 to 6 steps per session sequence. A candidate is
  a pattern seen in at least `MIN_SUPPORT_SESSIONS = 3` distinct sessions. Score =
  distinct sessions × pattern length; proposals are ordered by score.
- Scope labels: `local` when all supporting sessions belong to one repo (install
  target `<project>/.claude/skills/`), `global` when they span 2 or more repos
  (install target `~/.claude/skills/`), in the spirit of the existing Ronce Racine
  cross-repo signal.
- Dedup: a candidate is dropped when a covering skill is already installed
  (existing `listInstalledSkills` inventory, matched by the drafted or slugged
  name), or when the same pattern was already proposed or dropped (existing
  `persistActions` self-tuning, action kind `infer-skill`, target = the pattern
  signature string).

### 2. Drafting via `claude -p` (`lib/skill-writer.ts`, injectable runner)

- Binary resolution: `CHARDON_CLAUDE_BIN` env var, then `claude` on `PATH`. When
  neither resolves, skip drafting silently: the deterministic skeleton (same
  generator as `create-skill`) is delivered instead. No network happens without the
  binary.
- Prompt: the normalized pattern, up to 3 real example sequences (redacted 60-char
  commands, directory names), the support count and scope label. Asked output: YAML
  frontmatter (name, description with trigger phrases) plus a numbered procedure
  body.
- Safety rails: bounded subprocess timeout (`CLAUDE_P_TIMEOUT_MS = 120_000`),
  output validated (parsable frontmatter with a name) before use; any failure falls
  back to the deterministic skeleton. The runner is injectable so tests use a fake
  `claude` shell script.
- Privacy: `claude -p` runs under the user's own Claude Code account, with the same
  guarantees as their sessions; only already-redacted, already-truncated data is
  included in the prompt.

### 3. Delivery and lifecycle

- Files land in `<outDir>/proposed/skill-<slug>.md` (never overwritten), each
  stating its install destination. Installation stays manual.
- Each proposal persists an `infer-skill` action (baseline = support count) plus a
  `patterns` row carrying `proposal_path`, so `/chardon-improve` lists it and the
  existing apply/measure/drop loop applies. ROI: `measure` re-runs the mining and
  re-counts the pattern's support; a procedure replaced by a skill invocation
  disappears from the raw event stream.
- `/chardon-improve` gains one summary line when candidates exist: "N recurring
  procedures detected: run /chardon-skills".

## Invariants honored

Zero runtime npm dependencies (child_process only); parameterized SQL scoped by
repo; injected clock; pure rendering separated from I/O; additive-only reuse of the
existing schema (`actions`, `patterns.proposal_path`; no new tables); English
everywhere; no em dashes; every new user-facing string gets an asserting test.

## Testing

- Mining: seeded temp DBs with known sequences: pattern above/below support,
  cross-repo vs single-repo labeling, legacy events skipped, dedup against
  installed skills and against dropped actions, injected clock for the window.
- Writer: fake `claude` binary (shell script echoing a canned draft) exercised via
  `CHARDON_CLAUDE_BIN`; malformed output falls back to the skeleton; missing binary
  skips silently; timeout path covered.
- Command: end-to-end on a temp DB, proposals written, digest line rendered,
  actions persisted; re-run proposes nothing new (dedup).

## Open follow-ups (out of scope here)

- Excluding `.claude/worktrees/` paths from all detectors (dogfooding noise).
- Using basenames instead of absolute paths in `create-skill` trigger phrases and
  skeleton slugs.
