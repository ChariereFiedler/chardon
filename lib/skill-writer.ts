/**
 * Drafts an inferred skill through the Claude Code CLI (`claude -p`), running
 * under the user's own account: no API key, no npm dependency. Every failure
 * path (no binary, timeout, unusable output) returns null so the caller falls
 * back to the deterministic skeleton; no network happens without the binary.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { ProcedureCandidate } from "./procedures.ts";

/** Hard cap on one `claude -p` invocation. */
export const CLAUDE_P_TIMEOUT_MS = 120_000;

/** Runs the CLI and returns stdout; throws on any spawn failure. Injectable. */
export type ClaudeRunner = (bin: string, prompt: string) => string;

/** Matches the frontmatter name line of a drafted skill. */
const NAME_LINE_PATTERN = /^name:\s*(\S+)/m;

/**
 * Resolves the Claude Code binary: `CHARDON_CLAUDE_BIN` first (it often lives
 * outside the shell PATH, e.g. ~/.local/bin), then a `claude` file on PATH.
 * Returns null when neither resolves; drafting is then skipped silently.
 */
export function resolveClaudeBin(env: NodeJS.ProcessEnv): string | null {
  // The explicit override is trusted as-is: a wrong path just makes the spawn
  // throw, which the caller already treats as "drafting unavailable".
  const explicit = env.CHARDON_CLAUDE_BIN;
  if (explicit) return explicit;
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, "claude");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Builds the drafting prompt from the mined candidate. Pure. */
export function buildDraftPrompt(c: ProcedureCandidate, installTarget: string): string {
  const examples = c.examples
    .map((seq, i) => `Example ${i + 1}: ${seq.join(" -> ")}`)
    .join("\n");
  return [
    "You are drafting a Claude Code skill from an observed recurring procedure.",
    `Procedure (normalized steps): ${c.signature}`,
    `Observed in ${c.supportSessions} session(s), scope: ${c.scope}, install target: ${installTarget}.`,
    "Real observed sequences (commands are redacted and truncated):",
    examples,
    "",
    "Answer with ONLY a complete SKILL.md file: YAML frontmatter delimited by",
    "--- lines containing `name:` (short kebab-case) and `description:` (one",
    "sentence including trigger phrases), then a markdown body with a short",
    "numbered procedure generalizing these sequences. No commentary around it.",
  ].join("\n");
}

function defaultRunner(bin: string, prompt: string): string {
  return execFileSync(bin, ["-p", prompt], {
    encoding: "utf-8",
    timeout: CLAUDE_P_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * Drafts the skill file for a candidate. Returns the markdown and the name
 * extracted from its frontmatter, or null when drafting is unavailable or the
 * output is not a plausible skill file.
 */
export function draftSkill(
  c: ProcedureCandidate,
  installTarget: string,
  opts: { runner?: ClaudeRunner; env?: NodeJS.ProcessEnv } = {},
): { markdown: string; name: string } | null {
  const env = opts.env ?? process.env;
  const bin = resolveClaudeBin(env);
  if (!bin) return null;
  try {
    const output = (opts.runner ?? defaultRunner)(bin, buildDraftPrompt(c, installTarget)).trim();
    if (!output.startsWith("---")) return null;
    const name = output.match(NAME_LINE_PATTERN)?.[1];
    if (!name) return null;
    return { markdown: output, name };
  } catch {
    // Timeout, crash, or unusable CLI: the deterministic skeleton takes over.
    return null;
  }
}
