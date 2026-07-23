import type { ChardonDb } from "./db.ts";
import { safeRegex, type SkillMap, type SkillMapRule, type Thresholds } from "./config.ts";
import { detectToilLoops, detectColdReads, detectRetryStorms, detectFailingCommands, detectSlowCommands, detectSkillUsage, detectEditedWithoutTests, detectUnverifiedCommits, detectCrossRepoCommands } from "./patterns.ts";

export type Severity = "high" | "medium" | "low";

/** Friction count threshold for high severity. */
export const SEV_HIGH = 8;
/** Friction count threshold for medium severity. */
export const SEV_MEDIUM = 4;

/**
 * Built-in friction-to-skill mappings, used when no `skillMap` is supplied.
 * Mirrors `skillMap` in `config/chardon.default.json`: a recurring mapped
 * friction with no matching Skill event in the window yields a
 * `consider-skill` proposal (deduped by skill name).
 */
const DEFAULT_SKILL_MAP: SkillMap = {
  failure_cluster: "systematic-debugging",
  retry_storm: "systematic-debugging",
  edited_without_tests: "test-driven-development",
  unverified_commit: "verification-before-completion",
};

/** Reserved `skillMap` key holding command-regex rules for failure clusters. */
const ON_FAIL_KEY = "onFail";

/**
 * Compiles the vetted `onFail` rules of a skillMap. The map comes from a
 * committed `.chardon.json` (untrusted): a rule whose `match` fails the
 * `safeRegex` vetting, or whose shape is malformed, is silently ignored.
 */
function compileOnFailRules(skillMap: SkillMap): { regex: RegExp; skill: string }[] {
  const raw = skillMap[ON_FAIL_KEY];
  if (!Array.isArray(raw)) return [];
  const rules: { regex: RegExp; skill: string }[] = [];
  for (const entry of raw as Partial<SkillMapRule>[]) {
    if (entry === null || typeof entry !== "object") continue;
    if (typeof entry.match !== "string" || typeof entry.skill !== "string") continue;
    const regex = safeRegex(entry.match);
    if (regex) rules.push({ regex, skill: entry.skill });
  }
  return rules;
}

/** Friction the proposal derives from (kept so a create-skill skeleton can cite it). */
export interface FrictionSource {
  patternType: string;
  target: string;
}

export interface ProposedAction {
  kind: string;
  target: string;
  patternType: string;
  baseline: number;
  severity: Severity;
  /** Set on `create-skill` proposals only: the underlying friction. */
  source?: FrictionSource;
}

/** Maps a friction count to a severity band using named thresholds. */
export function severityFor(count: number): Severity {
  if (count >= SEV_HIGH) return "high";
  if (count >= SEV_MEDIUM) return "medium";
  return "low";
}

/** Percentage severity band (used by token proposals, whose baseline is a %). */
export const PCT_HIGH = 100;
export const PCT_MEDIUM = 50;
function severityForPct(pct: number): Severity {
  if (pct >= PCT_HIGH) return "high";
  if (pct >= PCT_MEDIUM) return "medium";
  return "low";
}

/** Pattern types whose `baseline` is a percentage rather than a count. */
const PCT_PATTERN_TYPES = new Set(["over_budget", "token_growth"]);

/**
 * Severity for a proposal, honoring the baseline's unit: percentage bands for
 * token proposals, count bands otherwise. Use this wherever severity is derived
 * from a persisted `(patternType, baseline)` — the `actions` table stores no severity.
 */
export function severityForProposal(patternType: string, baseline: number): Severity {
  return PCT_PATTERN_TYPES.has(patternType) ? severityForPct(baseline) : severityFor(baseline);
}

/** Week-over-week token growth (%) at/above which growth is worth investigating. */
export const TREND_ALERT_PCT = 50;

/**
 * A concrete next step for a proposal `kind`, given its `target`. Recomputed at
 * render time from the persisted `(kind, target)` so proposals are actionable
 * without storing the hint. Empty string for unknown kinds.
 */
export function actionHint(kind: string, target: string, baseline?: number): string {
  switch (kind) {
    case "automate-command":
      return `run less often, or add \`${target}\` to \`toilExclusions\` / script it`;
    case "fix-failing-command":
      return `\`${target}\` fails every run: fix or guard it instead of rerunning`;
    case "speed-up-command":
      return `\`${target}\` is slow: cache, scope, or parallelize it`;
    case "split-or-summarize":
      return `summarize \`${target}\` into a memory note so it isn't re-read`;
    case "investigate-file":
      return `\`${target}\` is edited repeatedly: find the root cause`;
    case "consider-skill":
      return `invoke the \`${target}\` skill next time this friction appears`;
    case "create-skill":
      return `no installed skill covers this friction: draft a \`${target}\` skill from the skeleton`;
    case "promote-to-canonical":
      return `recurs across ${baseline ?? "several"} repos: promote a shared rule or skill`;
    case "reduce-token-spend":
      return `trim context: large re-reads and long transcripts drive spend`;
    case "investigate-token-growth":
      return `token use jumped week-over-week: check for context churn`;
    case "run-tests-after-edits":
      return `session \`${target}\` edited a lot without a test run: run the suite before moving on`;
    case "verify-before-commit":
      return `\`${target}\` ran with no prior passing test: run the tests before committing`;
    default:
      return "";
  }
}

/** Live token facts a caller supplies so proposeActions can add token proposals. */
export interface TokenContext {
  budget: number;
  tokensToday: number;
  trendPct: number | null;
}

/**
 * Detects frictions in the DB for `repo` over the past `hoursBack` hours
 * and returns a list of proposed actions (not yet persisted).
 * When `tokenCtx` is supplied, budget/trend token proposals are added too.
 *
 * `skillMap` (defaults to the built-in mappings) drives the skill suggestions;
 * `installedSkills` grounds them: a mapped skill absent from a NON-empty
 * inventory is requalified as `create-skill`. An empty or missing inventory
 * keeps the plain `consider-skill` behavior on purpose: an inventory scan that
 * failed (or found nothing) must not requalify every suggestion blindly.
 */
export function proposeActions(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
  tokenCtx?: TokenContext,
  thresholds?: Thresholds,
  skillMap: SkillMap = DEFAULT_SKILL_MAP,
  installedSkills?: readonly string[],
): ProposedAction[] {
  const actions: ProposedAction[] = [];

  for (const loop of detectToilLoops(db, repo, hoursBack, [], thresholds?.toilMin)) {
    actions.push({
      kind: "automate-command",
      target: loop.cmd,
      patternType: "toil_loop",
      baseline: loop.count,
      severity: severityFor(loop.count),
    });
  }

  for (const read of detectColdReads(db, repo, hoursBack, thresholds?.coldMin)) {
    actions.push({
      kind: "split-or-summarize",
      target: read.file,
      patternType: "cold_read",
      baseline: read.count,
      severity: severityFor(read.count),
    });
  }

  for (const storm of detectRetryStorms(db, repo, hoursBack, thresholds?.retryMin)) {
    actions.push({
      kind: "investigate-file",
      target: storm.file,
      patternType: "retry_storm",
      baseline: storm.count,
      severity: severityFor(storm.count),
    });
  }

  for (const fail of detectFailingCommands(db, repo, hoursBack, thresholds?.failMin)) {
    actions.push({
      kind: "fix-failing-command",
      target: fail.cmd,
      patternType: "failure_cluster",
      baseline: fail.count,
      severity: severityFor(fail.count),
    });
  }

  for (const slow of detectSlowCommands(db, repo, hoursBack, thresholds?.slowMin, thresholds?.slowMs)) {
    actions.push({
      kind: "speed-up-command",
      target: slow.cmd,
      patternType: "slow_command",
      baseline: slow.count,
      severity: severityFor(slow.count),
    });
  }

  for (const session of detectEditedWithoutTests(db, repo, hoursBack)) {
    actions.push({
      kind: "run-tests-after-edits",
      target: session.sessionId,
      patternType: "edited_without_tests",
      baseline: session.edits,
      severity: severityFor(session.edits),
    });
  }

  const unverified = detectUnverifiedCommits(db, repo, hoursBack);
  if (unverified.count > 0) {
    actions.push({
      kind: "verify-before-commit",
      // Fixed marker target: dedupe applies to the habit, not one commit.
      target: "git commit",
      patternType: "unverified_commit",
      baseline: unverified.count,
      severity: severityFor(unverified.count),
    });
  }

  if (tokenCtx && tokenCtx.budget > 0 && tokenCtx.tokensToday > tokenCtx.budget) {
    const overagePct = Math.round(((tokenCtx.tokensToday - tokenCtx.budget) / tokenCtx.budget) * 100);
    actions.push({
      kind: "reduce-token-spend",
      target: "daily-tokens",
      patternType: "over_budget",
      baseline: overagePct,
      severity: severityForPct(overagePct),
    });
  }

  if (tokenCtx && tokenCtx.trendPct !== null && tokenCtx.trendPct >= TREND_ALERT_PCT) {
    actions.push({
      kind: "investigate-token-growth",
      target: "weekly-tokens",
      patternType: "token_growth",
      baseline: tokenCtx.trendPct,
      severity: severityForPct(tokenCtx.trendPct),
    });
  }

  // Cross-project signal: a command recurring across repos becomes a persistable
  // action in the current repo (baseline = repo count), so the digest's dedupe,
  // apply/measure loop and self-tuning cover it like any other proposal.
  for (const cross of detectCrossRepoCommands(db, hoursBack)) {
    actions.push({
      kind: "promote-to-canonical",
      target: cross.cmd,
      patternType: "cross_repo",
      baseline: cross.repos,
      severity: severityFor(cross.repos),
    });
  }

  // Suggest a skill for any mapped friction that fired without its skill being used.
  // Detectors return rows ordered by count DESC, so the first mapped friction for a
  // given skill carries the highest count (the baseline the suggestion inherits).
  // `onFail` command-regex rules refine failure clusters ahead of the patternType entry.
  const onFailRules = compileOnFailRules(skillMap);
  const skillForFriction = (action: ProposedAction): string | undefined => {
    if (action.patternType === "failure_cluster") {
      const rule = onFailRules.find((r) => r.regex.test(action.target));
      if (rule) return rule.skill;
    }
    const mapped = skillMap[action.patternType];
    return typeof mapped === "string" ? mapped : undefined;
  };

  const usedSkills = detectSkillUsage(db, repo, hoursBack);
  const inventory = installedSkills && installedSkills.length > 0 ? new Set(installedSkills) : null;
  const suggested = new Set<string>();
  for (const action of [...actions]) {
    const skill = skillForFriction(action);
    if (!skill || usedSkills.has(skill) || suggested.has(skill)) continue;
    suggested.add(skill);
    const missing = inventory !== null && !inventory.has(skill);
    actions.push({
      kind: missing ? "create-skill" : "consider-skill",
      target: skill,
      patternType: "uncovered_friction",
      baseline: action.baseline,
      severity: severityFor(action.baseline),
      ...(missing ? { source: { patternType: action.patternType, target: action.target } } : {}),
    });
  }

  return actions;
}

/**
 * Records the skeleton file generated for a `create-skill` proposal as a
 * `patterns` row (one per `proposal_path`; re-runs do not duplicate), so the
 * digest can show `skeleton: <path>` next to the proposal.
 */
export function recordSkeleton(
  db: ChardonDb,
  repo: string,
  entry: { skill: string; patternType: string; target: string; baseline: number; path: string },
): void {
  const existing = db
    .prepare(`SELECT COUNT(*) AS cnt FROM patterns WHERE repo = ? AND proposal_path = ?`)
    .get(repo, entry.path) as { cnt: number };
  if (existing.cnt > 0) return;
  db.prepare(
    `INSERT INTO patterns (repo, cadence, pattern_type, score, context, proposal_path)
     VALUES (?, 'daily', ?, ?, ?, ?)`,
  ).run(repo, entry.patternType, entry.baseline, JSON.stringify({ target: entry.target, skill: entry.skill }), entry.path);
}

/** Maps each skill named in a recorded skeleton to its file path, for `repo`. */
export function skeletonPaths(db: ChardonDb, repo: string): Record<string, string> {
  const rows = db
    .prepare(
      `SELECT context, proposal_path AS path
       FROM patterns
       WHERE repo = ? AND proposal_path IS NOT NULL
       ORDER BY id`,
    )
    .all(repo) as { context: string; path: string }[];
  const paths: Record<string, string> = {};
  for (const row of rows) {
    try {
      const skill = (JSON.parse(row.context) as { skill?: unknown }).skill;
      if (typeof skill === "string") paths[skill] = row.path;
    } catch {
      // Malformed context (hand-edited row): skip it.
    }
  }
  return paths;
}

/**
 * Persists proposed actions to the `actions` table, skipping a (repo, kind, target)
 * that is already open (`proposed`/`applied`), was `dropped` by the user, or was
 * `measured` without effect (`after_metric >= baseline`, i.e. it never helped). An
 * effective past fix that later regresses is NOT suppressed — it can be re-proposed.
 * Returns the number of rows inserted.
 */
export function persistActions(
  db: ChardonDb,
  repo: string,
  actions: ProposedAction[],
): number {
  const checkStmt = db.prepare(
    `SELECT COUNT(*) AS cnt
     FROM actions
     WHERE repo = ?
       AND kind = ?
       AND target = ?
       AND (
         status IN ('proposed', 'applied', 'dropped')
         OR (status = 'measured' AND after_metric IS NOT NULL AND after_metric >= baseline)
       )`,
  );

  const insertStmt = db.prepare(
    `INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
     VALUES (?, ?, ?, ?, ?, 'proposed')`,
  );

  let inserted = 0;
  for (const action of actions) {
    const row = checkStmt.get(repo, action.kind, action.target) as { cnt: number };
    if (row.cnt > 0) continue;
    insertStmt.run(repo, action.kind, action.target, action.patternType, action.baseline);
    inserted++;
  }

  return inserted;
}

/**
 * Returns all open actions (`proposed` or `applied`) for `repo`.
 */
export function openActions(
  db: ChardonDb,
  repo: string,
): { id: number; kind: string; target: string; patternType: string; baseline: number; status: string }[] {
  return db
    .prepare(
      `SELECT id,
              kind,
              target,
              pattern_type AS patternType,
              baseline,
              status
       FROM actions
       WHERE repo = ?
         AND status IN ('proposed', 'applied')
       ORDER BY id`,
    )
    .all(repo) as { id: number; kind: string; target: string; patternType: string; baseline: number; status: string }[];
}
