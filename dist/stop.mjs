#!/usr/bin/env node
import{readFileSync as Be}from"node:fs";import{basename as te}from"node:path";function E(e){let n=process.argv[1];if(!n)return!1;let s=te(n);return s===`${e}.ts`||s===`${e}.mjs`||s===`${e}.js`}import{createRequire as he}from"node:module";import{chmodSync as Ee,closeSync as fe,mkdirSync as Re,openSync as _e,readFileSync as De}from"node:fs";import{dirname as y,join as Te}from"node:path";import{fileURLToPath as Se}from"node:url";import{existsSync as ne,readFileSync as b}from"node:fs";import{homedir as oe}from"node:os";import{basename as se,join as f,resolve as S,sep as re}from"node:path";import{fileURLToPath as ae}from"node:url";var ie=/-wt-\d+$/,N=".chardon.json",ce=ae(new URL("../",import.meta.url)),ue=f(ce,"config","chardon.default.json");function R(e){let n=JSON.parse(b(ue,"utf-8")),s=f(e,N),t={...n};if(ne(s))try{let r=JSON.parse(b(s,"utf-8"));t={...n,...r},t.gitlab={...n.gitlab,...r.gitlab??{}},t.thresholds={...n.thresholds,...r.thresholds??{}}}catch{}return de(t.ticketRegex)===null&&(t.ticketRegex=n.ticketRegex),t.outDir=ge(e,t.outDir,n.outDir),t}var pe=100,le=5;function de(e){if(typeof e!="string"||e.length>pe||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>le)return null;try{return new RegExp(e)}catch{return null}}function k(){return process.env.CHARDON_DB??f(oe(),".claude","chardon.db")}var me=/^[a-z0-9][a-z0-9._-]{0,63}$/;function m(e){try{let n=b(f(e,N),"utf-8"),s=JSON.parse(n).repoName;if(typeof s=="string"&&me.test(s))return s}catch{}return se(e).replace(ie,"")}function ge(e,n,s){let t=S(e),r=S(t,n);return r===t||r.startsWith(t+re)?r:S(t,s)}function O(e){return e.replace(/\//g,"-")}function _(e,n,s=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let t=n instanceof Error?n.message:n!==void 0?String(n):"";try{let r=s().toISOString();process.stderr.write(`[chardon] ${r} ${e}${t?`: ${t}`:""}
`)}catch{}}var be=he(import.meta.url),{DatabaseSync:Ae}=be("node:sqlite");function Ce(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}Ce();var Ne=Te(y(Se(import.meta.url)),"schema.sql"),I=2;function g(){let e=k();Re(y(e),{recursive:!0});try{fe(_e(e,"a",384)),Ee(e,384)}catch(i){_("db-permissions",i)}let n=new Ae(e);n.exec("PRAGMA busy_timeout = 5000"),n.exec("PRAGMA journal_mode = WAL"),n.exec("PRAGMA foreign_keys = ON");let s=De(Ne,"utf-8"),t=ke(n);if(t&&n.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),n.exec(s),t&&Oe(n),Ie(n))try{n.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}if(x(n,"sessions","root_hash"))try{n.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}return n.prepare("PRAGMA user_version").get().user_version!==I&&n.exec(`PRAGMA user_version = ${I}`),n}function ke(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(t=>t.name==="repo"):!1}function Oe(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(n){throw e.exec("ROLLBACK"),n}}function x(e,n,s){let t=e.prepare(`PRAGMA table_info(${n})`).all();return t.length>0&&!t.some(r=>r.name===s)}function Ie(e){return x(e,"hook_health","last_error")}function h(e){try{e.close()}catch{}}function M(e,n,s){e.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(s,n)}function L(e,n,s){let t=e.prepare("SELECT ok, failed, last_error FROM hook_health WHERE repo = ? AND date = ?").get(n,s);return t?{ok:t.ok,failed:t.failed,lastError:t.last_error}:{ok:0,failed:0,lastError:null}}import{mkdirSync as ve,writeFileSync as He}from"node:fs";import{basename as We,isAbsolute as je,join as B}from"node:path";function w(e,n,s,t,r=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(n,`-${s}`,r);if(t.length===0)return i;let u=new Set(t);return i.filter(a=>!u.has(a.cmd))}function U(e,n,s,t=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(n,`-${s}`,t)}function $(e,n,s,t=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(n,`-${s}`,t)}function F(e,n,s){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(n,`-${s}`)??{sessions:0,tools:0,failures:0}}function P(e,n){return e.prepare(`SELECT COUNT(DISTINCT root_hash) AS roots
       FROM sessions
       WHERE repo = ? AND root_hash IS NOT NULL AND root_hash != ''`).get(n)?.roots??0}import{readdirSync as ye,readFileSync as xe}from"node:fs";import{homedir as Me}from"node:os";import{basename as Le,join as A}from"node:path";var we=2,Ue=7,$e=/-wt-\d+$/;function Fe(){return process.env.CHARDON_PROJECTS_DIR??A(Me(),".claude","projects")}function Pe(e){let n;try{n=xe(e,"utf-8")}catch{return[]}let s=new Map;for(let t of n.split(`
`)){if(!t.trim())continue;let r;try{r=JSON.parse(t)}catch{continue}if(r.type!=="assistant")continue;let i=r.message;if(!i?.usage)continue;let u=r.timestamp;if(!u)continue;let a=i.usage,c=u.slice(0,10),o=s.get(c);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,messages:0},s.set(c,o)),o.inputTokens+=a.input_tokens??0,o.outputTokens+=a.output_tokens??0,o.cacheRead+=a.cache_read_input_tokens??0,o.cacheCreation+=a.cache_creation_input_tokens??0,o.messages+=1}return Array.from(s.entries()).map(([t,r])=>({date:t,...r}))}function v(e){let n=[];try{for(let s of ye(e,{withFileTypes:!0})){let t=A(e,s.name);s.isFile()&&s.name.endsWith(".jsonl")?n.push(t):s.isDirectory()&&n.push(...v(t))}}catch{}return n}function H(e){let n=$e.test(Le(e))?"worktree":"main",s=m(e),t=A(Fe(),O(e)),r=v(t),i=new Map;for(let u of r){let a=Pe(u);for(let c of a){let o=i.get(c.date);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,nbMessages:0,sessions:new Set},i.set(c.date,o)),o.inputTokens+=c.inputTokens,o.outputTokens+=c.outputTokens,o.cacheRead+=c.cacheRead,o.cacheCreation+=c.cacheCreation,o.nbMessages+=c.messages,o.sessions.add(u)}}return Array.from(i.entries()).map(([u,a])=>({date:u,origin:n,repo:s,inputTokens:a.inputTokens,outputTokens:a.outputTokens,cacheRead:a.cacheRead,cacheCreation:a.cacheCreation,nbMessages:a.nbMessages,nbSessions:a.sessions.size}))}function W(e,n){let s=e.prepare(`
    INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, origin, repo) DO UPDATE SET
      input_tokens   = excluded.input_tokens,
      output_tokens  = excluded.output_tokens,
      cache_read     = excluded.cache_read,
      cache_creation = excluded.cache_creation,
      nb_messages    = excluded.nb_messages,
      nb_sessions    = excluded.nb_sessions
  `);for(let t of n)s.run(t.date,t.origin,t.repo,t.inputTokens,t.outputTokens,t.cacheRead,t.cacheCreation,t.nbMessages,t.nbSessions)}var D={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function j(e){return(e.input*D.input+e.output*D.output+e.cacheRead*D.cacheRead+e.cacheCreation*D.cacheCreation)/1e6}function G(e,n,s,t){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(n,s,t,Ue+1),i=r.find(o=>o.date===t),u=i&&i.output_tokens>0?i.cache_read/i.output_tokens:0,a=r.filter(o=>o.date!==t&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,l)=>o-l),c=0;if(a.length>0){let o=Math.floor(a.length/2);c=a.length%2===0?(a[o-1]+a[o])/2:a[o]}return{drift:c>0&&u>we*c,ratio:u,median:c}}var T=24;function Ge(e){let{date:n,velocity:s,toil:t,coldReads:r,retryStorms:i,tokens:u}=e,a=e.health??{ok:0,failed:0},c=t.length>0||r.length>0||i.length>0,o=[`# Dev Metrics \xB7 ${n}`,"","## Velocity",`- ${s.sessions} session(s) \xB7 ${s.tools} tool calls \xB7 ${s.failures} failure(s)`,""];o.push("## Tokens");let l=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${l}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(a.failed>0?`\u26A0 ${a.failed} silent collection failure(s) today (${a.ok} ok): run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy: ${a.ok} write(s) recorded, 0 failures`),a.failed>0&&a.lastError&&o.push(`last error: ${a.lastError}`),e.slugRoots!==void 0&&e.slugRoots>1&&e.repo&&o.push(`\u26A0 ${e.slugRoots} different project roots share the repo slug '${e.repo}': their metrics are merged. Set "repoName" in .chardon.json to separate them.`),o.push(""),!c)o.push("## Frictions","","No friction detected, clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),t.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let p of t)o.push(`| \`${p.cmd}\` | ${p.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let p of r)o.push(`| \`${p.file}\` | ${p.count} |`);o.push("")}if(i.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let p of i)o.push(`| \`${p.file}\` | ${p.count} |`);o.push("")}}return o.join(`
`)}async function C(e){let{projectDir:n,now:s}=e,t=R(n),r=m(n),i=s.toISOString().slice(0,10),a=/-wt-\d+$/.test(We(n))?"worktree":"main",c=g(),o;try{let Y=F(c,r,T),z=w(c,r,T,t.toilExclusions,t.thresholds.toilMin),Z=$(c,r,T,t.thresholds.coldMin),X=U(c,r,T,t.thresholds.retryMin),d=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,a,i),{drift:q}=G(c,r,a,i),K={inputTokens:d.inputTokens,outputTokens:d.outputTokens,cacheRead:d.cacheRead,cacheCreation:d.cacheCreation,drift:q,costUsd:j({input:d.inputTokens,output:d.outputTokens,cacheRead:d.cacheRead,cacheCreation:d.cacheCreation})},Q=L(c,r,i),ee=P(c,r);o=Ge({date:i,velocity:Y,toil:z,coldReads:Z,retryStorms:X,tokens:K,health:Q,repo:r,slugRoots:ee})}finally{h(c)}let l=je(t.outDir)?t.outDir:B(n,t.outDir);ve(l,{recursive:!0});let p=B(l,`daily-${i}.md`);return He(p,o,"utf-8"),{path:p,markdown:o}}if(E("analyze-daily"))try{let{path:e}=await C({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}catch(e){let n=e instanceof Error?e.message:String(e);console.error(`analyze-daily: cannot generate the report: ${n}`),process.exit(1)}function V(e,n,s,t){let r=new Date(s.getTime()-n*864e5).toISOString(),i=r.slice(0,10),u=e.prepare(`DELETE FROM events
       WHERE ts < ?
         AND session_id IN (SELECT id FROM sessions WHERE repo = ?)`).run(r,t).changes,a=e.prepare(`DELETE FROM sessions
       WHERE repo = ?
         AND started_at < ?
         AND id NOT IN (SELECT session_id FROM events WHERE session_id IS NOT NULL)`).run(t,r).changes,c=e.prepare("DELETE FROM token_usage WHERE repo = ? AND date < ?").run(t,i).changes,o=e.prepare("DELETE FROM nudges WHERE repo = ? AND date < ?").run(t,i).changes;return e.prepare("DELETE FROM purge_log WHERE repo = ? AND ts < ?").run(t,r),e.prepare(`INSERT INTO purge_log (ts, repo, retention_days, events, sessions, token_usage)
     VALUES (?, ?, ?, ?, ?, ?)`).run(s.toISOString(),t,n,u,a,c),e.exec("VACUUM"),{events:u,sessions:a,tokenUsage:c,nudges:o}}function J(e,n,s,t){let r=new Date(s.getTime()-864e5).toISOString();if(e.prepare("SELECT 1 FROM purge_log WHERE repo = ? AND ts >= ? LIMIT 1").get(t,r))return!1;let u=new Date(s.getTime()-n*864e5).toISOString();return e.prepare("SELECT 1 FROM sessions WHERE repo = ? AND started_at < ? LIMIT 1").get(t,u)!==void 0}async function Ve(e,n,s=new Date){try{n.CHARDON_DB&&(process.env.CHARDON_DB=n.CHARDON_DB);let t="";try{if(typeof e!="object"||e===null)return;t=e.session_id??""}catch{return}if(!t)return;let r=n.CLAUDE_PROJECT_DIR??"";if(!r)return;let i=s.toISOString(),u=g();try{M(u,t,i)}finally{h(u)}try{let a=g();try{W(a,H(r))}finally{h(a)}}catch{}try{await C({projectDir:r,now:s})}catch{}try{let a=R(r).retentionDays,c=m(r),o=s,l=g();try{J(l,a,o,c)&&V(l,a,o,c)}finally{h(l)}}catch{}}catch(t){_("stop",t)}}if(E("stop")){try{let e={};try{let n=Be(0,"utf-8");e=JSON.parse(n)}catch{process.exit(0)}await Ve(e,process.env)}catch{}process.exit(0)}export{Ve as run};
