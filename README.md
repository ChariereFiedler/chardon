<p align="center">
  <img src="assets/header.png" alt="Illustration of purple and gold thistles" width="100%">
</p>

# Chardon

**Find out what wasted your time in Claude Code today, and fix it tomorrow.**

<p>
  <a href="https://github.com/ChariereFiedler/chardon/actions/workflows/ci.yml"><img src="https://github.com/ChariereFiedler/chardon/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022-brightgreen" alt="Node 22+">
  <img src="https://img.shields.io/badge/runtime%20deps-zero-blue" alt="Zero runtime dependencies">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="MIT license">
</p>

Chardon is a Claude Code plugin that records how your sessions actually go (which commands
get re-run, which files get re-read, what fails, what's slow) and turns that into a daily
report like this one:

```markdown
## Detected frictions

### Toil loops (same command repeated)
| Command | Repetitions |
|---|---|
| `docker compose up -d && npm run seed` | 4 |
| `npm run test:e2e -- --grep billing` | 3 |

### Cold reads (file re-read often, memory/skill candidate)
| File | Reads |
|---|---|
| `src/billing/invoice-calculator.ts` | 5 |
```

Then it proposes one concrete action per friction, records a **baseline**, and re-measures
after you act, so a suggestion that changed nothing is shown for what it is and never
proposed again. Everything runs locally: no server, no account, no data leaving your
machine (two opt-in exceptions, both listed in [Data & privacy](#data--privacy)).

## Quickstart

Type these in the **Claude Code prompt** (they are slash commands, not shell commands):

```
/plugin marketplace add ChariereFiedler/chardon
/plugin install chardon@chardon
```

`chardon@chardon` means "the plugin named chardon, from the marketplace named chardon";
both happen to share the name. The eight commands and the four collection hooks are wired
automatically; no file to copy, no build step, no dependency to install. The only
requirement is **Node 22 or later** on your `PATH` (`node -v` to check): the hooks are
plain-`node` precompiled bundles, and `node:sqlite` ships with Node.

Then:

1. **Restart Claude Code** (hooks are only picked up at session start).
2. Work normally for a while.
3. Type `/chardon-daily`.

A near-empty report on day one is normal; the line to check is *Collection health*: if it
says `healthy` with a non-zero write count, collection works. Configuration is optional;
defaults are sensible, and a `.chardon.json` at the project root overrides them (see
[Configuration](#configuration)).

## What a day looks like

The four hooks run on their own. You type a slash command only when you want to *read*
something.

### While you work: automatic

`SessionStart` opens a session row. Every tool call lands in the database via
`PostToolUse`: Bash commands (redacted, truncated), file paths, durations, success or
failure. When the session ends (`Stop`), the daily report is written to `docs/chardon/` in
your project. Add that folder to your `.gitignore` unless you want reports in your
commits; this repository ignores it too. Reports may quote (redacted) commands you ran, so
treat them as local notes, not something to publish.

### Reading the damage: `/chardon-daily`

```markdown
# Dev Metrics · 2026-07-21

## Velocity
- 1 session(s) · 16 tool calls · 0 failure(s)

## Collection health
🟢 healthy: 16 write(s) recorded, 0 failures

## Detected frictions
…the friction tables shown at the top of this page…
```

*Collection health* is not decoration. Hooks are fail-open: a broken hook exits silently
rather than break your session, so this line is how you find out something went silent.

### Deciding what to change: `/chardon-improve`

```markdown
## Prioritized Proposals

- 🟡 **automate-command** → `docker compose up -d && npm run seed` (baseline: 4)
  ↳ run less often, or add it to `toilExclusions` / script it
- 🟡 **investigate-file** → `src/billing/tax-rules.ts` (baseline: 4)
  ↳ edited repeatedly: find the root cause
- 🟡 **consider-skill** → `recurring-bug-root-cause` (baseline: 4)
  ↳ invoke this skill next time the friction appears

## Open Actions

- `#1` [proposed] **automate-command** → `docker compose up -d && npm run seed`
```

The proposal ids shown in *Open Actions* (`#1`) are what the follow-up commands take.
`consider-skill` fires when a friction maps to a Claude Code skill you have but did not
invoke; Chardon reads skill usage from the session events, it does not guess.

### Closing the loop

```
/chardon-apply 1     → Action 1 marked applied. Run measure later to capture its ROI.
/chardon-measure 1   → Action 1: friction 4 → 0 (reduced by 4).
/chardon-drop 2      → never propose this one again ("this is normal here")
```

The workflow is: Chardon proposes, **you** act (script the command, fix the root cause),
`apply` records that you acted, and `measure` (a day or more later, once new sessions
exist) re-counts the same friction against the baseline. An action measured as ineffective
is never re-proposed; a friction that returns after being fixed resurfaces in a
**Regressions** section.

## Why local-only

- **It answers your question**, not a manager's: *what did I waste time on today?*
  No aggregation across people, by design; no row is attributed to a person.
- **Local data can afford to be specific**: the actual commands you re-ran, not
  anonymized averages.
- **The loop is measured**: proposals carry baselines and get re-counted, so advice that
  did not work is visible and retired.

## What Chardon detects and proposes

Detection windows are the calendar day for the daily report. Every threshold is
configurable; raise them to cut noise.

| Friction | What it means | Threshold | Proposal |
|---|---|---|---|
| **Toil loop** | same Bash command run over and over | ≥ 3 runs (`toilMin`) | `automate-command`: script it, run it less, or exclude it |
| **Failing command** | same command *failing*, not merely repeating | ≥ 3 failures (`failMin`) | `fix-failing-command`: fix or guard it instead of rerunning |
| **Slow command** | same command repeatedly burning wall-clock | ≥ 3 runs averaging ≥ 30 s (`slowMin`, `slowMs`) | `speed-up-command`: cache, scope, or parallelize it |
| **Retry storm** | one file edited again and again | ≥ 4 edits (`retryMin`) | `investigate-file`: find the root cause |
| **Cold read** | one file re-read but never modified | ≥ 3 reads (`coldMin`) | `split-or-summarize`: turn it into a memory note |
| **Skill gap** | a friction maps to a skill you did not invoke | with the friction | `consider-skill`: use that skill next time |
| **Over budget** | today's tokens exceed `tokenBudgetPerDay` | budget set | `reduce-token-spend`: trim context churn |
| **Token growth** | week-over-week token jump | ≥ trend threshold | `investigate-token-growth`: check for context churn |
| **Cross-project** | same friction across several repos | ≥ 2 repos | promote a shared rule or skill |

Each proposal carries a severity (⚪ low, 🟡 medium, 🔴 high), so the digest is ordered by
what actually costs you.

## Commands

All typed in the Claude Code prompt.

| Command | What it does |
|---|---|
| `/chardon-daily` | today's report: velocity, frictions, tokens, collection health |
| `/chardon-weekly` | weekly synthesis and token trend (the LLM step is optional) |
| `/chardon-improve` | prioritized proposals, open actions, measured ROI, regressions |
| `/chardon-apply <id>` | mark an action as applied (you did the fix) |
| `/chardon-measure <id>` | re-count the friction and record the delta |
| `/chardon-drop <id>` | drop a proposal for good |
| `/chardon-inspect` | show what is stored for the current repo |
| `/chardon-purge` | delete the current repo's history older than the retention window |

## Data & privacy

**What is collected**: tool metadata only. For a Bash call: the command line, redacted
then truncated to 60 characters. For a file operation: the path, truncated to 80
characters. Plus durations, success/failure, skill and subagent names, and token counts.
**Not collected**: your prompts, file contents, command output.

**Where it lives**: a single SQLite file, `~/.claude/chardon.db`, shared by all your
projects and scoped per repo, created owner-only (`0600`). It is a plain local file:
anyone with access to your machine account can read it, so treat it like the rest of your
home directory. `sqlite3 ~/.claude/chardon.db` shows everything;
`/chardon-inspect` shows the current repo's slice.

**Redaction is a best-effort blocklist**, not a guarantee (`lib/redact.ts`): GitLab,
GitHub, Anthropic, AWS, Google, Stripe, npm and Slack tokens, JWTs, long hex strings,
`VAR_TOKEN=…` and lowercase `api_key=…` assignments, credentials in URLs, `curl -u`
basic-auth values, `sshpass -p`, and secrets passed as bare flags (`--token …`,
`Bearer …`). A secret in a shape it does not know can still get through; the 60-character
truncation caps the blast radius. Report gaps via
[`SECURITY.md`](SECURITY.md).

**What the hooks read**: besides tool events, the `Stop` hook and the status line read
your local session transcripts (`~/.claude/projects/…`) to extract **token usage counters
only**; transcript text never reaches the database.

**What leaves your machine**: nothing, with two opt-in exceptions.

1. `/chardon-weekly`'s synthesis step calls the Anthropic API, only if you set
   `ANTHROPIC_API_KEY`. The prompt contains the weekly aggregates: repo name, redacted
   commands, file paths, token counts (see `buildWeeklyPrompt` in `lib/weekly.ts`). It is
   a paid API call, separate from a Claude subscription, using the model in
   `CHARDON_MODEL` (defaults to an Opus-class model; set a cheaper one if you prefer).
2. The optional GitLab section of the status line calls the GitLab API on each refresh
   (two requests) with the token you configured. Off by default.

**Retention**: `retentionDays` (default 90) bounds the history kept per repo. At session
end the Stop hook opportunistically purges the current repo's older rows, at most once a
day per repo; each purge is logged in `purge_log` (visible via `/chardon-inspect`), and
`/chardon-purge` stays the explicit trigger. Uninstalling leaves the DB in place; delete
the file to remove every trace.

**Backup**: the accumulated history *is* the value Chardon produces; the code is
replaceable, `~/.claude/chardon.db` is not. If that history matters to you, include the
file in your usual backups: a plain file copy taken while no Claude Code session is
running is a valid backup. If the file is ever lost, nothing breaks: the schema
self-recreates on the next hook and collection resumes from zero, only the history is
gone.

**The bundles are auditable**: hooks run as committed, precompiled `dist/*.mjs`; CI
rebuilds them from source on every push and fails if they differ (`ci.yml`, "dist is in
sync with source"), and `npm run build && git diff dist/` reproduces that check locally.

## Configuration

Optional. Create `.chardon.json` at the project root; it is meant to be committed (Chardon
treats its values as untrusted input: a hostile regex or path cannot hang a hook or write
outside the project). Full shape with defaults:

```json
{
  "outDir": "docs/chardon",
  "ticketRegex": "(?:feat|fix)/(\\d+)",
  "tokenBudgetPerDay": 0,
  "retentionDays": 90,
  "thresholds": {
    "toilMin": 3, "retryMin": 4, "coldMin": 3,
    "failMin": 3, "slowMin": 3, "slowMs": 30000
  },
  "toilExclusions": [],
  "gitlab": { "enabled": false, "projectId": "", "tokenEnv": "GITLAB_TOKEN" }
}
```

Top-level keys are shallow-merged over the defaults; `thresholds` and `gitlab` are
deep-merged, so a partial override keeps the rest.

| Key | Default | Role |
|---|---|---|
| `outDir` | `"docs/chardon"` | where reports are written (confined to the project) |
| `ticketRegex` | `"(?:feat\|fix)/(\\d+)"` | pulls a ticket number out of the branch name; stored for the v1.1 ticket-lifecycle feature, no visible effect yet |
| `toilExclusions` | `[]` | commands to ignore in toil detection |
| `tokenBudgetPerDay` | `0` (off) | the status line flags `⚠` past this many tokens |
| `retentionDays` | `90` | how far back the automatic purge and `/chardon-purge` keep the current repo's history |
| `thresholds` | see above | detection thresholds, raise them to cut noise |
| `gitlab` | `{enabled: false}` | optional MR and issue counts in the status line |

To enable the GitLab counts: set `enabled: true` and your numeric `projectId`; the token
is read at runtime from the environment variable named by `tokenEnv`, is never stored,
and is passed to `curl` via stdin so it does not show up in the process list.

### Environment variables

Set these in the shell that launches `claude` (e.g. your shell profile), except
`CLAUDE_PROJECT_DIR` which Claude Code injects itself.

| Variable | Effect |
|---|---|
| `CLAUDE_PROJECT_DIR` | project root, injected by Claude Code; without it a hook writes nothing |
| `CHARDON_DB` | database path (default `~/.claude/chardon.db`) |
| `CHARDON_DEBUG=1` | print swallowed hook errors to stderr instead of staying silent |
| `CHARDON_ACTIVE=1` | enable the live nudges: inline alerts before repeated, failing or slow Bash commands, token-budget warnings at 80% and 100%, and the session-start briefing (open actions, yesterday's top friction, collection-failure warning). Each alert fires at most once per day. Off by default to stay quiet; without it the alert hook costs nothing |
| `CHARDON_MODEL` | override the model used by the weekly synthesis |

## Optional extras

### The status line

Claude Code ignores a `statusLine` declared by a plugin, so this is wired by hand in
`~/.claude/settings.json` (your global Claude Code settings; add the key, do not replace
the file):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/cache/chardon/chardon/0.1.0/dist/statusline.mjs",
    "refreshInterval": 30
  }
}
```

The line is built from named segments:

| Segment | Content |
|---|---|
| `project` | project name (from `package.json`, else the directory name) |
| `branch` | current git branch |
| `context` | model id and context tokens used vs the window size |
| `subagents` | active subagent count |
| `worktrees` | linked worktree count |
| `tokens` | today's token count against your budget (with a `⚠` past it) |
| `gitlab` | open MR and issue counts (needs `gitlab.enabled` in `.chardon.json`) |

By default (no argument) it renders **only the monitoring segments**: `tokens`,
`subagents`, `worktrees`, `gitlab`. Project, branch, and context are generic, so most
status lines already show them; ask for them explicitly if you want Chardon to print
them too:

```bash
node .../dist/statusline.mjs                          # 💰 142000/120000 ⚠ · 🤖 2 · 🌳 1
node .../dist/statusline.mjs project branch tokens    # my-project · main · 💰 142000/120000 ⚠
```

Segments render in the order given, empty ones are omitted, and unknown names are
ignored silently: a status line must never error.

Two caveats. The path contains the plugin version and **breaks at every plugin update**
until you edit it. And `settings.json` accepts a single status line: if you already have
one, point `command` at a small wrapper script that appends Chardon's monitoring
segments to your line (the default output no longer duplicates project or branch), e.g.:

```bash
#!/bin/sh
mine=$(my-existing-statusline)
chardon=$(node ~/.claude/plugins/cache/chardon/chardon/0.1.0/dist/statusline.mjs)
printf '%s · %s\n' "$mine" "$chardon"
```

`refreshInterval` is in seconds.

### The weekly LLM synthesis

`/chardon-weekly` works without any dependency; only its final synthesis paragraph needs
`@anthropic-ai/sdk` and an `ANTHROPIC_API_KEY`. Install the SDK once under `~/.claude/`
so the plugin can resolve it across updates:

```bash
cd ~/.claude && npm install @anthropic-ai/sdk
```

## Performance & overhead (measured)

Each hook is a fresh Node process, and `PostToolUse` runs on **every tool call**, so the
steady-state cost is about one Node startup per tool call, roughly 56 ms here. The inline
alert hook (`PreToolUse` on Bash) is guarded at the shell level and spawns nothing unless
you opted into `CHARDON_ACTIVE=1`. Measured by `scripts/bench.ts` on a 2026 Linux laptop:

```
event write (in-process):        ~0.172 ms/event
hook spawn, source (strip-types): ~123 ms/event
hook spawn, bundle (plain node):  ~56 ms/event
```

Shipping precompiled bundles instead of running TypeScript sources is what brings 123 ms
down to 56 ms; what remains is Node startup, irreducible without a long-running daemon.
If ~56 ms per tool call is unacceptable to you, this plugin is not for you. That is a
real trade-off, not a footnote. Reproduce the numbers:

```bash
npm run build && node --experimental-strip-types scripts/bench.ts
```

## Known limits

- **Repos are identified by directory basename**: `~/work/app` and `~/personal/app` are
  the same repo to Chardon and their metrics merge. Rename one directory if that matters.
- **Worktrees**: linked `git worktree` checkouts are detected natively; sibling clone
  directories are recognized by the `<repo>-wt-<N>` naming convention only. Token counts
  are kept per checkout origin, so the main checkout's budget does not include its
  worktrees' spend.
- **`ticketRegex` has no visible effect yet**: the extracted ticket number is stored for
  the deferred v1.1 ticket-lifecycle feature.
- **Redaction is best-effort** (see [Data & privacy](#data--privacy)).

## Troubleshooting

**`/chardon-daily` shows nothing.** Hooks only start collecting at the first session
started *after* installation: restart Claude Code and work a little. Then check the
*Collection health* line. If it reports failures or stays at zero, check `node -v` (a
Node older than 22 makes hooks exit silently, by fail-open design), then run a hook by
hand to see the real error:

```bash
echo '{}' | CHARDON_DEBUG=1 CLAUDE_PROJECT_DIR=$PWD \
  node ~/.claude/plugins/cache/chardon/chardon/0.1.0/dist/post-tool-use.mjs
```

**The status line broke after a plugin update.** The wired path contains the plugin
version; update it in `settings.json` (see [Optional extras](#optional-extras)).

**A hook seems to do nothing.** That is the fail-open contract: empty stdin, missing
`CLAUDE_PROJECT_DIR`, or an unreachable database means exit 0 and write nothing, never a
broken session. `CHARDON_DEBUG=1` makes hooks talk.

## Uninstalling

```
/plugin uninstall chardon@chardon
```

Remove the `statusLine` block from `settings.json` if you added it. Your data stays in
`~/.claude/chardon.db`; delete that file to remove every trace.

## Architecture

```
hooks/     SessionStart · PreToolUse(Bash) · PostToolUse · Stop, all fail-open
  └─> lib/     db (SQLite) · redact · patterns (detection) · improve · roi · config · git
scripts/   analyze-daily · analyze-weekly · statusline · improve · inspect · purge · roi-actions
dist/      the above, precompiled and committed: what actually runs
```

Flow: hooks → `chardon.db` (WAL) → readers query the DB → Markdown out. Rendering is kept
pure (data → string) and separated from I/O, so it is tested without touching a database.

Data model, invariants and known limits → [`docs/architecture.md`](docs/architecture.md).
Agent-facing working rules → [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md).

## Development

```bash
npm install        # dev tooling only, never needed at runtime
npm run build      # refresh dist/*.mjs (the bundles are committed)
npm test           # 313 tests
npm run typecheck
npm run lint
```

Hooks are tested as **real subprocesses** (stdin + env), and fail-open is asserted rather
than assumed. Test strategy → [`TESTING.md`](TESTING.md).

## Roadmap

v1 is complete: collection, token parsing, daily and weekly reports, status line, and the
full improvement loop, including regression alerts and the cross-project signal.

Deferred to v1.1: `ticket_metrics` (ticket lifecycle) exists in the schema but is never
populated.

## The name

*Chardon* is French for **thistle**: it grows in ground nobody tends, it is covered in
small sharp reminders, and pulling it up means going after the root rather than the
leaves. Roughly the job here. It also keeps company with
[Ronce Racine](https://github.com/ChariereFiedler/ronce-racine) ("bramble root"), the
shared engineering-discipline config this repo is itself equipped with.

## Contributing & license

Contributions welcome: see [`CONTRIBUTING.md`](CONTRIBUTING.md) and the working rules in
[`CLAUDE.md`](CLAUDE.md). Security reports: [`SECURITY.md`](SECURITY.md).

Licensed under the [MIT License](LICENSE).

The header illustration (`assets/header.png`) is AI-generated and is **not** covered by
the MIT License; it is provided for use with this project only.
