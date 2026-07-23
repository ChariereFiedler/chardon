import{basename as we}from"node:path";import{basename as X}from"node:path";function D(e){let t=process.argv[1];if(!t)return!1;let o=X(t);return o===`${e}.ts`||o===`${e}.mjs`||o===`${e}.js`}import{createRequire as de}from"node:module";import{chmodSync as pe,closeSync as me,mkdirSync as le,openSync as ge,readFileSync as fe}from"node:fs";import{dirname as I,join as be}from"node:path";import{fileURLToPath as he}from"node:url";import{existsSync as z,readFileSync as y}from"node:fs";import{homedir as Q}from"node:os";import{basename as Z,join as _,resolve as S,sep as ee}from"node:path";import{fileURLToPath as te}from"node:url";var ne=/-wt-\d+$/,re=".chardon.json",oe=te(new URL("../",import.meta.url)),se=_(oe,"config","chardon.default.json");function N(e){let t=JSON.parse(y(se,"utf-8")),o=_(e,re),n={...t};if(z(o))try{let s=JSON.parse(y(o,"utf-8"));n={...t,...s},n.gitlab={...t.gitlab,...s.gitlab??{}},n.thresholds={...t.thresholds,...s.thresholds??{}}}catch{}return ce(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=ue(e,n.outDir,t.outDir),n}var ie=100,ae=5;function ce(e){if(typeof e!="string"||e.length>ie||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>ae)return null;try{return new RegExp(e)}catch{return null}}function A(){return process.env.CHARDON_DB??_(Q(),".claude","chardon.db")}function T(e){return Z(e).replace(ne,"")}function ue(e,t,o){let n=S(e),s=S(n,t);return s===n||s.startsWith(n+ee)?s:S(n,o)}function O(e,t){if(process.env.CHARDON_DEBUG!=="1")return;let o=t instanceof Error?t.message:t!==void 0?String(t):"";try{process.stderr.write(`[chardon] ${e}${o?`: ${o}`:""}
`)}catch{}}var ke=de(import.meta.url),{DatabaseSync:Re}=ke("node:sqlite");function Ee(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}Ee();var Se=be(I(he(import.meta.url)),"schema.sql"),x=2;function w(){let e=A();le(I(e),{recursive:!0});try{me(ge(e,"a",384)),pe(e,384)}catch(a){O("db-permissions",a)}let t=new Re(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let o=fe(Se,"utf-8"),n=_e(t);return n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(o),n&&Te(t),t.prepare("PRAGMA user_version").get().user_version!==x&&t.exec(`PRAGMA user_version = ${x}`),t}function _e(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function Te(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function M(e){try{e.close()}catch{}}function b(e,t,o,n,s=3){let a=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,s);if(n.length===0)return a;let i=new Set(n);return a.filter(u=>!i.has(u.cmd))}function v(e,t,o,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,n)}function L(e,t,o,n=3,s=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,n)}var Ce=2;function P(e,t,o=Ce){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${o}`);return new Set(n.map(s=>s.skill))}var De=8,ye=4,Ne={failure_cluster:"systematic-debugging",retry_storm:"recurring-bug-root-cause"};function m(e){return e>=De?"high":e>=ye?"medium":"low"}var Ae=100,Oe=50;function C(e){return e>=Ae?"high":e>=Oe?"medium":"low"}var xe=new Set(["over_budget","token_growth"]);function F(e,t){return xe.has(e)?C(t):m(t)}var Ie=50;function H(e,t){switch(e){case"automate-command":return`run less often, or add \`${t}\` to \`toilExclusions\` / script it`;case"fix-failing-command":return`\`${t}\` fails every run: fix or guard it instead of rerunning`;case"speed-up-command":return`\`${t}\` is slow: cache, scope, or parallelize it`;case"split-or-summarize":return`summarize \`${t}\` into a memory note so it isn't re-read`;case"investigate-file":return`\`${t}\` is edited repeatedly: find the root cause`;case"consider-skill":return`invoke the \`${t}\` skill next time this friction appears`;case"reduce-token-spend":return"trim context: large re-reads and long transcripts drive spend";case"investigate-token-growth":return"token use jumped week-over-week: check for context churn";default:return""}}function k(e,t,o,n,s){let a=[];for(let r of b(e,t,o,[],s?.toilMin))a.push({kind:"automate-command",target:r.cmd,patternType:"toil_loop",baseline:r.count,severity:m(r.count)});for(let r of h(e,t,o,s?.coldMin))a.push({kind:"split-or-summarize",target:r.file,patternType:"cold_read",baseline:r.count,severity:m(r.count)});for(let r of $(e,t,o,s?.retryMin))a.push({kind:"investigate-file",target:r.file,patternType:"retry_storm",baseline:r.count,severity:m(r.count)});for(let r of v(e,t,o,s?.failMin))a.push({kind:"fix-failing-command",target:r.cmd,patternType:"failure_cluster",baseline:r.count,severity:m(r.count)});for(let r of L(e,t,o,s?.slowMin,s?.slowMs))a.push({kind:"speed-up-command",target:r.cmd,patternType:"slow_command",baseline:r.count,severity:m(r.count)});if(n&&n.budget>0&&n.tokensToday>n.budget){let r=Math.round((n.tokensToday-n.budget)/n.budget*100);a.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:r,severity:C(r)})}n&&n.trendPct!==null&&n.trendPct>=Ie&&a.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:n.trendPct,severity:C(n.trendPct)});let i=U(e,t,o),u=new Set;for(let r of[...a]){let d=Ne[r.patternType];!d||i.has(d)||u.has(d)||(u.add(d),a.push({kind:"consider-skill",target:d,patternType:"uncovered_friction",baseline:r.baseline,severity:m(r.baseline)}))}return a}function W(e,t,o){let n=e.prepare(`SELECT COUNT(*) AS cnt
     FROM actions
     WHERE repo = ?
       AND kind = ?
       AND target = ?
       AND (
         status IN ('proposed', 'applied', 'dropped')
         OR (status = 'measured' AND after_metric IS NOT NULL AND after_metric >= baseline)
       )`),s=e.prepare(`INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
     VALUES (?, ?, ?, ?, ?, 'proposed')`),a=0;for(let i of o)n.get(t,i.kind,i.target).cnt>0||(s.run(t,i.kind,i.target,i.patternType,i.baseline),a++);return a}function j(e,t){return e.prepare(`SELECT id,
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
       ORDER BY id DESC`).all(t);if(n.length===0)return[];let s=k(e,t,o),a=new Set,i=[];for(let u of n){let r=`${u.kind}\0${u.target}`;if(a.has(r))continue;a.add(r);let d=s.find(p=>p.kind===u.kind&&p.target===u.target);d&&d.baseline>=u.baseline&&i.push({kind:u.kind,target:u.target,baseline:u.baseline,after:u.after,current:d.baseline})}return i}function G(e,t){return e.prepare(`SELECT kind,
              target,
              baseline,
              after_metric AS after,
              baseline - after_metric AS delta
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
       ORDER BY id`).all(t)}function Y(e,t,o,n){return e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(t,o,n)?.total??0}var R=168;function V(e,t,o){let n=o.toISOString().slice(0,10),s=3600*1e3,a=new Date(o.getTime()-R*s).toISOString().slice(0,10),i=new Date(o.getTime()-2*R*s).toISOString().slice(0,10),u=b(e,t,R,[]),r=h(e,t,R),d=e.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(t,a),p=e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(t,i,a),g=d??{input:0,output:0,cacheRead:0},f=g.input+g.output,l=p?.total??0,E=l>0?Math.round((f-l)/l*100):null;return{repo:t,weekStart:a,weekEnd:n,toil:u,coldReads:r,tokens:g,tokenTrend:{thisWeek:f,lastWeek:l,pct:E}}}var Me={high:"\u{1F534}",medium:"\u{1F7E1}",low:"\u26AA"};function ve(e){let{proposals:t,open:o,roi:n}=e,s=e.regressions??[];if(t.length===0&&s.length===0&&(e.crossRepo??[]).length===0&&o.length===0&&n.length===0)return"No improvements to show: no friction detected yet.";let i=["# Chardon Improve Digest",""];if(i.push("## Prioritized Proposals",""),t.length===0)i.push("No proposals.","");else{for(let r of t){let d=Me[r.severity]??"\u26AA";i.push(`- ${d} **${r.kind}** \u2192 \`${r.target}\` (baseline: ${r.baseline})`);let p=H(r.kind,r.target);p&&i.push(`  \u21B3 ${p}`)}i.push("")}if(s.length>0){i.push("## Regressions","");for(let r of s)i.push(`- \u26A0\uFE0F **${r.kind}** \u2192 \`${r.target}\` regressed (now ${r.current}, baseline was ${r.baseline})`);i.push("")}let u=e.crossRepo??[];if(u.length>0){i.push("## Cross-project candidates (Ronce Racine)","");for(let r of u)i.push(`- \u{1F33F} \`${r.cmd}\` recurs across ${r.repos} repos \u2192 consider a canonical rule/skill`);i.push("")}if(i.push("## Open Actions",""),o.length===0)i.push("No open actions.","");else{for(let r of o)i.push(`- \`#${r.id}\` [${r.status}] **${r.kind}** \u2192 \`${r.target}\``);i.push("")}if(i.push("## Measured ROI",""),n.length===0)i.push("No measured ROI yet.","");else{for(let r of n)i.push(`- **${r.kind}** \u2192 \`${r.target}\`: friction reduced by **${r.delta}**`);i.push("")}return i.join(`
`)}async function Le(e){let{projectDir:t,hoursBack:o,now:n}=e,s=T(t),a=w(),i;try{let u=N(t),r;if(n){let c=/-wt-\d+$/.test(we(t))?"worktree":"main",J=n.toISOString().slice(0,10),q=Y(a,s,c,J),K=V(a,s,n).tokenTrend?.pct??null;r={budget:u.tokenBudgetPerDay,tokensToday:q,trendPct:K}}W(a,s,k(a,s,o,r,u.thresholds));let d=j(a,s),p=d.map(c=>({id:c.id,kind:c.kind,target:c.target,status:c.status})),g=G(a,s).map(c=>({kind:c.kind,target:c.target,delta:c.delta})),f=B(a,s,o).map(c=>({kind:c.kind,target:c.target,baseline:c.baseline,current:c.current})),l=P(a,o).map(c=>({cmd:c.cmd,repos:c.repos})),E=d.filter(c=>c.status==="proposed").map(c=>({kind:c.kind,target:c.target,patternType:c.patternType,baseline:c.baseline,severity:F(c.patternType,c.baseline)}));i=ve({proposals:E,regressions:f,crossRepo:l,open:p,roi:g})}finally{M(a)}return{digest:i}}if(D("improve")){let{digest:e}=await Le({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),hoursBack:24,now:new Date});console.log(e)}export{ve as renderImproveDigest,Le as runImprove};
