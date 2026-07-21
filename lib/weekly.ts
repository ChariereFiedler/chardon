import type { ChardonDb } from "./db.ts";
import { detectToilLoops, detectColdReads } from "./patterns.ts";

/** A function that calls an LLM with a prompt and returns the text response or null. */
export type ModelFn = (prompt: string) => Promise<string | null>;

/** Number of hours in a week — used for the aggregation window. */
const WEEK_HOURS = 168;

/** Model backing the optional weekly synthesis; override with `CHARDON_MODEL`. */
const SYNTHESIS_MODEL = "claude-opus-4-8";
const SYNTHESIS_MAX_TOKENS = 4096;

export interface WeekSummary {
  repo: string;
  weekStart: string;
  weekEnd: string;
  toil: { cmd: string; count: number }[];
  coldReads: { file: string; count: number }[];
  tokens: { input: number; output: number; cacheRead: number };
  /** input+output totals for this vs the prior 7-day window; `pct` null when no prior data. */
  tokenTrend?: { thisWeek: number; lastWeek: number; pct: number | null };
}

/**
 * Aggregates the last 7 days of DB data into a WeekSummary.
 * `now` is used to compute the weekEnd timestamp (ISO date string).
 */
export function aggregateWeek(db: ChardonDb, repo: string, now: Date): WeekSummary {
  const weekEnd = now.toISOString().slice(0, 10);
  const hourMs = 60 * 60 * 1000;
  const weekStart = new Date(now.getTime() - WEEK_HOURS * hourMs).toISOString().slice(0, 10);
  const prevStart = new Date(now.getTime() - 2 * WEEK_HOURS * hourMs).toISOString().slice(0, 10);

  const toil = detectToilLoops(db, repo, WEEK_HOURS, []);
  const coldReads = detectColdReads(db, repo, WEEK_HOURS);

  // Window bounds derive from the injected `now`, bound as parameters — the DB
  // never recomputes its own notion of "now" (keeps aggregateWeek deterministic).
  const tokenRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`,
    )
    .get(repo, weekStart) as { input: number; output: number; cacheRead: number } | undefined;

  // Prior 7-day window (days 8–14) for a week-over-week trend.
  const prevRow = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`,
    )
    .get(repo, prevStart, weekStart) as { total: number } | undefined;

  const tokens = tokenRow ?? { input: 0, output: 0, cacheRead: 0 };
  const thisWeek = tokens.input + tokens.output;
  const lastWeek = prevRow?.total ?? 0;
  const pct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  return {
    repo,
    weekStart,
    weekEnd,
    toil,
    coldReads,
    tokens,
    tokenTrend: { thisWeek, lastWeek, pct },
  };
}

/**
 * Builds a deterministic prompt asking for a short synthesis and up to 3
 * concrete workflow improvements based on the given WeekSummary.
 * Pure function: no clock, no I/O.
 */
export function buildWeeklyPrompt(s: WeekSummary): string {
  const toilLines =
    s.toil.length > 0
      ? s.toil.map((t) => `  - "${t.cmd}" repeated ${t.count}x`).join("\n")
      : "  (none above threshold)";

  const coldLines =
    s.coldReads.length > 0
      ? s.coldReads.map((c) => `  - "${c.file}" read ${c.count}x`).join("\n")
      : "  (none above threshold)";

  const noFrictionNote =
    s.toil.length === 0 && s.coldReads.length === 0
      ? "\n> No toil loops or repeated cold reads detected this week — no friction to address.\n"
      : "";

  return `You are a software workflow analyst. Below is a one-week activity summary for the repository "${s.repo}" (${s.weekStart} → ${s.weekEnd}).
${noFrictionNote}
## Toil loops (repeated identical Bash commands)
${toilLines}

## Cold reads (files read repeatedly without modification)
${coldLines}

## Token usage
- Input tokens:      ${s.tokens.input}
- Output tokens:     ${s.tokens.output}
- Cache read tokens: ${s.tokens.cacheRead}

Based on this data, provide:
1. A short synthesis (2-3 sentences) describing the main workflow patterns observed.
2. Up to 3 concrete, actionable workflow improvements the developer could adopt to reduce toil and improve efficiency.

Be specific: reference the actual commands and files listed above where relevant.`;
}

/**
 * Calls the Claude API with the given prompt and returns the text response.
 * Returns null if ANTHROPIC_API_KEY is unset or the SDK is not installed.
 * The @anthropic-ai/sdk package is optional — import failure is silently handled.
 */
export async function callModel(prompt: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // Use a variable to prevent TypeScript from resolving the optional package
  // at compile time — the SDK may not be installed (optionalDependencies).
  const sdkId = "@anthropic-ai/sdk";
  let mod: any;
  try {
    mod = await import(/* @vite-ignore */ sdkId);
  } catch {
    // SDK not installed — feature is optional
    return null;
  }
  const Anthropic = mod.default;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: process.env.CHARDON_MODEL ?? SYNTHESIS_MODEL,
      max_tokens: SYNTHESIS_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    return (
      res.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n") || null
    );
  } catch {
    // Network/API failure must not break report generation — degrade to no synthesis.
    return null;
  }
}
