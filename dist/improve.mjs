import{basename as Ne}from"node:path";import{basename as K}from"node:path";function D(e){let t=process.argv[1];if(!t)return!1;let o=K(t);return o===`${e}.ts`||o===`${e}.mjs`||o===`${e}.js`}import{createRequire as ie}from"node:module";import{chmodSync as ae,mkdirSync as ce,readFileSync as ue}from"node:fs";import{dirname as x,join as de}from"node:path";import{fileURLToPath as pe}from"node:url";import{existsSync as z,readFileSync as N}from"node:fs";import{homedir as X}from"node:os";import{basename as Q,join as _,resolve as E,sep as Z}from"node:path";import{fileURLToPath as ee}from"node:url";var te=/-wt-\d+$/,ne=".chardon.json",re=ee(new URL("../",import.meta.url)),oe=_(re,"config","chardon.default.json");function y(e){let t=JSON.parse(N(oe,"utf-8")),o=_(e,ne),n={...t};if(z(o))try{let s=JSON.parse(N(o,"utf-8"));n={...t,...s},n.gitlab={...t.gitlab,...s.gitlab??{}},n.thresholds={...t.thresholds,...s.thresholds??{}}}catch{}try{new RegExp(n.ticketRegex)}catch{n.ticketRegex=t.ticketRegex}return n.outDir=se(e,n.outDir,t.outDir),n}function A(){return process.env.CHARDON_DB??_(X(),".claude","chardon.db")}function T(e){return Q(e).replace(te,"")}function se(e,t,o){let n=E(e),s=E(n,t);return s===n||s.startsWith(n+Z)?s:E(n,o)}var me=ie(import.meta.url),{DatabaseSync:le}=me("node:sqlite");function ge(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}ge();var fe=de(x(pe(import.meta.url)),"schema.sql"),O=2;function I(){let e=A();ce(x(e),{recursive:!0});let t=new le(e);try{ae(e,384)}catch{}t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let o=ue(fe,"utf-8"),n=be(t);return n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(o),n&&he(t),t.prepare("PRAGMA user_version").get().user_version!==O&&t.exec(`PRAGMA user_version = ${O}`),t}function be(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function he(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function w(e){try{e.close()}catch{}}function b(e,t,o,n,s=3){let a=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,s);if(n.length===0)return a;let i=new Set(n);return a.filter(u=>!i.has(u.cmd))}function M(e,t,o,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,n,s)}function v(e,t,o,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${o}`,n)}var ke=2;function $(e,t,o=ke){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(`-${t}`,o,3)}function P(e,t,o){let n=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${o}`);return new Set(n.map(s=>s.skill))}var Re=8,Se=4,Ee={failure_cluster:"systematic-debugging",retry_storm:"recurring-bug-root-cause"};function m(e){return e>=Re?"high":e>=Se?"medium":"low"}var _e=100,Te=50;function C(e){return e>=_e?"high":e>=Te?"medium":"low"}var Ce=new Set(["over_budget","token_growth"]);function U(e,t){return Ce.has(e)?C(t):m(t)}var De=50;function F(e,t){switch(e){case"automate-command":return`run less often, or add \`${t}\` to \`toilExclusions\` / script it`;case"fix-failing-command":return`\`${t}\` fails every run \u2014 fix or guard it instead of rerunning`;case"speed-up-command":return`\`${t}\` is slow \u2014 cache, scope, or parallelize it`;case"split-or-summarize":return`summarize \`${t}\` into a memory note so it isn't re-read`;case"investigate-file":return`\`${t}\` is edited repeatedly \u2014 find the root cause`;case"consider-skill":return`invoke the \`${t}\` skill next time this friction appears`;case"reduce-token-spend":return"trim context: large re-reads and long transcripts drive spend";case"investigate-token-growth":return"token use jumped week-over-week \u2014 check for context churn";default:return""}}function k(e,t,o,n,s){let a=[];for(let r of b(e,t,o,[],s?.toilMin))a.push({kind:"automate-command",target:r.cmd,patternType:"toil_loop",baseline:r.count,severity:m(r.count)});for(let r of h(e,t,o,s?.coldMin))a.push({kind:"split-or-summarize",target:r.file,patternType:"cold_read",baseline:r.count,severity:m(r.count)});for(let r of v(e,t,o,s?.retryMin))a.push({kind:"investigate-file",target:r.file,patternType:"retry_storm",baseline:r.count,severity:m(r.count)});for(let r of M(e,t,o,s?.failMin))a.push({kind:"fix-failing-command",target:r.cmd,patternType:"failure_cluster",baseline:r.count,severity:m(r.count)});for(let r of L(e,t,o,s?.slowMin,s?.slowMs))a.push({kind:"speed-up-command",target:r.cmd,patternType:"slow_command",baseline:r.count,severity:m(r.count)});if(n&&n.budget>0&&n.tokensToday>n.budget){let r=Math.round((n.tokensToday-n.budget)/n.budget*100);a.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:r,severity:C(r)})}n&&n.trendPct!==null&&n.trendPct>=De&&a.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:n.trendPct,severity:C(n.trendPct)});let i=P(e,t,o),u=new Set;for(let r of[...a]){let d=Ee[r.patternType];!d||i.has(d)||u.has(d)||(u.add(d),a.push({kind:"consider-skill",target:d,patternType:"uncovered_friction",baseline:r.baseline,severity:m(r.baseline)}))}return a}function H(e,t,o){let n=e.prepare(`SELECT COUNT(*) AS cnt
     FROM actions
     WHERE repo = ?
       AND kind = ?
       AND target = ?
       AND (
         status IN ('proposed', 'applied', 'dropped')
         OR (status = 'measured' AND after_metric IS NOT NULL AND after_metric >= baseline)
       )`),s=e.prepare(`INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
     VALUES (?, ?, ?, ?, ?, 'proposed')`),a=0;for(let i of o)n.get(t,i.kind,i.target).cnt>0||(s.run(t,i.kind,i.target,i.patternType,i.baseline),a++);return a}function W(e,t){return e.prepare(`SELECT id,
              kind,
              target,
              pattern_type AS patternType,
              baseline,
              status
       FROM actions
       WHERE repo = ?
         AND status IN ('proposed', 'applied')
       ORDER BY id`).all(t)}function j(e,t,o){let n=e.prepare(`SELECT kind, target, baseline, after_metric AS after
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
         AND after_metric IS NOT NULL
         AND after_metric < baseline
       ORDER BY id DESC`).all(t);if(n.length===0)return[];let s=k(e,t,o),a=new Set,i=[];for(let u of n){let r=`${u.kind}\0${u.target}`;if(a.has(r))continue;a.add(r);let d=s.find(p=>p.kind===u.kind&&p.target===u.target);d&&d.baseline>=u.baseline&&i.push({kind:u.kind,target:u.target,baseline:u.baseline,after:u.after,current:d.baseline})}return i}function B(e,t){return e.prepare(`SELECT kind,
              target,
              baseline,
              after_metric AS after,
              baseline - after_metric AS delta
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
       ORDER BY id`).all(t)}function G(e,t,o,n){return e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(t,o,n)?.total??0}var R=168;function Y(e,t,o){let n=o.toISOString().slice(0,10),s=3600*1e3,a=new Date(o.getTime()-R*s).toISOString().slice(0,10),i=new Date(o.getTime()-2*R*s).toISOString().slice(0,10),u=b(e,t,R,[]),r=h(e,t,R),d=e.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(t,a),p=e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(t,i,a),g=d??{input:0,output:0,cacheRead:0},f=g.input+g.output,l=p?.total??0,S=l>0?Math.round((f-l)/l*100):null;return{repo:t,weekStart:a,weekEnd:n,toil:u,coldReads:r,tokens:g,tokenTrend:{thisWeek:f,lastWeek:l,pct:S}}}var ye={high:"\u{1F534}",medium:"\u{1F7E1}",low:"\u26AA"};function Ae(e){let{proposals:t,open:o,roi:n}=e,s=e.regressions??[];if(t.length===0&&s.length===0&&(e.crossRepo??[]).length===0&&o.length===0&&n.length===0)return"No improvements to show \u2014 no friction detected yet.";let i=["# Chardon Improve Digest",""];if(i.push("## Prioritized Proposals",""),t.length===0)i.push("No proposals.","");else{for(let r of t){let d=ye[r.severity]??"\u26AA";i.push(`- ${d} **${r.kind}** \u2192 \`${r.target}\` (baseline: ${r.baseline})`);let p=F(r.kind,r.target);p&&i.push(`  \u21B3 ${p}`)}i.push("")}if(s.length>0){i.push("## Regressions","");for(let r of s)i.push(`- \u26A0\uFE0F **${r.kind}** \u2192 \`${r.target}\` regressed (now ${r.current}, baseline was ${r.baseline})`);i.push("")}let u=e.crossRepo??[];if(u.length>0){i.push("## Cross-project candidates (Ronce Racine)","");for(let r of u)i.push(`- \u{1F33F} \`${r.cmd}\` recurs across ${r.repos} repos \u2192 consider a canonical rule/skill`);i.push("")}if(i.push("## Open Actions",""),o.length===0)i.push("No open actions.","");else{for(let r of o)i.push(`- \`#${r.id}\` [${r.status}] **${r.kind}** \u2192 \`${r.target}\``);i.push("")}if(i.push("## Measured ROI",""),n.length===0)i.push("No measured ROI yet.","");else{for(let r of n)i.push(`- **${r.kind}** \u2192 \`${r.target}\`: friction reduced by **${r.delta}**`);i.push("")}return i.join(`
`)}async function Oe(e){let{projectDir:t,hoursBack:o,now:n}=e,s=T(t),a=I(),i;try{let u=y(t),r;if(n){let c=/-wt-\d+$/.test(Ne(t))?"worktree":"main",V=n.toISOString().slice(0,10),J=G(a,s,c,V),q=Y(a,s,n).tokenTrend?.pct??null;r={budget:u.tokenBudgetPerDay,tokensToday:J,trendPct:q}}H(a,s,k(a,s,o,r,u.thresholds));let d=W(a,s),p=d.map(c=>({id:c.id,kind:c.kind,target:c.target,status:c.status})),g=B(a,s).map(c=>({kind:c.kind,target:c.target,delta:c.delta})),f=j(a,s,o).map(c=>({kind:c.kind,target:c.target,baseline:c.baseline,current:c.current})),l=$(a,o).map(c=>({cmd:c.cmd,repos:c.repos})),S=d.filter(c=>c.status==="proposed").map(c=>({kind:c.kind,target:c.target,patternType:c.patternType,baseline:c.baseline,severity:U(c.patternType,c.baseline)}));i=Ae({proposals:S,regressions:f,crossRepo:l,open:p,roi:g})}finally{w(a)}return{digest:i}}if(D("improve")){let{digest:e}=await Oe({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),hoursBack:24,now:new Date});console.log(e)}export{Ae as renderImproveDigest,Oe as runImprove};
