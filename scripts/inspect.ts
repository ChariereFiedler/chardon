import { isMainModule } from "../lib/is-main.ts";

import { closeDb, openDb } from "../lib/db.ts";
import type { ChardonDb } from "../lib/db.ts";
import { dbPath, repoSlug } from "../lib/config.ts";

const TABLES = ["sessions", "events", "token_usage", "actions", "patterns", "hook_health", "ticket_metrics"];

export interface InspectData {
  dbPath: string;
  repo: string;
  counts: { table: string; rows: number }[];
  sampleMeta: string[];
}

/** Pure render of what the local DB holds (data → string). */
export function renderInspect(d: InspectData): string {
  const lines: string[] = [
    "# Chardon: what is stored locally",
    "",
    `Database: \`${d.dbPath}\` (local, 0600, never synced).`,
    `Current repo scope: \`${d.repo}\`.`,
    "",
    "## Row counts (whole database, all repos)",
    "| Table | Rows |",
    "|---|---|",
    ...d.counts.map((c) => `| ${c.table} | ${c.rows} |`),
    "",
    `## Sample stored command metadata for \`${d.repo}\` (redaction applied before storage)`,
  ];
  if (d.sampleMeta.length === 0) {
    lines.push("(no Bash command events stored yet)");
  } else {
    for (const m of d.sampleMeta) lines.push(`- \`${m}\``);
  }
  lines.push(
    "",
    "Two opt-in features can send data off this machine: the weekly LLM synthesis",
    "(`/chardon-weekly`, only when you set `ANTHROPIC_API_KEY`) and the GitLab counts",
    "of the status line (only when `.chardon.json` sets `gitlab.enabled`).",
  );
  return lines.join("\n");
}

function collect(db: ChardonDb, repo: string): InspectData {
  const counts = TABLES.map((table) => ({
    table,
    rows: (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c,
  }));
  // `events` carries no `repo` column — it is scoped through its session. Without this
  // join the transparency command would show another repo's commands under this repo's name.
  const sampleMeta = (
    db
      .prepare(
        `SELECT json_extract(e.meta, '$.cmd') AS cmd
         FROM events e
         JOIN sessions s ON s.id = e.session_id
         WHERE s.repo = ? AND e.tool = 'Bash' AND json_extract(e.meta, '$.cmd') IS NOT NULL
         ORDER BY e.id DESC LIMIT 5`,
      )
      .all(repo) as { cmd: string }[]
  ).map((r) => r.cmd);
  return { dbPath: dbPath(), repo, counts, sampleMeta };
}

/** Opens the DB, gathers a transparency summary, and renders it. */
export function runInspect(projectDir: string): { report: string } {
  const repo = repoSlug(projectDir);
  const db = openDb();
  try {
    return { report: renderInspect(collect(db, repo)) };
  } finally {
    closeDb(db);
  }
}

if (isMainModule("inspect")) {
  const { report } = runInspect(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  console.log(report);
}
