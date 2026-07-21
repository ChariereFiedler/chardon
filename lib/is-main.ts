/**
 * Robust "am I the process entry point?" check for CLI guards.
 *
 * The naive guard `import.meta.url === pathToFileURL(process.argv[1]).href`
 * breaks under bundling: esbuild rewrites every inlined `import.meta.url` to the
 * host bundle's URL, so an imported entry's CLI block fires when the host bundle
 * is run directly. Concretely, `node dist/stop.mjs` used to also run
 * scripts/analyze-daily.ts's CLI block (bundled in via hooks/stop.ts), throwing
 * outside the hook's fail-open path. Matching the invoked filename instead
 * survives bundling — this mirrors the check already used in scripts/statusline.ts.
 *
 * @param name Base module name without extension, e.g. "stop", "analyze-daily".
 */
import { basename } from "node:path";

export function isMainModule(name: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = basename(entry);
  return base === `${name}.ts` || base === `${name}.mjs` || base === `${name}.js`;
}
