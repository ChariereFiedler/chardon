#!/usr/bin/env node
import{readFileSync as qe}from"node:fs";import{basename as oe}from"node:path";function f(e){let s=process.argv[1];if(!s)return!1;let n=oe(s);return n===`${e}.ts`||n===`${e}.mjs`||n===`${e}.js`}import{createRequire as _e}from"node:module";import{chmodSync as Re,closeSync as De,mkdirSync as Te,openSync as Se,readFileSync as Ae}from"node:fs";import{dirname as M,join as Ce}from"node:path";import{fileURLToPath as be}from"node:url";import{existsSync as re,readFileSync as A}from"node:fs";import{homedir as ie}from"node:os";import{basename as ae,join as _,resolve as S,sep as ce}from"node:path";import{fileURLToPath as ue}from"node:url";var de=/-wt-\d+$/,N=".chardon.json",pe=ue(new URL("../",import.meta.url)),le=_(pe,"config","chardon.default.json");function R(e){let s=JSON.parse(A(le,"utf-8")),n=_(e,N),t={...s};if(re(n))try{let r=JSON.parse(A(n,"utf-8"));t={...s,...r},t.gitlab={...s.gitlab,...r.gitlab??{}},t.thresholds={...s.thresholds,...r.thresholds??{}},t.skillMap={...s.skillMap,...r.skillMap??{}}}catch{}return he(t.ticketRegex)===null&&(t.ticketRegex=s.ticketRegex),t.outDir=fe(e,t.outDir,s.outDir),t}var me=100,ge=5;function he(e){if(typeof e!="string"||e.length>me||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]|(?<!\()\?/g)?.length??0)>ge)return null;try{return new RegExp(e)}catch{return null}}function k(){return process.env.CHARDON_DB??_(ie(),".claude","chardon.db")}var Ee=/^[a-z0-9][a-z0-9._-]{0,63}$/;function m(e){try{let s=A(_(e,N),"utf-8"),n=JSON.parse(s).repoName;if(typeof n=="string"&&Ee.test(n))return n}catch{}return ae(e).replace(de,"")}function fe(e,s,n){let t=S(e),r=S(t,s);return r===t||r.startsWith(t+ce)?r:S(t,n)}function O(e){return e.replace(/\//g,"-")}function D(e,s,n=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let t=s instanceof Error?s.message:s!==void 0?String(s):"";try{let r=n().toISOString();process.stderr.write(`[chardon] ${r} ${e}${t?`: ${t}`:""}
`)}catch{}}var Ne=_e(import.meta.url),{DatabaseSync:ke}=Ne("node:sqlite");function Oe(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}Oe();var Ie=Ce(M(be(import.meta.url)),"schema.sql"),I=2;function g(){let e=k();Te(M(e),{recursive:!0});try{De(Se(e,"a",384)),Re(e,384)}catch(a){D("db-permissions",a)}let s=new ke(e);s.exec("PRAGMA busy_timeout = 5000"),s.exec("PRAGMA journal_mode = WAL"),s.exec("PRAGMA foreign_keys = ON");let n=Ae(Ie,"utf-8"),t=Me(s);if(t&&s.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),s.exec(n),t&&xe(s),ye(s))try{s.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}if(x(s,"sessions","root_hash"))try{s.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}return s.prepare("PRAGMA user_version").get().user_version!==I&&s.exec(`PRAGMA user_version = ${I}`),s}function Me(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(t=>t.name==="repo"):!1}function xe(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(s){throw e.exec("ROLLBACK"),s}}function x(e,s,n){let t=e.prepare(`PRAGMA table_info(${s})`).all();return t.length>0&&!t.some(r=>r.name===n)}function ye(e){return x(e,"hook_health","last_error")}function h(e){try{e.close()}catch{}}function y(e,s,n){e.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(n,s)}function L(e,s,n){let t=e.prepare("SELECT ok, failed, last_error FROM hook_health WHERE repo = ? AND date = ?").get(s,n);return t?{ok:t.ok,failed:t.failed,lastError:t.last_error}:{ok:0,failed:0,lastError:null}}import{mkdirSync as Ve,writeFileSync as Je}from"node:fs";import{basename as Ye,isAbsolute as ze,join as J}from"node:path";function w(e,s,n,t,r=3){let a=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(s,`-${n}`,r);if(t.length===0)return a;let u=new Set(t);return a.filter(i=>!u.has(i.cmd))}function U(e,s,n,t=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(s,`-${n}`,t)}function $(e,s,n,t=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(s,`-${n}`,t)}var Le=5,we=5,Ue="git commit";function v(e,s,n,t=Le){return e.prepare(`SELECT e.session_id AS sessionId,
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
       LIMIT 20`).all(s,`-${n}`,t)}function F(e,s,n){let t=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd
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
       ORDER BY e.id`).all(s,`-${n}`,Ue);return{count:t.length,sample:t.slice(0,we).map(r=>r.cmd)}}function P(e,s,n){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(s,`-${n}`)??{sessions:0,tools:0,failures:0}}function H(e,s){return e.prepare(`SELECT COUNT(DISTINCT root_hash) AS roots
       FROM sessions
       WHERE repo = ? AND root_hash IS NOT NULL AND root_hash != ''`).get(s)?.roots??0}import{readdirSync as $e,readFileSync as ve}from"node:fs";import{homedir as Fe}from"node:os";import{basename as Pe,join as C}from"node:path";var He=2,We=7,je=/-wt-\d+$/;function Be(){return process.env.CHARDON_PROJECTS_DIR??C(Fe(),".claude","projects")}function Ge(e){let s;try{s=ve(e,"utf-8")}catch{return[]}let n=new Map;for(let t of s.split(`
`)){if(!t.trim())continue;let r;try{r=JSON.parse(t)}catch{continue}if(r.type!=="assistant")continue;let a=r.message;if(!a?.usage)continue;let u=r.timestamp;if(!u)continue;let i=a.usage,c=u.slice(0,10),o=n.get(c);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,messages:0},n.set(c,o)),o.inputTokens+=i.input_tokens??0,o.outputTokens+=i.output_tokens??0,o.cacheRead+=i.cache_read_input_tokens??0,o.cacheCreation+=i.cache_creation_input_tokens??0,o.messages+=1}return Array.from(n.entries()).map(([t,r])=>({date:t,...r}))}function W(e){let s=[];try{for(let n of $e(e,{withFileTypes:!0})){let t=C(e,n.name);n.isFile()&&n.name.endsWith(".jsonl")?s.push(t):n.isDirectory()&&s.push(...W(t))}}catch{}return s}function j(e){let s=je.test(Pe(e))?"worktree":"main",n=m(e),t=C(Be(),O(e)),r=W(t),a=new Map;for(let u of r){let i=Ge(u);for(let c of i){let o=a.get(c.date);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,nbMessages:0,sessions:new Set},a.set(c.date,o)),o.inputTokens+=c.inputTokens,o.outputTokens+=c.outputTokens,o.cacheRead+=c.cacheRead,o.cacheCreation+=c.cacheCreation,o.nbMessages+=c.messages,o.sessions.add(u)}}return Array.from(a.entries()).map(([u,i])=>({date:u,origin:s,repo:n,inputTokens:i.inputTokens,outputTokens:i.outputTokens,cacheRead:i.cacheRead,cacheCreation:i.cacheCreation,nbMessages:i.nbMessages,nbSessions:i.sessions.size}))}function B(e,s){let n=e.prepare(`
    INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, origin, repo) DO UPDATE SET
      input_tokens   = excluded.input_tokens,
      output_tokens  = excluded.output_tokens,
      cache_read     = excluded.cache_read,
      cache_creation = excluded.cache_creation,
      nb_messages    = excluded.nb_messages,
      nb_sessions    = excluded.nb_sessions
  `);for(let t of s)n.run(t.date,t.origin,t.repo,t.inputTokens,t.outputTokens,t.cacheRead,t.cacheCreation,t.nbMessages,t.nbSessions)}var T={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function G(e){return(e.input*T.input+e.output*T.output+e.cacheRead*T.cacheRead+e.cacheCreation*T.cacheCreation)/1e6}function V(e,s,n,t){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(s,n,t,We+1),a=r.find(o=>o.date===t),u=a&&a.output_tokens>0?a.cache_read/a.output_tokens:0,i=r.filter(o=>o.date!==t&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,p)=>o-p),c=0;if(i.length>0){let o=Math.floor(i.length/2);c=i.length%2===0?(i[o-1]+i[o])/2:i[o]}return{drift:c>0&&u>He*c,ratio:u,median:c}}var E=24;function Xe(e){if(!e)return[];let{editedWithoutTests:s,unverifiedCommits:n}=e;if(s.length===0&&n.count===0)return[];let t=["## Method signals",""];if(s.length>0){t.push("### Edits without a test run (per session)"),t.push("| Session | Edits |"),t.push("|---|---|");for(let r of s)t.push(`| \`${r.sessionId}\` | ${r.edits} |`);t.push("")}if(n.count>0){t.push("### Commits without a prior passing test"),t.push(`${n.count} commit(s) went in with no successful test run earlier in the session.`);for(let r of n.sample)t.push(`- \`${r}\``);t.push("")}return t}function Ze(e){let{date:s,velocity:n,toil:t,coldReads:r,retryStorms:a,tokens:u}=e,i=e.health??{ok:0,failed:0},c=t.length>0||r.length>0||a.length>0,o=[`# Dev Metrics \xB7 ${s}`,"","## Velocity",`- ${n.sessions} session(s) \xB7 ${n.tools} tool calls \xB7 ${n.failures} failure(s)`,""];o.push("## Tokens");let p=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${p}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(i.failed>0?`\u26A0 ${i.failed} silent collection failure(s) today (${i.ok} ok): run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy: ${i.ok} write(s) recorded, 0 failures`),i.failed>0&&i.lastError&&o.push(`last error: ${i.lastError}`),e.slugRoots!==void 0&&e.slugRoots>1&&e.repo&&o.push(`\u26A0 ${e.slugRoots} different project roots share the repo slug '${e.repo}': their metrics are merged. Set "repoName" in .chardon.json to separate them.`),o.push(""),!c)o.push("## Frictions","","No friction detected, clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),t.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let d of t)o.push(`| \`${d.cmd}\` | ${d.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let d of r)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}if(a.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let d of a)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}}return o.push(...Xe(e.methodSignals)),o.join(`
`)}async function b(e){let{projectDir:s,now:n}=e,t=R(s),r=m(s),a=n.toISOString().slice(0,10),i=/-wt-\d+$/.test(Ye(s))?"worktree":"main",c=g(),o;try{let X=P(c,r,E),Z=w(c,r,E,t.toilExclusions,t.thresholds.toilMin),q=$(c,r,E,t.thresholds.coldMin),K=U(c,r,E,t.thresholds.retryMin),l=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,i,a),{drift:Q}=V(c,r,i,a),ee={inputTokens:l.inputTokens,outputTokens:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation,drift:Q,costUsd:G({input:l.inputTokens,output:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation})},te=L(c,r,a),se=H(c,r),ne={editedWithoutTests:v(c,r,E),unverifiedCommits:F(c,r,E)};o=Ze({date:a,velocity:X,toil:Z,coldReads:q,retryStorms:K,tokens:ee,health:te,repo:r,slugRoots:se,methodSignals:ne})}finally{h(c)}let p=ze(t.outDir)?t.outDir:J(s,t.outDir);Ve(p,{recursive:!0});let d=J(p,`daily-${a}.md`);return Je(d,o,"utf-8"),{path:d,markdown:o}}if(f("analyze-daily"))try{let{path:e}=await b({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}catch(e){let s=e instanceof Error?e.message:String(e);console.error(`analyze-daily: cannot generate the report: ${s}`),process.exit(1)}function Y(e,s,n,t){let r=new Date(n.getTime()-s*864e5).toISOString(),a=r.slice(0,10),u=e.prepare(`DELETE FROM events
       WHERE ts < ?
         AND session_id IN (SELECT id FROM sessions WHERE repo = ?)`).run(r,t).changes,i=e.prepare(`DELETE FROM sessions
       WHERE repo = ?
         AND started_at < ?
         AND id NOT IN (SELECT session_id FROM events WHERE session_id IS NOT NULL)`).run(t,r).changes,c=e.prepare("DELETE FROM token_usage WHERE repo = ? AND date < ?").run(t,a).changes,o=e.prepare("DELETE FROM nudges WHERE repo = ? AND date < ?").run(t,a).changes;return e.prepare("DELETE FROM purge_log WHERE repo = ? AND ts < ?").run(t,r),e.prepare(`INSERT INTO purge_log (ts, repo, retention_days, events, sessions, token_usage)
     VALUES (?, ?, ?, ?, ?, ?)`).run(n.toISOString(),t,s,u,i,c),e.exec("VACUUM"),{events:u,sessions:i,tokenUsage:c,nudges:o}}function z(e,s,n,t){let r=new Date(n.getTime()-864e5).toISOString();if(e.prepare("SELECT 1 FROM purge_log WHERE repo = ? AND ts >= ? LIMIT 1").get(t,r))return!1;let u=new Date(n.getTime()-s*864e5).toISOString();return e.prepare("SELECT 1 FROM sessions WHERE repo = ? AND started_at < ? LIMIT 1").get(t,u)!==void 0}async function Ke(e,s,n=new Date){try{s.CHARDON_DB&&(process.env.CHARDON_DB=s.CHARDON_DB);let t="";try{if(typeof e!="object"||e===null)return;t=e.session_id??""}catch{return}if(!t)return;let r=s.CLAUDE_PROJECT_DIR??"";if(!r)return;let a=n.toISOString(),u=g();try{y(u,t,a)}finally{h(u)}try{let i=g();try{B(i,j(r))}finally{h(i)}}catch{}try{await b({projectDir:r,now:n})}catch{}try{let i=R(r).retentionDays,c=m(r),o=n,p=g();try{z(p,i,o,c)&&Y(p,i,o,c)}finally{h(p)}}catch{}}catch(t){D("stop",t)}}if(f("stop")){try{let e={};try{let s=qe(0,"utf-8");e=JSON.parse(s)}catch{process.exit(0)}await Ke(e,process.env)}catch{}process.exit(0)}export{Ke as run};
