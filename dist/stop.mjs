#!/usr/bin/env node
import{readFileSync as He}from"node:fs";import{basename as q}from"node:path";function f(e){let n=process.argv[1];if(!n)return!1;let s=q(n);return s===`${e}.ts`||s===`${e}.mjs`||s===`${e}.js`}import{createRequire as de}from"node:module";import{chmodSync as le,closeSync as me,mkdirSync as ge,openSync as Ee,readFileSync as fe}from"node:fs";import{dirname as I,join as he}from"node:path";import{fileURLToPath as _e}from"node:url";import{existsSync as K,readFileSync as C}from"node:fs";import{homedir as Q}from"node:os";import{basename as ee,join as b,resolve as T,sep as te}from"node:path";import{fileURLToPath as ne}from"node:url";var oe=/-wt-\d+$/,se=".chardon.json",re=ne(new URL("../",import.meta.url)),ae=b(re,"config","chardon.default.json");function h(e){let n=JSON.parse(C(ae,"utf-8")),s=b(e,se),t={...n};if(K(s))try{let r=JSON.parse(C(s,"utf-8"));t={...n,...r},t.gitlab={...n.gitlab,...r.gitlab??{}},t.thresholds={...n.thresholds,...r.thresholds??{}}}catch{}return ue(t.ticketRegex)===null&&(t.ticketRegex=n.ticketRegex),t.outDir=pe(e,t.outDir,n.outDir),t}var ie=100,ce=5;function ue(e){if(typeof e!="string"||e.length>ie||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>ce)return null;try{return new RegExp(e)}catch{return null}}function N(){return process.env.CHARDON_DB??b(Q(),".claude","chardon.db")}function m(e){return ee(e).replace(oe,"")}function pe(e,n,s){let t=T(e),r=T(t,n);return r===t||r.startsWith(t+te)?r:T(t,s)}function k(e){return e.replace(/\//g,"-")}function _(e,n,s=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let t=n instanceof Error?n.message:n!==void 0?String(n):"";try{let r=s().toISOString();process.stderr.write(`[chardon] ${r} ${e}${t?`: ${t}`:""}
`)}catch{}}var Re=de(import.meta.url),{DatabaseSync:De}=Re("node:sqlite");function Te(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}Te();var be=he(I(_e(import.meta.url)),"schema.sql"),O=2;function g(){let e=N();ge(I(e),{recursive:!0});try{me(Ee(e,"a",384)),le(e,384)}catch(i){_("db-permissions",i)}let n=new De(e);n.exec("PRAGMA busy_timeout = 5000"),n.exec("PRAGMA journal_mode = WAL"),n.exec("PRAGMA foreign_keys = ON");let s=fe(be,"utf-8"),t=Se(n);if(t&&n.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),n.exec(s),t&&Ae(n),Ce(n))try{n.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}return n.prepare("PRAGMA user_version").get().user_version!==O&&n.exec(`PRAGMA user_version = ${O}`),n}function Se(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(t=>t.name==="repo"):!1}function Ae(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(n){throw e.exec("ROLLBACK"),n}}function Ce(e){let n=e.prepare("PRAGMA table_info(hook_health)").all();return n.length>0&&!n.some(s=>s.name==="last_error")}function E(e){try{e.close()}catch{}}function y(e,n,s){e.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(s,n)}function x(e,n,s){let t=e.prepare("SELECT ok, failed, last_error FROM hook_health WHERE repo = ? AND date = ?").get(n,s);return t?{ok:t.ok,failed:t.failed,lastError:t.last_error}:{ok:0,failed:0,lastError:null}}import{mkdirSync as Ue,writeFileSync as $e}from"node:fs";import{basename as Fe,isAbsolute as ve,join as W}from"node:path";function M(e,n,s,t,r=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(n,`-${s}`,r);if(t.length===0)return i;let u=new Set(t);return i.filter(a=>!u.has(a.cmd))}function L(e,n,s,t=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(n,`-${s}`,t)}function w(e,n,s,t=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(n,`-${s}`,t)}function U(e,n,s){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(n,`-${s}`)??{sessions:0,tools:0,failures:0}}import{readdirSync as Ne,readFileSync as ke}from"node:fs";import{homedir as Oe}from"node:os";import{basename as Ie,join as S}from"node:path";var ye=2,xe=7,Me=/-wt-\d+$/;function Le(){return process.env.CHARDON_PROJECTS_DIR??S(Oe(),".claude","projects")}function we(e){let n;try{n=ke(e,"utf-8")}catch{return[]}let s=new Map;for(let t of n.split(`
`)){if(!t.trim())continue;let r;try{r=JSON.parse(t)}catch{continue}if(r.type!=="assistant")continue;let i=r.message;if(!i?.usage)continue;let u=r.timestamp;if(!u)continue;let a=i.usage,c=u.slice(0,10),o=s.get(c);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,messages:0},s.set(c,o)),o.inputTokens+=a.input_tokens??0,o.outputTokens+=a.output_tokens??0,o.cacheRead+=a.cache_read_input_tokens??0,o.cacheCreation+=a.cache_creation_input_tokens??0,o.messages+=1}return Array.from(s.entries()).map(([t,r])=>({date:t,...r}))}function $(e){let n=[];try{for(let s of Ne(e,{withFileTypes:!0})){let t=S(e,s.name);s.isFile()&&s.name.endsWith(".jsonl")?n.push(t):s.isDirectory()&&n.push(...$(t))}}catch{}return n}function F(e){let n=Me.test(Ie(e))?"worktree":"main",s=m(e),t=S(Le(),k(e)),r=$(t),i=new Map;for(let u of r){let a=we(u);for(let c of a){let o=i.get(c.date);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,nbMessages:0,sessions:new Set},i.set(c.date,o)),o.inputTokens+=c.inputTokens,o.outputTokens+=c.outputTokens,o.cacheRead+=c.cacheRead,o.cacheCreation+=c.cacheCreation,o.nbMessages+=c.messages,o.sessions.add(u)}}return Array.from(i.entries()).map(([u,a])=>({date:u,origin:n,repo:s,inputTokens:a.inputTokens,outputTokens:a.outputTokens,cacheRead:a.cacheRead,cacheCreation:a.cacheCreation,nbMessages:a.nbMessages,nbSessions:a.sessions.size}))}function v(e,n){let s=e.prepare(`
    INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, origin, repo) DO UPDATE SET
      input_tokens   = excluded.input_tokens,
      output_tokens  = excluded.output_tokens,
      cache_read     = excluded.cache_read,
      cache_creation = excluded.cache_creation,
      nb_messages    = excluded.nb_messages,
      nb_sessions    = excluded.nb_sessions
  `);for(let t of n)s.run(t.date,t.origin,t.repo,t.inputTokens,t.outputTokens,t.cacheRead,t.cacheCreation,t.nbMessages,t.nbSessions)}var R={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function P(e){return(e.input*R.input+e.output*R.output+e.cacheRead*R.cacheRead+e.cacheCreation*R.cacheCreation)/1e6}function H(e,n,s,t){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(n,s,t,xe+1),i=r.find(o=>o.date===t),u=i&&i.output_tokens>0?i.cache_read/i.output_tokens:0,a=r.filter(o=>o.date!==t&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,d)=>o-d),c=0;if(a.length>0){let o=Math.floor(a.length/2);c=a.length%2===0?(a[o-1]+a[o])/2:a[o]}return{drift:c>0&&u>ye*c,ratio:u,median:c}}var D=24;function Pe(e){let{date:n,velocity:s,toil:t,coldReads:r,retryStorms:i,tokens:u}=e,a=e.health??{ok:0,failed:0},c=t.length>0||r.length>0||i.length>0,o=[`# Dev Metrics \xB7 ${n}`,"","## Velocity",`- ${s.sessions} session(s) \xB7 ${s.tools} tool calls \xB7 ${s.failures} failure(s)`,""];o.push("## Tokens");let d=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${d}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(a.failed>0?`\u26A0 ${a.failed} silent collection failure(s) today (${a.ok} ok): run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy: ${a.ok} write(s) recorded, 0 failures`),a.failed>0&&a.lastError&&o.push(`last error: ${a.lastError}`),o.push(""),!c)o.push("## Frictions","","No friction detected, clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),t.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let p of t)o.push(`| \`${p.cmd}\` | ${p.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let p of r)o.push(`| \`${p.file}\` | ${p.count} |`);o.push("")}if(i.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let p of i)o.push(`| \`${p.file}\` | ${p.count} |`);o.push("")}}return o.join(`
`)}async function A(e){let{projectDir:n,now:s}=e,t=h(n),r=m(n),i=s.toISOString().slice(0,10),a=/-wt-\d+$/.test(Fe(n))?"worktree":"main",c=g(),o;try{let B=U(c,r,D),V=M(c,r,D,t.toilExclusions,t.thresholds.toilMin),J=w(c,r,D,t.thresholds.coldMin),Y=L(c,r,D,t.thresholds.retryMin),l=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,a,i),{drift:z}=H(c,r,a,i),Z={inputTokens:l.inputTokens,outputTokens:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation,drift:z,costUsd:P({input:l.inputTokens,output:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation})},X=x(c,r,i);o=Pe({date:i,velocity:B,toil:V,coldReads:J,retryStorms:Y,tokens:Z,health:X})}finally{E(c)}let d=ve(t.outDir)?t.outDir:W(n,t.outDir);Ue(d,{recursive:!0});let p=W(d,`daily-${i}.md`);return $e(p,o,"utf-8"),{path:p,markdown:o}}if(f("analyze-daily"))try{let{path:e}=await A({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}catch(e){let n=e instanceof Error?e.message:String(e);console.error(`analyze-daily: cannot generate the report: ${n}`),process.exit(1)}function j(e,n,s,t){let r=new Date(s.getTime()-n*864e5).toISOString(),i=r.slice(0,10),u=e.prepare(`DELETE FROM events
       WHERE ts < ?
         AND session_id IN (SELECT id FROM sessions WHERE repo = ?)`).run(r,t).changes,a=e.prepare(`DELETE FROM sessions
       WHERE repo = ?
         AND started_at < ?
         AND id NOT IN (SELECT session_id FROM events WHERE session_id IS NOT NULL)`).run(t,r).changes,c=e.prepare("DELETE FROM token_usage WHERE repo = ? AND date < ?").run(t,i).changes,o=e.prepare("DELETE FROM nudges WHERE repo = ? AND date < ?").run(t,i).changes;return e.prepare("DELETE FROM purge_log WHERE repo = ? AND ts < ?").run(t,r),e.prepare(`INSERT INTO purge_log (ts, repo, retention_days, events, sessions, token_usage)
     VALUES (?, ?, ?, ?, ?, ?)`).run(s.toISOString(),t,n,u,a,c),e.exec("VACUUM"),{events:u,sessions:a,tokenUsage:c,nudges:o}}function G(e,n,s,t){let r=new Date(s.getTime()-864e5).toISOString();if(e.prepare("SELECT 1 FROM purge_log WHERE repo = ? AND ts >= ? LIMIT 1").get(t,r))return!1;let u=new Date(s.getTime()-n*864e5).toISOString();return e.prepare("SELECT 1 FROM sessions WHERE repo = ? AND started_at < ? LIMIT 1").get(t,u)!==void 0}async function We(e,n,s=new Date){try{n.CHARDON_DB&&(process.env.CHARDON_DB=n.CHARDON_DB);let t="";try{if(typeof e!="object"||e===null)return;t=e.session_id??""}catch{return}if(!t)return;let r=n.CLAUDE_PROJECT_DIR??"";if(!r)return;let i=s.toISOString(),u=g();try{y(u,t,i)}finally{E(u)}try{let a=g();try{v(a,F(r))}finally{E(a)}}catch{}try{await A({projectDir:r,now:s})}catch{}try{let a=h(r).retentionDays,c=m(r),o=s,d=g();try{G(d,a,o,c)&&j(d,a,o,c)}finally{E(d)}}catch{}}catch(t){_("stop",t)}}if(f("stop")){try{let e={};try{let n=He(0,"utf-8");e=JSON.parse(n)}catch{process.exit(0)}await We(e,process.env)}catch{}process.exit(0)}export{We as run};
