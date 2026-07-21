# Software Industrialization Audit Report

**Project:** chardon · **Date:** 2026-07-07 · **Global score: 1.8/4 — Managed**

> Weighted global score across 7 scored domains (Perf Frontend excluded — entirely N/A).
> **Important nuance:** several domains are pulled down by questions that are
> *structurally out of scope* for a local single-user tool (no deployed service, no SLA,
> no multi-tenancy). The genuinely *scored* gaps are few but pointed — see the action plan.
> Excluding those N/A questions, effective maturity is closer to "Defined" (~2.4).

## Project profile
- **Type:** Claude Code plugin / CLI-library tool (fail-open hooks + analysis scripts). No web UI, no server backend.
- **Language:** TypeScript run via `node --experimental-strip-types` (Node ≥22, no build step, no required runtime dependency).
- **Architecture:** modular monolith ~1550 LOC (`hooks/` → `lib/` → `scripts/`), local SQLite (`~/.claude/chardon.db`).
- **CI/CD:** GitHub Actions (typecheck + test, Node 22 & 24). **Distribution:** plugin marketplace / local install (no Docker/K8s).

## Executive summary
chardon shows **remarkable test maturity** (172 tests, Stryker mutation testing,
fast-check property-based tests, fail-open verified via real subprocesses) and **strong
architectural discipline** (linear dependency graph, pure/impure separation, injected
clock, documented invariants). The gaps concentrate on three axes: **an active security
vulnerability** (shell command injection via `.chardon.json`), **the absence of data
lifecycle governance** (no retention/purge — the database grew unbounded), and **minimal
CI/quality tooling** (no linter, no security/dependency scan, coverage/mutation not run in
CI). None of these are structural; all are addressable, most as quick wins. *(The security,
retention, and CI gaps were fixed right after the audit — see the follow-up section.)*

## Maturity radar
```
Testing        ████████████████░░░░  3.2
Architecture   ███████████░░░░░░░░░░  2.2
Quality        ██████████░░░░░░░░░░░  2.1
CI/CD          ███████░░░░░░░░░░░░░░  1.5
Security       ███████░░░░░░░░░░░░░░  1.4
Compliance     ██████░░░░░░░░░░░░░░░  1.3
Observability  ██░░░░░░░░░░░░░░░░░░░  0.5  (2 questions scored / 15 — rest N/A)
Perf Frontend  ────────────────────  N/A  (no frontend — excluded from score)
```

## Scores by domain
| Domain | Score | Scored questions | Weight | Level |
|--------|-------|------------------|--------|-------|
| Testing | 3.2/4 | 6/13 | 1.2 | Controlled |
| Architecture | 2.2/4 | 16/74 | 1.0 | Defined |
| Quality (QA 1.8 + Data 2.6) | 2.1/4 | 21/28 | 1.0 | Defined |
| CI/CD | 1.5/4 | 7/10 | 1.0 | Managed |
| Security | 1.4/4 | 6/16 | 1.5 | Managed |
| Compliance | 1.3/4 | 16/29 | 1.0 | Managed |
| Observability | 0.5/4 | 2/15 | 1.0 | Initial |
| Perf Frontend | N/A | 0/29 | — | Excluded |

**Global = Σ(score × weight) / Σ(weight) = 13.5 / 7.7 = 1.8/4 (Managed).**

## Priority gaps

### 🔴 Critical — top priority
- **Shell command injection (RCE)** — `scripts/statusline.ts` interpolated
  `config.gitlab.projectId` and `token` (from the target repo's **committed** `.chardon.json`,
  therefore untrusted) directly into an `execSync("curl ...")` run every 30s. A hostile repo
  or a PR editing `.chardon.json` could execute arbitrary code. **Fix:** `execFileSync("curl",
  [...args])` (no shell) + validate `projectId` against `^\d+$`. *(SE-05/off-grid: MUST now)*

### 🟠 Scored gaps (real)
- **No data retention / lifecycle policy** — `events`, `token_usage`, `patterns`, `actions`
  grew unbounded; no TTL, purge, VACUUM, or right-to-erasure. *(QU-08, CO-03, DG-07 = 0)*
- **8 `npm audit` vulnerabilities** (2 critical, devDeps) with no CI scan/gate, no
  Dependabot/Renovate. *(QA-07, SE-09)*
- **No linter/formatter** (no ESLint/Prettier/Biome) — only TS strict + manual discipline. *(QA-06)*
- **No per-field sensitivity classification** although the internal `secure-logging` rule
  requires it. *(DG-06)*
- **Coverage & mutation not run in CI** — a mutation-score regression is invisible between
  local runs. *(te-09, QA-01)*
- **Fail-open blind spot** — every `catch {}` swallows the error with no trace, even in debug;
  a collection bug is invisible. Documented but not tooled. *(ob-09)*
- **DB `0644`** (world-readable on a shared machine) instead of `0600`. *(SE-02)*
- **No schema migration mechanism** (additive-only, by convention). *(DG-03, AR-07)*
- **No Git tag** despite `version 0.1.0` + CHANGELOG. *(ci-08)*

### 🟡 Hardening (COULD)
- GitHub Actions pinned by `@v4` tag (not SHA), no restricted `permissions:`. *(ci-10)*
- `readTailLines` reads the whole transcript into RAM on each refresh (no seek). *(status-line perf)*
- No formal ADRs (decisions live in `docs/superpowers/plans/`). *(AR-01)*
- `callModel` had no local `try/catch` (resilience delegated to the caller). *(te-05)*

## Action plan

### Quick wins (< 1 day)
1. **[MUST]** Fix the shell injection in `statusline.ts` (`execFileSync` + `^\d+$` validation). *(SE: 1.4→~2.0)*
2. **[MUST]** Add an `npm audit --omit=dev` step (or Dependabot) in CI. *(QA-07/SE-09: 1→2)*
3. **[SHOULD]** `chmod 0600` on `~/.claude/chardon.db` at creation. *(SE-02: 1→2)*
4. **[SHOULD]** Add a minimal linter (Biome or ESLint flat config) + `lint` script. *(QA-06: 1→2)*
5. **[SHOULD]** `gitleaks detect` CI step (complements app-level redaction). *(QA-11)*
6. **[SHOULD]** Pin actions by SHA + `permissions: contents: read` in `ci.yml`. *(ci-10: 1→2)*
7. **[SHOULD]** Local `try/catch` around `callModel` (`lib/weekly.ts`). *(te-05: 2→3)*
8. **[SHOULD]** Create tag `v0.1.0` + a release job from the CHANGELOG. *(ci-08: 1→2)*

### Short term (1-3 months)
9. **[MUST]** Retention policy: purge `events`/`sessions` older than N days + `VACUUM`, plus a documented `npm run chardon:purge` (right to erasure). *(QU-08/CO-03/DG-07: 0→2)*
10. **[MUST]** Per-field sensitivity classification in `schema.sql`/`architecture.md`. *(DG-06: 1→2)*
11. **[SHOULD]** `coverage` + `mutation` CI job (at least on `main`, non-blocking). *(te-09: 2→3)*
12. **[SHOULD]** `CHARDON_DEBUG=1` flag → messages on **stderr** in each `catch` (never changing `exit(0)`). *(ob-09: 0→2)*
13. **[SHOULD]** A `schema_version` table/column (read, not compared) to prepare migrations. *(DG-03/AR-07: 1→3)*

### Mid term (3-6 months)
14. Fitness function: a test that fails if `schema.sql` contains `ALTER`/`DROP`. *(AR-07)*
15. Extract 2-3 short ADRs (`docs/adr/`) from `architecture.md`. *(AR-01)*
16. `readTailLines`: real bounded read (offset from `statSync().size`). *(perf)*
17. In-DB hook-failure counter, surfaced in the weekly report. *(ob-09)*

### Vision (6-12 months)
18. Populate `ticket_metrics` (already planned for v1.1).
19. Wire the ROI apply/measure loop to a command (`/chardon-apply`).

## Impact projection
| Domain | Current | After quick wins + short term |
|--------|---------|-------------------------------|
| Security | 1.4 | ~2.6 |
| Quality | 2.1 | ~2.9 |
| Compliance | 1.3 | ~2.3 |
| CI/CD | 1.5 | ~2.4 |
| Observability | 0.5 | ~1.8 |
| Testing | 3.2 | ~3.5 |
| Architecture | 2.2 | ~2.7 |
| **Global** | **1.8** | **~2.5 (Defined)** |

## Follow-up — fixes applied (2026-07-07)
Right after the audit, the following priority gaps were fixed and merged to `main`:
- 🔴→✅ **Shell injection** (`statusline.ts`): `execFileSync` with no shell + `^\d+$` validation of `projectId` (test `isValidProjectId`).
- ✅ **DB `0600`** at creation (`lib/db.ts`).
- ✅ **Retention**: `/chardon-purge` command + `retentionDays` (90d) + `VACUUM` (`lib/retention.ts`, `scripts/purge.ts`).
- ✅ **Sensitivity classification** per field documented in `lib/schema.sql` (Public/Internal, no secrets).
- ✅ **CI hardening**: `permissions: contents: read`, `npm audit --omit=dev` gate, Dependabot (npm + github-actions).
- ✅ **Resilience**: local `try/catch` around `callModel` (`lib/weekly.ts`).

Still open (not in this batch): linter/formatter (Biome/ESLint), coverage/mutation in CI,
`CHARDON_DEBUG` (fail-open blind spot), SHA-pinned actions, `v0.1.0` tag, `schema_version`, ADRs.
Projected score after this batch: Security ~2.4, Compliance ~2.1, Quality ~2.4, CI/CD ~2.0 → **global ~2.1**.

## Non-auditable items
- Real GitHub configuration (branch protection, required reviews, platform secret scanning, Scorecard) — no access to github.com from the local audit.
- Real CI pipeline duration, organizational DORA metrics (solo, single-branch project).
- Behavior on a multi-user machine (umask), effective token rotation on the end-user side.
- Anthropic's retention policy on the weekly summaries sent via the API (outside the project's code).
- Result of a third-party pentest / bug bounty (none conducted).

## Appendix
### Method
Automated audit via 8 domain subagents (`audit-*` skills), 0-4 maturity model, 214 reference
questions. Each level is justified by code analysis / an executed command.
### Domains N/A by construction (local tool, no deployed service)
Scalability, HA/DR (RPO/RTO), availability/SLA, runtime incident management, operational
observability (RED/USE metrics, tracing, on-call alerting), frontend performance, containers.
These exclusions are a **tracked choice** tied to the profile, not audit gaps.
