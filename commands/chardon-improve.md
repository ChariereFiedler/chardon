---
description: Show prioritized workflow improvements and their measured ROI.
---

Show the Chardon improvement digest for the current project, then act on it.

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/dist/improve.mjs`
2. Read the prioritized proposals (🔴 high / 🟡 medium / ⚪ low) and the measured ROI.
3. Pick the top 🔴 item, propose a concrete change to address it, and — once applied —
   note that a later run will measure whether the friction actually dropped.
