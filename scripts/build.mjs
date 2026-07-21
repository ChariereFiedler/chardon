// Precompiles hooks, the status line, and the command scripts to plain-JS bundles
// in dist/, so they run with `node` (no --experimental-strip-types). Type-stripping
// the whole import graph on every spawn is the dominant per-tool-call cost; running
// precompiled .mjs removes it (~5x faster hook latency). Source of truth stays .ts.
//
// Run: npm run build   (or: node scripts/build.mjs)

import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Flat output names → dist/<name>.mjs, so dist/schema.sql resolves for every bundle.
const sources = [
  "hooks/session-start.ts",
  "hooks/post-tool-use.ts",
  "hooks/stop.ts",
  "hooks/notify.ts",
  "scripts/statusline.ts",
  "scripts/analyze-daily.ts",
  "scripts/analyze-weekly.ts",
  "scripts/improve.ts",
  "scripts/roi-actions.ts",
  "scripts/purge.ts",
  "scripts/inspect.ts",
];
const entryPoints = sources.map((p) => ({
  in: join(root, p),
  out: p.split("/").pop().replace(/\.ts$/, ""),
}));

await build({
  entryPoints,
  outdir: join(root, "dist"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  minify: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // node builtins are external on platform:node; the optional SDK stays a runtime import.
  external: ["node:sqlite", "@anthropic-ai/sdk"],
  logLevel: "info",
});

// db.ts reads schema.sql relative to its own module dir; after bundling that is dist/.
mkdirSync(join(root, "dist"), { recursive: true });
copyFileSync(join(root, "lib/schema.sql"), join(root, "dist/schema.sql"));

console.log("build: dist/*.mjs + dist/schema.sql written");
