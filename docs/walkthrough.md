# Walkthrough: the closed improvement loop

This is a real end-to-end run (actual command output, not mocked) showing chardon going
from raw events to a **measured** improvement. It is the answer to "detection is not
actionable, and the ROI loop never closes."

> This is a demonstration of the mechanism. A longitudinal case study with production
> numbers accrues from real use over time; chardon is installed on its own repo
> (`.claude/settings.local.json`) so that data accumulates as the project is developed.

## 1. Events are collected (fail-open hooks → SQLite)
During a session, three `npm run build` invocations fail. The `PostToolUse` hook records
them (redacted, scoped to the repo), and also records collection health.

## 2. `/chardon-improve`: proposals with a concrete next step and an id
```
# Chardon Improve Digest

## Prioritized Proposals
- ⚪ **fix-failing-command** → `npm run build` (baseline: 3)
  ↳ `npm run build` fails every run: fix or guard it instead of rerunning
- ⚪ **consider-skill** → `systematic-debugging` (baseline: 3)
  ↳ invoke the `systematic-debugging` skill next time this friction appears

## Open Actions
- `#2` [proposed] **fix-failing-command** → `npm run build`
```
Each proposal carries an **action hint** (the `↳` line) and each open action shows its
**id**, so you know exactly what to do and which action to act on.

## 3. `/chardon-apply 2`: record that you acted
```
Action 2 marked applied. Run measure later to capture its ROI.
```

## 4. Fix the root cause, then `/chardon-measure 2`: the loop closes
After fixing the build, chardon re-measures the same friction:
```
Action 2: friction 3 → 0 (reduced by 3).
```
The ROI is stored and shown in the "Measured ROI" section of `/chardon-improve`. Detect →
propose → **apply → measure** is now a closed loop, not an open-ended list.

## 5. The data is trustworthy: collection health is visible
The daily report tells you whether collection actually worked:
```
## Collection health
🟢 healthy: 12 write(s) recorded, 0 failures
```
If a hook silently fails, it says so instead:
```
## Collection health
⚠ 2 silent collection failure(s) today (10 ok): run with CHARDON_DEBUG=1 to see them
```
Set `CHARDON_DEBUG=1` to print the swallowed errors to stderr (never changing the exit code,
so fail-open is preserved).

## 6. Teach it what is noise: `/chardon-drop <id>`
If a proposal is not worth acting on, drop it; chardon stops proposing that
`(kind, target)`. This is how the signal stays relevant to you.
