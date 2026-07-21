# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-07-10

Initial release: event collection (4 fail-open hooks → SQLite), token-cost parsing,
daily and weekly reports, a live status line, and the improvement loop
(detect → propose → measure ROI). Slash commands: `/chardon-daily`,
`/chardon-weekly`, `/chardon-improve`.

### Changed
- Hooks and the status line now run with `node --experimental-strip-types`
  instead of `npx tsx`. The plugin has **no runtime npm dependencies** and needs
  no install step — only Node ≥ 22. Relative imports use the `.ts` extension.

### Fixed
- Stop-hook crash (`no such column: repo`): CLI-entry guards now match the invoked
  filename instead of `import.meta.url`, which esbuild collapses to the host bundle's
  URL — so a bundled entry (`analyze-daily` inside `dist/stop.mjs`) no longer runs its
  CLI block outside the hook's fail-open path.
- Self-healing schema reconciliation: a `token_usage` table created before `repo`
  joined its primary key is rebuilt on open (existing rows kept, unscoped), instead of
  every write failing against the missing column.

### Performance
- Hooks/commands now run **precompiled `dist/*.mjs` bundles** (esbuild) via plain
  `node`, instead of type-stripping the `.ts` source on every spawn — roughly a 2–3×
  reduction in per-tool-call latency. Bundles are committed (consumers still build
  nothing); `npm run build` regenerates them and CI checks `dist/` is in sync.

### Added
- Open-source packaging: MIT `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CHANGELOG.md`, and a GitHub Actions CI workflow (Node 22 & 24).
- Improvement-loop proposals from previously unexploited signals: `fix-failing-command`
  (a Bash command failing repeatedly), `speed-up-command` (a slow recurring command),
  and `consider-skill` (a friction a known skill would address, used without it).
- Cost visibility: the status line flags token usage over the daily budget (`⚠`), and
  the weekly report shows a week-over-week token trend.
- Token-cost proposals in the improve digest: `reduce-token-spend` (daily budget
  exceeded) and `investigate-token-growth` (week-over-week growth past a threshold).
- Self-tuning improvement loop: proposals measured as ineffective (or dropped) are no
  longer re-proposed, and a previously-fixed friction that returns is flagged as a
  **regression** in the digest.
- Cross-project **Ronce Racine candidate** signal: a Bash command recurring across
  multiple repos is surfaced as a candidate for a canonical rule/skill.
- Data retention: a `/chardon-purge` command (and `retentionDays` config, default 90)
  removes history older than the window and compacts the database.
- Tooling: a Biome linter (`npm run lint`, gated in CI) and a `PRAGMA user_version`
  schema-version stamp for detecting future non-additive drift.

### Security
- **Removed a command-injection vector** in the status-line GitLab collector: the
  project id (from a project's committed `.chardon.json`) is validated (`^\d+$`) and
  the request runs via `execFileSync` with no shell. The database file is now created
  `0600` (owner-only). CI restricts `permissions` and gates `npm audit` on runtime
  dependencies; Dependabot tracks dev/action updates.
