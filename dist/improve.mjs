import{basename as Ce}from"node:path";import{basename as K}from"node:path";function D(t){let e=process.argv[1];if(!e)return!1;let r=K(e);return r===`${t}.ts`||r===`${t}.mjs`||r===`${t}.js`}import{createRequire as se}from"node:module";import{chmodSync as ie,readFileSync as ae}from"node:fs";import{dirname as ce,join as ue}from"node:path";import{fileURLToPath as de}from"node:url";import{existsSync as q,readFileSync as N}from"node:fs";import{homedir as z}from"node:os";import{basename as X,join as _,resolve as S,sep as Q}from"node:path";import{fileURLToPath as Z}from"node:url";var ee=/-wt-\d+$/,te=".chardon.json",ne=Z(new URL("../",import.meta.url)),oe=_(ne,"config","chardon.default.json");function y(t){let e=JSON.parse(N(oe,"utf-8")),r=_(t,te),n={...e};if(q(r))try{let s=JSON.parse(N(r,"utf-8"));n={...e,...s},n.gitlab={...e.gitlab,...s.gitlab??{}},n.thresholds={...e.thresholds,...s.thresholds??{}}}catch{}try{new RegExp(n.ticketRegex)}catch{n.ticketRegex=e.ticketRegex}return n.outDir=re(t,n.outDir,e.outDir),n}function A(){return process.env.CHARDON_DB??_(z(),".claude","chardon.db")}function T(t){return X(t).replace(ee,"")}function re(t,e,r){let n=S(t),s=S(n,e);return s===n||s.startsWith(n+Q)?s:S(n,r)}var pe=se(import.meta.url),{DatabaseSync:me}=pe("node:sqlite"),le=ue(ce(de(import.meta.url)),"schema.sql"),O=2;function x(){let t=A(),e=new me(t);try{ie(t,384)}catch{}e.exec("PRAGMA busy_timeout = 5000"),e.exec("PRAGMA journal_mode = WAL"),e.exec("PRAGMA foreign_keys = ON");let r=ae(le,"utf-8"),n=ge(e);return n&&e.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),e.exec(r),n&&fe(e),e.prepare("PRAGMA user_version").get().user_version!==O&&e.exec(`PRAGMA user_version = ${O}`),e}function ge(t){return t.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!t.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function fe(t){t.exec("BEGIN");try{t.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),t.exec("DROP TABLE token_usage_legacy"),t.exec("COMMIT")}catch(e){throw t.exec("ROLLBACK"),e}}function I(t){try{t.close()}catch{}}function b(t,e,r,n,s=3){let a=t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(e,`-${r}`,s);if(n.length===0)return a;let i=new Set(n);return a.filter(u=>!i.has(u.cmd))}function w(t,e,r,n=3){return t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(e,`-${r}`,n)}function M(t,e,r,n=3,s=3e4){return t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(e,`-${r}`,n,s)}function L(t,e,r,n=4){return t.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(e,`-${r}`,n)}function h(t,e,r,n=3){return t.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(e,`-${r}`,n)}var be=2;function v(t,e,r=be){return t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(`-${e}`,r,3)}function $(t,e,r){let n=t.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(e,`-${r}`);return new Set(n.map(s=>s.skill))}var he=8,ke=4,Re={failure_cluster:"systematic-debugging",retry_storm:"recurring-bug-root-cause"};function m(t){return t>=he?"high":t>=ke?"medium":"low"}var Ee=100,Se=50;function C(t){return t>=Ee?"high":t>=Se?"medium":"low"}var _e=new Set(["over_budget","token_growth"]);function P(t,e){return _e.has(t)?C(e):m(e)}var Te=50;function U(t,e){switch(t){case"automate-command":return`run less often, or add \`${e}\` to \`toilExclusions\` / script it`;case"fix-failing-command":return`\`${e}\` fails every run \u2014 fix or guard it instead of rerunning`;case"speed-up-command":return`\`${e}\` is slow \u2014 cache, scope, or parallelize it`;case"split-or-summarize":return`summarize \`${e}\` into a memory note so it isn't re-read`;case"investigate-file":return`\`${e}\` is edited repeatedly \u2014 find the root cause`;case"consider-skill":return`invoke the \`${e}\` skill next time this friction appears`;case"reduce-token-spend":return"trim context: large re-reads and long transcripts drive spend";case"investigate-token-growth":return"token use jumped week-over-week \u2014 check for context churn";default:return""}}function k(t,e,r,n,s){let a=[];for(let o of b(t,e,r,[],s?.toilMin))a.push({kind:"automate-command",target:o.cmd,patternType:"toil_loop",baseline:o.count,severity:m(o.count)});for(let o of h(t,e,r,s?.coldMin))a.push({kind:"split-or-summarize",target:o.file,patternType:"cold_read",baseline:o.count,severity:m(o.count)});for(let o of L(t,e,r,s?.retryMin))a.push({kind:"investigate-file",target:o.file,patternType:"retry_storm",baseline:o.count,severity:m(o.count)});for(let o of w(t,e,r,s?.failMin))a.push({kind:"fix-failing-command",target:o.cmd,patternType:"failure_cluster",baseline:o.count,severity:m(o.count)});for(let o of M(t,e,r,s?.slowMin,s?.slowMs))a.push({kind:"speed-up-command",target:o.cmd,patternType:"slow_command",baseline:o.count,severity:m(o.count)});if(n&&n.budget>0&&n.tokensToday>n.budget){let o=Math.round((n.tokensToday-n.budget)/n.budget*100);a.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:o,severity:C(o)})}n&&n.trendPct!==null&&n.trendPct>=Te&&a.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:n.trendPct,severity:C(n.trendPct)});let i=$(t,e,r),u=new Set;for(let o of[...a]){let d=Re[o.patternType];!d||i.has(d)||u.has(d)||(u.add(d),a.push({kind:"consider-skill",target:d,patternType:"uncovered_friction",baseline:o.baseline,severity:m(o.baseline)}))}return a}function F(t,e,r){let n=t.prepare(`SELECT COUNT(*) AS cnt
     FROM actions
     WHERE repo = ?
       AND kind = ?
       AND target = ?
       AND (
         status IN ('proposed', 'applied', 'dropped')
         OR (status = 'measured' AND after_metric IS NOT NULL AND after_metric >= baseline)
       )`),s=t.prepare(`INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
     VALUES (?, ?, ?, ?, ?, 'proposed')`),a=0;for(let i of r)n.get(e,i.kind,i.target).cnt>0||(s.run(e,i.kind,i.target,i.patternType,i.baseline),a++);return a}function H(t,e){return t.prepare(`SELECT id,
              kind,
              target,
              pattern_type AS patternType,
              baseline,
              status
       FROM actions
       WHERE repo = ?
         AND status IN ('proposed', 'applied')
       ORDER BY id`).all(e)}function W(t,e,r){let n=t.prepare(`SELECT kind, target, baseline, after_metric AS after
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
         AND after_metric IS NOT NULL
         AND after_metric < baseline
       ORDER BY id DESC`).all(e);if(n.length===0)return[];let s=k(t,e,r),a=new Set,i=[];for(let u of n){let o=`${u.kind}\0${u.target}`;if(a.has(o))continue;a.add(o);let d=s.find(p=>p.kind===u.kind&&p.target===u.target);d&&d.baseline>=u.baseline&&i.push({kind:u.kind,target:u.target,baseline:u.baseline,after:u.after,current:d.baseline})}return i}function j(t,e){return t.prepare(`SELECT kind,
              target,
              baseline,
              after_metric AS after,
              baseline - after_metric AS delta
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
       ORDER BY id`).all(e)}function B(t,e,r,n){return t.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(e,r,n)?.total??0}var R=168;function G(t,e,r){let n=r.toISOString().slice(0,10),s=3600*1e3,a=new Date(r.getTime()-R*s).toISOString().slice(0,10),i=new Date(r.getTime()-2*R*s).toISOString().slice(0,10),u=b(t,e,R,[]),o=h(t,e,R),d=t.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(e,a),p=t.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(e,i,a),g=d??{input:0,output:0,cacheRead:0},f=g.input+g.output,l=p?.total??0,E=l>0?Math.round((f-l)/l*100):null;return{repo:e,weekStart:a,weekEnd:n,toil:u,coldReads:o,tokens:g,tokenTrend:{thisWeek:f,lastWeek:l,pct:E}}}var De={high:"\u{1F534}",medium:"\u{1F7E1}",low:"\u26AA"};function Ne(t){let{proposals:e,open:r,roi:n}=t,s=t.regressions??[];if(e.length===0&&s.length===0&&(t.crossRepo??[]).length===0&&r.length===0&&n.length===0)return"No improvements to show \u2014 no friction detected yet.";let i=["# Chardon Improve Digest",""];if(i.push("## Prioritized Proposals",""),e.length===0)i.push("No proposals.","");else{for(let o of e){let d=De[o.severity]??"\u26AA";i.push(`- ${d} **${o.kind}** \u2192 \`${o.target}\` (baseline: ${o.baseline})`);let p=U(o.kind,o.target);p&&i.push(`  \u21B3 ${p}`)}i.push("")}if(s.length>0){i.push("## Regressions","");for(let o of s)i.push(`- \u26A0\uFE0F **${o.kind}** \u2192 \`${o.target}\` regressed (now ${o.current}, baseline was ${o.baseline})`);i.push("")}let u=t.crossRepo??[];if(u.length>0){i.push("## Cross-project candidates (Ronce Racine)","");for(let o of u)i.push(`- \u{1F33F} \`${o.cmd}\` recurs across ${o.repos} repos \u2192 consider a canonical rule/skill`);i.push("")}if(i.push("## Open Actions",""),r.length===0)i.push("No open actions.","");else{for(let o of r)i.push(`- \`#${o.id}\` [${o.status}] **${o.kind}** \u2192 \`${o.target}\``);i.push("")}if(i.push("## Measured ROI",""),n.length===0)i.push("No measured ROI yet.","");else{for(let o of n)i.push(`- **${o.kind}** \u2192 \`${o.target}\`: friction reduced by **${o.delta}**`);i.push("")}return i.join(`
`)}async function ye(t){let{projectDir:e,hoursBack:r,now:n}=t,s=T(e),a=x(),i;try{let u=y(e),o;if(n){let c=/-wt-\d+$/.test(Ce(e))?"worktree":"main",Y=n.toISOString().slice(0,10),V=B(a,s,c,Y),J=G(a,s,n).tokenTrend?.pct??null;o={budget:u.tokenBudgetPerDay,tokensToday:V,trendPct:J}}F(a,s,k(a,s,r,o,u.thresholds));let d=H(a,s),p=d.map(c=>({id:c.id,kind:c.kind,target:c.target,status:c.status})),g=j(a,s).map(c=>({kind:c.kind,target:c.target,delta:c.delta})),f=W(a,s,r).map(c=>({kind:c.kind,target:c.target,baseline:c.baseline,current:c.current})),l=v(a,r).map(c=>({cmd:c.cmd,repos:c.repos})),E=d.filter(c=>c.status==="proposed").map(c=>({kind:c.kind,target:c.target,patternType:c.patternType,baseline:c.baseline,severity:P(c.patternType,c.baseline)}));i=Ne({proposals:E,regressions:f,crossRepo:l,open:p,roi:g})}finally{I(a)}return{digest:i}}if(D("improve")){let{digest:t}=await ye({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),hoursBack:24,now:new Date});console.log(t)}export{Ne as renderImproveDigest,ye as runImprove};
