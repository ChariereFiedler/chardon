import{basename as dt}from"node:path";import{basename as pe}from"node:path";function L(e){let t=process.argv[1];if(!t)return!1;let r=pe(t);return r===`${e}.ts`||r===`${e}.mjs`||r===`${e}.js`}import{createRequire as Ae}from"node:module";import{chmodSync as De,closeSync as Ne,mkdirSync as Ce,openSync as ye,readFileSync as Oe}from"node:fs";import{dirname as H,join as xe}from"node:path";import{fileURLToPath as Ie}from"node:url";import{existsSync as de,readFileSync as O}from"node:fs";import{homedir as me}from"node:os";import{basename as ge,join as _,resolve as y,sep as fe}from"node:path";import{fileURLToPath as he}from"node:url";var Ee=/-wt-\d+$/,v=".chardon.json",ke=he(new URL("../",import.meta.url)),be=_(ke,"config","chardon.default.json");function $(e){let t=JSON.parse(O(be,"utf-8")),r=_(e,v),n={...t};if(de(r))try{let o=JSON.parse(O(r,"utf-8"));n={...t,...o},n.gitlab={...t.gitlab,...o.gitlab??{}},n.thresholds={...t.thresholds,...o.thresholds??{}},n.skillMap={...t.skillMap,...o.skillMap??{}}}catch{}return x(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=Re(e,n.outDir,t.outDir),n}var Se=100,_e=5;function x(e){if(typeof e!="string"||e.length>Se||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]|(?<!\()\?/g)?.length??0)>_e)return null;try{return new RegExp(e)}catch{return null}}function U(){return process.env.CHARDON_DB??_(me(),".claude","chardon.db")}var Te=/^[a-z0-9][a-z0-9._-]{0,63}$/;function I(e){try{let t=O(_(e,v),"utf-8"),r=JSON.parse(t).repoName;if(typeof r=="string"&&Te.test(r))return r}catch{}return ge(e).replace(Ee,"")}function Re(e,t,r){let n=y(e),o=y(n,t);return o===n||o.startsWith(n+fe)?o:y(n,r)}function P(e,t,r=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let o=r().toISOString();process.stderr.write(`[chardon] ${o} ${e}${n?`: ${n}`:""}
`)}catch{}}var we=Ae(import.meta.url),{DatabaseSync:Me}=we("node:sqlite");function Le(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}Le();var ve=xe(H(Ie(import.meta.url)),"schema.sql"),F=2;function W(){let e=U();Ce(H(e),{recursive:!0});try{Ne(ye(e,"a",384)),De(e,384)}catch(i){P("db-permissions",i)}let t=new Me(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let r=Oe(ve,"utf-8"),n=$e(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(r),n&&Ue(t),Pe(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}if(j(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}return t.prepare("PRAGMA user_version").get().user_version!==F&&t.exec(`PRAGMA user_version = ${F}`),t}function $e(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function Ue(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function j(e,t,r){let n=e.prepare(`PRAGMA table_info(${t})`).all();return n.length>0&&!n.some(o=>o.name===r)}function Pe(e){return j(e,"hook_health","last_error")}function B(e){try{e.close()}catch{}}function T(e,t,r,n,o=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,o);if(n.length===0)return i;let s=new Set(n);return i.filter(u=>!s.has(u.cmd))}function G(e,t,r,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n)}function Y(e,t,r,n=3,o=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n,o)}function V(e,t,r,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${r}`,n)}function R(e,t,r,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${r}`,n)}var Fe=5,He=5,We="git commit";function z(e,t,r,n=Fe){return e.prepare(`SELECT e.session_id AS sessionId,
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
       LIMIT 20`).all(t,`-${r}`,n)}function J(e,t,r){let n=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd
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
       ORDER BY e.id`).all(t,`-${r}`,We);return{count:n.length,sample:n.slice(0,He).map(o=>o.cmd)}}var je=2;function A(e,t,r=je){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(`-${t}`,r,3)}function X(e,t,r){let n=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${r}`);return new Set(n.map(o=>o.skill))}var Be=8,Ge=4,Ye={failure_cluster:"systematic-debugging",retry_storm:"systematic-debugging",edited_without_tests:"test-driven-development",unverified_commit:"verification-before-completion"},Ve="onFail";function ze(e){let t=e[Ve];if(!Array.isArray(t))return[];let r=[];for(let n of t){if(n===null||typeof n!="object"||typeof n.match!="string"||typeof n.skill!="string")continue;let o=x(n.match);o&&r.push({regex:o,skill:n.skill})}return r}function f(e){return e>=Be?"high":e>=Ge?"medium":"low"}var Je=100,Xe=50;function w(e){return e>=Je?"high":e>=Xe?"medium":"low"}var Ze=new Set(["over_budget","token_growth"]);function Z(e,t){return Ze.has(e)?w(t):f(t)}var Ke=50;function K(e,t,r){switch(e){case"automate-command":return`run less often, or add \`${t}\` to \`toilExclusions\` / script it`;case"fix-failing-command":return`\`${t}\` fails every run: fix or guard it instead of rerunning`;case"speed-up-command":return`\`${t}\` is slow: cache, scope, or parallelize it`;case"split-or-summarize":return`summarize \`${t}\` into a memory note so it isn't re-read`;case"investigate-file":return`\`${t}\` is edited repeatedly: find the root cause`;case"consider-skill":return`invoke the \`${t}\` skill next time this friction appears`;case"create-skill":return`no installed skill covers this friction: draft a \`${t}\` skill from the skeleton`;case"promote-to-canonical":return`recurs across ${r??"several"} repos: promote a shared rule or skill`;case"reduce-token-spend":return"trim context: large re-reads and long transcripts drive spend";case"investigate-token-growth":return"token use jumped week-over-week: check for context churn";case"run-tests-after-edits":return`session \`${t}\` edited a lot without a test run: run the suite before moving on`;case"verify-before-commit":return`\`${t}\` ran with no prior passing test: run the tests before committing`;default:return""}}function D(e,t,r,n,o,i=Ye,s){let u=[];for(let a of T(e,t,r,[],o?.toilMin))u.push({kind:"automate-command",target:a.cmd,patternType:"toil_loop",baseline:a.count,severity:f(a.count)});for(let a of R(e,t,r,o?.coldMin))u.push({kind:"split-or-summarize",target:a.file,patternType:"cold_read",baseline:a.count,severity:f(a.count)});for(let a of V(e,t,r,o?.retryMin))u.push({kind:"investigate-file",target:a.file,patternType:"retry_storm",baseline:a.count,severity:f(a.count)});for(let a of G(e,t,r,o?.failMin))u.push({kind:"fix-failing-command",target:a.cmd,patternType:"failure_cluster",baseline:a.count,severity:f(a.count)});for(let a of Y(e,t,r,o?.slowMin,o?.slowMs))u.push({kind:"speed-up-command",target:a.cmd,patternType:"slow_command",baseline:a.count,severity:f(a.count)});for(let a of z(e,t,r))u.push({kind:"run-tests-after-edits",target:a.sessionId,patternType:"edited_without_tests",baseline:a.edits,severity:f(a.edits)});let c=J(e,t,r);if(c.count>0&&u.push({kind:"verify-before-commit",target:"git commit",patternType:"unverified_commit",baseline:c.count,severity:f(c.count)}),n&&n.budget>0&&n.tokensToday>n.budget){let a=Math.round((n.tokensToday-n.budget)/n.budget*100);u.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:a,severity:w(a)})}n&&n.trendPct!==null&&n.trendPct>=Ke&&u.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:n.trendPct,severity:w(n.trendPct)});for(let a of A(e,r))u.push({kind:"promote-to-canonical",target:a.cmd,patternType:"cross_repo",baseline:a.repos,severity:f(a.repos)});let p=ze(i),d=a=>{if(a.patternType==="failure_cluster"){let b=p.find(C=>C.regex.test(a.target));if(b)return b.skill}let g=i[a.patternType];return typeof g=="string"?g:void 0},m=X(e,t,r),E=s&&s.length>0?new Set(s):null,h=new Set;for(let a of[...u]){let g=d(a);if(!g||m.has(g)||h.has(g))continue;h.add(g);let b=E!==null&&!E.has(g);u.push({kind:b?"create-skill":"consider-skill",target:g,patternType:"uncovered_friction",baseline:a.baseline,severity:f(a.baseline),...b?{source:{patternType:a.patternType,target:a.target}}:{}})}return u}function q(e,t,r){e.prepare("SELECT COUNT(*) AS cnt FROM patterns WHERE repo = ? AND proposal_path = ?").get(t,r.path).cnt>0||e.prepare(`INSERT INTO patterns (repo, cadence, pattern_type, score, context, proposal_path)
     VALUES (?, 'daily', ?, ?, ?, ?)`).run(t,r.patternType,r.baseline,JSON.stringify({target:r.target,skill:r.skill}),r.path)}function Q(e,t){let r=e.prepare(`SELECT context, proposal_path AS path
       FROM patterns
       WHERE repo = ? AND proposal_path IS NOT NULL
       ORDER BY id`).all(t),n={};for(let o of r)try{let i=JSON.parse(o.context).skill;typeof i=="string"&&(n[i]=o.path)}catch{}return n}function ee(e,t,r){let n=e.prepare(`SELECT COUNT(*) AS cnt
     FROM actions
     WHERE repo = ?
       AND kind = ?
       AND target = ?
       AND (
         status IN ('proposed', 'applied', 'dropped')
         OR (status = 'measured' AND after_metric IS NOT NULL AND after_metric >= baseline)
       )`),o=e.prepare(`INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
     VALUES (?, ?, ?, ?, ?, 'proposed')`),i=0;for(let s of r)n.get(t,s.kind,s.target).cnt>0||(o.run(t,s.kind,s.target,s.patternType,s.baseline),i++);return i}function te(e,t){return e.prepare(`SELECT id,
              kind,
              target,
              pattern_type AS patternType,
              baseline,
              status
       FROM actions
       WHERE repo = ?
         AND status IN ('proposed', 'applied')
       ORDER BY id`).all(t)}import{existsSync as qe,mkdirSync as Qe,readdirSync as ne,readFileSync as et,writeFileSync as tt}from"node:fs";import{homedir as nt}from"node:os";import{join as k}from"node:path";var rt=/^---\r?\n([\s\S]*?)\r?\n---/,st=/^name:\s*(.+?)\s*$/m;function ot(e){let t=e.match(rt)?.[1];return t?t.match(st)?.[1]??null:null}function it(e){let t=[],r;try{r=ne(e,{withFileTypes:!0})}catch{return t}for(let n of r)if(n.isDirectory())try{let o=et(k(e,n.name,"SKILL.md"),"utf-8"),i=ot(o);i&&t.push(i)}catch{}return t}function M(e){try{return ne(e,{withFileTypes:!0}).filter(t=>t.isDirectory()).map(t=>k(e,t.name))}catch{return[]}}function re(e,t=nt()){let r=new Set,n=[k(e,".claude","skills"),k(t,".claude","skills")],o=k(t,".claude","plugins","cache");for(let i of M(o))for(let s of M(i))for(let u of M(s))n.push(k(u,"skills"));for(let i of n)for(let s of it(i))r.add(s);return[...r]}var at=40,ct="friction";function ut(e){let t=e.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,at).replace(/^-+|-+$/g,"");return t===""?ct:t}var lt={toil_loop:"a command run over and over",failure_cluster:"a repeatedly failing command",slow_command:"a repeatedly slow command",retry_storm:"a file edited again and again",cold_read:"a file re-read without changes"};function pt(e){let t=lt[e.patternType]??"a recurring friction";return["---",`name: ${e.skill}`,`description: Use when facing ${t}. Trigger phrases: "${e.target}", "${e.patternType}".`,"---","",`# ${e.skill}`,"",`Skeleton drafted from observed friction (${e.patternType} on \`${e.target}\`).`,"Flesh out each step with what actually works, then install it as a skill.","","## Procedure","",`1. Reproduce the friction: \`${e.target}\`.`,"2. Identify the root cause instead of retrying.","3. Apply the smallest fix or guard that removes the repetition.","4. Verify the friction is gone and note what changed.",""].join(`
`)}function se(e){try{let t=k(e.outDir,"proposed"),r=k(t,`skill-${ut(e.target)}.md`);return qe(r)||(Qe(t,{recursive:!0}),tt(r,pt(e))),r}catch{return null}}function oe(e,t,r){let n=e.prepare(`SELECT kind, target, baseline, after_metric AS after
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
         AND after_metric IS NOT NULL
         AND after_metric < baseline
       ORDER BY id DESC`).all(t);if(n.length===0)return[];let o=D(e,t,r),i=new Set,s=[];for(let u of n){let c=`${u.kind}\0${u.target}`;if(i.has(c))continue;i.add(c);let p=o.find(d=>d.kind===u.kind&&d.target===u.target);p&&p.baseline>=u.baseline&&s.push({kind:u.kind,target:u.target,baseline:u.baseline,after:u.after,current:p.baseline})}return s}function ie(e,t){return e.prepare(`SELECT kind,
              target,
              baseline,
              after_metric AS after,
              baseline - after_metric AS delta
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
       ORDER BY id`).all(t)}function ae(e,t,r,n){return e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(t,r,n)?.total??0}var N=168;function ce(e,t,r){let n=r.toISOString().slice(0,10),o=3600*1e3,i=new Date(r.getTime()-N*o).toISOString().slice(0,10),s=new Date(r.getTime()-2*N*o).toISOString().slice(0,10),u=T(e,t,N,[]),c=R(e,t,N),p=e.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(t,i),d=e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(t,s,i),m=p??{input:0,output:0,cacheRead:0},E=m.input+m.output,h=d?.total??0,a=h>0?Math.round((E-h)/h*100):null;return{repo:t,weekStart:i,weekEnd:n,toil:u,coldReads:c,tokens:m,tokenTrend:{thisWeek:E,lastWeek:h,pct:a}}}var mt={high:"\u{1F534}",medium:"\u{1F7E1}",low:"\u26AA"};function gt(e){let{proposals:t,open:r,roi:n}=e,o=e.regressions??[];if(t.length===0&&o.length===0&&(e.crossRepo??[]).length===0&&r.length===0&&n.length===0)return"No improvements to show: no friction detected yet.";let s=["# Chardon Improve Digest",""];if(s.push("## Prioritized Proposals",""),t.length===0)s.push("No proposals.","");else{for(let c of t){let p=mt[c.severity]??"\u26AA";s.push(`- ${p} **${c.kind}** \u2192 \`${c.target}\` (baseline: ${c.baseline})`);let d=K(c.kind,c.target,c.baseline);d&&s.push(`  \u21B3 ${d}`);let m=c.kind==="create-skill"?e.skeletons?.[c.target]:void 0;m&&s.push(`  \u21B3 skeleton: ${m}`)}s.push("")}if(o.length>0){s.push("## Regressions","");for(let c of o)s.push(`- \u26A0\uFE0F **${c.kind}** \u2192 \`${c.target}\` regressed (now ${c.current}, baseline was ${c.baseline})`);s.push("")}let u=e.crossRepo??[];if(u.length>0){s.push("## Cross-project candidates (Ronce Racine)","");for(let c of u)s.push(`- \u{1F33F} \`${c.cmd}\` recurs across ${c.repos} repos \u2192 consider a canonical rule/skill`);s.push("")}if(s.push("## Open Actions",""),r.length===0)s.push("No open actions.","");else{for(let c of r)s.push(`- \`#${c.id}\` [${c.status}] **${c.kind}** \u2192 \`${c.target}\``);s.push("")}if(s.push("## Measured ROI",""),n.length===0)s.push("No measured ROI yet.","");else{for(let c of n)s.push(`- **${c.kind}** \u2192 \`${c.target}\`: friction reduced by **${c.delta}**`);s.push("")}return s.join(`
`)}async function ft(e){let{projectDir:t,hoursBack:r,now:n,homeDir:o}=e,i=I(t),s=W(),u;try{let c=$(t),p;if(n){let l=/-wt-\d+$/.test(dt(t))?"worktree":"main",S=n.toISOString().slice(0,10),ue=ae(s,i,l,S),le=ce(s,i,n).tokenTrend?.pct??null;p={budget:c.tokenBudgetPerDay,tokensToday:ue,trendPct:le}}let d=re(t,o),m=D(s,i,r,p,c.thresholds,c.skillMap,d);for(let l of m){if(l.kind!=="create-skill"||!l.source)continue;let S=se({outDir:c.outDir,skill:l.target,...l.source});S&&q(s,i,{skill:l.target,baseline:l.baseline,path:S,...l.source})}ee(s,i,m);let E=te(s,i),h=E.map(l=>({id:l.id,kind:l.kind,target:l.target,status:l.status})),a=ie(s,i).map(l=>({kind:l.kind,target:l.target,delta:l.delta})),g=oe(s,i,r).map(l=>({kind:l.kind,target:l.target,baseline:l.baseline,current:l.current})),b=A(s,r).map(l=>({cmd:l.cmd,repos:l.repos})),C=E.filter(l=>l.status==="proposed").map(l=>({kind:l.kind,target:l.target,patternType:l.patternType,baseline:l.baseline,severity:Z(l.patternType,l.baseline)}));u=gt({proposals:C,regressions:g,crossRepo:b,skeletons:Q(s,i),open:h,roi:a})}finally{B(s)}return{digest:u}}if(L("improve")){let{digest:e}=await ft({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),hoursBack:24,now:new Date});console.log(e)}export{gt as renderImproveDigest,ft as runImprove};
