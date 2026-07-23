import{basename as ve}from"node:path";import{basename as K}from"node:path";function C(e){let t=process.argv[1];if(!t)return!1;let r=K(t);return r===`${e}.ts`||r===`${e}.mjs`||r===`${e}.js`}import{createRequire as le}from"node:module";import{chmodSync as me,closeSync as ge,mkdirSync as fe,openSync as he,readFileSync as be}from"node:fs";import{dirname as w,join as Ee}from"node:path";import{fileURLToPath as Re}from"node:url";import{existsSync as Q,readFileSync as S}from"node:fs";import{homedir as ee}from"node:os";import{basename as te,join as h,resolve as k,sep as ne}from"node:path";import{fileURLToPath as re}from"node:url";var oe=/-wt-\d+$/,N=".chardon.json",se=re(new URL("../",import.meta.url)),ie=h(se,"config","chardon.default.json");function y(e){let t=JSON.parse(S(ie,"utf-8")),r=h(e,N),n={...t};if(Q(r))try{let s=JSON.parse(S(r,"utf-8"));n={...t,...s},n.gitlab={...t.gitlab,...s.gitlab??{}},n.thresholds={...t.thresholds,...s.thresholds??{}}}catch{}return ue(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=de(e,n.outDir,t.outDir),n}var ae=100,ce=5;function ue(e){if(typeof e!="string"||e.length>ae||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>ce)return null;try{return new RegExp(e)}catch{return null}}function O(){return process.env.CHARDON_DB??h(ee(),".claude","chardon.db")}var pe=/^[a-z0-9][a-z0-9._-]{0,63}$/;function A(e){try{let t=S(h(e,N),"utf-8"),r=JSON.parse(t).repoName;if(typeof r=="string"&&pe.test(r))return r}catch{}return te(e).replace(oe,"")}function de(e,t,r){let n=k(e),s=k(n,t);return s===n||s.startsWith(n+ne)?s:k(n,r)}function x(e,t,r=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let s=r().toISOString();process.stderr.write(`[chardon] ${s} ${e}${n?`: ${n}`:""}
`)}catch{}}var _e=le(import.meta.url),{DatabaseSync:Te}=_e("node:sqlite");function ke(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}ke();var Se=Ee(w(Re(import.meta.url)),"schema.sql"),I=2;function M(){let e=O();fe(w(e),{recursive:!0});try{ge(he(e,"a",384)),me(e,384)}catch(i){x("db-permissions",i)}let t=new Te(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let r=be(Se,"utf-8"),n=Ae(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(r),n&&De(t),Ce(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}if(L(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}return t.prepare("PRAGMA user_version").get().user_version!==I&&t.exec(`PRAGMA user_version = ${I}`),t}function Ae(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function De(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function L(e,t,r){let n=e.prepare(`PRAGMA table_info(${t})`).all();return n.length>0&&!n.some(s=>s.name===r)}function Ce(e){return L(e,"hook_health","last_error")}function v(e){try{e.close()}catch{}}function b(e,t,r,n,s=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,s);if(n.length===0)return i;let a=new Set(n);return i.filter(u=>!a.has(u.cmd))}function $(e,t,r,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n)}function P(e,t,r,n=3,s=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n,s)}function U(e,t,r,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${r}`,n)}function E(e,t,r,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${r}`,n)}var Ne=2;function H(e,t,r=Ne){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(`-${t}`,r,3)}function F(e,t,r){let n=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${r}`);return new Set(n.map(s=>s.skill))}var ye=8,Oe=4,xe={failure_cluster:"systematic-debugging",retry_storm:"recurring-bug-root-cause"};function l(e){return e>=ye?"high":e>=Oe?"medium":"low"}var Ie=100,we=50;function D(e){return e>=Ie?"high":e>=we?"medium":"low"}var Me=new Set(["over_budget","token_growth"]);function W(e,t){return Me.has(e)?D(t):l(t)}var Le=50;function j(e,t){switch(e){case"automate-command":return`run less often, or add \`${t}\` to \`toilExclusions\` / script it`;case"fix-failing-command":return`\`${t}\` fails every run: fix or guard it instead of rerunning`;case"speed-up-command":return`\`${t}\` is slow: cache, scope, or parallelize it`;case"split-or-summarize":return`summarize \`${t}\` into a memory note so it isn't re-read`;case"investigate-file":return`\`${t}\` is edited repeatedly: find the root cause`;case"consider-skill":return`invoke the \`${t}\` skill next time this friction appears`;case"reduce-token-spend":return"trim context: large re-reads and long transcripts drive spend";case"investigate-token-growth":return"token use jumped week-over-week: check for context churn";default:return""}}function R(e,t,r,n,s){let i=[];for(let o of b(e,t,r,[],s?.toilMin))i.push({kind:"automate-command",target:o.cmd,patternType:"toil_loop",baseline:o.count,severity:l(o.count)});for(let o of E(e,t,r,s?.coldMin))i.push({kind:"split-or-summarize",target:o.file,patternType:"cold_read",baseline:o.count,severity:l(o.count)});for(let o of U(e,t,r,s?.retryMin))i.push({kind:"investigate-file",target:o.file,patternType:"retry_storm",baseline:o.count,severity:l(o.count)});for(let o of $(e,t,r,s?.failMin))i.push({kind:"fix-failing-command",target:o.cmd,patternType:"failure_cluster",baseline:o.count,severity:l(o.count)});for(let o of P(e,t,r,s?.slowMin,s?.slowMs))i.push({kind:"speed-up-command",target:o.cmd,patternType:"slow_command",baseline:o.count,severity:l(o.count)});if(n&&n.budget>0&&n.tokensToday>n.budget){let o=Math.round((n.tokensToday-n.budget)/n.budget*100);i.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:o,severity:D(o)})}n&&n.trendPct!==null&&n.trendPct>=Le&&i.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:n.trendPct,severity:D(n.trendPct)});let a=F(e,t,r),u=new Set;for(let o of[...i]){let p=xe[o.patternType];!p||a.has(p)||u.has(p)||(u.add(p),i.push({kind:"consider-skill",target:p,patternType:"uncovered_friction",baseline:o.baseline,severity:l(o.baseline)}))}return i}function B(e,t,r){let n=e.prepare(`SELECT COUNT(*) AS cnt
     FROM actions
     WHERE repo = ?
       AND kind = ?
       AND target = ?
       AND (
         status IN ('proposed', 'applied', 'dropped')
         OR (status = 'measured' AND after_metric IS NOT NULL AND after_metric >= baseline)
       )`),s=e.prepare(`INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
     VALUES (?, ?, ?, ?, ?, 'proposed')`),i=0;for(let a of r)n.get(t,a.kind,a.target).cnt>0||(s.run(t,a.kind,a.target,a.patternType,a.baseline),i++);return i}function G(e,t){return e.prepare(`SELECT id,
              kind,
              target,
              pattern_type AS patternType,
              baseline,
              status
       FROM actions
       WHERE repo = ?
         AND status IN ('proposed', 'applied')
       ORDER BY id`).all(t)}function Y(e,t,r){let n=e.prepare(`SELECT kind, target, baseline, after_metric AS after
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
         AND after_metric IS NOT NULL
         AND after_metric < baseline
       ORDER BY id DESC`).all(t);if(n.length===0)return[];let s=R(e,t,r),i=new Set,a=[];for(let u of n){let o=`${u.kind}\0${u.target}`;if(i.has(o))continue;i.add(o);let p=s.find(d=>d.kind===u.kind&&d.target===u.target);p&&p.baseline>=u.baseline&&a.push({kind:u.kind,target:u.target,baseline:u.baseline,after:u.after,current:p.baseline})}return a}function z(e,t){return e.prepare(`SELECT kind,
              target,
              baseline,
              after_metric AS after,
              baseline - after_metric AS delta
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
       ORDER BY id`).all(t)}function V(e,t,r,n){return e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(t,r,n)?.total??0}var _=168;function J(e,t,r){let n=r.toISOString().slice(0,10),s=3600*1e3,i=new Date(r.getTime()-_*s).toISOString().slice(0,10),a=new Date(r.getTime()-2*_*s).toISOString().slice(0,10),u=b(e,t,_,[]),o=E(e,t,_),p=e.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(t,i),d=e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(t,a,i),g=p??{input:0,output:0,cacheRead:0},f=g.input+g.output,m=d?.total??0,T=m>0?Math.round((f-m)/m*100):null;return{repo:t,weekStart:i,weekEnd:n,toil:u,coldReads:o,tokens:g,tokenTrend:{thisWeek:f,lastWeek:m,pct:T}}}var $e={high:"\u{1F534}",medium:"\u{1F7E1}",low:"\u26AA"};function Pe(e){let{proposals:t,open:r,roi:n}=e,s=e.regressions??[];if(t.length===0&&s.length===0&&(e.crossRepo??[]).length===0&&r.length===0&&n.length===0)return"No improvements to show: no friction detected yet.";let a=["# Chardon Improve Digest",""];if(a.push("## Prioritized Proposals",""),t.length===0)a.push("No proposals.","");else{for(let o of t){let p=$e[o.severity]??"\u26AA";a.push(`- ${p} **${o.kind}** \u2192 \`${o.target}\` (baseline: ${o.baseline})`);let d=j(o.kind,o.target);d&&a.push(`  \u21B3 ${d}`)}a.push("")}if(s.length>0){a.push("## Regressions","");for(let o of s)a.push(`- \u26A0\uFE0F **${o.kind}** \u2192 \`${o.target}\` regressed (now ${o.current}, baseline was ${o.baseline})`);a.push("")}let u=e.crossRepo??[];if(u.length>0){a.push("## Cross-project candidates (Ronce Racine)","");for(let o of u)a.push(`- \u{1F33F} \`${o.cmd}\` recurs across ${o.repos} repos \u2192 consider a canonical rule/skill`);a.push("")}if(a.push("## Open Actions",""),r.length===0)a.push("No open actions.","");else{for(let o of r)a.push(`- \`#${o.id}\` [${o.status}] **${o.kind}** \u2192 \`${o.target}\``);a.push("")}if(a.push("## Measured ROI",""),n.length===0)a.push("No measured ROI yet.","");else{for(let o of n)a.push(`- **${o.kind}** \u2192 \`${o.target}\`: friction reduced by **${o.delta}**`);a.push("")}return a.join(`
`)}async function Ue(e){let{projectDir:t,hoursBack:r,now:n}=e,s=A(t),i=M(),a;try{let u=y(t),o;if(n){let c=/-wt-\d+$/.test(ve(t))?"worktree":"main",Z=n.toISOString().slice(0,10),X=V(i,s,c,Z),q=J(i,s,n).tokenTrend?.pct??null;o={budget:u.tokenBudgetPerDay,tokensToday:X,trendPct:q}}B(i,s,R(i,s,r,o,u.thresholds));let p=G(i,s),d=p.map(c=>({id:c.id,kind:c.kind,target:c.target,status:c.status})),g=z(i,s).map(c=>({kind:c.kind,target:c.target,delta:c.delta})),f=Y(i,s,r).map(c=>({kind:c.kind,target:c.target,baseline:c.baseline,current:c.current})),m=H(i,r).map(c=>({cmd:c.cmd,repos:c.repos})),T=p.filter(c=>c.status==="proposed").map(c=>({kind:c.kind,target:c.target,patternType:c.patternType,baseline:c.baseline,severity:W(c.patternType,c.baseline)}));a=Pe({proposals:T,regressions:f,crossRepo:m,open:d,roi:g})}finally{v(i)}return{digest:a}}if(C("improve")){let{digest:e}=await Ue({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),hoursBack:24,now:new Date});console.log(e)}export{Pe as renderImproveDigest,Ue as runImprove};
