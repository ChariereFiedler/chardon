import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ChardonDb } from "./db.ts";
import { repoSlug, transcriptSlug } from "./config.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Multiplier above the 7-day median that triggers a drift alert. */
const DRIFT_FACTOR = 2;

/** Number of past days used to compute the median ratio (lookback window). */
const DRIFT_WINDOW_DAYS = 7;

/** Worktree suffix pattern: a project dir ending in `-wt-<digits>` is a worktree. */
const WORKTREE_SUFFIX = /-wt-\d+$/;

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface DayUsage {
  date: string;
  origin: "main" | "worktree";
  repo: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreation: number;
  nbMessages: number;
  nbSessions: number;
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/**
 * Root directory where Claude Code stores per-project transcript folders.
 * Override with `CHARDON_PROJECTS_DIR` for tests or non-standard setups.
 */
export function projectsDir(): string {
  return process.env.CHARDON_PROJECTS_DIR ?? join(homedir(), ".claude", "projects");
}

// ---------------------------------------------------------------------------
// Transcript parsing
// ---------------------------------------------------------------------------

/** Parses a JSONL transcript file and returns aggregated tokens and message counts per calendar day. */
function parseJsonlFile(
  filePath: string,
): Array<{ date: string; inputTokens: number; outputTokens: number; cacheRead: number; cacheCreation: number; messages: number }> {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const byDay = new Map<string, { inputTokens: number; outputTokens: number; cacheRead: number; cacheCreation: number; messages: number }>();

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== "assistant") continue;

    const message = entry.message as Record<string, unknown> | undefined;
    if (!message?.usage) continue;

    const timestamp = entry.timestamp as string | undefined;
    if (!timestamp) continue;

    const usage = message.usage as Record<string, unknown>;
    const date = timestamp.slice(0, 10);

    let row = byDay.get(date);
    if (!row) {
      row = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, messages: 0 };
      byDay.set(date, row);
    }

    row.inputTokens += (usage.input_tokens as number) ?? 0;
    row.outputTokens += (usage.output_tokens as number) ?? 0;
    row.cacheRead += (usage.cache_read_input_tokens as number) ?? 0;
    row.cacheCreation += (usage.cache_creation_input_tokens as number) ?? 0;
    row.messages += 1;
  }

  return Array.from(byDay.entries()).map(([date, row]) => ({ date, ...row }));
}

/** Recursively collects all `*.jsonl` files under a directory. */
function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(full);
      } else if (entry.isDirectory()) {
        files.push(...findJsonlFiles(full));
      }
    }
  } catch {
    // Directory missing or permission denied — return what we have.
  }
  return files;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads all JSONL transcripts for `projectDir` and returns token usage
 * aggregated by calendar day (UTC date from each entry's `timestamp`).
 *
 * The transcript directory is `projectsDir()/<transcriptSlug(projectDir)>/`.
 * `origin` is `"worktree"` when `basename(projectDir)` matches `/-wt-\d+$/`,
 * otherwise `"main"`.
 * `repo` is `repoSlug(projectDir)` (basename without worktree suffix).
 */
export function aggregateTranscripts(projectDir: string): DayUsage[] {
  const origin: "main" | "worktree" = WORKTREE_SUFFIX.test(basename(projectDir))
    ? "worktree"
    : "main";
  const repo = repoSlug(projectDir);

  const transcriptDir = join(projectsDir(), transcriptSlug(projectDir));
  const files = findJsonlFiles(transcriptDir);

  // Accumulate per-day totals across all session files in a single pass.
  const byDay = new Map<
    string,
    { inputTokens: number; outputTokens: number; cacheRead: number; cacheCreation: number; nbMessages: number; sessions: Set<string> }
  >();

  for (const file of files) {
    const dayEntries = parseJsonlFile(file);
    for (const entry of dayEntries) {
      let row = byDay.get(entry.date);
      if (!row) {
        row = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreation: 0, nbMessages: 0, sessions: new Set() };
        byDay.set(entry.date, row);
      }
      row.inputTokens += entry.inputTokens;
      row.outputTokens += entry.outputTokens;
      row.cacheRead += entry.cacheRead;
      row.cacheCreation += entry.cacheCreation;
      row.nbMessages += entry.messages;
      row.sessions.add(file);
    }
  }

  return Array.from(byDay.entries()).map(([date, row]) => ({
    date,
    origin,
    repo,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheRead: row.cacheRead,
    cacheCreation: row.cacheCreation,
    nbMessages: row.nbMessages,
    nbSessions: row.sessions.size,
  }));
}

/**
 * Upserts `DayUsage` rows into the `token_usage` table.
 * Idempotent on the `(date, origin, repo)` primary key.
 */
export function upsertTokenUsage(db: ChardonDb, rows: DayUsage[]): void {
  const stmt = db.prepare(`
    INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, origin, repo) DO UPDATE SET
      input_tokens   = excluded.input_tokens,
      output_tokens  = excluded.output_tokens,
      cache_read     = excluded.cache_read,
      cache_creation = excluded.cache_creation,
      nb_messages    = excluded.nb_messages,
      nb_sessions    = excluded.nb_sessions
  `);
  for (const row of rows) {
    stmt.run(
      row.date,
      row.origin,
      row.repo,
      row.inputTokens,
      row.outputTokens,
      row.cacheRead,
      row.cacheCreation,
      row.nbMessages,
      row.nbSessions,
    );
  }
}

/**
 * Rough USD price per 1M tokens (Sonnet-tier estimate). Real cost depends on the
 * model mix, which `token_usage` does not record — treat the result as an estimate.
 */
export const PRICE_PER_M = { input: 3, output: 15, cacheRead: 0.3, cacheCreation: 3.75 };

/** Estimates USD cost for a day's token counts using `PRICE_PER_M`. */
export function estimateCostUsd(u: {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}): number {
  return (
    (u.input * PRICE_PER_M.input +
      u.output * PRICE_PER_M.output +
      u.cacheRead * PRICE_PER_M.cacheRead +
      u.cacheCreation * PRICE_PER_M.cacheCreation) /
    1_000_000
  );
}

/**
 * Sums `input_tokens + output_tokens` from `token_usage` for one repo/origin/day.
 * Parameterized; returns 0 when there is no row.
 */
export function tokensForDay(
  db: ChardonDb,
  repo: string,
  origin: "main" | "worktree",
  date: string,
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`,
    )
    .get(repo, origin, date) as { total: number } | undefined;
  return row?.total ?? 0;
}

/**
 * Compares today's `cache_read / output_tokens` ratio against the
 * `DRIFT_WINDOW_DAYS`-day median for a specific repo+origin pair.
 * Returns `drift: true` when the ratio exceeds `DRIFT_FACTOR × median`.
 */
export function detectTokenDrift(
  db: ChardonDb,
  repo: string,
  origin: "main" | "worktree",
  today: string,
): { drift: boolean; ratio: number; median: number } {
  const rows = db
    .prepare(
      `SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`,
    )
    // +1 so today is included in the fetched window, then excluded from history
    .all(repo, origin, today, DRIFT_WINDOW_DAYS + 1) as unknown as Array<{
    date: string;
    cache_read: number;
    output_tokens: number;
  }>;

  const todayRow = rows.find((r) => r.date === today);
  const ratio =
    todayRow && todayRow.output_tokens > 0
      ? todayRow.cache_read / todayRow.output_tokens
      : 0;

  const history = rows
    .filter((r) => r.date !== today && r.output_tokens > 0)
    .map((r) => r.cache_read / r.output_tokens)
    .sort((a, b) => a - b);

  let median = 0;
  if (history.length > 0) {
    const mid = Math.floor(history.length / 2);
    median =
      history.length % 2 === 0
        ? (history[mid - 1] + history[mid]) / 2
        : history[mid];
  }

  return { drift: median > 0 && ratio > DRIFT_FACTOR * median, ratio, median };
}
