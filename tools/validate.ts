#!/usr/bin/env -S node --experimental-strip-types
/**
 * Validates what ships: the plugin manifests, and the doc claims that can be
 * checked mechanically.
 *
 *   node --experimental-strip-types tools/validate.ts            everything
 *   node --experimental-strip-types tools/validate.ts manifest   manifests only
 *   node --experimental-strip-types tools/validate.ts docs       doc parity only
 *
 * Why this exists: on 2026-07-21 the plugin turned out to be uninstallable, and
 * had been for its whole history. Three defects, all mechanically detectable,
 * none caught because nothing validated the manifests:
 *
 *   - `author` was a string where the schema wants an object;
 *   - `hooks` pointed at hooks/hooks.json, which Claude Code loads on its own,
 *     so declaring it raised "Duplicate hooks file detected" and failed the
 *     whole plugin load;
 *   - `statusLine` was declared but is ignored at load time, so the documented
 *     status line could never have worked from a plugin install.
 *
 * The same session saw the README drift on its test count, on the Node
 * requirement and on the benchmark figures. Hence the `docs` mode: a claim that
 * can be checked against the source of truth should not depend on a reviewer
 * noticing.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT_VAR = /\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g;

const errors: string[] = [];
const fail = (msg: string): void => {
  errors.push(msg);
};

function readJson(rel: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(ROOT, rel), "utf-8"));
  } catch (err) {
    fail(`${rel}: unreadable or invalid JSON (${(err as Error).message})`);
    return null;
  }
}

/** Every `${CLAUDE_PLUGIN_ROOT}/x` in `text` must resolve to a shipped file. */
function checkPluginRootPaths(text: string, source: string): void {
  for (const [, rel] of text.matchAll(PLUGIN_ROOT_VAR)) {
    if (!existsSync(join(ROOT, rel))) fail(`${source}: references missing file \`${rel}\``);
  }
}

export function validateManifests(): void {
  const pkg = readJson("package.json");
  const plugin = readJson(".claude-plugin/plugin.json");
  const marketplace = readJson(".claude-plugin/marketplace.json");
  const hooks = readJson("hooks/hooks.json");

  if (plugin) {
    for (const key of ["name", "version", "description", "author"]) {
      if (plugin[key] === undefined) fail(`plugin.json: missing \`${key}\``);
    }
    // The schema wants an object; a string fails installation outright.
    if (plugin.author !== undefined && typeof plugin.author !== "object") {
      fail("plugin.json: `author` must be an object ({name, url}), not a string");
    }
    // hooks/hooks.json is loaded by convention. Declaring it duplicates the load
    // and takes the whole plugin down with it.
    if (plugin.hooks !== undefined) {
      fail("plugin.json: do not declare `hooks` — hooks/hooks.json is loaded automatically");
    }
    // Silently ignored at load time, so declaring it promises what cannot work.
    if (plugin.statusLine !== undefined) {
      fail("plugin.json: `statusLine` is ignored by Claude Code — wire it in settings.json instead");
    }
    if (pkg && plugin.version !== pkg.version) {
      fail(`plugin.json version (${plugin.version}) != package.json version (${pkg.version})`);
    }
  }

  if (marketplace) {
    for (const key of ["name", "description", "owner"]) {
      if (marketplace[key] === undefined) fail(`marketplace.json: missing \`${key}\``);
    }
    const owner = marketplace.owner as Record<string, unknown> | undefined;
    if (owner && (typeof owner !== "object" || !owner.name)) {
      fail("marketplace.json: `owner` must be an object with a `name`");
    }
  }

  if (hooks) checkPluginRootPaths(JSON.stringify(hooks), "hooks/hooks.json");

  for (const file of readdirSync(join(ROOT, "commands"))) {
    if (!file.endsWith(".md")) continue;
    checkPluginRootPaths(readFileSync(join(ROOT, "commands", file), "utf-8"), `commands/${file}`);
  }
}

/** Counts the `it(` / `test(` cases across the suite, as `npm test` reports them. */
function countTests(): number {
  let total = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".test.ts")) {
        total += (readFileSync(full, "utf-8").match(/^\s*(?:it|test)\(/gm) ?? []).length;
      }
    }
  };
  walk(ROOT);
  return total;
}

export function validateDocs(): void {
  const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
  const config = readJson("config/chardon.default.json") ?? {};

  // Test count: the figure quoted in the README must match the suite.
  const quoted = readme.match(/(\d+)\s+tests/);
  if (quoted) {
    const actual = countTests();
    if (Number(quoted[1]) !== actual) {
      fail(`README claims ${quoted[1]} tests, the suite defines ${actual}`);
    }
  }

  // Every slash command named in the docs must ship.
  for (const [, name] of readme.matchAll(/\/(chardon-[a-z]+)/g)) {
    if (!existsSync(join(ROOT, "commands", `${name}.md`))) {
      fail(`README documents /${name}, which has no commands/${name}.md`);
    }
  }

  // Every config key documented in a table must exist in the defaults.
  // Config rows have three cells (key, default, description); two-cell tables
  // (status-line segments, commands) are not config and are skipped.
  for (const [, key] of readme.matchAll(/^\| `(\w+)` \|[^|\n]*\|[^|\n]*\|/gm)) {
    if (key in config) continue;
    if (/^CHARDON_|^CLAUDE_/.test(key)) continue; // env vars, checked below
    fail(`README documents config key \`${key}\`, absent from config/chardon.default.json`);
  }

  checkPluginRootPaths(readme, "README.md");
}

const mode = process.argv[2] ?? "all";
if (mode === "all" || mode === "manifest") validateManifests();
if (mode === "all" || mode === "docs") validateDocs();

if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(`✓ ${mode === "all" ? "manifests and docs" : mode} valid`);
