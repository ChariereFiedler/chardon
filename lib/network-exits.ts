/**
 * Single source of truth for every opt-in feature that can send data off the
 * machine. History justifies the mechanism: the "single exception" claim went
 * stale three times in two days as exits were added. Adding an entry here is
 * now the ONLY way to ship a new exit: `scripts/inspect.ts` renders this list
 * verbatim and `tools/validate.ts` fails the build when the README does not
 * mention every trigger and the right count.
 */

export interface NetworkExit {
  /** One-line description rendered by /chardon-inspect. */
  summary: string;
  /** The opt-in switch; validate.ts requires the README to mention it. */
  trigger: string;
}

export const NETWORK_EXITS: readonly NetworkExit[] = [
  {
    summary: "the weekly LLM synthesis (/chardon-weekly), calling the Anthropic API",
    trigger: "ANTHROPIC_API_KEY",
  },
  {
    summary: "the GitLab counts of the status line, calling the GitLab API",
    trigger: "gitlab.enabled",
  },
  {
    summary: "skill drafting by /chardon-skills, through your local Claude Code CLI",
    trigger: "claude -p",
  },
];

const COUNT_WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };

/** English word for the exit count ("three"), as the README spells it. */
export function networkExitCountWord(): string {
  return COUNT_WORDS[NETWORK_EXITS.length] ?? String(NETWORK_EXITS.length);
}
