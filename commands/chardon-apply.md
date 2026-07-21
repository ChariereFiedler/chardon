---
description: Mark a Chardon improvement action as applied (you acted on it).
---

Record that you have acted on a proposed improvement, so its ROI can be measured later.

1. If you don't know the action id, run `/chardon-improve` first — each Open Action shows its `#id`.
2. Run: `node ${CLAUDE_PLUGIN_ROOT}/dist/roi-actions.mjs apply <ACTION_ID>`
3. Report the confirmation. Later, `/chardon-measure <ACTION_ID>` captures the friction reduction.
