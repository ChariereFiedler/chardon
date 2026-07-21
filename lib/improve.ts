import type { ChardonDb } from "./db.ts";
import type { Thresholds } from "./config.ts";
import { detectToilLoops, detectColdReads, detectRetryStorms, detectFailingCommands, detectSlowCommands, detectSkillUsage } from "./patterns.ts";

export type Severity = "high" | "medium" | "low";

/** Friction count threshold for high severity. */
export const SEV_HIGH = 8;
/** Friction count threshold for medium severity. */
export const SEV_MEDIUM = 4;

/**
 * Maps a friction `patternType` to the skill that best addresses it.
 * A recurring mapped friction with no matching Skill event in the window
 * yields a `consider-skill` proposal (deduped by skill name).
 */
const FRICTION_SKILL_MAP: Record<string, string> = {
  failure_cluster: "systematic-debugging",
  retry_storm: "recurring-bug-root-cause",
};

export interface ProposedAction {
  kind: string;
  target: string;
  patternType: string;
  baseline: number;
  severity: Severity;
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
export function actionHint(kind: string, target: string): string {
  switch (kind) {
    case "automate-command":
      return `run less often, or add \`${target}\` to \`toilExclusions\` / script it`;
    case "fix-failing-command":
      return `\`${target}\` fails every run — fix or guard it instead of rerunning`;
    case "speed-up-command":
      return `\`${target}\` is slow — cache, scope, or parallelize it`;
    case "split-or-summarize":
      return `summarize \`${target}\` into a memory note so it isn't re-read`;
    case "investigate-file":
      return `\`${target}\` is edited repeatedly — find the root cause`;
    case "consider-skill":
      return `invoke the \`${target}\` skill next time this friction appears`;
    case "reduce-token-spend":
      return `trim context: large re-reads and long transcripts drive spend`;
    case "investigate-token-growth":
      return `token use jumped week-over-week — check for context churn`;
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
 */
export function proposeActions(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
  tokenCtx?: TokenContext,
  thresholds?: Thresholds,
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

  // Suggest a skill for any mapped friction that fired without its skill being used.
  // Detectors return rows ordered by count DESC, so the first mapped friction for a
  // given skill carries the highest count — the baseline the suggestion inherits.
  const usedSkills = detectSkillUsage(db, repo, hoursBack);
  const suggested = new Set<string>();
  for (const action of [...actions]) {
    const skill = FRICTION_SKILL_MAP[action.patternType];
    if (!skill || usedSkills.has(skill) || suggested.has(skill)) continue;
    suggested.add(skill);
    actions.push({
      kind: "consider-skill",
      target: skill,
      patternType: "uncovered_friction",
      baseline: action.baseline,
      severity: severityFor(action.baseline),
    });
  }

  return actions;
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
