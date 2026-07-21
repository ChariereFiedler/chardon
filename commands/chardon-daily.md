---
description: Generate and show today's Chardon workflow report.
---

Run the daily workflow report for the current project, then summarize it.

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/dist/analyze-daily.mjs`
2. Read the file path it printed and open that Markdown report.
3. Summarize the key frictions (toil loops, cold reads, retry storms), the token
   usage, and any cache-efficiency drift. Suggest one concrete improvement.
