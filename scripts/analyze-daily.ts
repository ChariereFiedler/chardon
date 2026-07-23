import { mkdirSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { isMainModule } from "../lib/is-main.ts";

import { closeDb, openDb, readHealth } from "../lib/db.ts";
import { loadConfig, repoSlug } from "../lib/config.ts";
import {
  computeVelocity,
  detectToilLoops,
  detectColdReads,
  detectRetryStorms,
  detectSlugCollision,
  type RetryStorm,
} from "../lib/patterns.ts";
import { detectTokenDrift, estimateCostUsd } from "../lib/token-parser.ts";

/** Analysis window in hours. */
const ANALYSIS_WINDOW_HOURS = 24;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DailyReportData {
  date: string;
  velocity: { sessions: number; tools: number; failures: number };
  toil: { cmd: string; count: number }[];
  coldReads: { file: string; count: number }[];
  retryStorms: RetryStorm[];
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheRead: number;
    cacheCreation: number;
    drift: boolean;
    costUsd?: number;
  };
  health?: { ok: number; failed: number; lastError?: string | null };
  /** Repo slug, used by the slug-collision warning. */
  repo?: string;
  /** Distinct project roots seen for this slug (collision when above 1). */
  slugRoots?: number;
}

// ---------------------------------------------------------------------------
// Pure rendering (no I/O, no new Date())
// ---------------------------------------------------------------------------

/**
 * Transforms metric data into a Markdown report.
 * Pure function: no DB access, no file I/O, no `new Date()`.
 */
export function renderDailyReport(data: DailyReportData): string {
  const { date, velocity, toil, coldReads, retryStorms, tokens } = data;
  const health = data.health ?? { ok: 0, failed: 0 };
  const hasPatterns = toil.length > 0 || coldReads.length > 0 || retryStorms.length > 0;

  const sections: string[] = [
    `# Dev Metrics · ${date}`,
    "",
    "## Velocity",
    `- ${velocity.sessions} session(s) · ${velocity.tools} tool calls · ${velocity.failures} failure(s)`,
    "",
  ];

  // Tokens section
  sections.push("## Tokens");
  const cost = tokens.costUsd !== undefined ? ` · ~$${tokens.costUsd.toFixed(2)} (est.)` : "";
  sections.push(
    `input ${tokens.inputTokens} · output ${tokens.outputTokens} · cache read ${tokens.cacheRead} · cache creation ${tokens.cacheCreation}${cost}`,
  );
  if (tokens.drift) {
    sections.push("⚠️ cache efficiency drift");
  }
  sections.push("");

  // Collection health: makes silent fail-open failures visible.
  sections.push("## Collection health");
  sections.push(
    health.failed > 0
      ? `⚠ ${health.failed} silent collection failure(s) today (${health.ok} ok): run with CHARDON_DEBUG=1 to see them`
      : `🟢 healthy: ${health.ok} write(s) recorded, 0 failures`,
  );
  if (health.failed > 0 && health.lastError) {
    sections.push(`last error: ${health.lastError}`);
  }
  if (data.slugRoots !== undefined && data.slugRoots > 1 && data.repo) {
    sections.push(
      `⚠ ${data.slugRoots} different project roots share the repo slug '${data.repo}': their metrics are merged. Set "repoName" in .chardon.json to separate them.`,
    );
  }
  sections.push("");

  if (!hasPatterns) {
    sections.push("## Frictions", "", "No friction detected, clean session. 🟢", "");
  } else {
    sections.push("## Detected frictions", "");

    if (toil.length > 0) {
      sections.push("### Toil loops (same command repeated)");
      sections.push("| Command | Repetitions |");
      sections.push("|---|---|");
      for (const t of toil) {
        sections.push(`| \`${t.cmd}\` | ${t.count} |`);
      }
      sections.push("");
    }

    if (coldReads.length > 0) {
      sections.push("### Cold reads (file re-read often → memory/skill candidate)");
      sections.push("| File | Reads |");
      sections.push("|---|---|");
      for (const c of coldReads) {
        sections.push(`| \`${c.file}\` | ${c.count} |`);
      }
      sections.push("");
    }

    if (retryStorms.length > 0) {
      sections.push("### Retry storms (same file edited repeatedly)");
      sections.push("| File | Edits |");
      sections.push("|---|---|");
      for (const r of retryStorms) {
        sections.push(`| \`${r.file}\` | ${r.count} |`);
      }
      sections.push("");
    }
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Orchestration (I/O: DB + file)
// ---------------------------------------------------------------------------

/**
 * Generates the full daily report:
 * - opens the DB, computes velocity + patterns over `ANALYSIS_WINDOW_HOURS`
 * - calls `renderDailyReport` (pure)
 * - writes to `<outDir>/daily-YYYY-MM-DD.md` (recursive mkdir)
 *
 * The date is supplied via `now` (injected) — never `new Date()` internally.
 */
export async function generateDailyReport(opts: {
  projectDir: string;
  now: Date;
}): Promise<{ path: string; markdown: string }> {
  const { projectDir, now } = opts;
  const config = loadConfig(projectDir);
  const repo = repoSlug(projectDir);
  const date = now.toISOString().slice(0, 10);

  /** Worktree suffix pattern: matches `/-wt-<digits>` at end of dir name. */
  const WORKTREE_SUFFIX = /-wt-\d+$/;

  // Determine worktree origin for token drift detection.
  // Must derive from basename(projectDir), not the slug (which strips the suffix).
  const origin: "main" | "worktree" = WORKTREE_SUFFIX.test(basename(projectDir))
    ? "worktree"
    : "main";

  const db = openDb();
  let markdown: string;
  try {
    const velocity = computeVelocity(db, repo, ANALYSIS_WINDOW_HOURS);
    const toil = detectToilLoops(db, repo, ANALYSIS_WINDOW_HOURS, config.toilExclusions, config.thresholds.toilMin);
    const coldReads = detectColdReads(db, repo, ANALYSIS_WINDOW_HOURS, config.thresholds.coldMin);
    const retryStorms = detectRetryStorms(db, repo, ANALYSIS_WINDOW_HOURS, config.thresholds.retryMin);

    // Sum today's token_usage rows for this project's repo+origin.
    const tokenRow = db
      .prepare(
        `SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`,
      )
      .get(repo, origin, date) as {
      inputTokens: number;
      outputTokens: number;
      cacheRead: number;
      cacheCreation: number;
    };

    const { drift } = detectTokenDrift(db, repo, origin, date);

    const tokens = {
      inputTokens: tokenRow.inputTokens,
      outputTokens: tokenRow.outputTokens,
      cacheRead: tokenRow.cacheRead,
      cacheCreation: tokenRow.cacheCreation,
      drift,
      costUsd: estimateCostUsd({
        input: tokenRow.inputTokens,
        output: tokenRow.outputTokens,
        cacheRead: tokenRow.cacheRead,
        cacheCreation: tokenRow.cacheCreation,
      }),
    };

    const health = readHealth(db, repo, date);
    const slugRoots = detectSlugCollision(db, repo);
    markdown = renderDailyReport({ date, velocity, toil, coldReads, retryStorms, tokens, health, repo, slugRoots });
  } finally {
    closeDb(db);
  }

  const outDir = isAbsolute(config.outDir)
    ? config.outDir
    : join(projectDir, config.outDir);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `daily-${date}.md`);
  writeFileSync(outPath, markdown, "utf-8");

  return { path: outPath, markdown };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (isMainModule("analyze-daily")) {
  try {
    const { path } = await generateDailyReport({
      projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
      now: new Date(),
    });
    console.log(path);
  } catch (err) {
    // A corrupted or unreadable DB must yield a clean one-line error, not an
    // uncaught stack trace. The message names the operation and the cause.
    const cause = err instanceof Error ? err.message : String(err);
    console.error(`analyze-daily: cannot generate the report: ${cause}`);
    process.exit(1);
  }
}
