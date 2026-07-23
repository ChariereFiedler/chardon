/**
 * Opt-in diagnostics for the fail-open hooks. When `CHARDON_DEBUG=1`, writes one
 * ISO-timestamped line per swallowed error to **stderr** — never stdout, never
 * changing the exit code. This closes the "silent failure" blind spot without
 * breaking fail-open.
 *
 * `now` is injectable for tests; the default `new Date()` is acceptable here
 * because debug() is pure I/O called from catch paths, never logic under test.
 */
export function debug(op: string, err?: unknown, now: () => Date = () => new Date()): void {
  if (process.env.CHARDON_DEBUG !== "1") return;
  const detail = err instanceof Error ? err.message : err !== undefined ? String(err) : "";
  try {
    const ts = now().toISOString();
    process.stderr.write(`[chardon] ${ts} ${op}${detail ? `: ${detail}` : ""}\n`);
  } catch {
    // Even diagnostics must never throw into a hook.
  }
}
