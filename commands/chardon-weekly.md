---
description: Generate this week's Chardon synthesis (LLM, optional).
---

Generate the weekly workflow synthesis for the current project, then summarize it.

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/dist/analyze-weekly.mjs`
2. Open the Markdown report it printed.
3. If an AI synthesis is present, relay its top improvement suggestions; otherwise
   tell the user to set `ANTHROPIC_API_KEY` to enable the synthesis.
