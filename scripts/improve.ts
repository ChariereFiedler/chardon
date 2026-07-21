import { basename } from "node:path";
import { isMainModule } from "../lib/is-main.ts";

import { closeDb, openDb } from "../lib/db.ts";
import { loadConfig, repoSlug } from "../lib/config.ts";
import {
  proposeActions,
  persistActions,
  openActions,
  actionHint,
  severityForProposal,
  type ProposedAction,
  type Severity,
  type TokenContext,
} from "../lib/improve.ts";
import { roiSummary, detectRegressions } from "../lib/roi.ts";
import { detectCrossRepoCommands } from "../lib/patterns.ts";
import { tokensForDay } from "../lib/token-parser.ts";
import { aggregateWeek } from "../lib/weekly.ts";

// ---------------------------------------------------------------------------
// Severity icon map (named constant, not magic strings inline)
// ---------------------------------------------------------------------------

const SEVERITY_ICON: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "⚪",
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImproveDigestData {
  proposals: ProposedAction[];
  regressions?: { kind: string; target: string; baseline: number; current: number }[];
  crossRepo?: { cmd: string; repos: number }[];
  open: { id: number; kind: string; target: string; status: string }[];
  roi: { kind: string; target: string; delta: number }[];
}

// ---------------------------------------------------------------------------
// Pure rendering (no I/O, no new Date())
// ---------------------------------------------------------------------------

/**
 * Renders the improvement digest as Markdown.
 * Pure function: no DB access, no file I/O, no `new Date()`.
 */
export function renderImproveDigest(d: ImproveDigestData): string {
  const { proposals, open, roi } = d;
  const regressions = d.regressions ?? [];
  const isEmpty =
    proposals.length === 0 &&
    regressions.length === 0 &&
    (d.crossRepo ?? []).length === 0 &&
    open.length === 0 &&
    roi.length === 0;

  if (isEmpty) {
    return "No improvements to show — no friction detected yet.";
  }

  const sections: string[] = ["# Chardon Improve Digest", ""];

  // Prioritized proposals
  sections.push("## Prioritized Proposals", "");
  if (proposals.length === 0) {
    sections.push("No proposals.", "");
  } else {
    for (const p of proposals) {
      const icon = SEVERITY_ICON[p.severity] ?? "⚪";
      sections.push(`- ${icon} **${p.kind}** → \`${p.target}\` (baseline: ${p.baseline})`);
      const hint = actionHint(p.kind, p.target);
      if (hint) sections.push(`  ↳ ${hint}`);
    }
    sections.push("");
  }

  // Regressions: previously-fixed frictions that came back.
  if (regressions.length > 0) {
    sections.push("## Regressions", "");
    for (const r of regressions) {
      sections.push(`- ⚠️ **${r.kind}** → \`${r.target}\` regressed (now ${r.current}, baseline was ${r.baseline})`);
    }
    sections.push("");
  }

  // Cross-project candidates: a command recurring across repos → canonical rule/skill.
  const crossRepo = d.crossRepo ?? [];
  if (crossRepo.length > 0) {
    sections.push("## Cross-project candidates (Ronce Racine)", "");
    for (const c of crossRepo) {
      sections.push(`- 🌿 \`${c.cmd}\` recurs across ${c.repos} repos → consider a canonical rule/skill`);
    }
    sections.push("");
  }

  // Open actions
  sections.push("## Open Actions", "");
  if (open.length === 0) {
    sections.push("No open actions.", "");
  } else {
    for (const a of open) {
      sections.push(`- \`#${a.id}\` [${a.status}] **${a.kind}** → \`${a.target}\``);
    }
    sections.push("");
  }

  // Measured ROI
  sections.push("## Measured ROI", "");
  if (roi.length === 0) {
    sections.push("No measured ROI yet.", "");
  } else {
    for (const r of roi) {
      sections.push(`- **${r.kind}** → \`${r.target}\`: friction reduced by **${r.delta}**`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Orchestration (I/O: DB)
// ---------------------------------------------------------------------------

/**
 * Opens the DB, persists fresh proposals, reads open actions + ROI summary,
 * renders the digest, and closes the DB.
 */
export async function runImprove(opts: {
  projectDir: string;
  hoursBack: number;
  now?: Date;
}): Promise<{ digest: string }> {
  const { projectDir, hoursBack, now } = opts;
  const repo = repoSlug(projectDir);

  const db = openDb();
  let digest: string;
  try {
    const config = loadConfig(projectDir);
    // Token proposals need the daily budget + live token facts, available only
    // when a clock is supplied (CLI passes `new Date()`).
    let tokenCtx: TokenContext | undefined;
    if (now) {
      const origin: "main" | "worktree" = /-wt-\d+$/.test(basename(projectDir)) ? "worktree" : "main";
      const today = now.toISOString().slice(0, 10);
      const tokensToday = tokensForDay(db, repo, origin, today);
      const trendPct = aggregateWeek(db, repo, now).tokenTrend?.pct ?? null;
      tokenCtx = { budget: config.tokenBudgetPerDay, tokensToday, trendPct };
    }
    persistActions(db, repo, proposeActions(db, repo, hoursBack, tokenCtx, config.thresholds));
    const allOpen = openActions(db, repo);
    const open = allOpen.map((a) => ({
      id: a.id,
      kind: a.kind,
      target: a.target,
      status: a.status,
    }));
    const roi = roiSummary(db, repo).map((r) => ({
      kind: r.kind,
      target: r.target,
      delta: r.delta,
    }));
    const regressions = detectRegressions(db, repo, hoursBack).map((r) => ({
      kind: r.kind,
      target: r.target,
      baseline: r.baseline,
      current: r.current,
    }));
    // Cross-project signal spans all repos, not just this one.
    const crossRepo = detectCrossRepoCommands(db, hoursBack).map((c) => ({ cmd: c.cmd, repos: c.repos }));
    // Derive proposals from open actions tagged 'proposed' for the digest
    const proposals = allOpen
      .filter((a) => a.status === "proposed")
      .map((a) => ({
        kind: a.kind,
        target: a.target,
        patternType: a.patternType,
        baseline: a.baseline,
        severity: severityForProposal(a.patternType, a.baseline) as Severity,
      }));
    digest = renderImproveDigest({ proposals, regressions, crossRepo, open, roi });
  } finally {
    closeDb(db);
  }

  return { digest };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (isMainModule("improve")) {
  const { digest } = await runImprove({
    projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    hoursBack: 24,
    now: new Date(),
  });
  console.log(digest);
}
