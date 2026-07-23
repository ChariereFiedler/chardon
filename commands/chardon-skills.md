Mine the recurring work procedures Chardon observed and propose skills for them.

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/dist/skills.mjs`
2. Read the proposals it printed: each names a procedure, its support, and the
   drafted skill file under the project's proposed/ directory.
3. Summarize the candidates, open the most supported draft, and help the user
   decide: install it (copy to the stated target), refine it, or drop it with
   /chardon-drop <id>.
