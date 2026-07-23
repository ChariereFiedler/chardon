import{basename as j}from"node:path";function b(e){let t=process.argv[1];if(!t)return!1;let n=j(t);return n===`${e}.ts`||n===`${e}.mjs`||n===`${e}.js`}import{createRequire as Z}from"node:module";import{chmodSync as X,closeSync as q,mkdirSync as K,openSync as Q,readFileSync as ee}from"node:fs";import{dirname as D,join as te}from"node:path";import{fileURLToPath as re}from"node:url";import{homedir as B}from"node:os";import{basename as Ie,join as T,resolve as Me,sep as Le}from"node:path";import{fileURLToPath as V}from"node:url";var Y=V(new URL("../",import.meta.url)),we=T(Y,"config","chardon.default.json");var z=100,J=5;function R(e){if(typeof e!="string"||e.length>z||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]|(?<!\()\?/g)?.length??0)>J)return null;try{return new RegExp(e)}catch{return null}}function S(){return process.env.CHARDON_DB??T(B(),".claude","chardon.db")}function h(e,t,n=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let r=t instanceof Error?t.message:t!==void 0?String(t):"";try{let o=n().toISOString();process.stderr.write(`[chardon] ${o} ${e}${r?`: ${r}`:""}
`)}catch{}}var ne=Z(import.meta.url),{DatabaseSync:se}=ne("node:sqlite");function oe(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}oe();var ie=te(D(re(import.meta.url)),"schema.sql"),N=2;function f(){let e=S();K(D(e),{recursive:!0});try{q(Q(e,"a",384)),X(e,384)}catch(a){h("db-permissions",a)}let t=new se(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let n=ee(ie,"utf-8"),r=ae(t);if(r&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(n),r&&ce(t),ue(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}if(C(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}return t.prepare("PRAGMA user_version").get().user_version!==N&&t.exec(`PRAGMA user_version = ${N}`),t}function ae(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(r=>r.name==="repo"):!1}function ce(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function C(e,t,n){let r=e.prepare(`PRAGMA table_info(${t})`).all();return r.length>0&&!r.some(o=>o.name===n)}function ue(e){return C(e,"hook_health","last_error")}function E(e){try{e.close()}catch{}}function O(e,t,n,r,o=3){let a=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,o);if(r.length===0)return a;let l=new Set(r);return a.filter(i=>!l.has(i.cmd))}function k(e,t,n,r=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,r)}function x(e,t,n,r=3,o=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,r,o)}function y(e,t,n,r=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${n}`,r)}function I(e,t,n,r=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${n}`,r)}var le=5,pe=5,de="git commit";function M(e,t,n,r=le){return e.prepare(`SELECT e.session_id AS sessionId,
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
       LIMIT 20`).all(t,`-${n}`,r)}function L(e,t,n){let r=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd
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
       ORDER BY e.id`).all(t,`-${n}`,de);return{count:r.length,sample:r.slice(0,pe).map(o=>o.cmd)}}var me=2;function v(e,t,n=me){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(`-${t}`,n,3)}function w(e,t,n){let r=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${n}`);return new Set(r.map(o=>o.skill))}var ge=8,fe=4,Ee={failure_cluster:"systematic-debugging",retry_storm:"systematic-debugging",edited_without_tests:"test-driven-development",unverified_commit:"verification-before-completion"},Ae="onFail";function _e(e){let t=e[Ae];if(!Array.isArray(t))return[];let n=[];for(let r of t){if(r===null||typeof r!="object"||typeof r.match!="string"||typeof r.skill!="string")continue;let o=R(r.match);o&&n.push({regex:o,skill:r.skill})}return n}function u(e){return e>=ge?"high":e>=fe?"medium":"low"}var be=100,Te=50;function $(e){return e>=be?"high":e>=Te?"medium":"low"}var Re=50;function U(e,t,n,r,o,a=Ee,l){let i=[];for(let s of O(e,t,n,[],o?.toilMin))i.push({kind:"automate-command",target:s.cmd,patternType:"toil_loop",baseline:s.count,severity:u(s.count)});for(let s of I(e,t,n,o?.coldMin))i.push({kind:"split-or-summarize",target:s.file,patternType:"cold_read",baseline:s.count,severity:u(s.count)});for(let s of y(e,t,n,o?.retryMin))i.push({kind:"investigate-file",target:s.file,patternType:"retry_storm",baseline:s.count,severity:u(s.count)});for(let s of k(e,t,n,o?.failMin))i.push({kind:"fix-failing-command",target:s.cmd,patternType:"failure_cluster",baseline:s.count,severity:u(s.count)});for(let s of x(e,t,n,o?.slowMin,o?.slowMs))i.push({kind:"speed-up-command",target:s.cmd,patternType:"slow_command",baseline:s.count,severity:u(s.count)});for(let s of M(e,t,n))i.push({kind:"run-tests-after-edits",target:s.sessionId,patternType:"edited_without_tests",baseline:s.edits,severity:u(s.edits)});let m=L(e,t,n);if(m.count>0&&i.push({kind:"verify-before-commit",target:"git commit",patternType:"unverified_commit",baseline:m.count,severity:u(m.count)}),r&&r.budget>0&&r.tokensToday>r.budget){let s=Math.round((r.tokensToday-r.budget)/r.budget*100);i.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:s,severity:$(s)})}r&&r.trendPct!==null&&r.trendPct>=Re&&i.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:r.trendPct,severity:$(r.trendPct)});for(let s of v(e,n))i.push({kind:"promote-to-canonical",target:s.cmd,patternType:"cross_repo",baseline:s.repos,severity:u(s.repos)});let p=_e(a),g=s=>{if(s.patternType==="failure_cluster"){let d=p.find(G=>G.regex.test(s.target));if(d)return d.skill}let c=a[s.patternType];return typeof c=="string"?c:void 0},W=w(e,t,n),A=l&&l.length>0?new Set(l):null,_=new Set;for(let s of[...i]){let c=g(s);if(!c||W.has(c)||_.has(c))continue;_.add(c);let d=A!==null&&!A.has(c);i.push({kind:d?"create-skill":"consider-skill",target:c,patternType:"uncovered_friction",baseline:s.baseline,severity:u(s.baseline),...d?{source:{patternType:s.patternType,target:s.target}}:{}})}return i}function P(e,t,n){e.prepare("UPDATE actions SET status = 'applied', applied_at = ? WHERE id = ?").run(n,t)}function H(e,t){e.prepare("UPDATE actions SET status = 'dropped' WHERE id = ?").run(t)}function F(e,t,n){let r=e.prepare("SELECT repo, kind, target, baseline FROM actions WHERE id = ?").get(t);if(!r)return null;let{repo:o,kind:a,target:l,baseline:i}=r,p=U(e,o,n).find(g=>g.kind===a&&g.target===l)?.baseline??0;return e.prepare("UPDATE actions SET after_metric = ?, status = 'measured' WHERE id = ?").run(p,t),{baseline:i,after:p,delta:i-p}}var Se=24;function he(e,t){let n=f();try{return P(n,e,t.toISOString()),`Action ${e} marked applied. Run measure later to capture its ROI.`}finally{E(n)}}function Ne(e){let t=f();try{return H(t,e),`Action ${e} dropped; chardon will stop proposing it.`}finally{E(t)}}function De(e,t){let n=f();try{let r=F(n,e,t);return r?`Action ${e}: friction ${r.baseline} \u2192 ${r.after} (reduced by ${r.delta}).`:`Action ${e} not found.`}finally{E(n)}}function Ce(e,t){let[n,r]=e,o=Number.parseInt(r??"",10);if(Number.isNaN(o))return"Usage: <apply|drop|measure> <action-id>";switch(n){case"apply":return he(o,t);case"drop":return Ne(o);case"measure":return De(o,Se);default:return`Unknown action "${n}". Usage: <apply|drop|measure> <action-id>`}}b("roi-actions")&&console.log(Ce(process.argv.slice(2),new Date));export{he as runApply,Ne as runDrop,De as runMeasure,Ce as runRoiAction};
