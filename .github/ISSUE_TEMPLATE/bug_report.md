---
name: Bug report
about: Something collected, reported, or displayed the wrong thing
title: ""
labels: bug
---

## What happened

<!-- What you observed. If a hook misbehaved, say which event (SessionStart, PreToolUse,
     PostToolUse, Stop) and which tool call triggered it. -->

## What you expected

## Did it break your session?

<!-- Hooks are meant to be fail-open: they must never block or crash a Claude Code session.
     If one did, say so here — that is a priority bug regardless of the rest. -->

- [ ] No, the session kept working
- [ ] Yes, the session was blocked or errored

## Reproduction

1.
2.
3.

## Diagnostics

```
# Node version and OS
node --version
uname -a

# What Chardon actually stored (redaction is applied before storage)
node <plugin-root>/dist/inspect.mjs

# Re-run the failing action with debug tracing on
CHARDON_DEBUG=1 <your command>
```

<!-- Paste the output above. `inspect` and the reports redact secrets, but skim them
     before pasting: they contain your command history and file paths. -->

## Config

<!-- Your `.chardon.json` if you have one, minus anything private. -->
