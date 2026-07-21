---
description: Show exactly what Chardon has stored locally (transparency).
---

Print a summary of the local Chardon database — row counts per table and a sample of stored
command metadata (with redaction visible) — so you can see precisely what is kept and confirm
nothing sensitive leaks.

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/dist/inspect.mjs`
2. Report the summary.
