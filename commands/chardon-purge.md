---
description: Purge Chardon history older than the configured retention window.
---

Remove old workflow-monitoring data so the local database does not grow forever
(retention defaults to 90 days, overridable via `retentionDays` in `.chardon.json`).

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/dist/purge.mjs`
2. Report the summary it printed (rows removed per table, database compacted).
