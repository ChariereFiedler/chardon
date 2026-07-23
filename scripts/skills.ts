/**
 * /chardon-skills: mines recurring work procedures from the events history and
 * proposes skills for them. Drafting goes through `claude -p` when available
 * (lib/skill-writer.ts); otherwise the deterministic skeleton is delivered.
 * Proposals persist as `infer-skill` actions so the existing
 * apply/measure/drop loop covers them.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMainModule } from "../lib/is-main.ts";
import { closeDb, openDb } from "../lib/db.ts";
import { loadConfig, repoSlug } from "../lib/config.ts";
import { persistActions, recordSkeleton, severityFor } from "../lib/improve.ts";
import { mineProcedures, renderProcedureSkeleton, type ProcedureCandidate } from "../lib/procedures.ts";
import { draftSkill, type ClaudeRunner } from "../lib/skill-writer.ts";
import { listInstalledSkills, skillSlug } from "../lib/skills.ts";

/** Where a proposed skill should be installed, by scope. */
const INSTALL_TARGETS = { local: ".claude/skills/", global: "~/.claude/skills/" } as const;

interface ProposalResult {
  candidate: ProcedureCandidate;
  name: string;
  path: string;
  mode: "drafted" | "skeleton";
}

/** Pure summary render (data to string). */
export function renderSkillsReport(
  proposals: ProposalResult[],
  skippedInstalled: string[],
): string {
  const lines: string[] = ["# Chardon Skill Proposals", ""];
  if (proposals.length === 0 && skippedInstalled.length === 0) {
    lines.push("No new recurring procedure detected. Work a few more sessions and retry.");
    return lines.join("\n");
  }
  for (const p of proposals) {
    const target = INSTALL_TARGETS[p.candidate.scope];
    lines.push(
      `- **${p.name}** (${p.candidate.scope}, ${p.candidate.supportSessions} session(s), ${p.mode})`,
      `  procedure: ${p.candidate.signature}`,
      `  file: ${p.path}`,
      `  install to: ${target}${p.name}/SKILL.md`,
    );
  }
  for (const name of skippedInstalled) {
    lines.push(`- ${name}: already installed, nothing to propose.`);
  }
  if (proposals.length === 0) {
    lines.push("", "No new recurring procedure to propose.");
  }
  return lines.join("\n");
}

/**
 * Mines, drafts and persists skill proposals for the current project.
 * Every option is injectable for tests; defaults fit the CLI entry.
 */
export function runSkillInference(opts: {
  projectDir: string;
  now: Date;
  homeDir?: string;
  runner?: ClaudeRunner;
  env?: NodeJS.ProcessEnv;
}): { summary: string; proposals: number } {
  const { projectDir, now } = opts;
  const repo = repoSlug(projectDir);
  const config = loadConfig(projectDir);
  const inventory = new Set(listInstalledSkills(projectDir, opts.homeDir));

  const db = openDb();
  try {
    // Only patterns this repo contributed to; a fresh signature only.
    const candidates = mineProcedures(db, now)
      .filter((c) => c.repos.includes(repo))
      .filter(
        (c) =>
          db
            .prepare(`SELECT 1 FROM actions WHERE repo = ? AND kind = 'infer-skill' AND target = ?`)
            .get(repo, c.signature) === undefined,
      );

    const proposals: ProposalResult[] = [];
    const skippedInstalled: string[] = [];
    for (const candidate of candidates) {
      const target = INSTALL_TARGETS[candidate.scope];
      const drafted = draftSkill(candidate, target, { runner: opts.runner, env: opts.env });
      const name = drafted?.name ?? `procedure-${skillSlug(candidate.signature)}`;
      if (inventory.has(name)) {
        skippedInstalled.push(name);
        continue;
      }
      const markdown = drafted?.markdown ?? renderProcedureSkeleton(candidate);

      const dir = join(config.outDir, "proposed");
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `skill-${skillSlug(candidate.signature)}.md`);
      if (!existsSync(path)) writeFileSync(path, markdown, "utf-8");

      recordSkeleton(db, repo, {
        skill: name,
        patternType: "recurring_procedure",
        target: candidate.signature,
        baseline: candidate.supportSessions,
        path,
      });
      persistActions(db, repo, [
        {
          kind: "infer-skill",
          target: candidate.signature,
          patternType: "recurring_procedure",
          baseline: candidate.supportSessions,
          severity: severityFor(candidate.supportSessions),
        },
      ]);
      proposals.push({ candidate, name, path, mode: drafted ? "drafted" : "skeleton" });
    }

    return { summary: renderSkillsReport(proposals, skippedInstalled), proposals: proposals.length };
  } finally {
    closeDb(db);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (isMainModule("skills")) {
  const { summary } = runSkillInference({
    projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    now: new Date(),
  });
  console.log(summary);
}
