import{basename as k}from"node:path";function g(e){let t=process.argv[1];if(!t)return!1;let n=k(t);return n===`${e}.ts`||n===`${e}.mjs`||n===`${e}.js`}import{createRequire as v}from"node:module";import{chmodSync as $,closeSync as U,mkdirSync as P,openSync as H,readFileSync as F}from"node:fs";import{dirname as R,join as W}from"node:path";import{fileURLToPath as G}from"node:url";import{homedir as M}from"node:os";import{basename as de,join as f,resolve as pe,sep as le}from"node:path";import{fileURLToPath as L}from"node:url";var w=L(new URL("../",import.meta.url)),ge=f(w,"config","chardon.default.json");function b(){return process.env.CHARDON_DB??f(M(),".claude","chardon.db")}function E(e,t){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{process.stderr.write(`[chardon] ${e}${n?`: ${n}`:""}
`)}catch{}}var j=v(import.meta.url),{DatabaseSync:B}=j("node:sqlite");function V(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}V();var Y=W(R(G(import.meta.url)),"schema.sql"),S=2;function p(){let e=b();P(R(e),{recursive:!0});try{U(H(e,"a",384)),$(e,384)}catch(i){E("db-permissions",i)}let t=new B(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let n=F(Y,"utf-8"),r=J(t);return r&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(n),r&&q(t),t.prepare("PRAGMA user_version").get().user_version!==S&&t.exec(`PRAGMA user_version = ${S}`),t}function J(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(r=>r.name==="repo"):!1}function q(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function l(e){try{e.close()}catch{}}function N(e,t,n,r,s=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`).all(t,`-${n}`,s);if(r.length===0)return i;let d=new Set(r);return i.filter(c=>!d.has(c.cmd))}function _(e,t,n,r=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.success = 0
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`).all(t,`-${n}`,r)}function A(e,t,n,r=3,s=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count,
              AVG(e.duration_ms) AS avgMs
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.duration_ms IS NOT NULL
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ? AND avgMs >= ?
       ORDER BY avgMs DESC
       LIMIT 20`).all(t,`-${n}`,r,s)}function T(e,t,n,r=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool IN ('Edit', 'Bash')
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.file') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.file')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`).all(t,`-${n}`,r)}function h(e,t,n,r=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Read'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.file') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.file')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`).all(t,`-${n}`,r)}function D(e,t,n){let r=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${n}`);return new Set(r.map(s=>s.skill))}var X=8,z=4,K={failure_cluster:"systematic-debugging",retry_storm:"recurring-bug-root-cause"};function u(e){return e>=X?"high":e>=z?"medium":"low"}var Q=100,Z=50;function C(e){return e>=Q?"high":e>=Z?"medium":"low"}var ee=50;function x(e,t,n,r,s){let i=[];for(let o of N(e,t,n,[],s?.toilMin))i.push({kind:"automate-command",target:o.cmd,patternType:"toil_loop",baseline:o.count,severity:u(o.count)});for(let o of h(e,t,n,s?.coldMin))i.push({kind:"split-or-summarize",target:o.file,patternType:"cold_read",baseline:o.count,severity:u(o.count)});for(let o of T(e,t,n,s?.retryMin))i.push({kind:"investigate-file",target:o.file,patternType:"retry_storm",baseline:o.count,severity:u(o.count)});for(let o of _(e,t,n,s?.failMin))i.push({kind:"fix-failing-command",target:o.cmd,patternType:"failure_cluster",baseline:o.count,severity:u(o.count)});for(let o of A(e,t,n,s?.slowMin,s?.slowMs))i.push({kind:"speed-up-command",target:o.cmd,patternType:"slow_command",baseline:o.count,severity:u(o.count)});if(r&&r.budget>0&&r.tokensToday>r.budget){let o=Math.round((r.tokensToday-r.budget)/r.budget*100);i.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:o,severity:C(o)})}r&&r.trendPct!==null&&r.trendPct>=ee&&i.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:r.trendPct,severity:C(r.trendPct)});let d=D(e,t,n),c=new Set;for(let o of[...i]){let a=K[o.patternType];!a||d.has(a)||c.has(a)||(c.add(a),i.push({kind:"consider-skill",target:a,patternType:"uncovered_friction",baseline:o.baseline,severity:u(o.baseline)}))}return i}function y(e,t,n){e.prepare("UPDATE actions SET status = 'applied', applied_at = ? WHERE id = ?").run(n,t)}function O(e,t){e.prepare("UPDATE actions SET status = 'dropped' WHERE id = ?").run(t)}function I(e,t,n){let r=e.prepare("SELECT repo, kind, target, baseline FROM actions WHERE id = ?").get(t);if(!r)return null;let{repo:s,kind:i,target:d,baseline:c}=r,a=x(e,s,n).find(m=>m.kind===i&&m.target===d)?.baseline??0;return e.prepare("UPDATE actions SET after_metric = ?, status = 'measured' WHERE id = ?").run(a,t),{baseline:c,after:a,delta:c-a}}var te=24;function ne(e,t){let n=p();try{return y(n,e,t.toISOString()),`Action ${e} marked applied. Run measure later to capture its ROI.`}finally{l(n)}}function re(e){let t=p();try{return O(t,e),`Action ${e} dropped; chardon will stop proposing it.`}finally{l(t)}}function oe(e,t){let n=p();try{let r=I(n,e,t);return r?`Action ${e}: friction ${r.baseline} \u2192 ${r.after} (reduced by ${r.delta}).`:`Action ${e} not found.`}finally{l(n)}}function se(e,t){let[n,r]=e,s=Number.parseInt(r??"",10);if(Number.isNaN(s))return"Usage: <apply|drop|measure> <action-id>";switch(n){case"apply":return ne(s,t);case"drop":return re(s);case"measure":return oe(s,te);default:return`Unknown action "${n}". Usage: <apply|drop|measure> <action-id>`}}g("roi-actions")&&console.log(se(process.argv.slice(2),new Date));export{ne as runApply,re as runDrop,oe as runMeasure,se as runRoiAction};
