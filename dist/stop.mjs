#!/usr/bin/env node
import{readFileSync as tt}from"node:fs";import{basename as ie}from"node:path";function f(e){let s=process.argv[1];if(!s)return!1;let n=ie(s);return n===`${e}.ts`||n===`${e}.mjs`||n===`${e}.js`}import{createRequire as Te}from"node:module";import{chmodSync as Se,closeSync as Ae,mkdirSync as Ce,openSync as be,readFileSync as Ne}from"node:fs";import{dirname as x,join as Oe}from"node:path";import{fileURLToPath as ke}from"node:url";import{existsSync as ae,readFileSync as A}from"node:fs";import{homedir as ce}from"node:os";import{basename as ue,join as _,resolve as S,sep as de}from"node:path";import{fileURLToPath as pe}from"node:url";var le=/-wt-\d+$/,O=".chardon.json",me=pe(new URL("../",import.meta.url)),ge=_(me,"config","chardon.default.json");function R(e){let s=JSON.parse(A(ge,"utf-8")),n=_(e,O),t={...s};if(ae(n))try{let r=JSON.parse(A(n,"utf-8"));t={...s,...r},t.gitlab={...s.gitlab,...r.gitlab??{}},t.thresholds={...s.thresholds,...r.thresholds??{}},t.skillMap={...s.skillMap,...r.skillMap??{}}}catch{}return fe(t.ticketRegex)===null&&(t.ticketRegex=s.ticketRegex),t.outDir=Re(e,t.outDir,s.outDir),t}var he=100,Ee=5;function fe(e){if(typeof e!="string"||e.length>he||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]|(?<!\()\?/g)?.length??0)>Ee)return null;try{return new RegExp(e)}catch{return null}}function k(){return process.env.CHARDON_DB??_(ce(),".claude","chardon.db")}var _e=/^[a-z0-9][a-z0-9._-]{0,63}$/;function m(e){try{let s=A(_(e,O),"utf-8"),n=JSON.parse(s).repoName;if(typeof n=="string"&&_e.test(n))return n}catch{}return ue(e).replace(le,"")}function Re(e,s,n){let t=S(e),r=S(t,s);return r===t||r.startsWith(t+de)?r:S(t,n)}function I(e){return e.replace(/\//g,"-")}function D(e,s,n=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let t=s instanceof Error?s.message:s!==void 0?String(s):"";try{let r=n().toISOString();process.stderr.write(`[chardon] ${r} ${e}${t?`: ${t}`:""}
`)}catch{}}var De=[[/glpat-[A-Za-z0-9_-]{10,}/g,"[REDACTED]"],[/glrt-[A-Za-z0-9_-]{10,}/g,"[REDACTED]"],[/ghp_[A-Za-z0-9]{36,}/g,"[REDACTED]"],[/github_pat_[A-Za-z0-9_]{20,}/g,"[REDACTED]"],[/ATATT[A-Za-z0-9+/=]{40,}/g,"[REDACTED]"],[/\bAKIA[0-9A-Z]{16}\b/g,"[REDACTED]"],[/sk-ant-[A-Za-z0-9_-]{20,}/g,"[REDACTED]"],[/\bsk_(?:live|test)_[A-Za-z0-9]{20,}/g,"[REDACTED]"],[/\bnpm_[A-Za-z0-9]{36}\b/g,"[REDACTED]"],[/\bxox[baprs]-[A-Za-z0-9-]{10,}/g,"[REDACTED]"],[/\bAIza[0-9A-Za-z_-]{35}\b/g,"[REDACTED]"],[/((?:^|\s)(?:-u|--user)[ =])[^\s:@]+:\S+/g,"$1[REDACTED]"],[/(\bsshpass\s+-p\s*)\S+/g,"$1[REDACTED]"],[/\b((?:[a-z0-9]+[_-])*(?:token|key|secret|password|passwd|pass|pwd|auth|credential)s?)=("[^"]*"|'[^']*'|\S+)/g,"$1=[REDACTED]"],[/(--?(?:token|key|secret|password|passwd|pwd|api[-_]?key|auth)(?:\s+|=)|[Bb]earer\s+)\S+/g,"$1[REDACTED]"],[/\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASS|PWD|AUTH|CREDENTIAL)[A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g,"$1=[REDACTED]"],[/((?:postgres|mysql|mongodb|http|https|sftp|ftp):\/\/)[^:@\s]+:[^@\s]+@/g,"$1[REDACTED]@"],[/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[JWT_REDACTED]"],[/\b[0-9a-fA-F]{32,}\b/g,"[HEX_REDACTED]"]];function M(e){if(typeof e!="string")return"";let s=e;for(let[n,t]of De)s=s.replace(n,t);return s}var Ie=Te(import.meta.url),{DatabaseSync:Me}=Ie("node:sqlite");function ye(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}ye();var xe=Oe(x(ke(import.meta.url)),"schema.sql"),y=2;function g(){let e=k();Ce(x(e),{recursive:!0});try{Ae(be(e,"a",384)),Se(e,384)}catch(i){D("db-permissions",i)}let s=new Me(e);s.exec("PRAGMA busy_timeout = 5000"),s.exec("PRAGMA journal_mode = WAL"),s.exec("PRAGMA foreign_keys = ON");let n=Ne(xe,"utf-8"),t=Le(s);if(t&&s.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),s.exec(n),t&&we(s),Ue(s))try{s.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}if(C(s,"sessions","root_hash"))try{s.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}if(C(s,"purge_log","nudges"))try{s.exec("ALTER TABLE purge_log ADD COLUMN nudges INTEGER NOT NULL DEFAULT 0")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}return s.prepare("PRAGMA user_version").get().user_version!==y&&s.exec(`PRAGMA user_version = ${y}`),s}function Le(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(t=>t.name==="repo"):!1}function we(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(s){throw e.exec("ROLLBACK"),s}}function C(e,s,n){let t=e.prepare(`PRAGMA table_info(${s})`).all();return t.length>0&&!t.some(r=>r.name===n)}function Ue(e){return C(e,"hook_health","last_error")}function h(e){try{e.close()}catch{}}function L(e,s,n){e.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(n,s)}var $e=200;function w(e,s,n,t){if(n){e.prepare(`INSERT INTO hook_health (date, repo, ok, failed)
       VALUES (date('now'), ?, 1, 0)
       ON CONFLICT(date, repo) DO UPDATE SET ok = ok + 1`).run(s);return}let r=t!==void 0?M(t).slice(0,$e):null;e.prepare(`INSERT INTO hook_health (date, repo, ok, failed, last_error)
     VALUES (date('now'), ?, 0, 1, ?)
     ON CONFLICT(date, repo) DO UPDATE SET
       failed = failed + 1,
       last_error = COALESCE(excluded.last_error, last_error)`).run(s,r)}function U(e,s,n){let t=e.prepare("SELECT ok, failed, last_error FROM hook_health WHERE repo = ? AND date = ?").get(s,n);return t?{ok:t.ok,failed:t.failed,lastError:t.last_error}:{ok:0,failed:0,lastError:null}}import{mkdirSync as Xe,writeFileSync as Ze}from"node:fs";import{basename as qe,isAbsolute as Ke,join as z}from"node:path";function $(e,s,n,t,r=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(s,`-${n}`,r);if(t.length===0)return i;let u=new Set(t);return i.filter(a=>!u.has(a.cmd))}function v(e,s,n,t=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(s,`-${n}`,t)}function F(e,s,n,t=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(s,`-${n}`,t)}var ve=5,Fe=5,He="git commit";function H(e,s,n,t=ve){return e.prepare(`SELECT e.session_id AS sessionId,
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
       LIMIT 20`).all(s,`-${n}`,t)}function P(e,s,n){let t=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd
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
       ORDER BY e.id`).all(s,`-${n}`,He);return{count:t.length,sample:t.slice(0,Fe).map(r=>r.cmd)}}function W(e,s,n){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(s,`-${n}`)??{sessions:0,tools:0,failures:0}}function j(e,s){return e.prepare(`SELECT COUNT(DISTINCT root_hash) AS roots
       FROM sessions
       WHERE repo = ? AND root_hash IS NOT NULL AND root_hash != ''`).get(s)?.roots??0}import{readdirSync as Pe,readFileSync as We}from"node:fs";import{homedir as je}from"node:os";import{basename as Be,join as b}from"node:path";var Ge=2,Ve=7,Je=/-wt-\d+$/;function Ye(){return process.env.CHARDON_PROJECTS_DIR??b(je(),".claude","projects")}function ze(e){let s;try{s=We(e,"utf-8")}catch{return[]}let n=new Map;for(let t of s.split(`
`)){if(!t.trim())continue;let r;try{r=JSON.parse(t)}catch{continue}if(r.type!=="assistant")continue;let i=r.message;if(!i?.usage)continue;let u=r.timestamp;if(!u)continue;let a=i.usage,c=u.slice(0,10),o=n.get(c);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,messages:0},n.set(c,o)),o.inputTokens+=a.input_tokens??0,o.outputTokens+=a.output_tokens??0,o.cacheRead+=a.cache_read_input_tokens??0,o.cacheCreation+=a.cache_creation_input_tokens??0,o.messages+=1}return Array.from(n.entries()).map(([t,r])=>({date:t,...r}))}function B(e){let s=[];try{for(let n of Pe(e,{withFileTypes:!0})){let t=b(e,n.name);n.isFile()&&n.name.endsWith(".jsonl")?s.push(t):n.isDirectory()&&s.push(...B(t))}}catch{}return s}function G(e){let s=Je.test(Be(e))?"worktree":"main",n=m(e),t=b(Ye(),I(e)),r=B(t),i=new Map;for(let u of r){let a=ze(u);for(let c of a){let o=i.get(c.date);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,nbMessages:0,sessions:new Set},i.set(c.date,o)),o.inputTokens+=c.inputTokens,o.outputTokens+=c.outputTokens,o.cacheRead+=c.cacheRead,o.cacheCreation+=c.cacheCreation,o.nbMessages+=c.messages,o.sessions.add(u)}}return Array.from(i.entries()).map(([u,a])=>({date:u,origin:s,repo:n,inputTokens:a.inputTokens,outputTokens:a.outputTokens,cacheRead:a.cacheRead,cacheCreation:a.cacheCreation,nbMessages:a.nbMessages,nbSessions:a.sessions.size}))}function V(e,s){let n=e.prepare(`
    INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, origin, repo) DO UPDATE SET
      input_tokens   = excluded.input_tokens,
      output_tokens  = excluded.output_tokens,
      cache_read     = excluded.cache_read,
      cache_creation = excluded.cache_creation,
      nb_messages    = excluded.nb_messages,
      nb_sessions    = excluded.nb_sessions
  `);for(let t of s)n.run(t.date,t.origin,t.repo,t.inputTokens,t.outputTokens,t.cacheRead,t.cacheCreation,t.nbMessages,t.nbSessions)}var T={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function J(e){return(e.input*T.input+e.output*T.output+e.cacheRead*T.cacheRead+e.cacheCreation*T.cacheCreation)/1e6}function Y(e,s,n,t){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(s,n,t,Ve+1),i=r.find(o=>o.date===t),u=i&&i.output_tokens>0?i.cache_read/i.output_tokens:0,a=r.filter(o=>o.date!==t&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,p)=>o-p),c=0;if(a.length>0){let o=Math.floor(a.length/2);c=a.length%2===0?(a[o-1]+a[o])/2:a[o]}return{drift:c>0&&u>Ge*c,ratio:u,median:c}}var E=24;function Qe(e){if(!e)return[];let{editedWithoutTests:s,unverifiedCommits:n}=e;if(s.length===0&&n.count===0)return[];let t=["## Method signals",""];if(s.length>0){t.push("### Edits without a test run (per session)"),t.push("| Session | Edits |"),t.push("|---|---|");for(let r of s)t.push(`| \`${r.sessionId}\` | ${r.edits} |`);t.push("")}if(n.count>0){t.push("### Commits without a prior passing test"),t.push(`${n.count} commit(s) went in with no successful test run earlier in the session.`);for(let r of n.sample)t.push(`- \`${r}\``);t.push("")}return t}function et(e){let{date:s,velocity:n,toil:t,coldReads:r,retryStorms:i,tokens:u}=e,a=e.health??{ok:0,failed:0},c=t.length>0||r.length>0||i.length>0,o=[`# Dev Metrics \xB7 ${s}`,"","## Velocity",`- ${n.sessions} session(s) \xB7 ${n.tools} tool calls \xB7 ${n.failures} failure(s)`,""];o.push("## Tokens");let p=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${p}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(a.failed>0?`\u26A0 ${a.failed} silent collection failure(s) today (${a.ok} ok): run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy: ${a.ok} write(s) recorded, 0 failures`),a.failed>0&&a.lastError&&o.push(`last error: ${a.lastError}`),e.slugRoots!==void 0&&e.slugRoots>1&&e.repo&&o.push(`\u26A0 ${e.slugRoots} different project roots share the repo slug '${e.repo}': their metrics are merged. Set "repoName" in .chardon.json to separate them.`),o.push(""),!c)o.push("## Frictions","","No friction detected, clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),t.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let d of t)o.push(`| \`${d.cmd}\` | ${d.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let d of r)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}if(i.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let d of i)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}}return o.push(...Qe(e.methodSignals)),o.join(`
`)}async function N(e){let{projectDir:s,now:n}=e,t=R(s),r=m(s),i=n.toISOString().slice(0,10),a=/-wt-\d+$/.test(qe(s))?"worktree":"main",c=g(),o;try{let q=W(c,r,E),K=$(c,r,E,t.toilExclusions,t.thresholds.toilMin),Q=F(c,r,E,t.thresholds.coldMin),ee=v(c,r,E,t.thresholds.retryMin),l=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,a,i),{drift:te}=Y(c,r,a,i),se={inputTokens:l.inputTokens,outputTokens:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation,drift:te,costUsd:J({input:l.inputTokens,output:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation})},ne=U(c,r,i),oe=j(c,r),re={editedWithoutTests:H(c,r,E),unverifiedCommits:P(c,r,E)};o=et({date:i,velocity:q,toil:K,coldReads:Q,retryStorms:ee,tokens:se,health:ne,repo:r,slugRoots:oe,methodSignals:re})}finally{h(c)}let p=Ke(t.outDir)?t.outDir:z(s,t.outDir);Xe(p,{recursive:!0});let d=z(p,`daily-${i}.md`);return Ze(d,o,"utf-8"),{path:d,markdown:o}}if(f("analyze-daily"))try{let{path:e}=await N({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}catch(e){let s=e instanceof Error?e.message:String(e);console.error(`analyze-daily: cannot generate the report: ${s}`),process.exit(1)}function X(e,s,n,t){let r=new Date(n.getTime()-s*864e5).toISOString(),i=r.slice(0,10),u=e.prepare(`DELETE FROM events
       WHERE ts < ?
         AND session_id IN (SELECT id FROM sessions WHERE repo = ?)`).run(r,t).changes,a=e.prepare(`DELETE FROM sessions
       WHERE repo = ?
         AND started_at < ?
         AND id NOT IN (SELECT session_id FROM events WHERE session_id IS NOT NULL)`).run(t,r).changes,c=e.prepare("DELETE FROM token_usage WHERE repo = ? AND date < ?").run(t,i).changes,o=e.prepare("DELETE FROM nudges WHERE repo = ? AND date < ?").run(t,i).changes;return e.prepare("DELETE FROM purge_log WHERE repo = ? AND ts < ?").run(t,r),e.prepare(`INSERT INTO purge_log (ts, repo, retention_days, events, sessions, token_usage, nudges)
     VALUES (?, ?, ?, ?, ?, ?, ?)`).run(n.toISOString(),t,s,u,a,c,o),e.exec("VACUUM"),{events:u,sessions:a,tokenUsage:c,nudges:o}}function Z(e,s,n,t){let r=new Date(n.getTime()-864e5).toISOString();if(e.prepare("SELECT 1 FROM purge_log WHERE repo = ? AND ts >= ? LIMIT 1").get(t,r))return!1;let u=new Date(n.getTime()-s*864e5).toISOString();return e.prepare("SELECT 1 FROM sessions WHERE repo = ? AND started_at < ? LIMIT 1").get(t,u)!==void 0}async function st(e,s,n=new Date){try{s.CHARDON_DB&&(process.env.CHARDON_DB=s.CHARDON_DB);let t="";try{if(typeof e!="object"||e===null)return;t=e.session_id??""}catch{return}if(!t)return;let r=s.CLAUDE_PROJECT_DIR??"";if(!r)return;let i=n.toISOString(),u=g();try{L(u,t,i)}finally{h(u)}try{let a=g();try{V(a,G(r))}finally{h(a)}}catch{}try{await N({projectDir:r,now:n})}catch{}try{let a=R(r).retentionDays,c=m(r),o=n,p=g();try{Z(p,a,o,c)&&X(p,a,o,c)}finally{h(p)}}catch{}}catch(t){try{let r=m(s.CLAUDE_PROJECT_DIR??"");if(r){let i=g();try{w(i,r,!1,t instanceof Error?t.message:String(t))}finally{h(i)}}}catch{}D("stop",t)}}if(f("stop")){try{let e={};try{let s=tt(0,"utf-8");e=JSON.parse(s)}catch{process.exit(0)}await st(e,process.env)}catch{}process.exit(0)}export{st as run};
