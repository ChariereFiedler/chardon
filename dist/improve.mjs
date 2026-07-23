import{basename as Rt}from"node:path";import{basename as me}from"node:path";function v(e){let t=process.argv[1];if(!t)return!1;let s=me(t);return s===`${e}.ts`||s===`${e}.mjs`||s===`${e}.js`}import{createRequire as Ne}from"node:module";import{chmodSync as Ce,closeSync as ye,mkdirSync as Oe,openSync as xe,readFileSync as Ie}from"node:fs";import{dirname as W,join as we}from"node:path";import{fileURLToPath as Me}from"node:url";import{existsSync as ge,readFileSync as O}from"node:fs";import{homedir as fe}from"node:os";import{basename as he,join as T,resolve as y,sep as Ee}from"node:path";import{fileURLToPath as Se}from"node:url";var be=/-wt-\d+$/,$=".chardon.json",ke=Se(new URL("../",import.meta.url)),_e=T(ke,"config","chardon.default.json");function P(e){let t=JSON.parse(O(_e,"utf-8")),s=T(e,$),n={...t};if(ge(s))try{let o=JSON.parse(O(s,"utf-8"));n={...t,...o},n.gitlab={...t.gitlab,...o.gitlab??{}},n.thresholds={...t.thresholds,...o.thresholds??{}},n.skillMap={...t.skillMap,...o.skillMap??{}}}catch{}return x(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=De(e,n.outDir,t.outDir),n}var Te=100,Re=5;function x(e){if(typeof e!="string"||e.length>Te||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]|(?<!\()\?/g)?.length??0)>Re)return null;try{return new RegExp(e)}catch{return null}}function U(){return process.env.CHARDON_DB??T(fe(),".claude","chardon.db")}var Ae=/^[a-z0-9][a-z0-9._-]{0,63}$/;function I(e){try{let t=O(T(e,$),"utf-8"),s=JSON.parse(t).repoName;if(typeof s=="string"&&Ae.test(s))return s}catch{}return he(e).replace(be,"")}function De(e,t,s){let n=y(e),o=y(n,t);return o===n||o.startsWith(n+Ee)?o:y(n,s)}function F(e,t,s=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let o=s().toISOString();process.stderr.write(`[chardon] ${o} ${e}${n?`: ${n}`:""}
`)}catch{}}var Le=Ne(import.meta.url),{DatabaseSync:ve}=Le("node:sqlite");function $e(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}$e();var Pe=we(W(Me(import.meta.url)),"schema.sql"),H=2;function j(){let e=U();Oe(W(e),{recursive:!0});try{ye(xe(e,"a",384)),Ce(e,384)}catch(a){F("db-permissions",a)}let t=new ve(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let s=Ie(Pe,"utf-8"),n=Ue(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(s),n&&Fe(t),He(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}if(B(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}return t.prepare("PRAGMA user_version").get().user_version!==H&&t.exec(`PRAGMA user_version = ${H}`),t}function Ue(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function Fe(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function B(e,t,s){let n=e.prepare(`PRAGMA table_info(${t})`).all();return n.length>0&&!n.some(o=>o.name===s)}function He(e){return B(e,"hook_health","last_error")}function G(e){try{e.close()}catch{}}function R(e,t,s,n,o=3){let a=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${s}`,o);if(n.length===0)return a;let r=new Set(n);return a.filter(u=>!r.has(u.cmd))}function z(e,t,s,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${s}`,n)}function Y(e,t,s,n=3,o=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${s}`,n,o)}function V(e,t,s,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function A(e,t,s,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}var We=5,je=5,Be="git commit";function J(e,t,s,n=We){return e.prepare(`SELECT e.session_id AS sessionId,
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
       LIMIT 20`).all(t,`-${s}`,n)}function X(e,t,s){let n=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd
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
       ORDER BY e.id`).all(t,`-${s}`,Be);return{count:n.length,sample:n.slice(0,je).map(o=>o.cmd)}}var Ge=2;function D(e,t,s=Ge){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(`-${t}`,s,3)}function Z(e,t,s){let n=e.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(t,`-${s}`);return new Set(n.map(o=>o.skill))}var ze=8,Ye=4,Ve={failure_cluster:"systematic-debugging",retry_storm:"systematic-debugging",edited_without_tests:"test-driven-development",unverified_commit:"verification-before-completion"},Je="onFail";function Xe(e){let t=e[Je];if(!Array.isArray(t))return[];let s=[];for(let n of t){if(n===null||typeof n!="object"||typeof n.match!="string"||typeof n.skill!="string")continue;let o=x(n.match);o&&s.push({regex:o,skill:n.skill})}return s}function S(e){return e>=ze?"high":e>=Ye?"medium":"low"}var Ze=100,Ke=50;function w(e){return e>=Ze?"high":e>=Ke?"medium":"low"}var qe=new Set(["over_budget","token_growth"]);function K(e,t){return qe.has(e)?w(t):S(t)}var Qe=50;function q(e,t,s){switch(e){case"automate-command":return`run less often, or add \`${t}\` to \`toilExclusions\` / script it`;case"fix-failing-command":return`\`${t}\` fails every run: fix or guard it instead of rerunning`;case"speed-up-command":return`\`${t}\` is slow: cache, scope, or parallelize it`;case"split-or-summarize":return`summarize \`${t}\` into a memory note so it isn't re-read`;case"investigate-file":return`\`${t}\` is edited repeatedly: find the root cause`;case"consider-skill":return`invoke the \`${t}\` skill next time this friction appears`;case"create-skill":return`no installed skill covers this friction: draft a \`${t}\` skill from the skeleton`;case"promote-to-canonical":return`recurs across ${s??"several"} repos: promote a shared rule or skill`;case"reduce-token-spend":return"trim context: large re-reads and long transcripts drive spend";case"investigate-token-growth":return"token use jumped week-over-week: check for context churn";case"run-tests-after-edits":return`session \`${t}\` edited a lot without a test run: run the suite before moving on`;case"verify-before-commit":return`\`${t}\` ran with no prior passing test: run the tests before committing`;default:return""}}function N(e,t,s,n,o,a=Ve,r){let u=[];for(let c of R(e,t,s,[],o?.toilMin))u.push({kind:"automate-command",target:c.cmd,patternType:"toil_loop",baseline:c.count,severity:S(c.count)});for(let c of A(e,t,s,o?.coldMin))u.push({kind:"split-or-summarize",target:c.file,patternType:"cold_read",baseline:c.count,severity:S(c.count)});for(let c of V(e,t,s,o?.retryMin))u.push({kind:"investigate-file",target:c.file,patternType:"retry_storm",baseline:c.count,severity:S(c.count)});for(let c of z(e,t,s,o?.failMin))u.push({kind:"fix-failing-command",target:c.cmd,patternType:"failure_cluster",baseline:c.count,severity:S(c.count)});for(let c of Y(e,t,s,o?.slowMin,o?.slowMs))u.push({kind:"speed-up-command",target:c.cmd,patternType:"slow_command",baseline:c.count,severity:S(c.count)});for(let c of J(e,t,s))u.push({kind:"run-tests-after-edits",target:c.sessionId,patternType:"edited_without_tests",baseline:c.edits,severity:S(c.edits)});let i=X(e,t,s);if(i.count>0&&u.push({kind:"verify-before-commit",target:"git commit",patternType:"unverified_commit",baseline:i.count,severity:S(i.count)}),n&&n.budget>0&&n.tokensToday>n.budget){let c=Math.round((n.tokensToday-n.budget)/n.budget*100);u.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:c,severity:w(c)})}n&&n.trendPct!==null&&n.trendPct>=Qe&&u.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:n.trendPct,severity:w(n.trendPct)});for(let c of D(e,s))u.push({kind:"promote-to-canonical",target:c.cmd,patternType:"cross_repo",baseline:c.repos,severity:S(c.repos)});let p=Xe(a),d=c=>{if(c.patternType==="failure_cluster"){let E=p.find(b=>b.regex.test(c.target));if(E)return E.skill}let g=a[c.patternType];return typeof g=="string"?g:void 0},m=Z(e,t,s),h=r&&r.length>0?new Set(r):null,f=new Set;for(let c of[...u]){let g=d(c);if(!g||m.has(g)||f.has(g))continue;f.add(g);let E=h!==null&&!h.has(g);u.push({kind:E?"create-skill":"consider-skill",target:g,patternType:"uncovered_friction",baseline:c.baseline,severity:S(c.baseline),...E?{source:{patternType:c.patternType,target:c.target}}:{}})}return u}function Q(e,t,s){e.prepare("SELECT COUNT(*) AS cnt FROM patterns WHERE repo = ? AND proposal_path = ?").get(t,s.path).cnt>0||e.prepare(`INSERT INTO patterns (repo, cadence, pattern_type, score, context, proposal_path)
     VALUES (?, 'daily', ?, ?, ?, ?)`).run(t,s.patternType,s.baseline,JSON.stringify({target:s.target,skill:s.skill}),s.path)}function ee(e,t){let s=e.prepare(`SELECT context, proposal_path AS path
       FROM patterns
       WHERE repo = ? AND proposal_path IS NOT NULL
       ORDER BY id`).all(t),n={};for(let o of s)try{let a=JSON.parse(o.context).skill;typeof a=="string"&&(n[a]=o.path)}catch{}return n}function te(e,t,s){let n=e.prepare(`SELECT COUNT(*) AS cnt
     FROM actions
     WHERE repo = ?
       AND kind = ?
       AND target = ?
       AND (
         status IN ('proposed', 'applied', 'dropped')
         OR (status = 'measured' AND after_metric IS NOT NULL AND after_metric >= baseline)
       )`),o=e.prepare(`INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
     VALUES (?, ?, ?, ?, ?, 'proposed')`),a=0;for(let r of s)n.get(t,r.kind,r.target).cnt>0||(o.run(t,r.kind,r.target,r.patternType,r.baseline),a++);return a}function ne(e,t){return e.prepare(`SELECT id,
              kind,
              target,
              pattern_type AS patternType,
              baseline,
              status
       FROM actions
       WHERE repo = ?
         AND status IN ('proposed', 'applied')
       ORDER BY id`).all(t)}import{basename as mt,dirname as gt}from"node:path";import{existsSync as et,mkdirSync as tt,readdirSync as se,readFileSync as nt,writeFileSync as st}from"node:fs";import{homedir as rt}from"node:os";import{join as _}from"node:path";var ot=/^---\r?\n([\s\S]*?)\r?\n---/,it=/^name:\s*(.+?)\s*$/m;function at(e){let t=e.match(ot)?.[1];return t?t.match(it)?.[1]??null:null}function ct(e){let t=[],s;try{s=se(e,{withFileTypes:!0})}catch{return t}for(let n of s)if(n.isDirectory())try{let o=nt(_(e,n.name,"SKILL.md"),"utf-8"),a=at(o);a&&t.push(a)}catch{}return t}function M(e){try{return se(e,{withFileTypes:!0}).filter(t=>t.isDirectory()).map(t=>_(e,t.name))}catch{return[]}}function re(e,t=rt()){let s=new Set,n=[_(e,".claude","skills"),_(t,".claude","skills")],o=_(t,".claude","plugins","cache");for(let a of M(o))for(let r of M(a))for(let u of M(r))n.push(_(u,"skills"));for(let a of n)for(let r of ct(a))s.add(r);return[...s]}var ut=40,lt="friction";function oe(e){let t=e.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,ut).replace(/^-+|-+$/g,"");return t===""?lt:t}var pt={toil_loop:"a command run over and over",failure_cluster:"a repeatedly failing command",slow_command:"a repeatedly slow command",retry_storm:"a file edited again and again",cold_read:"a file re-read without changes"};function dt(e){let t=pt[e.patternType]??"a recurring friction";return["---",`name: ${e.skill}`,`description: Use when facing ${t}. Trigger phrases: "${e.target}", "${e.patternType}".`,"---","",`# ${e.skill}`,"",`Skeleton drafted from observed friction (${e.patternType} on \`${e.target}\`).`,"Flesh out each step with what actually works, then install it as a skill.","","## Procedure","",`1. Reproduce the friction: \`${e.target}\`.`,"2. Identify the root cause instead of retrying.","3. Apply the smallest fix or guard that removes the repetition.","4. Verify the friction is gone and note what changed.",""].join(`
`)}function ie(e){try{let t=_(e.outDir,"proposed"),s=_(t,`skill-${oe(e.target)}.md`);return et(s)||(tt(t,{recursive:!0}),st(s,dt(e))),s}catch{return null}}var ft=14,ht=3,Et=3,St=6,bt=3,kt=1440*60*1e3,_t=" > ";function Tt(e,t){return e==="Bash"?t.cmd_class?{step:t.cmd_class,display:t.cmd??t.cmd_class}:null:(e==="Edit"||e==="Write")&&t.file?{step:`edit@${mt(gt(t.file))}`,display:t.file}:null}function L(e,t){let s=new Date(t.getTime()-ft*kt).toISOString(),n=e.prepare(`SELECT e.session_id AS sessionId, s.repo AS repo, e.tool AS tool, e.meta AS meta
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.ts >= ?
       ORDER BY e.session_id, e.id`).all(s),o=new Map;for(let i of n){let p;try{p=JSON.parse(i.meta??"{}")}catch{continue}let d=Tt(i.tool,p);if(!d)continue;let m=o.get(i.sessionId)??{repo:i.repo,steps:[]};m.steps.push(d),o.set(i.sessionId,m)}let a=new Map;for(let[i,{repo:p,steps:d}]of o){let m=new Set;for(let h=Et;h<=St;h++)for(let f=0;f+h<=d.length;f++){let c=d.slice(f,f+h),g=c.map(b=>b.step).join(_t);if(m.has(g))continue;m.add(g);let E=a.get(g)??{steps:c.map(b=>b.step),sessionIds:new Set,repos:new Set,examples:[]};E.sessionIds.add(i),E.repos.add(p),E.examples.length<bt&&E.examples.push(c.map(b=>b.display)),a.set(g,E)}}let r=[...a.entries()].filter(([,i])=>i.sessionIds.size>=ht);return r.filter(([i,p])=>!r.some(([d,m])=>m.steps.length>p.steps.length&&m.sessionIds.size===p.sessionIds.size&&d.includes(i))).map(([i,p])=>{let d=[...p.repos].sort();return{signature:i,steps:p.steps,supportSessions:p.sessionIds.size,repos:d,scope:d.length>=2?"global":"local",score:p.sessionIds.size*p.steps.length,examples:p.examples}}).sort((i,p)=>p.score-i.score)}function ae(e,t,s){let n=e.prepare(`SELECT kind, target, baseline, after_metric AS after
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
         AND after_metric IS NOT NULL
         AND after_metric < baseline
       ORDER BY id DESC`).all(t);if(n.length===0)return[];let o=N(e,t,s),a=new Set,r=[];for(let u of n){let i=`${u.kind}\0${u.target}`;if(a.has(i))continue;a.add(i);let p=o.find(d=>d.kind===u.kind&&d.target===u.target);p&&p.baseline>=u.baseline&&r.push({kind:u.kind,target:u.target,baseline:u.baseline,after:u.after,current:p.baseline})}return r}function ce(e,t){return e.prepare(`SELECT kind,
              target,
              baseline,
              after_metric AS after,
              baseline - after_metric AS delta
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
       ORDER BY id`).all(t)}function ue(e,t,s,n){return e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(t,s,n)?.total??0}var C=168;function le(e,t,s){let n=s.toISOString().slice(0,10),o=3600*1e3,a=new Date(s.getTime()-C*o).toISOString().slice(0,10),r=new Date(s.getTime()-2*C*o).toISOString().slice(0,10),u=R(e,t,C,[]),i=A(e,t,C),p=e.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(t,a),d=e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(t,r,a),m=p??{input:0,output:0,cacheRead:0},h=m.input+m.output,f=d?.total??0,c=f>0?Math.round((h-f)/f*100):null;return{repo:t,weekStart:a,weekEnd:n,toil:u,coldReads:i,tokens:m,tokenTrend:{thisWeek:h,lastWeek:f,pct:c}}}var At={high:"\u{1F534}",medium:"\u{1F7E1}",low:"\u26AA"};function Dt(e){let{proposals:t,open:s,roi:n}=e,o=e.regressions??[];if(t.length===0&&o.length===0&&(e.crossRepo??[]).length===0&&s.length===0&&n.length===0)return"No improvements to show: no friction detected yet.";let r=["# Chardon Improve Digest",""];if(r.push("## Prioritized Proposals",""),t.length===0)r.push("No proposals.","");else{for(let i of t){let p=At[i.severity]??"\u26AA";r.push(`- ${p} **${i.kind}** \u2192 \`${i.target}\` (baseline: ${i.baseline})`);let d=q(i.kind,i.target,i.baseline);d&&r.push(`  \u21B3 ${d}`);let m=i.kind==="create-skill"?e.skeletons?.[i.target]:void 0;m&&r.push(`  \u21B3 skeleton: ${m}`)}r.push("")}if(o.length>0){r.push("## Regressions","");for(let i of o)r.push(`- \u26A0\uFE0F **${i.kind}** \u2192 \`${i.target}\` regressed (now ${i.current}, baseline was ${i.baseline})`);r.push("")}let u=e.crossRepo??[];if(u.length>0){r.push("## Cross-project candidates (Ronce Racine)","");for(let i of u)r.push(`- \u{1F33F} \`${i.cmd}\` recurs across ${i.repos} repos \u2192 consider a canonical rule/skill`);r.push("")}if(r.push("## Open Actions",""),s.length===0)r.push("No open actions.","");else{for(let i of s)r.push(`- \`#${i.id}\` [${i.status}] **${i.kind}** \u2192 \`${i.target}\``);r.push("")}if(r.push("## Measured ROI",""),n.length===0)r.push("No measured ROI yet.","");else{for(let i of n)r.push(`- **${i.kind}** \u2192 \`${i.target}\`: friction reduced by **${i.delta}**`);r.push("")}return r.join(`
`)}async function Nt(e){let{projectDir:t,hoursBack:s,now:n,homeDir:o}=e,a=I(t),r=j(),u;try{let i=P(t),p;if(n){let l=/-wt-\d+$/.test(Rt(t))?"worktree":"main",k=n.toISOString().slice(0,10),pe=ue(r,a,l,k),de=le(r,a,n).tokenTrend?.pct??null;p={budget:i.tokenBudgetPerDay,tokensToday:pe,trendPct:de}}let d=re(t,o),m=N(r,a,s,p,i.thresholds,i.skillMap,d);for(let l of m){if(l.kind!=="create-skill"||!l.source)continue;let k=ie({outDir:i.outDir,skill:l.target,...l.source});k&&Q(r,a,{skill:l.target,baseline:l.baseline,path:k,...l.source})}te(r,a,m);let h=ne(r,a),f=h.map(l=>({id:l.id,kind:l.kind,target:l.target,status:l.status})),c=ce(r,a).map(l=>({kind:l.kind,target:l.target,delta:l.delta})),g=ae(r,a,s).map(l=>({kind:l.kind,target:l.target,baseline:l.baseline,current:l.current})),E=D(r,s).map(l=>({cmd:l.cmd,repos:l.repos})),b=h.filter(l=>l.status==="proposed").map(l=>({kind:l.kind,target:l.target,patternType:l.patternType,baseline:l.baseline,severity:K(l.patternType,l.baseline)}));if(u=Dt({proposals:b,regressions:g,crossRepo:E,skeletons:ee(r,a),open:f,roi:c}),n){let l=L(r,n).filter(k=>k.repos.includes(a)).filter(k=>r.prepare("SELECT 1 FROM actions WHERE repo = ? AND kind = 'infer-skill' AND target = ?").get(a,k.signature)===void 0).length;l>0&&(u+=`

${l} recurring procedure(s) detected: run /chardon-skills`)}}finally{G(r)}return{digest:u}}if(v("improve")){let{digest:e}=await Nt({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),hoursBack:24,now:new Date});console.log(e)}export{Dt as renderImproveDigest,Nt as runImprove};
