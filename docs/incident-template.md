# Incident: <one-line title>

Date: YYYY-MM-DD · Author: <name> · Severity: <low | medium | high>

Lightweight post-mortem, in the style of the fixture-git writeup in
`docs/superpowers/plans/2026-07-21-chardon-ronce-uniformisation.md`. Aim for a
few sentences per section: enough that a reader six months later understands
what happened and why it cannot happen again. Blameless: name causes and
guards, not people.

## Context

What was being done when the incident happened, and the state of the system at
that moment. Include the trigger (a command, a config, a sequence of events)
precisely enough to reproduce it.

## Impact

What actually broke, for whom, and for how long. Distinguish observed damage
(data written, sessions blocked, history lost) from near misses (nothing was
pushed, no data left the machine).

## Root cause

The underlying defect, not the first symptom. If several defects lined up,
list each one; state which invariant (fail-open, repo scoping, additive
schema...) was violated or missing.

## Remediation

What was done to restore a clean state, and what changed in the code or the
process so the same class of failure is prevented, not just this instance.

## Verified guard

The mechanical check that now covers this failure (a test, a CI job, a
validation rule) and the evidence it works: show it failing without the fix
and passing with it. A guard that was not seen to fail is a hope, not a guard.
