import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// node:sqlite loaded at runtime via native require: avoids Vite trying to resolve/bundle
// it (otherwise it rewrites "node:sqlite" → "sqlite", which is not found).
const nodeRequire = createRequire(import.meta.url);

describe("smoke", () => {
  it("vitest runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("the SQLite schema is valid and creates the expected tables", () => {
    // node:sqlite is required (Node >= 22).
    const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");
    const sql = readFileSync(join(ROOT, "lib/schema.sql"), "utf8");
    const db = new DatabaseSync(":memory:");
    db.exec(sql);
    db.exec(sql); // idempotent: applying twice does not break

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const tables = rows.map((r) => r.name);

    expect(tables).toEqual(
      ["actions", "events", "hook_health", "nudges", "patterns", "purge_log", "sessions", "ticket_metrics", "token_usage"].sort(),
    );
    db.close();
  });
});
