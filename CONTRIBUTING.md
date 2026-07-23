# Contributing to Chardon

Thanks for your interest in improving Chardon. This is a small, focused
plugin; contributions that keep it generic, fail-open, and well-tested are very
welcome.

## Ground rules

Read [`CLAUDE.md`](CLAUDE.md) first: it lists the non-negotiable invariants:

- **Fail-open hooks.** Every hook ends with `process.exit(0)`. A hook must never
  throw or block a session.
- **Generic only.** No hardcoded project path, repo name, or tracker id in
  `lib/`, `hooks/`, `scripts/`, `config/`, or `schema.sql`. Everything derives
  from `CLAUDE_PROJECT_DIR`.
- **Parameterized SQL only.** Bind `?` placeholders; never interpolate values.
- **`node:sqlite` via `createRequire`.** Never `import` it directly.
- **English everywhere** in this repo (code, comments, docs, tests, commits).

## Runtime

**No runtime npm dependencies** (only Node ≥ 22). The `.ts` source is precompiled with
esbuild to committed `dist/*.mjs` bundles, which the hooks and commands run with plain
`node` (faster per-tool-call than re-stripping types every spawn). **Run `npm run build`
after changing any `hooks/`, `lib/`, or `scripts/` code and commit the updated `dist/`**;
CI fails if `dist/` is out of sync. `npm test` rebuilds automatically first.

## Development

```bash
npm install        # dev tooling (vitest, typescript, esbuild)
npm run build      # precompile dist/*.mjs (also runs before npm test)
npm test           # vitest run
npm run typecheck  # tsc --noEmit
npm run coverage   # coverage report
npm run mutation   # Stryker mutation testing (optional, slow)
```

Run `npm test` and `npm run typecheck` before opening a PR; keep the suite green.
When you change a user-facing string, update its asserting test in the same change.
See [`TESTING.md`](TESTING.md) for the test strategy.

## Commits

`type(scope): description` where type is one of
`feat | fix | refactor | test | docs | chore`. First line ≤ 72 chars.

## Pull requests

- One logical change per PR.
- Explain the *why*, not just the *what*.
- Confirm tests and typecheck pass, and note anything you could not verify.
