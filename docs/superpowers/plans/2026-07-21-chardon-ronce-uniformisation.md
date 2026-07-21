# Uniformisation Chardon / Ronce Racine

Date: 2026-07-21. Spans two repositories: `~/lab/claude-cadran` (Chardon) and
`~/lab/claude-rules` (Ronce Racine).

## Intent

Make the two projects share one architecture, taking the better half from each side rather
than aligning downward:

- **Chardon adopts Ronce Racine's structure**: a `tools/` directory, manifest validators
  wired into `npm test`, a doc-code parity check, `prepare` / `prepublishOnly` lifecycle
  scripts.
- **Ronce Racine adopts Chardon's test tooling**: Vitest instead of the bespoke runner,
  Stryker instead of the hand-declared mutation table.

## What must stay different, and why

| Point | Chardon | Ronce Racine | Reason |
|---|---|---|---|
| `dist/` in git | **committed** | gitignored, built by `prepare` | A Claude Code marketplace install runs no `npm install`, so `prepare` never fires. Gitignoring `dist/` would ship a broken plugin. |
| Distribution | `/plugin` marketplace | npm package | Different channels, different lifecycle hooks. |

This divergence is deliberate. Do not "fix" it.

## Phase 1 — Chardon: manifest validators (highest value)

The three manifest defects found on 2026-07-21 (`author` as string, `hooks` declared and
duplicated, `statusLine` silently ignored) were all detectable mechanically. None was caught
because nothing validated the manifests.

- Add `tools/validate.ts` running, and failing on:
  - `claude plugin validate .` (exit non-zero on error; warnings surfaced)
  - `plugin.json` / `marketplace.json` / `hooks/hooks.json` parse as JSON
  - every command referenced in `commands/*.md` resolves to a file in `dist/`
  - every hook command in `hooks/hooks.json` resolves to a file in `dist/`
- Wire into `npm test` before Vitest, and into CI.

**Verify**: reintroduce each of the three known defects one at a time; the validator must
fail on each.

## Phase 2 — Chardon: doc-code parity

The README drifted on the test count, on "stable on Node 24", on the perf figures, and
claimed a status line the plugin cannot provide.

- Extend `tools/validate.ts` with a `docs` mode checking mechanically verifiable claims:
  - the test count quoted in `README.md` matches the Vitest run
  - every `/chardon-*` command named in docs exists in `commands/`
  - every config key and env var documented exists in `config/chardon.default.json`
    or is referenced in `lib|scripts|hooks`
  - no `${CLAUDE_PLUGIN_ROOT}` path in docs points at a missing `dist/` file

**Verify**: bump a number in the README; the check must fail.

## Phase 3 — Chardon: structure alignment

- `scripts/build.mjs` → `tools/build.mjs` (keep esbuild, keep bundling, keep committed `dist/`).
  Kept as `.mjs` rather than renamed to `.ts`: it is a plain ESM build script with no types
  to strip, and renaming it would be cargo-culting Ronce Racine's extension rather than its
  structure. `scripts/` keeps the runtime entry points, which are product code.
- Add `prepublishOnly` running build + full test suite
- Keep `scripts/` for the runtime entry points (`analyze-daily`, `statusline`, …), which are
  product code, not tooling. Only build/validation tooling moves to `tools/`.

**Verify**: `npm run build && git diff --exit-code -- dist` stays green; the bench is unchanged.

## Phase 4 — Ronce Racine: Vitest migration

Scope measured: 7 files under `tests/`, 87 cases, 1306 lines, plus per-skill
`skills/*/scripts/*.test.ts`.

- Map the bespoke API onto Vitest: `test` → `it`, `assert`/`contains`/`absent` → `expect`.
  Keep the domain fixtures (`hook`, `builtHook`, `freshRepo`, `initWork`, `WORK`) as plain
  helpers, they are not runner-specific.
- Point `vitest.config.ts` at both `tests/**/*.test.ts` and `skills/**/scripts/*.test.ts`.
- Delete `tools/tests.ts` once parity is proven.

**Verify**: the same 87 cases pass under Vitest, and the count matches before deletion.

## Phase 5 — Ronce Racine: Stryker

Replace the 229-line hand-declared `MUTATIONS` table with Stryker over `hooks/` and
`install.ts`, as Chardon does.

**Verify**: Stryker kills at least the mutants the hand-written table covered. Record the
score as the new floor.

## Phase 6 — Ronce Racine: evaluate esbuild

`tools/build.ts` currently uses `typescript.transpileModule` file by file. Chardon bundles
with esbuild and measures ~56 ms per hook spawn.

Measure before deciding: build Ronce Racine's hooks both ways, run its own documented
benchmark (the header of `tools/build.ts` quotes 527 / 99 / 38 ms), and keep whichever wins.
Bundling may not pay off here, since its hooks import few siblings.

**Verify**: numbers recorded in the build header, replacing the current ones if they change.

## Outcome

**Phases 1 to 3 (Chardon), done.** `tools/validate.ts` checks the manifests and the
mechanically verifiable doc claims, wired into `pretest` and CI. Each of the seven checks was
proven by reintroducing the defect it targets. `scripts/build.mjs` moved to `tools/`.

**Phase 4 (Vitest), done.** 96 cases across 11 files, exact parity with the bespoke runner
before deleting it. Two findings:

- `WORK` was derived from `process.argv[1]`, which identified the file under the old
  one-process-per-file runner but is the Vitest binary now. Every file would have shared one
  scratch directory. It now comes from Vitest's own test path.
- Files must run **sequentially** (`fileParallelism: false`). These tests spawn the real CLI
  and hooks against shared repo state, and running them concurrently made them race.

**Phase 5 (Stryker), revised by measurement.** Stryker does **not** replace
`tools/mutations.ts`, it complements it. Stryker instruments code in memory, so it only sees
modules a test imports directly; a test that spawns a subprocess runs the original file from
disk. Measured: every subprocess-tested file scored 0% with all mutants uncovered, while
`tools/eval.ts`, which tests import, scored 79%. Both harnesses are now wired, each on the
code it can actually reach. Overall score 43.65%, but **92.80% on covered mutants**.

**Phase 6 (esbuild), answered structurally then measured.** Ronce Racine's eight hooks have
**zero sibling imports**, so bundling has nothing to inline. Measured: a built hook spawns in
33.4 ms against a bare-node floor of 25.0 ms, versus 88.0 ms running the TypeScript source.
`transpileModule` stays; esbuild would buy nothing.

**Incident, caused and fixed.** Running the files in parallel made `playground/setup.ts` fail
its fixture cleanup; `git init` then failed and git walked up to the real checkout, landing
six `fix(cart)` fixture commits and 600+ junk files in Ronce Racine's history. Nothing was
pushed. The branch was rebuilt from the clean base, and `setup.ts` now sets
`GIT_CEILING_DIRECTORIES` so git can never escape the fixtures directory again (verified: it
resolved to the repo root without the guard, and refuses with it).

## Order

Phases 1 and 2 first: they are cheap, they protect against the class of bug that shipped
today, and they are independent of everything else. Phase 3 is cosmetic. Phases 4 to 6 are
the larger, riskier half and touch a repo that is already published on npm, so they should
land one at a time with the suite green between each.
