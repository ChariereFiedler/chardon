import type { ChardonDb } from "./db.ts";

/** Minimum repetition threshold to qualify as a toil loop. */
export const TOIL_MIN = 3;
/** Minimum repetition threshold to qualify as a retry storm. */
export const RETRY_MIN = 4;
/** Minimum read count to qualify as a cold read. */
export const COLD_MIN = 3;
/** Minimum count of the same failing Bash command to flag a failure cluster. */
export const FAIL_MIN = 3;
/** Minimum number of runs of the same command to consider it a slow drain. */
export const SLOW_MIN = 3;
/** Average duration (ms) at/above which a repeated command is "slow". */
export const SLOW_MS = 30_000;

export interface ToilLoop {
  cmd: string;
  count: number;
}

export interface FailingCommand {
  cmd: string;
  count: number;
}

export interface SlowCommand {
  cmd: string;
  count: number;
  avgMs: number;
}

export interface RetryStorm {
  file: string;
  count: number;
}

export interface ColdRead {
  file: string;
  count: number;
}

export interface Velocity {
  sessions: number;
  tools: number;
  failures: number;
}

/**
 * Detects repeated Bash commands beyond the `TOIL_MIN` threshold.
 * Commands listed in `exclusions` (exact match) are ignored.
 */
export function detectToilLoops(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
  exclusions: string[],
  min: number = TOIL_MIN,
): ToilLoop[] {
  const rows = db
    .prepare(
      `SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`,
    )
    .all(repo, `-${hoursBack}`, min) as unknown as ToilLoop[];

  if (exclusions.length === 0) return rows;
  const excluded = new Set(exclusions);
  return rows.filter((r) => !excluded.has(r.cmd));
}

/**
 * Detects the same Bash command failing (`success = 0`) at least `FAIL_MIN`
 * times within the window. Distinct from a toil loop, which ignores success.
 */
export function detectFailingCommands(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
  min: number = FAIL_MIN,
): FailingCommand[] {
  return db
    .prepare(
      `SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.success = 0
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`,
    )
    .all(repo, `-${hoursBack}`, min) as unknown as FailingCommand[];
}

/**
 * Detects the same Bash command run at least `SLOW_MIN` times with an average
 * duration >= `SLOW_MS`. Rows without `duration_ms` are ignored, so this yields
 * nothing until Claude Code reports command durations.
 */
export function detectSlowCommands(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
  minCount: number = SLOW_MIN,
  minMs: number = SLOW_MS,
): SlowCommand[] {
  return db
    .prepare(
      `SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count,
              AVG(e.duration_ms) AS avgMs
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.duration_ms IS NOT NULL
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ? AND avgMs >= ?
       ORDER BY avgMs DESC
       LIMIT 20`,
    )
    .all(repo, `-${hoursBack}`, minCount, minMs) as unknown as SlowCommand[];
}

/**
 * Detects files repeatedly edited/modified (retry storms).
 * Threshold: `RETRY_MIN` Edit or Bash events on the same file.
 */
export function detectRetryStorms(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
  min: number = RETRY_MIN,
): RetryStorm[] {
  return db
    .prepare(
      `SELECT json_extract(e.meta, '$.file') AS file,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool IN ('Edit', 'Bash')
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.file') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.file')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`,
    )
    .all(repo, `-${hoursBack}`, min) as unknown as RetryStorm[];
}

/**
 * Detects files read repeatedly without modification (cold reads).
 * Threshold: `COLD_MIN` Read events on the same file.
 */
export function detectColdReads(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
  min: number = COLD_MIN,
): ColdRead[] {
  return db
    .prepare(
      `SELECT json_extract(e.meta, '$.file') AS file,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Read'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.file') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.file')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`,
    )
    .all(repo, `-${hoursBack}`, min) as unknown as ColdRead[];
}

/** Minimum Edit/Write events in a session before "no test run" is a signal. */
export const EDIT_NO_TEST_MIN = 5;
/** Maximum sample commands returned by detectUnverifiedCommits. */
export const UNVERIFIED_SAMPLE_LIMIT = 5;
/** Redacted-command prefix identifying a commit among cmd_class 'git' events. */
const GIT_COMMIT_PREFIX = "git commit";

export interface EditedWithoutTests {
  sessionId: string;
  edits: number;
}

export interface UnverifiedCommits {
  count: number;
  sample: string[];
}

/**
 * Method signal: sessions with at least `minEdits` Edit/Write events and not a
 * single Bash event classified `test` or `typecheck` in the window.
 *
 * Relies on `meta.cmd_class`, written at collection time. Legacy events predate
 * that field, so a session is only judged when it holds at least one classified
 * Bash event (classify-era proof); older sessions are skipped silently.
 */
export function detectEditedWithoutTests(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
  minEdits: number = EDIT_NO_TEST_MIN,
): EditedWithoutTests[] {
  return db
    .prepare(
      `SELECT e.session_id AS sessionId,
              COUNT(*) AS edits
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool IN ('Edit', 'Write')
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
       GROUP BY e.session_id
       HAVING edits >= ?
          AND EXISTS (
            SELECT 1 FROM events c
            WHERE c.session_id = e.session_id
              AND c.tool = 'Bash'
              AND json_extract(c.meta, '$.cmd_class') IS NOT NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM events v
            WHERE v.session_id = e.session_id
              AND v.tool = 'Bash'
              AND json_extract(v.meta, '$.cmd_class') IN ('test', 'typecheck')
          )
       ORDER BY edits DESC
       LIMIT 20`,
    )
    .all(repo, `-${hoursBack}`, minEdits) as unknown as EditedWithoutTests[];
}

/**
 * Method signal: `git commit` runs (cmd_class 'git', redacted cmd starting with
 * "git commit") with no earlier successful cmd_class 'test' event in the same
 * session. Returns the count plus a bounded sample of the offending commands.
 *
 * Legacy events without `meta.cmd_class` never match the 'git' filter, so they
 * are skipped silently: only classify-era commits count.
 */
export function detectUnverifiedCommits(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
): UnverifiedCommits {
  const rows = db
    .prepare(
      `SELECT json_extract(e.meta, '$.cmd') AS cmd
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd_class') = 'git'
         AND json_extract(e.meta, '$.cmd') LIKE ? || '%'
         AND NOT EXISTS (
           SELECT 1 FROM events t
           WHERE t.session_id = e.session_id
             AND t.id < e.id
             AND t.tool = 'Bash'
             AND t.success = 1
             AND json_extract(t.meta, '$.cmd_class') = 'test'
         )
       ORDER BY e.id`,
    )
    .all(repo, `-${hoursBack}`, GIT_COMMIT_PREFIX) as unknown as { cmd: string }[];

  return {
    count: rows.length,
    sample: rows.slice(0, UNVERIFIED_SAMPLE_LIMIT).map((r) => r.cmd),
  };
}

/**
 * Computes velocity: number of sessions, tool calls, and failures
 * within the `hoursBack` time window.
 */
export function computeVelocity(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
): Velocity {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`,
    )
    .get(repo, `-${hoursBack}`) as Velocity | undefined;

  return row ?? { sessions: 0, tools: 0, failures: 0 };
}

/** Minimum number of distinct repos a command must span to be a cross-project candidate. */
export const CROSS_REPO_MIN = 2;

export interface CrossRepoCommand {
  cmd: string;
  repos: number;
  total: number;
}

/**
 * Cross-project signal ("Ronce Racine candidate"): a Bash command that recurs
 * (total >= `TOIL_MIN`) across at least `minRepos` distinct repos — a generic,
 * repo-portable friction worth a canonical rule/skill. Queries the whole DB, not
 * one repo. File-based frictions are excluded (their paths are repo-specific).
 */
export function detectCrossRepoCommands(
  db: ChardonDb,
  hoursBack: number,
  minRepos: number = CROSS_REPO_MIN,
): CrossRepoCommand[] {
  return db
    .prepare(
      `SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(DISTINCT s.repo) AS repos,
              COUNT(*) AS total
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING repos >= ? AND total >= ?
       ORDER BY repos DESC, total DESC
       LIMIT 20`,
    )
    .all(`-${hoursBack}`, minRepos, TOIL_MIN) as unknown as CrossRepoCommand[];
}

/** Returns the set of skill names invoked (Skill tool) within the window. */
export function detectSkillUsage(
  db: ChardonDb,
  repo: string,
  hoursBack: number,
): Set<string> {
  const rows = db
    .prepare(
      `SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`,
    )
    .all(repo, `-${hoursBack}`) as unknown as { skill: string }[];
  return new Set(rows.map((r) => r.skill));
}

/**
 * Number of distinct project roots (by stored root hash) sharing this repo
 * slug. Anything above 1 means two different directories with the same
 * basename are silently merging their metrics; the daily report surfaces it.
 * Legacy sessions without a hash are ignored (they cannot discriminate).
 */
export function detectSlugCollision(db: ChardonDb, repo: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT root_hash) AS roots
       FROM sessions
       WHERE repo = ? AND root_hash IS NOT NULL AND root_hash != ''`,
    )
    .get(repo) as { roots: number } | undefined;
  return row?.roots ?? 0;
}
