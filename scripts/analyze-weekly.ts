import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { isMainModule } from "../lib/is-main.ts";

import { closeDb, openDb } from "../lib/db.ts";
import { loadConfig, repoSlug } from "../lib/config.ts";
import { aggregateWeek, buildWeeklyPrompt, callModel, type ModelFn, type WeekSummary } from "../lib/weekly.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of characters allowed in the LLM synthesis section. */
const SYNTHESIS_MAX_CHARS = 8000;

// ---------------------------------------------------------------------------
// Pure rendering (no I/O, no new Date())
// ---------------------------------------------------------------------------

/**
 * Renders a weekly Markdown report from pre-computed data.
 * Pure function: no DB access, no file I/O, no `new Date()`.
 *
 * @param weekEnd   ISO date string for the end of the week (YYYY-MM-DD).
 * @param summary   Aggregated week data.
 * @param synthesis LLM synthesis text, or null when the API key is absent.
 */
export function renderWeeklyReport(
  weekEnd: string,
  summary: WeekSummary,
  synthesis: string | null,
): string {
  const sections: string[] = [
    `# Weekly Workflow Report · ${summary.weekStart} → ${weekEnd}`,
    "",
    `**Repository:** ${summary.repo}`,
    "",
    "## Token usage",
    `- Input: ${summary.tokens.input}`,
    `- Output: ${summary.tokens.output}`,
    `- Cache read: ${summary.tokens.cacheRead}`,
  ];

  if (summary.tokenTrend) {
    const { thisWeek, lastWeek, pct } = summary.tokenTrend;
    const label = pct === null ? "n/a" : `${pct > 0 ? "+" : ""}${pct}%`;
    sections.push(`- Week-over-week: ${thisWeek} vs ${lastWeek} (${label})`);
  }
  sections.push("");

  if (summary.toil.length > 0) {
    sections.push("## Toil loops (repeated identical commands)");
    sections.push("| Command | Repetitions |");
    sections.push("|---|---|");
    for (const t of summary.toil) {
      sections.push(`| \`${t.cmd}\` | ${t.count} |`);
    }
    sections.push("");
  }

  if (summary.coldReads.length > 0) {
    sections.push("## Cold reads (files re-read often)");
    sections.push("| File | Reads |");
    sections.push("|---|---|");
    for (const c of summary.coldReads) {
      sections.push(`| \`${c.file}\` | ${c.count} |`);
    }
    sections.push("");
  }

  if (synthesis !== null) {
    const capped =
      synthesis.length > SYNTHESIS_MAX_CHARS
        ? `${synthesis.slice(0, SYNTHESIS_MAX_CHARS)}… (truncated)`
        : synthesis;
    sections.push("## AI synthesis");
    sections.push(capped);
    sections.push("");
  } else {
    sections.push("> Set ANTHROPIC_API_KEY to enable the weekly synthesis.");
    sections.push("");
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// ISO week label helper
// ---------------------------------------------------------------------------

/**
 * Returns the ISO week label `YYYY-Www` for a given date.
 * The ISO week year may differ from the calendar year near year boundaries.
 */
export function isoWeekLabel(date: Date): string {
  // Copy the date and set to the nearest Thursday (ISO weeks are defined by Thursday)
  const thursday = new Date(date.getTime());
  const day = date.getUTCDay(); // 0 = Sun, 4 = Thu
  // Shift to Thursday of the same week
  thursday.setUTCDate(date.getUTCDate() + (4 - (day === 0 ? 7 : day)));

  const year = thursday.getUTCFullYear();

  // Week number: days since Jan 4 of the ISO year (Jan 4 is always in week 1)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const weekNum =
    1 + Math.round((thursday.getTime() - jan4.getTime()) / (7 * 24 * 60 * 60 * 1000));

  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Orchestration (I/O: DB + file)
// ---------------------------------------------------------------------------

/**
 * Generates the full weekly report:
 * - opens the DB, aggregates the last 7 days via `aggregateWeek`
 * - builds the LLM prompt and calls the model (best-effort; null tolerated)
 * - renders via `renderWeeklyReport` (pure)
 * - writes `<outDir>/weekly-YYYY-Www.md` (recursive mkdir)
 *
 * `now` is injected — never calls `new Date()` internally.
 */
export async function generateWeeklyReport(opts: {
  projectDir: string;
  now: Date;
  model?: ModelFn;
}): Promise<{ path: string; markdown: string }> {
  const { projectDir, now, model = callModel } = opts;
  const config = loadConfig(projectDir);
  const repo = repoSlug(projectDir);

  const db = openDb();
  let markdown: string;
  try {
    const summary = aggregateWeek(db, repo, now);
    const prompt = buildWeeklyPrompt(summary);
    // Best-effort: a network/API failure must not break report generation.
    const synthesis = await model(prompt).catch(() => null);
    markdown = renderWeeklyReport(summary.weekEnd, summary, synthesis);
  } finally {
    closeDb(db);
  }

  const outDir = isAbsolute(config.outDir)
    ? config.outDir
    : join(projectDir, config.outDir);
  mkdirSync(outDir, { recursive: true });

  const weekLabel = isoWeekLabel(now);
  const outPath = join(outDir, `weekly-${weekLabel}.md`);
  writeFileSync(outPath, markdown, "utf-8");

  return { path: outPath, markdown };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (isMainModule("analyze-weekly")) {
  const { path } = await generateWeeklyReport({
    projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    now: new Date(),
  });
  console.log(path);
}
