import{basename as Me}from"node:path";import{basename as q}from"node:path";function D(e){let t=process.argv[1];if(!t)return!1;let o=q(t);return o===`${e}.ts`||o===`${e}.mjs`||o===`${e}.js`}import{createRequire as pe}from"node:module";import{chmodSync as de,closeSync as le,mkdirSync as me,openSync as ge,readFileSync as fe}from"node:fs";import{dirname as I,join as be}from"node:path";import{fileURLToPath as he}from"node:url";import{existsSync as X,readFileSync as C}from"node:fs";import{homedir as K}from"node:os";import{basename as Q,join as T,resolve as k,sep as ee}from"node:path";import{fileURLToPath as te}from"node:url";var ne=/-wt-\d+$/,re=".chardon.json",oe=te(new URL("../",import.meta.url)),se=T(oe,"config","chardon.default.json");function N(e){let t=JSON.parse(C(se,"utf-8")),o=T(e,re),n={...t};if(X(o))try{let s=JSON.parse(C(o,"utf-8"));n={...t,...s},n.gitlab={...t.gitlab,...s.gitlab??{}},n.thresholds={...t.thresholds,...s.thresholds??{}}}catch{}return ce(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=ue(e,n.outDir,t.outDir),n}var ie=100,ae=5;function ce(e){if(typeof e!="string"||e.length>ie||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>ae)return null;try{return new RegExp(e)}catch{return null}}function y(){return process.env.CHARDON_DB??T(K(),".claude","chardon.db")}function S(e){return Q(e).replace(ne,"")}function ue(e,t,o){let n=k(e),s=k(n,t);return s===n||s.startsWith(n+ee)?s:k(n,o)}function O(e,t,o=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let s=o().toISOString();process.stderr.write(`[chardon] ${s} ${e}${n?`: ${n}`:""}
`)}catch{}}var Ee=pe(import.meta.url),{DatabaseSync:Re}=Ee("node:sqlite");function _e(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}_e();var ke=be(I(he(import.meta.url)),"schema.sql"),x=2;function w(){let e=y();me(I(e),{recursive:!0});try{le(ge(e,"a",384)),de(e,384)}catch(i){O("db-permissions",i)}let t=new Re(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let o=fe(ke,"utf-8"),n=Te(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(o),n&&Se(t),Ae(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}return t.prepare("PRAGMA user_version").get().user_version!==x&&t.exec(`PRAGMA user_version = ${x}`),t}function Te(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function Se(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function Ae(e){let t=e.prepare("PRAGMA table_info(hook_health)").all();return t.length>0&&!t.some(o=>o.name==="last_error")}function M(e){try{e.close()}catch{}}function b(e,t,o,n,s=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,s);if(n.length===0)return i;let a=new Set(n);return i.filter(u=>!a.has(u.cmd))}function L(e,t,o,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,n)}function v(e,t,o,n=3,s=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,n,s)}function $(e,t,o,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${o}`,n)}function h(e,t,o,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${o}`,n)}var De=2;function P(e,t,o=De){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(`-${t}`,o,3)}function U(e,t,o){let n=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${o}`);return new Set(n.map(s=>s.skill))}var Ce=8,Ne=4,ye={failure_cluster:"systematic-debugging",retry_storm:"recurring-bug-root-cause"};function l(e){return e>=Ce?"high":e>=Ne?"medium":"low"}var Oe=100,xe=50;function A(e){return e>=Oe?"high":e>=xe?"medium":"low"}var Ie=new Set(["over_budget","token_growth"]);function F(e,t){return Ie.has(e)?A(t):l(t)}var we=50;function H(e,t){switch(e){case"automate-command":return`run less often, or add \`${t}\` to \`toilExclusions\` / script it`;case"fix-failing-command":return`\`${t}\` fails every run: fix or guard it instead of rerunning`;case"speed-up-command":return`\`${t}\` is slow: cache, scope, or parallelize it`;case"split-or-summarize":return`summarize \`${t}\` into a memory note so it isn't re-read`;case"investigate-file":return`\`${t}\` is edited repeatedly: find the root cause`;case"consider-skill":return`invoke the \`${t}\` skill next time this friction appears`;case"reduce-token-spend":return"trim context: large re-reads and long transcripts drive spend";case"investigate-token-growth":return"token use jumped week-over-week: check for context churn";default:return""}}function E(e,t,o,n,s){let i=[];for(let r of b(e,t,o,[],s?.toilMin))i.push({kind:"automate-command",target:r.cmd,patternType:"toil_loop",baseline:r.count,severity:l(r.count)});for(let r of h(e,t,o,s?.coldMin))i.push({kind:"split-or-summarize",target:r.file,patternType:"cold_read",baseline:r.count,severity:l(r.count)});for(let r of $(e,t,o,s?.retryMin))i.push({kind:"investigate-file",target:r.file,patternType:"retry_storm",baseline:r.count,severity:l(r.count)});for(let r of L(e,t,o,s?.failMin))i.push({kind:"fix-failing-command",target:r.cmd,patternType:"failure_cluster",baseline:r.count,severity:l(r.count)});for(let r of v(e,t,o,s?.slowMin,s?.slowMs))i.push({kind:"speed-up-command",target:r.cmd,patternType:"slow_command",baseline:r.count,severity:l(r.count)});if(n&&n.budget>0&&n.tokensToday>n.budget){let r=Math.round((n.tokensToday-n.budget)/n.budget*100);i.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:r,severity:A(r)})}n&&n.trendPct!==null&&n.trendPct>=we&&i.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:n.trendPct,severity:A(n.trendPct)});let a=U(e,t,o),u=new Set;for(let r of[...i]){let p=ye[r.patternType];!p||a.has(p)||u.has(p)||(u.add(p),i.push({kind:"consider-skill",target:p,patternType:"uncovered_friction",baseline:r.baseline,severity:l(r.baseline)}))}return i}function W(e,t,o){let n=e.prepare(`SELECT COUNT(*) AS cnt
     FROM actions
     WHERE repo = ?
       AND kind = ?
       AND target = ?
       AND (
         status IN ('proposed', 'applied', 'dropped')
         OR (status = 'measured' AND after_metric IS NOT NULL AND after_metric >= baseline)
       )`),s=e.prepare(`INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
     VALUES (?, ?, ?, ?, ?, 'proposed')`),i=0;for(let a of o)n.get(t,a.kind,a.target).cnt>0||(s.run(t,a.kind,a.target,a.patternType,a.baseline),i++);return i}function j(e,t){return e.prepare(`SELECT id,
              kind,
              target,
              pattern_type AS patternType,
              baseline,
              status
       FROM actions
       WHERE repo = ?
         AND status IN ('proposed', 'applied')
       ORDER BY id`).all(t)}function B(e,t,o){let n=e.prepare(`SELECT kind, target, baseline, after_metric AS after
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
         AND after_metric IS NOT NULL
         AND after_metric < baseline
       ORDER BY id DESC`).all(t);if(n.length===0)return[];let s=E(e,t,o),i=new Set,a=[];for(let u of n){let r=`${u.kind}\0${u.target}`;if(i.has(r))continue;i.add(r);let p=s.find(d=>d.kind===u.kind&&d.target===u.target);p&&p.baseline>=u.baseline&&a.push({kind:u.kind,target:u.target,baseline:u.baseline,after:u.after,current:p.baseline})}return a}function G(e,t){return e.prepare(`SELECT kind,
              target,
              baseline,
              after_metric AS after,
              baseline - after_metric AS delta
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
       ORDER BY id`).all(t)}function Y(e,t,o,n){return e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(t,o,n)?.total??0}var R=168;function V(e,t,o){let n=o.toISOString().slice(0,10),s=3600*1e3,i=new Date(o.getTime()-R*s).toISOString().slice(0,10),a=new Date(o.getTime()-2*R*s).toISOString().slice(0,10),u=b(e,t,R,[]),r=h(e,t,R),p=e.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(t,i),d=e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(t,a,i),g=p??{input:0,output:0,cacheRead:0},f=g.input+g.output,m=d?.total??0,_=m>0?Math.round((f-m)/m*100):null;return{repo:t,weekStart:i,weekEnd:n,toil:u,coldReads:r,tokens:g,tokenTrend:{thisWeek:f,lastWeek:m,pct:_}}}var Le={high:"\u{1F534}",medium:"\u{1F7E1}",low:"\u26AA"};function ve(e){let{proposals:t,open:o,roi:n}=e,s=e.regressions??[];if(t.length===0&&s.length===0&&(e.crossRepo??[]).length===0&&o.length===0&&n.length===0)return"No improvements to show: no friction detected yet.";let a=["# Chardon Improve Digest",""];if(a.push("## Prioritized Proposals",""),t.length===0)a.push("No proposals.","");else{for(let r of t){let p=Le[r.severity]??"\u26AA";a.push(`- ${p} **${r.kind}** \u2192 \`${r.target}\` (baseline: ${r.baseline})`);let d=H(r.kind,r.target);d&&a.push(`  \u21B3 ${d}`)}a.push("")}if(s.length>0){a.push("## Regressions","");for(let r of s)a.push(`- \u26A0\uFE0F **${r.kind}** \u2192 \`${r.target}\` regressed (now ${r.current}, baseline was ${r.baseline})`);a.push("")}let u=e.crossRepo??[];if(u.length>0){a.push("## Cross-project candidates (Ronce Racine)","");for(let r of u)a.push(`- \u{1F33F} \`${r.cmd}\` recurs across ${r.repos} repos \u2192 consider a canonical rule/skill`);a.push("")}if(a.push("## Open Actions",""),o.length===0)a.push("No open actions.","");else{for(let r of o)a.push(`- \`#${r.id}\` [${r.status}] **${r.kind}** \u2192 \`${r.target}\``);a.push("")}if(a.push("## Measured ROI",""),n.length===0)a.push("No measured ROI yet.","");else{for(let r of n)a.push(`- **${r.kind}** \u2192 \`${r.target}\`: friction reduced by **${r.delta}**`);a.push("")}return a.join(`
`)}async function $e(e){let{projectDir:t,hoursBack:o,now:n}=e,s=S(t),i=w(),a;try{let u=N(t),r;if(n){let c=/-wt-\d+$/.test(Me(t))?"worktree":"main",z=n.toISOString().slice(0,10),J=Y(i,s,c,z),Z=V(i,s,n).tokenTrend?.pct??null;r={budget:u.tokenBudgetPerDay,tokensToday:J,trendPct:Z}}W(i,s,E(i,s,o,r,u.thresholds));let p=j(i,s),d=p.map(c=>({id:c.id,kind:c.kind,target:c.target,status:c.status})),g=G(i,s).map(c=>({kind:c.kind,target:c.target,delta:c.delta})),f=B(i,s,o).map(c=>({kind:c.kind,target:c.target,baseline:c.baseline,current:c.current})),m=P(i,o).map(c=>({cmd:c.cmd,repos:c.repos})),_=p.filter(c=>c.status==="proposed").map(c=>({kind:c.kind,target:c.target,patternType:c.patternType,baseline:c.baseline,severity:F(c.patternType,c.baseline)}));a=ve({proposals:_,regressions:f,crossRepo:m,open:d,roi:g})}finally{M(i)}return{digest:a}}if(D("improve")){let{digest:e}=await $e({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),hoursBack:24,now:new Date});console.log(e)}export{ve as renderImproveDigest,$e as runImprove};
