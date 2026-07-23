import{basename as L}from"node:path";function g(e){let t=process.argv[1];if(!t)return!1;let n=L(t);return n===`${e}.ts`||n===`${e}.mjs`||n===`${e}.js`}import{createRequire as $}from"node:module";import{chmodSync as U,closeSync as P,mkdirSync as H,openSync as F,readFileSync as G}from"node:fs";import{dirname as T,join as W}from"node:path";import{fileURLToPath as j}from"node:url";import{homedir as M}from"node:os";import{basename as pe,join as f,resolve as me,sep as ge}from"node:path";import{fileURLToPath as w}from"node:url";var v=w(new URL("../",import.meta.url)),Ee=f(v,"config","chardon.default.json");function E(){return process.env.CHARDON_DB??f(M(),".claude","chardon.db")}function b(e,t,n=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let r=t instanceof Error?t.message:t!==void 0?String(t):"";try{let s=n().toISOString();process.stderr.write(`[chardon] ${s} ${e}${r?`: ${r}`:""}
`)}catch{}}var B=$(import.meta.url),{DatabaseSync:z}=B("node:sqlite");function V(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}V();var Y=W(T(j(import.meta.url)),"schema.sql"),A=2;function l(){let e=E();H(T(e),{recursive:!0});try{P(F(e,"a",384)),U(e,384)}catch(i){b("db-permissions",i)}let t=new z(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let n=G(Y,"utf-8"),r=Z(t);if(r&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(n),r&&J(t),q(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}if(_(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}return t.prepare("PRAGMA user_version").get().user_version!==A&&t.exec(`PRAGMA user_version = ${A}`),t}function Z(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(r=>r.name==="repo"):!1}function J(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function _(e,t,n){let r=e.prepare(`PRAGMA table_info(${t})`).all();return r.length>0&&!r.some(s=>s.name===n)}function q(e){return _(e,"hook_health","last_error")}function p(e){try{e.close()}catch{}}function R(e,t,n,r,s=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,s);if(r.length===0)return i;let d=new Set(r);return i.filter(c=>!d.has(c.cmd))}function S(e,t,n,r=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,r)}function D(e,t,n,r=3,s=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,r,s)}function N(e,t,n,r=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${n}`,r)}function C(e,t,n){let r=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${n}`);return new Set(r.map(s=>s.skill))}var X=8,K=4,Q={failure_cluster:"systematic-debugging",retry_storm:"recurring-bug-root-cause"};function u(e){return e>=X?"high":e>=K?"medium":"low"}var ee=100,te=50;function O(e){return e>=ee?"high":e>=te?"medium":"low"}var re=50;function x(e,t,n,r,s){let i=[];for(let o of R(e,t,n,[],s?.toilMin))i.push({kind:"automate-command",target:o.cmd,patternType:"toil_loop",baseline:o.count,severity:u(o.count)});for(let o of h(e,t,n,s?.coldMin))i.push({kind:"split-or-summarize",target:o.file,patternType:"cold_read",baseline:o.count,severity:u(o.count)});for(let o of N(e,t,n,s?.retryMin))i.push({kind:"investigate-file",target:o.file,patternType:"retry_storm",baseline:o.count,severity:u(o.count)});for(let o of S(e,t,n,s?.failMin))i.push({kind:"fix-failing-command",target:o.cmd,patternType:"failure_cluster",baseline:o.count,severity:u(o.count)});for(let o of D(e,t,n,s?.slowMin,s?.slowMs))i.push({kind:"speed-up-command",target:o.cmd,patternType:"slow_command",baseline:o.count,severity:u(o.count)});if(r&&r.budget>0&&r.tokensToday>r.budget){let o=Math.round((r.tokensToday-r.budget)/r.budget*100);i.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:o,severity:O(o)})}r&&r.trendPct!==null&&r.trendPct>=re&&i.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:r.trendPct,severity:O(r.trendPct)});let d=C(e,t,n),c=new Set;for(let o of[...i]){let a=Q[o.patternType];!a||d.has(a)||c.has(a)||(c.add(a),i.push({kind:"consider-skill",target:a,patternType:"uncovered_friction",baseline:o.baseline,severity:u(o.baseline)}))}return i}function y(e,t,n){e.prepare("UPDATE actions SET status = 'applied', applied_at = ? WHERE id = ?").run(n,t)}function k(e,t){e.prepare("UPDATE actions SET status = 'dropped' WHERE id = ?").run(t)}function I(e,t,n){let r=e.prepare("SELECT repo, kind, target, baseline FROM actions WHERE id = ?").get(t);if(!r)return null;let{repo:s,kind:i,target:d,baseline:c}=r,a=x(e,s,n).find(m=>m.kind===i&&m.target===d)?.baseline??0;return e.prepare("UPDATE actions SET after_metric = ?, status = 'measured' WHERE id = ?").run(a,t),{baseline:c,after:a,delta:c-a}}var ne=24;function oe(e,t){let n=l();try{return y(n,e,t.toISOString()),`Action ${e} marked applied. Run measure later to capture its ROI.`}finally{p(n)}}function se(e){let t=l();try{return k(t,e),`Action ${e} dropped; chardon will stop proposing it.`}finally{p(t)}}function ie(e,t){let n=l();try{let r=I(n,e,t);return r?`Action ${e}: friction ${r.baseline} \u2192 ${r.after} (reduced by ${r.delta}).`:`Action ${e} not found.`}finally{p(n)}}function ae(e,t){let[n,r]=e,s=Number.parseInt(r??"",10);if(Number.isNaN(s))return"Usage: <apply|drop|measure> <action-id>";switch(n){case"apply":return oe(s,t);case"drop":return se(s);case"measure":return ie(s,ne);default:return`Unknown action "${n}". Usage: <apply|drop|measure> <action-id>`}}g("roi-actions")&&console.log(ae(process.argv.slice(2),new Date));export{oe as runApply,se as runDrop,ie as runMeasure,ae as runRoiAction};
