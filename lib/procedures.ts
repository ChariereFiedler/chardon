/**
 * Procedure mining: discovers recurring work sequences (ordered steps repeated
 * across sessions) from the events history, the raw material for inferred
 * skill proposals. Pure logic over the DB; no file or network I/O.
 */

import { basename, dirname } from "node:path";
import type { ChardonDb } from "./db.ts";
import { skillSlug } from "./skills.ts";

/** How far back mining looks. */
export const MINING_WINDOW_DAYS = 14;

/** A pattern must appear in at least this many distinct sessions. */
export const MIN_SUPPORT_SESSIONS = 3;

/** Pattern length bounds (steps). */
export const MIN_PATTERN_LENGTH = 3;
export const MAX_PATTERN_LENGTH = 6;

/** Real example sequences kept per candidate. */
const MAX_EXAMPLES = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const STEP_SEPARATOR = " > ";

export interface ProcedureCandidate {
  /** Steps joined by " > ", the stable identity of the pattern. */
  signature: string;
  steps: string[];
  supportSessions: number;
  /** Distinct repos supporting the pattern, sorted. */
  repos: string[];
  /** `global` when the pattern spans two or more repos. */
  scope: "local" | "global";
  /** supportSessions x pattern length; proposals are ordered by it. */
  score: number;
  /** Up to MAX_EXAMPLES real display sequences (redacted commands, files). */
  examples: string[][];
}

interface NormalizedStep {
  step: string;
  display: string;
}

/**
 * Maps one event to a mining step, or null when the event does not describe
 * work (reads, greps) or predates command classification (legacy rows).
 * Bash events use their cmd_class; edits use the parent directory so the
 * pattern generalizes across files of one area.
 */
function normalizeStep(tool: string, meta: { cmd?: string; cmd_class?: string; file?: string }): NormalizedStep | null {
  if (tool === "Bash") {
    // `other` carries no procedural signal and floods every pattern with noise
    // (verified on real data: 50+ `other > other > git` shaped proposals).
    if (!meta.cmd_class || meta.cmd_class === "other") return null;
    return { step: meta.cmd_class, display: meta.cmd ?? meta.cmd_class };
  }
  if ((tool === "Edit" || tool === "Write") && meta.file) {
    return { step: `edit@${basename(dirname(meta.file))}`, display: meta.file };
  }
  return null;
}

/**
 * Mines recurring procedures from the last MINING_WINDOW_DAYS of events, all
 * repos included (cross-repo patterns are the best global-skill candidates,
 * like the existing Ronce Racine signal). Returns closed patterns only: a
 * sub-pattern is dropped when a longer candidate carries the same support.
 */
export function mineProcedures(db: ChardonDb, now: Date): ProcedureCandidate[] {
  const cutoff = new Date(now.getTime() - MINING_WINDOW_DAYS * MS_PER_DAY).toISOString();
  const rows = db
    .prepare(
      `SELECT e.session_id AS sessionId, s.repo AS repo, e.tool AS tool, e.meta AS meta
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.ts >= ?
       ORDER BY e.session_id, e.id`,
    )
    .all(cutoff) as { sessionId: string; repo: string; tool: string; meta: string }[];

  // Rebuild each session's ordered step sequence.
  const sessions = new Map<string, { repo: string; steps: NormalizedStep[] }>();
  for (const row of rows) {
    let meta: { cmd?: string; cmd_class?: string; file?: string };
    try {
      meta = JSON.parse(row.meta ?? "{}");
    } catch {
      continue;
    }
    const normalized = normalizeStep(row.tool, meta);
    if (!normalized) continue;
    const session = sessions.get(row.sessionId) ?? { repo: row.repo, steps: [] };
    // Collapse consecutive identical steps: editing six files of one directory
    // in a row is one `edit@dir` step, not a six-step procedure.
    if (session.steps[session.steps.length - 1]?.step !== normalized.step) {
      session.steps.push(normalized);
    }
    sessions.set(row.sessionId, session);
  }

  // Count each distinct n-gram once per session.
  const patterns = new Map<
    string,
    { steps: string[]; sessionIds: Set<string>; repos: Set<string>; examples: string[][] }
  >();
  for (const [sessionId, { repo, steps }] of sessions) {
    const seenHere = new Set<string>();
    for (let n = MIN_PATTERN_LENGTH; n <= MAX_PATTERN_LENGTH; n++) {
      for (let i = 0; i + n <= steps.length; i++) {
        const slice = steps.slice(i, i + n);
        const signature = slice.map((s) => s.step).join(STEP_SEPARATOR);
        if (seenHere.has(signature)) continue;
        seenHere.add(signature);
        const entry = patterns.get(signature) ?? {
          steps: slice.map((s) => s.step),
          sessionIds: new Set<string>(),
          repos: new Set<string>(),
          examples: [],
        };
        entry.sessionIds.add(sessionId);
        entry.repos.add(repo);
        if (entry.examples.length < MAX_EXAMPLES) {
          entry.examples.push(slice.map((s) => s.display));
        }
        patterns.set(signature, entry);
      }
    }
  }

  const supported = [...patterns.entries()].filter(
    ([, p]) => p.sessionIds.size >= MIN_SUPPORT_SESSIONS,
  );

  // Closed-pattern filter: drop P when a strictly longer supported pattern
  // contains it contiguously with the same support (P adds no information).
  const closed = supported.filter(([signature, p]) =>
    !supported.some(
      ([otherSig, other]) =>
        other.steps.length > p.steps.length &&
        other.sessionIds.size === p.sessionIds.size &&
        otherSig.includes(signature),
    ),
  );

  return closed
    .map(([signature, p]) => {
      const repos = [...p.repos].sort();
      return {
        signature,
        steps: p.steps,
        supportSessions: p.sessionIds.size,
        repos,
        scope: repos.length >= 2 ? ("global" as const) : ("local" as const),
        score: p.sessionIds.size * p.steps.length,
        examples: p.examples,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Deterministic fallback skeleton used when `claude -p` is unavailable or its
 * output is unusable. Pure render (data to string).
 */
export function renderProcedureSkeleton(c: ProcedureCandidate): string {
  const exampleLines = c.examples[0]?.map((d, i) => `${i + 1}. \`${d}\``) ?? [];
  return [
    "---",
    `name: procedure-${skillSlug(c.signature)}`,
    `description: Recurring procedure observed by Chardon. Trigger phrases: "${c.steps.join('", "')}".`,
    "---",
    "",
    `# Recurring procedure: ${c.signature}`,
    "",
    `Observed in ${c.supportSessions} session(s) across ${c.repos.length} repo(s).`,
    "Flesh out each step with what actually works, then install it as a skill.",
    "",
    "## Observed steps",
    "",
    ...exampleLines,
    "",
  ].join("\n");
}
