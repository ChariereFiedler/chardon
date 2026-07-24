import{basename as Rt}from"node:path";import{basename as me}from"node:path";function $(t){let e=process.argv[1];if(!e)return!1;let s=me(e);return s===`${t}.ts`||s===`${t}.mjs`||s===`${t}.js`}import{createRequire as Ne}from"node:module";import{chmodSync as Ce,closeSync as ye,mkdirSync as Oe,openSync as xe,readFileSync as Ie}from"node:fs";import{dirname as j,join as we}from"node:path";import{fileURLToPath as Me}from"node:url";import{existsSync as ge,readFileSync as O}from"node:fs";import{homedir as fe}from"node:os";import{basename as he,join as T,resolve as y,sep as Ee}from"node:path";import{fileURLToPath as Se}from"node:url";var be=/-wt-\d+$/,P=".chardon.json",ke=Se(new URL("../",import.meta.url)),_e=T(ke,"config","chardon.default.json");function U(t){let e=JSON.parse(O(_e,"utf-8")),s=T(t,P),n={...e};if(ge(s))try{let o=JSON.parse(O(s,"utf-8"));n={...e,...o},n.gitlab={...e.gitlab,...o.gitlab??{}},n.thresholds={...e.thresholds,...o.thresholds??{}},n.skillMap={...e.skillMap,...o.skillMap??{}}}catch{}return x(n.ticketRegex)===null&&(n.ticketRegex=e.ticketRegex),n.outDir=De(t,n.outDir,e.outDir),n}var Te=100,Re=5;function x(t){if(typeof t!="string"||t.length>Te||/\\[1-9]/.test(t)||/\)[+*{]/.test(t)||(t.match(/[+*{]|(?<!\()\?/g)?.length??0)>Re)return null;try{return new RegExp(t)}catch{return null}}function F(){return process.env.CHARDON_DB??T(fe(),".claude","chardon.db")}var Ae=/^[a-z0-9][a-z0-9._-]{0,63}$/;function I(t){try{let e=O(T(t,P),"utf-8"),s=JSON.parse(e).repoName;if(typeof s=="string"&&Ae.test(s))return s}catch{}return he(t).replace(be,"")}function De(t,e,s){let n=y(t),o=y(n,e);return o===n||o.startsWith(n+Ee)?o:y(n,s)}function H(t,e,s=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=e instanceof Error?e.message:e!==void 0?String(e):"";try{let o=s().toISOString();process.stderr.write(`[chardon] ${o} ${t}${n?`: ${n}`:""}
`)}catch{}}var Le=Ne(import.meta.url),{DatabaseSync:ve}=Le("node:sqlite");function $e(){process.removeAllListeners("warning"),process.on("warning",t=>{t.name==="ExperimentalWarning"&&t.message.includes("SQLite")||process.stderr.write(`${t.stack??`${t.name}: ${t.message}`}
`)})}$e();var Pe=we(j(Me(import.meta.url)),"schema.sql"),W=2;function B(){let t=F();Oe(j(t),{recursive:!0});try{ye(xe(t,"a",384)),Ce(t,384)}catch(a){H("db-permissions",a)}let e=new ve(t);e.exec("PRAGMA busy_timeout = 5000"),e.exec("PRAGMA journal_mode = WAL"),e.exec("PRAGMA foreign_keys = ON");let s=Ie(Pe,"utf-8"),n=Ue(e);if(n&&e.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),e.exec(s),n&&Fe(e),He(e))try{e.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}if(w(e,"sessions","root_hash"))try{e.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}if(w(e,"purge_log","nudges"))try{e.exec("ALTER TABLE purge_log ADD COLUMN nudges INTEGER NOT NULL DEFAULT 0")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}return e.prepare("PRAGMA user_version").get().user_version!==W&&e.exec(`PRAGMA user_version = ${W}`),e}function Ue(t){return t.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!t.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function Fe(t){t.exec("BEGIN");try{t.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),t.exec("DROP TABLE token_usage_legacy"),t.exec("COMMIT")}catch(e){throw t.exec("ROLLBACK"),e}}function w(t,e,s){let n=t.prepare(`PRAGMA table_info(${e})`).all();return n.length>0&&!n.some(o=>o.name===s)}function He(t){return w(t,"hook_health","last_error")}function G(t){try{t.close()}catch{}}function R(t,e,s,n,o=3){let a=t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(e,`-${s}`,o);if(n.length===0)return a;let r=new Set(n);return a.filter(u=>!r.has(u.cmd))}function z(t,e,s,n=3){return t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(e,`-${s}`,n)}function Y(t,e,s,n=3,o=3e4){return t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(e,`-${s}`,n,o)}function V(t,e,s,n=4){return t.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(e,`-${s}`,n)}function A(t,e,s,n=3){return t.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(e,`-${s}`,n)}var We=5,je=5,Be="git commit";function J(t,e,s,n=We){return t.prepare(`SELECT e.session_id AS sessionId,
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
       LIMIT 20`).all(e,`-${s}`,n)}function X(t,e,s){let n=t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd
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
       ORDER BY e.id`).all(e,`-${s}`,Be);return{count:n.length,sample:n.slice(0,je).map(o=>o.cmd)}}var Ge=2;function D(t,e,s=Ge){return t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(`-${e}`,s,3)}function Z(t,e,s){let n=t.prepare(`SELECT DISTINCT json_extract(e.meta, '$.skill') AS skill
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Skill'
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.skill') IS NOT NULL`).all(e,`-${s}`);return new Set(n.map(o=>o.skill))}var ze=8,Ye=4,Ve={failure_cluster:"systematic-debugging",retry_storm:"systematic-debugging",edited_without_tests:"test-driven-development",unverified_commit:"verification-before-completion"},Je="onFail";function Xe(t){let e=t[Je];if(!Array.isArray(e))return[];let s=[];for(let n of e){if(n===null||typeof n!="object"||typeof n.match!="string"||typeof n.skill!="string")continue;let o=x(n.match);o&&s.push({regex:o,skill:n.skill})}return s}function S(t){return t>=ze?"high":t>=Ye?"medium":"low"}var Ze=100,Ke=50;function M(t){return t>=Ze?"high":t>=Ke?"medium":"low"}var qe=new Set(["over_budget","token_growth"]);function K(t,e){return qe.has(t)?M(e):S(e)}var Qe=50;function q(t,e,s){switch(t){case"automate-command":return`run less often, or add \`${e}\` to \`toilExclusions\` / script it`;case"fix-failing-command":return`\`${e}\` fails every run: fix or guard it instead of rerunning`;case"speed-up-command":return`\`${e}\` is slow: cache, scope, or parallelize it`;case"split-or-summarize":return`summarize \`${e}\` into a memory note so it isn't re-read`;case"investigate-file":return`\`${e}\` is edited repeatedly: find the root cause`;case"consider-skill":return`invoke the \`${e}\` skill next time this friction appears`;case"create-skill":return`no installed skill covers this friction: draft a \`${e}\` skill from the skeleton`;case"promote-to-canonical":return`recurs across ${s??"several"} repos: promote a shared rule or skill`;case"reduce-token-spend":return"trim context: large re-reads and long transcripts drive spend";case"investigate-token-growth":return"token use jumped week-over-week: check for context churn";case"run-tests-after-edits":return`session \`${e}\` edited a lot without a test run: run the suite before moving on`;case"verify-before-commit":return`\`${e}\` ran with no prior passing test: run the tests before committing`;default:return""}}function N(t,e,s,n,o,a=Ve,r){let u=[];for(let c of R(t,e,s,[],o?.toilMin))u.push({kind:"automate-command",target:c.cmd,patternType:"toil_loop",baseline:c.count,severity:S(c.count)});for(let c of A(t,e,s,o?.coldMin))u.push({kind:"split-or-summarize",target:c.file,patternType:"cold_read",baseline:c.count,severity:S(c.count)});for(let c of V(t,e,s,o?.retryMin))u.push({kind:"investigate-file",target:c.file,patternType:"retry_storm",baseline:c.count,severity:S(c.count)});for(let c of z(t,e,s,o?.failMin))u.push({kind:"fix-failing-command",target:c.cmd,patternType:"failure_cluster",baseline:c.count,severity:S(c.count)});for(let c of Y(t,e,s,o?.slowMin,o?.slowMs))u.push({kind:"speed-up-command",target:c.cmd,patternType:"slow_command",baseline:c.count,severity:S(c.count)});for(let c of J(t,e,s))u.push({kind:"run-tests-after-edits",target:c.sessionId,patternType:"edited_without_tests",baseline:c.edits,severity:S(c.edits)});let i=X(t,e,s);if(i.count>0&&u.push({kind:"verify-before-commit",target:"git commit",patternType:"unverified_commit",baseline:i.count,severity:S(i.count)}),n&&n.budget>0&&n.tokensToday>n.budget){let c=Math.round((n.tokensToday-n.budget)/n.budget*100);u.push({kind:"reduce-token-spend",target:"daily-tokens",patternType:"over_budget",baseline:c,severity:M(c)})}n&&n.trendPct!==null&&n.trendPct>=Qe&&u.push({kind:"investigate-token-growth",target:"weekly-tokens",patternType:"token_growth",baseline:n.trendPct,severity:M(n.trendPct)});for(let c of D(t,s))u.push({kind:"promote-to-canonical",target:c.cmd,patternType:"cross_repo",baseline:c.repos,severity:S(c.repos)});let p=Xe(a),d=c=>{if(c.patternType==="failure_cluster"){let E=p.find(b=>b.regex.test(c.target));if(E)return E.skill}let g=a[c.patternType];return typeof g=="string"?g:void 0},m=Z(t,e,s),h=r&&r.length>0?new Set(r):null,f=new Set;for(let c of[...u]){let g=d(c);if(!g||m.has(g)||f.has(g))continue;f.add(g);let E=h!==null&&!h.has(g);u.push({kind:E?"create-skill":"consider-skill",target:g,patternType:"uncovered_friction",baseline:c.baseline,severity:S(c.baseline),...E?{source:{patternType:c.patternType,target:c.target}}:{}})}return u}function Q(t,e,s){t.prepare("SELECT COUNT(*) AS cnt FROM patterns WHERE repo = ? AND proposal_path = ?").get(e,s.path).cnt>0||t.prepare(`INSERT INTO patterns (repo, cadence, pattern_type, score, context, proposal_path)
     VALUES (?, 'daily', ?, ?, ?, ?)`).run(e,s.patternType,s.baseline,JSON.stringify({target:s.target,skill:s.skill}),s.path)}function ee(t,e){let s=t.prepare(`SELECT context, proposal_path AS path
       FROM patterns
       WHERE repo = ? AND proposal_path IS NOT NULL
       ORDER BY id`).all(e),n={};for(let o of s)try{let a=JSON.parse(o.context).skill;typeof a=="string"&&(n[a]=o.path)}catch{}return n}function te(t,e,s){let n=t.prepare(`SELECT COUNT(*) AS cnt
     FROM actions
     WHERE repo = ?
       AND kind = ?
       AND target = ?
       AND (
         status IN ('proposed', 'applied', 'dropped')
         OR (status = 'measured' AND after_metric IS NOT NULL AND after_metric >= baseline)
       )`),o=t.prepare(`INSERT INTO actions (repo, kind, target, pattern_type, baseline, status)
     VALUES (?, ?, ?, ?, ?, 'proposed')`),a=0;for(let r of s)n.get(e,r.kind,r.target).cnt>0||(o.run(e,r.kind,r.target,r.patternType,r.baseline),a++);return a}function ne(t,e){return t.prepare(`SELECT id,
              kind,
              target,
              pattern_type AS patternType,
              baseline,
              status
       FROM actions
       WHERE repo = ?
         AND status IN ('proposed', 'applied')
       ORDER BY id`).all(e)}import{basename as mt,dirname as gt}from"node:path";import{existsSync as et,mkdirSync as tt,readdirSync as se,readFileSync as nt,writeFileSync as st}from"node:fs";import{homedir as rt}from"node:os";import{join as _}from"node:path";var ot=/^---\r?\n([\s\S]*?)\r?\n---/,it=/^name:\s*(.+?)\s*$/m;function at(t){let e=t.match(ot)?.[1];return e?e.match(it)?.[1]??null:null}function ct(t){let e=[],s;try{s=se(t,{withFileTypes:!0})}catch{return e}for(let n of s)if(n.isDirectory())try{let o=nt(_(t,n.name,"SKILL.md"),"utf-8"),a=at(o);a&&e.push(a)}catch{}return e}function L(t){try{return se(t,{withFileTypes:!0}).filter(e=>e.isDirectory()).map(e=>_(t,e.name))}catch{return[]}}function re(t,e=rt()){let s=new Set,n=[_(t,".claude","skills"),_(e,".claude","skills")],o=_(e,".claude","plugins","cache");for(let a of L(o))for(let r of L(a))for(let u of L(r))n.push(_(u,"skills"));for(let a of n)for(let r of ct(a))s.add(r);return[...s]}var ut=40,lt="friction";function oe(t){let e=t.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,ut).replace(/^-+|-+$/g,"");return e===""?lt:e}var pt={toil_loop:"a command run over and over",failure_cluster:"a repeatedly failing command",slow_command:"a repeatedly slow command",retry_storm:"a file edited again and again",cold_read:"a file re-read without changes"};function dt(t){let e=pt[t.patternType]??"a recurring friction";return["---",`name: ${t.skill}`,`description: Use when facing ${e}. Trigger phrases: "${t.target}", "${t.patternType}".`,"---","",`# ${t.skill}`,"",`Skeleton drafted from observed friction (${t.patternType} on \`${t.target}\`).`,"Flesh out each step with what actually works, then install it as a skill.","","## Procedure","",`1. Reproduce the friction: \`${t.target}\`.`,"2. Identify the root cause instead of retrying.","3. Apply the smallest fix or guard that removes the repetition.","4. Verify the friction is gone and note what changed.",""].join(`
`)}function ie(t){try{let e=_(t.outDir,"proposed"),s=_(e,`skill-${oe(t.target)}.md`);return et(s)||(tt(e,{recursive:!0}),st(s,dt(t))),s}catch{return null}}var ft=14,ht=3,Et=3,St=6,bt=3,kt=1440*60*1e3,_t=" > ";function Tt(t,e){return t==="Bash"?!e.cmd_class||e.cmd_class==="other"?null:{step:e.cmd_class,display:e.cmd??e.cmd_class}:(t==="Edit"||t==="Write")&&e.file?{step:`edit@${mt(gt(e.file))}`,display:e.file}:null}function v(t,e){let s=new Date(e.getTime()-ft*kt).toISOString(),n=t.prepare(`SELECT e.session_id AS sessionId, s.repo AS repo, e.tool AS tool, e.meta AS meta
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.ts >= ?
       ORDER BY e.session_id, e.id`).all(s),o=new Map;for(let i of n){let p;try{p=JSON.parse(i.meta??"{}")}catch{continue}let d=Tt(i.tool,p);if(!d)continue;let m=o.get(i.sessionId)??{repo:i.repo,steps:[]};m.steps[m.steps.length-1]?.step!==d.step&&m.steps.push(d),o.set(i.sessionId,m)}let a=new Map;for(let[i,{repo:p,steps:d}]of o){let m=new Set;for(let h=Et;h<=St;h++)for(let f=0;f+h<=d.length;f++){let c=d.slice(f,f+h),g=c.map(b=>b.step).join(_t);if(m.has(g))continue;m.add(g);let E=a.get(g)??{steps:c.map(b=>b.step),sessionIds:new Set,repos:new Set,examples:[]};E.sessionIds.add(i),E.repos.add(p),E.examples.length<bt&&E.examples.push(c.map(b=>b.display)),a.set(g,E)}}let r=[...a.entries()].filter(([,i])=>i.sessionIds.size>=ht);return r.filter(([i,p])=>!r.some(([d,m])=>m.steps.length>p.steps.length&&m.sessionIds.size===p.sessionIds.size&&d.includes(i))).map(([i,p])=>{let d=[...p.repos].sort();return{signature:i,steps:p.steps,supportSessions:p.sessionIds.size,repos:d,scope:d.length>=2?"global":"local",score:p.sessionIds.size*p.steps.length,examples:p.examples}}).sort((i,p)=>p.score-i.score)}function ae(t,e,s){let n=t.prepare(`SELECT kind, target, baseline, after_metric AS after
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
         AND after_metric IS NOT NULL
         AND after_metric < baseline
       ORDER BY id DESC`).all(e);if(n.length===0)return[];let o=N(t,e,s),a=new Set,r=[];for(let u of n){let i=`${u.kind}\0${u.target}`;if(a.has(i))continue;a.add(i);let p=o.find(d=>d.kind===u.kind&&d.target===u.target);p&&p.baseline>=u.baseline&&r.push({kind:u.kind,target:u.target,baseline:u.baseline,after:u.after,current:p.baseline})}return r}function ce(t,e){return t.prepare(`SELECT kind,
              target,
              baseline,
              after_metric AS after,
              baseline - after_metric AS delta
       FROM actions
       WHERE repo = ?
         AND status = 'measured'
       ORDER BY id`).all(e)}function ue(t,e,s,n){return t.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(e,s,n)?.total??0}var C=168;function le(t,e,s){let n=s.toISOString().slice(0,10),o=3600*1e3,a=new Date(s.getTime()-C*o).toISOString().slice(0,10),r=new Date(s.getTime()-2*C*o).toISOString().slice(0,10),u=R(t,e,C,[]),i=A(t,e,C),p=t.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(e,a),d=t.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(e,r,a),m=p??{input:0,output:0,cacheRead:0},h=m.input+m.output,f=d?.total??0,c=f>0?Math.round((h-f)/f*100):null;return{repo:e,weekStart:a,weekEnd:n,toil:u,coldReads:i,tokens:m,tokenTrend:{thisWeek:h,lastWeek:f,pct:c}}}var At={high:"\u{1F534}",medium:"\u{1F7E1}",low:"\u26AA"};function Dt(t){let{proposals:e,open:s,roi:n}=t,o=t.regressions??[];if(e.length===0&&o.length===0&&(t.crossRepo??[]).length===0&&s.length===0&&n.length===0)return"No improvements to show: no friction detected yet.";let r=["# Chardon Improve Digest",""];if(r.push("## Prioritized Proposals",""),e.length===0)r.push("No proposals.","");else{for(let i of e){let p=At[i.severity]??"\u26AA";r.push(`- ${p} **${i.kind}** \u2192 \`${i.target}\` (baseline: ${i.baseline})`);let d=q(i.kind,i.target,i.baseline);d&&r.push(`  \u21B3 ${d}`);let m=i.kind==="create-skill"?t.skeletons?.[i.target]:void 0;m&&r.push(`  \u21B3 skeleton: ${m}`)}r.push("")}if(o.length>0){r.push("## Regressions","");for(let i of o)r.push(`- \u26A0\uFE0F **${i.kind}** \u2192 \`${i.target}\` regressed (now ${i.current}, baseline was ${i.baseline})`);r.push("")}let u=t.crossRepo??[];if(u.length>0){r.push("## Cross-project candidates (Ronce Racine)","");for(let i of u)r.push(`- \u{1F33F} \`${i.cmd}\` recurs across ${i.repos} repos \u2192 consider a canonical rule/skill`);r.push("")}if(r.push("## Open Actions",""),s.length===0)r.push("No open actions.","");else{for(let i of s)r.push(`- \`#${i.id}\` [${i.status}] **${i.kind}** \u2192 \`${i.target}\``);r.push("")}if(r.push("## Measured ROI",""),n.length===0)r.push("No measured ROI yet.","");else{for(let i of n)r.push(`- **${i.kind}** \u2192 \`${i.target}\`: friction reduced by **${i.delta}**`);r.push("")}return r.join(`
`)}async function Nt(t){let{projectDir:e,hoursBack:s,now:n,homeDir:o}=t,a=I(e),r=B(),u;try{let i=U(e),p;if(n){let l=/-wt-\d+$/.test(Rt(e))?"worktree":"main",k=n.toISOString().slice(0,10),pe=ue(r,a,l,k),de=le(r,a,n).tokenTrend?.pct??null;p={budget:i.tokenBudgetPerDay,tokensToday:pe,trendPct:de}}let d=re(e,o),m=N(r,a,s,p,i.thresholds,i.skillMap,d);for(let l of m){if(l.kind!=="create-skill"||!l.source)continue;let k=ie({outDir:i.outDir,skill:l.target,...l.source});k&&Q(r,a,{skill:l.target,baseline:l.baseline,path:k,...l.source})}te(r,a,m);let h=ne(r,a),f=h.map(l=>({id:l.id,kind:l.kind,target:l.target,status:l.status})),c=ce(r,a).map(l=>({kind:l.kind,target:l.target,delta:l.delta})),g=ae(r,a,s).map(l=>({kind:l.kind,target:l.target,baseline:l.baseline,current:l.current})),E=D(r,s).map(l=>({cmd:l.cmd,repos:l.repos})),b=h.filter(l=>l.status==="proposed").map(l=>({kind:l.kind,target:l.target,patternType:l.patternType,baseline:l.baseline,severity:K(l.patternType,l.baseline)}));if(u=Dt({proposals:b,regressions:g,crossRepo:E,skeletons:ee(r,a),open:f,roi:c}),n){let l=v(r,n).filter(k=>k.repos.includes(a)).filter(k=>r.prepare("SELECT 1 FROM actions WHERE repo = ? AND kind = 'infer-skill' AND target = ?").get(a,k.signature)===void 0).length;l>0&&(u+=`

${l} recurring procedure(s) detected: run /chardon-skills`)}}finally{G(r)}return{digest:u}}if($("improve")){let{digest:t}=await Nt({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),hoursBack:24,now:new Date});console.log(t)}export{Dt as renderImproveDigest,Nt as runImprove};
