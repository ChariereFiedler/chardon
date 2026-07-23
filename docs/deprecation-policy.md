# Deprecation policy

What users can rely on across versions, and how breaking changes are announced.
Chardon follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html); this
page defines what "public" means for it.

## Public surfaces

These are the contracts a user or a project can depend on:

- **The `.chardon.json` format**: every key documented in the README's
  configuration table, its type and its default.
- **The database schema**: the tables and columns in `lib/schema.sql`. Users
  query `~/.claude/chardon.db` directly (the README encourages it), so the
  shape of stored data is a contract, not an implementation detail.
- **Command names**: the `/chardon-*` slash commands and their documented
  arguments.
- **Status-line CLI arguments**: the flags accepted by `dist/statusline.mjs`,
  since users wire that invocation into their own `settings.json`.

Everything else (module layout under `lib/`, internal function signatures,
report wording, hook internals) is internal and may change in any release.

## Additive first

The default for evolving a public surface is addition, never mutation:

- Schema changes are additive only (`CREATE TABLE IF NOT EXISTS`, new columns
  with defaults); existing columns are never renamed, retyped or dropped in a
  minor or patch release.
- New config keys get defaults that preserve the previous behavior; existing
  keys keep their meaning.
- New commands and new CLI flags may appear; existing ones keep working.

## Deprecation and removal

When a public surface must go away:

1. The deprecation is **announced in `CHANGELOG.md` at least one minor version
   before removal**, naming the surface, the replacement, and the version in
   which removal is planned.
2. While deprecated, the surface keeps working unchanged.
3. Removal happens no earlier than the announced version, and only in a major
   or minor release, never in a patch.
