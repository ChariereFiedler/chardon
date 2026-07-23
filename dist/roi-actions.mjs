import{basename as B}from"node:path";function T(e){let t=process.argv[1];if(!t)return!1;let n=B(t);return n===`${e}.ts`||n===`${e}.mjs`||n===`${e}.js`}import{createRequire as Z}from"node:module";import{chmodSync as q,closeSync as K,mkdirSync as Q,openSync as ee,readFileSync as te}from"node:fs";import{dirname as y,join as re}from"node:path";import{fileURLToPath as ne}from"node:url";import{homedir as z}from"node:os";import{basename as Ge,join as b,resolve as je,sep as Be}from"node:path";import{fileURLToPath as Y}from"node:url";var V=Y(new URL("../",import.meta.url)),Ye=b(V,"config","chardon.default.json");var J=100,X=5;function R(e){if(typeof e!="string"||e.length>J||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]|(?<!\()\?/g)?.length??0)>X)return null;try{return new RegExp(e)}catch{return null}}function N(){return process.env.CHARDON_DB??b(z(),".claude","chardon.db")}function D(e,t,n=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let r=t instanceof Error?t.message:t!==void 0?String(t):"";try{let o=n().toISOString();process.stderr.write(`[chardon] ${o} ${e}${r?`: ${r}`:""}
`)}catch{}}var se=Z(import.meta.url),{DatabaseSync:oe}=se("node:sqlite");function ie(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}ie();var ae=re(y(ne(import.meta.url)),"schema.sql"),k=2;function _(){let e=N();Q(y(e),{recursive:!0});try{K(ee(e,"a",384)),q(e,384)}catch(c){D("db-permissions",c)}let t=new oe(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let n=te(ae,"utf-8"),r=ce(t);if(r&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(n),r&&le(t),ue(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(c){if(!String(c.message).includes("duplicate column"))throw c}if(C(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(c){if(!String(c.message).includes("duplicate column"))throw c}return t.prepare("PRAGMA user_version").get().user_version!==k&&t.exec(`PRAGMA user_version = ${k}`),t}function ce(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(r=>r.name==="repo"):!1}function le(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function C(e,t,n){let r=e.prepare(`PRAGMA table_info(${t})`).all();return r.length>0&&!r.some(o=>o.name===n)}function ue(e){return C(e,"hook_health","last_error")}function A(e){try{e.close()}catch{}}function x(e,t,n,r,o=3){let c=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,o);if(r.length===0)return c;let d=new Set(r);return c.filter(l=>!d.has(l.cmd))}function O(e,t,n,r=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,r)}function I(e,t,n,r=3,o=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,r,o)}function L(e,t,n,r=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${n}`,r)}function M(e,t,n,r=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${n}`,r)}var pe=5,de=5,me="git commit";function w(e,t,n,r=pe){return e.prepare(`SELECT e.session_id AS sessionId,
              COUNT(*) AS edits
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool IN ('Edit', 'Write')
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
       GROUP BY e.session_id
       HAVING edits >= ?
          AND EXISTS (
            SELECT 1 FROM events c
            WHERE c.session_id = e.session_id
              AND c.tool = 'Bash'
              AND json_extract(c.meta, '$.cmd_class') IS NOT NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM events v
            WHERE v.session_id = e.session_id
              AND v.tool = 'Bash'
              AND json_extract(v.meta, '$.cmd_class') IN ('test', 'typecheck')
          )
       ORDER BY edits DESC
       LIMIT 20`).all(t,`-${n}`,r)}function v(e,t,n){let r=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd_class') = 'git'
         AND json_extract(e.meta, '$.cmd') LIKE ? || '%'
         AND NOT EXISTS (
           SELECT 1 FROM events t
           WHERE t.session_id = e.session_id
             AND t.id < e.id
             AND t.tool = 'Bash'
             AND t.success = 1
             AND json_extract(t.meta, '$.cmd_class') = 'test'
         )
       ORDER BY e.id`).all(t,`-${n}`,me);return{count:r.length,sample:r.slice(0,de).map(o=>o.cmd)}}var ge=2;function $(e,t,n=ge){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(DISTINCT s.repo) AS repos,
              COUNT(*) AS total
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING repos >= ? AND total >= ?
       ORDER BY repos DESC, total DESC
       LIMIT 20`).all(`-${t}`,n,3)}function P(e,t,n){let r=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${n}`);return new Set(r.map(o=>o.skill))}var fe=8,Ee=4,Se={failure_cluster:"systematic-debugging",retry_storm:"systematic-debugging",edited_without_tests:"test-driven-development",unverified_commit:"verification-before-completion"},he="onFail";function _e(e){let t=e[he];if(!Array.isArray(t))return[];let n=[];for(let r of t){if(r===null||typeof r!="object"||typeof r.match!="string"||typeof r.skill!="string")continue;let o=R(r.match);o&&n.push({regex:o,skill:r.skill})}return n}function f(e){return e>=fe?"high":e>=Ee?"medium":"low"}var Ae=100,Te=50;function U(e){return e>=Ae?"high":e>=Te?"medium":"low"}var be=50;function F(e,t,n,r,o,c=Se,d){let l=[];for(let s of x(e,t,n,[],o?.toilMin))l.push({kind:"automate-command",target:s.cmd,patternType:"toil_loop",baseline:s.count,severity:f(s.count)});for(let s of M(e,t,n,o?.coldMin))l.push({kind:"split-or-summarize",target:s.file,patternType:"cold_read",baseline:s.count,severity:f(s.count)});for(let s of L(e,t,n,o?.retryMin))l.push({kind:"investigate-file",target:s.file,patternType:"retry_storm",baseline:s.count,severity:f(s.count)});for(let s of O(e,t,n,o?.failMin))l.push({kind:"fix-failing-command",target:s.cmd,patternType:"failure_cluster",baseline:s.count,severity:f(s.count)});for(let s of I(e,t,n,o?.slowMin,o?.slowMs))l.push({kind:"speed-up-command",target:s.cmd,patternType:"slow_command",baseline:s.count,severity:f(s.count)});for(let s of w(e,t,n))l.push({kind:"run-tests-after-edits",target:s.sessionId,patternType:"edited_without_tests",baseline:s.edits,severity:f(s.edits)});let i=v(e,t,n);if(i.count>0&&l.push({kind:"verify-before-commit",target:"git commit",patternType:"unverified_commit",baseline:i.count,severity:f(i.count)}),r&&r.budget>0&&r.tokensToday>r.budget){let s=Math.round((r.tokensToday-r.budget)/r.budget*100);l.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:s,severity:U(s)})}r&&r.trendPct!==null&&r.trendPct>=be&&l.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:r.trendPct,severity:U(r.trendPct)});for(let s of $(e,n))l.push({kind:"promote-to-canonical",target:s.cmd,patternType:"cross_repo",baseline:s.repos,severity:f(s.repos)});let a=_e(c),u=s=>{if(s.patternType==="failure_cluster"){let m=a.find(h=>h.regex.test(s.target));if(m)return m.skill}let p=c[s.patternType];return typeof p=="string"?p:void 0},g=P(e,t,n),E=d&&d.length>0?new Set(d):null,S=new Set;for(let s of[...l]){let p=u(s);if(!p||g.has(p)||S.has(p))continue;S.add(p);let m=E!==null&&!E.has(p);l.push({kind:m?"create-skill":"consider-skill",target:p,patternType:"uncovered_friction",baseline:s.baseline,severity:f(s.baseline),...m?{source:{patternType:s.patternType,target:s.target}}:{}})}return l}import{basename as Re,dirname as Ne}from"node:path";var De=14,ke=3,ye=3,Ce=6,xe=3,Oe=1440*60*1e3,Ie=" > ";function Le(e,t){return e==="Bash"?t.cmd_class?{step:t.cmd_class,display:t.cmd??t.cmd_class}:null:(e==="Edit"||e==="Write")&&t.file?{step:`edit@${Re(Ne(t.file))}`,display:t.file}:null}function H(e,t){let n=new Date(t.getTime()-De*Oe).toISOString(),r=e.prepare(`SELECT e.session_id AS sessionId, s.repo AS repo, e.tool AS tool, e.meta AS meta
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.ts >= ?
       ORDER BY e.session_id, e.id`).all(n),o=new Map;for(let i of r){let a;try{a=JSON.parse(i.meta??"{}")}catch{continue}let u=Le(i.tool,a);if(!u)continue;let g=o.get(i.sessionId)??{repo:i.repo,steps:[]};g.steps.push(u),o.set(i.sessionId,g)}let c=new Map;for(let[i,{repo:a,steps:u}]of o){let g=new Set;for(let E=ye;E<=Ce;E++)for(let S=0;S+E<=u.length;S++){let s=u.slice(S,S+E),p=s.map(h=>h.step).join(Ie);if(g.has(p))continue;g.add(p);let m=c.get(p)??{steps:s.map(h=>h.step),sessionIds:new Set,repos:new Set,examples:[]};m.sessionIds.add(i),m.repos.add(a),m.examples.length<xe&&m.examples.push(s.map(h=>h.display)),c.set(p,m)}}let d=[...c.entries()].filter(([,i])=>i.sessionIds.size>=ke);return d.filter(([i,a])=>!d.some(([u,g])=>g.steps.length>a.steps.length&&g.sessionIds.size===a.sessionIds.size&&u.includes(i))).map(([i,a])=>{let u=[...a.repos].sort();return{signature:i,steps:a.steps,supportSessions:a.sessionIds.size,repos:u,scope:u.length>=2?"global":"local",score:a.sessionIds.size*a.steps.length,examples:a.examples}}).sort((i,a)=>a.score-i.score)}function W(e,t,n){e.prepare("UPDATE actions SET status = 'applied', applied_at = ? WHERE id = ?").run(n,t)}function G(e,t){e.prepare("UPDATE actions SET status = 'dropped' WHERE id = ?").run(t)}function j(e,t,n,r=new Date){let o=e.prepare("SELECT repo, kind, target, baseline FROM actions WHERE id = ?").get(t);if(!o)return null;let{repo:c,kind:d,target:l,baseline:i}=o,a=d==="infer-skill"?H(e,r).find(u=>u.signature===l)?.supportSessions??0:F(e,c,n).find(u=>u.kind===d&&u.target===l)?.baseline??0;return e.prepare("UPDATE actions SET after_metric = ?, status = 'measured' WHERE id = ?").run(a,t),{baseline:i,after:a,delta:i-a}}var Me=24;function we(e,t){let n=_();try{return W(n,e,t.toISOString()),`Action ${e} marked applied. Run measure later to capture its ROI.`}finally{A(n)}}function ve(e){let t=_();try{return G(t,e),`Action ${e} dropped; chardon will stop proposing it.`}finally{A(t)}}function $e(e,t){let n=_();try{let r=j(n,e,t);return r?`Action ${e}: friction ${r.baseline} \u2192 ${r.after} (reduced by ${r.delta}).`:`Action ${e} not found.`}finally{A(n)}}function Pe(e,t){let[n,r]=e,o=Number.parseInt(r??"",10);if(Number.isNaN(o))return"Usage: <apply|drop|measure> <action-id>";switch(n){case"apply":return we(o,t);case"drop":return ve(o);case"measure":return $e(o,Me);default:return`Unknown action "${n}". Usage: <apply|drop|measure> <action-id>`}}T("roi-actions")&&console.log(Pe(process.argv.slice(2),new Date));export{we as runApply,ve as runDrop,$e as runMeasure,Pe as runRoiAction};
