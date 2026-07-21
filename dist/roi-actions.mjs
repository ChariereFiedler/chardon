import{basename as x}from"node:path";function g(e){let t=process.argv[1];if(!t)return!1;let r=x(t);return r===`${e}.ts`||r===`${e}.mjs`||r===`${e}.js`}import{createRequire as L}from"node:module";import{chmodSync as w,readFileSync as v}from"node:fs";import{dirname as U,join as $}from"node:path";import{fileURLToPath as P}from"node:url";import{homedir as I}from"node:os";import{basename as se,join as f,resolve as ie,sep as ae}from"node:path";import{fileURLToPath as k}from"node:url";var M=k(new URL("../",import.meta.url)),ue=f(M,"config","chardon.default.json");function b(){return process.env.CHARDON_DB??f(I(),".claude","chardon.db")}var H=L(import.meta.url),{DatabaseSync:F}=H("node:sqlite"),j=$(U(P(import.meta.url)),"schema.sql"),E=2;function p(){let e=b(),t=new F(e);try{w(e,384)}catch{}t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let r=v(j,"utf-8"),n=W(t);return n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(r),n&&G(t),t.prepare("PRAGMA user_version").get().user_version!==E&&t.exec(`PRAGMA user_version = ${E}`),t}function W(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function G(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function m(e){try{e.close()}catch{}}function N(e,t,r,n,s=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,s);if(n.length===0)return i;let d=new Set(n);return i.filter(c=>!d.has(c.cmd))}function R(e,t,r,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n)}function S(e,t,r,n=3,s=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n,s)}function _(e,t,r,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${r}`,n)}function A(e,t,r,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${r}`,n)}function T(e,t,r){let n=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${r}`);return new Set(n.map(s=>s.skill))}var B=8,V=4,Y={failure_cluster:"systematic-debugging",retry_storm:"recurring-bug-root-cause"};function u(e){return e>=B?"high":e>=V?"medium":"low"}var J=100,q=50;function h(e){return e>=J?"high":e>=q?"medium":"low"}var z=50;function D(e,t,r,n,s){let i=[];for(let o of N(e,t,r,[],s?.toilMin))i.push({kind:"automate-command",target:o.cmd,patternType:"toil_loop",baseline:o.count,severity:u(o.count)});for(let o of A(e,t,r,s?.coldMin))i.push({kind:"split-or-summarize",target:o.file,patternType:"cold_read",baseline:o.count,severity:u(o.count)});for(let o of _(e,t,r,s?.retryMin))i.push({kind:"investigate-file",target:o.file,patternType:"retry_storm",baseline:o.count,severity:u(o.count)});for(let o of R(e,t,r,s?.failMin))i.push({kind:"fix-failing-command",target:o.cmd,patternType:"failure_cluster",baseline:o.count,severity:u(o.count)});for(let o of S(e,t,r,s?.slowMin,s?.slowMs))i.push({kind:"speed-up-command",target:o.cmd,patternType:"slow_command",baseline:o.count,severity:u(o.count)});if(n&&n.budget>0&&n.tokensToday>n.budget){let o=Math.round((n.tokensToday-n.budget)/n.budget*100);i.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:o,severity:h(o)})}n&&n.trendPct!==null&&n.trendPct>=z&&i.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:n.trendPct,severity:h(n.trendPct)});let d=T(e,t,r),c=new Set;for(let o of[...i]){let a=Y[o.patternType];!a||d.has(a)||c.has(a)||(c.add(a),i.push({kind:"consider-skill",target:a,patternType:"uncovered_friction",baseline:o.baseline,severity:u(o.baseline)}))}return i}function C(e,t,r){e.prepare("UPDATE actions SET status = 'applied', applied_at = ? WHERE id = ?").run(r,t)}function O(e,t){e.prepare("UPDATE actions SET status = 'dropped' WHERE id = ?").run(t)}function y(e,t,r){let n=e.prepare("SELECT repo, kind, target, baseline FROM actions WHERE id = ?").get(t);if(!n)return null;let{repo:s,kind:i,target:d,baseline:c}=n,a=D(e,s,r).find(l=>l.kind===i&&l.target===d)?.baseline??0;return e.prepare("UPDATE actions SET after_metric = ?, status = 'measured' WHERE id = ?").run(a,t),{baseline:c,after:a,delta:c-a}}var K=24;function X(e,t){let r=p();try{return C(r,e,t.toISOString()),`Action ${e} marked applied \u2014 run measure later to capture its ROI.`}finally{m(r)}}function Q(e){let t=p();try{return O(t,e),`Action ${e} dropped \u2014 chardon will stop proposing it.`}finally{m(t)}}function Z(e,t){let r=p();try{let n=y(r,e,t);return n?`Action ${e}: friction ${n.baseline} \u2192 ${n.after} (reduced by ${n.delta}).`:`Action ${e} not found.`}finally{m(r)}}function ee(e,t){let[r,n]=e,s=Number.parseInt(n??"",10);if(Number.isNaN(s))return"Usage: <apply|drop|measure> <action-id>";switch(r){case"apply":return X(s,t);case"drop":return Q(s);case"measure":return Z(s,K);default:return`Unknown action "${r}". Usage: <apply|drop|measure> <action-id>`}}g("roi-actions")&&console.log(ee(process.argv.slice(2),new Date));export{X as runApply,Q as runDrop,Z as runMeasure,ee as runRoiAction};
