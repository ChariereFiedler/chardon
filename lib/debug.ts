/**
 * Opt-in diagnostics for the fail-open hooks. When `CHARDON_DEBUG=1`, writes one
 * line per swallowed error to **stderr** — never stdout, never changing the exit
 * code. This closes the "silent failure" blind spot without breaking fail-open.
 */
export function debug(op: string, err?: unknown): void {
  if (process.env.CHARDON_DEBUG !== "1") return;
  const detail = err instanceof Error ? err.message : err !== undefined ? String(err) : "";
  try {
    process.stderr.write(`[chardon] ${op}${detail ? `: ${detail}` : ""}\n`);
  } catch {
    // Even diagnostics must never throw into a hook.
  }
}
