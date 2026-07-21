## What this changes

<!-- One or two sentences. Link the issue it closes, if any. -->

## Checks

```bash
npm run build && git diff --exit-code -- dist   # committed bundles match the source
npm test
npm run typecheck
npm run lint
```

- [ ] All four pass locally

## Invariants

Tick what applies; if a box does not apply, say why rather than leaving it blank.

- [ ] Every hook still ends on `process.exit(0)` — empty/malformed stdin, a missing
      `CLAUDE_PROJECT_DIR`, or an unavailable DB must exit 0 and write nothing
- [ ] No project path, repo name, tracker id, or `~/.claude/projects/...` slug hardcoded
      in `lib/`, `hooks/`, `scripts/`, `config/`, `schema.sql`
- [ ] Every new row is scoped by `repo`; every query binds `?` placeholders
- [ ] `node:sqlite` still loaded via `createRequire`, never `import`
- [ ] Schema changes are additive; `SCHEMA_VERSION` bumped if they are not
- [ ] No new required runtime dependency

## Tests

<!-- Which test covers this? A bug fix should come with the test that fails without it.
     User-facing strings need their asserting test updated in the same change. -->
