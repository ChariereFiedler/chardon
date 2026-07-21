---
description: Drop a Chardon proposal so it is never suggested again ("this is normal").
---

Tell Chardon a proposal is not worth acting on. It will not be re-proposed for the same
`(kind, target)` — this is how you teach it what is noise.

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/dist/roi-actions.mjs drop <ACTION_ID>`
2. Report the confirmation.
