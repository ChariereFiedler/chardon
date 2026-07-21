#!/usr/bin/env node
import{readFileSync as Ie}from"node:fs";import{basename as q}from"node:path";function f(e){let t=process.argv[1];if(!t)return!1;let s=q(t);return s===`${e}.ts`||s===`${e}.mjs`||s===`${e}.js`}import{createRequire as re}from"node:module";import{chmodSync as ie,readFileSync as ae}from"node:fs";import{dirname as ce,join as ue}from"node:path";import{fileURLToPath as de}from"node:url";import{existsSync as K,readFileSync as E}from"node:fs";import{homedir as X}from"node:os";import{basename as z,join as C,resolve as _,sep as Q}from"node:path";import{fileURLToPath as Z}from"node:url";var ee=/-wt-\d+$/,te=".chardon.json",ne=Z(new URL("../",import.meta.url)),oe=C(ne,"config","chardon.default.json");function T(e){let t=JSON.parse(E(oe,"utf-8")),s=C(e,te),n={...t};if(K(s))try{let r=JSON.parse(E(s,"utf-8"));n={...t,...r},n.gitlab={...t.gitlab,...r.gitlab??{}},n.thresholds={...t.thresholds,...r.thresholds??{}}}catch{}try{new RegExp(n.ticketRegex)}catch{n.ticketRegex=t.ticketRegex}return n.outDir=se(e,n.outDir,t.outDir),n}function k(){return process.env.CHARDON_DB??C(X(),".claude","chardon.db")}function g(e){return z(e).replace(ee,"")}function se(e,t,s){let n=_(e),r=_(n,t);return r===n||r.startsWith(n+Q)?r:_(n,s)}function N(e){return e.replace(/\//g,"-")}var pe=re(import.meta.url),{DatabaseSync:me}=pe("node:sqlite");function le(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}le();var he=ue(ce(de(import.meta.url)),"schema.sql"),A=2;function l(){let e=k(),t=new me(e);try{ie(e,384)}catch{}t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let s=ae(he,"utf-8"),n=fe(t);return n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(s),n&&ge(t),t.prepare("PRAGMA user_version").get().user_version!==A&&t.exec(`PRAGMA user_version = ${A}`),t}function fe(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function ge(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function h(e){try{e.close()}catch{}}function O(e,t,s){e.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(s,t)}function y(e,t,s){return e.prepare("SELECT ok, failed FROM hook_health WHERE repo = ? AND date = ?").get(t,s)??{ok:0,failed:0}}import{mkdirSync as Ne,writeFileSync as Ae}from"node:fs";import{basename as Oe,isAbsolute as ye,join as P}from"node:path";function x(e,t,s,n,r=3){let a=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${s}`,r);if(n.length===0)return a;let u=new Set(n);return a.filter(i=>!u.has(i.cmd))}function I(e,t,s,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function M(e,t,s,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function L(e,t,s){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(t,`-${s}`)??{sessions:0,tools:0,failures:0}}import{readdirSync as be,readFileSync as Re}from"node:fs";import{homedir as _e}from"node:os";import{basename as Ce,join as S}from"node:path";var Se=2,De=7,Ee=/-wt-\d+$/;function Te(){return process.env.CHARDON_PROJECTS_DIR??S(_e(),".claude","projects")}function ke(e){let t;try{t=Re(e,"utf-8")}catch{return[]}let s=new Map;for(let n of t.split(`
`)){if(!n.trim())continue;let r;try{r=JSON.parse(n)}catch{continue}if(r.type!=="assistant")continue;let a=r.message;if(!a?.usage)continue;let u=r.timestamp;if(!u)continue;let i=a.usage,c=u.slice(0,10),o=s.get(c);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,messages:0},s.set(c,o)),o.inputTokens+=i.input_tokens??0,o.outputTokens+=i.output_tokens??0,o.cacheRead+=i.cache_read_input_tokens??0,o.cacheCreation+=i.cache_creation_input_tokens??0,o.messages+=1}return Array.from(s.entries()).map(([n,r])=>({date:n,...r}))}function w(e){let t=[];try{for(let s of be(e,{withFileTypes:!0})){let n=S(e,s.name);s.isFile()&&s.name.endsWith(".jsonl")?t.push(n):s.isDirectory()&&t.push(...w(n))}}catch{}return t}function $(e){let t=Ee.test(Ce(e))?"worktree":"main",s=g(e),n=S(Te(),N(e)),r=w(n),a=new Map;for(let u of r){let i=ke(u);for(let c of i){let o=a.get(c.date);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,nbMessages:0,sessions:new Set},a.set(c.date,o)),o.inputTokens+=c.inputTokens,o.outputTokens+=c.outputTokens,o.cacheRead+=c.cacheRead,o.cacheCreation+=c.cacheCreation,o.nbMessages+=c.messages,o.sessions.add(u)}}return Array.from(a.entries()).map(([u,i])=>({date:u,origin:t,repo:s,inputTokens:i.inputTokens,outputTokens:i.outputTokens,cacheRead:i.cacheRead,cacheCreation:i.cacheCreation,nbMessages:i.nbMessages,nbSessions:i.sessions.size}))}function U(e,t){let s=e.prepare(`
    INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, origin, repo) DO UPDATE SET
      input_tokens   = excluded.input_tokens,
      output_tokens  = excluded.output_tokens,
      cache_read     = excluded.cache_read,
      cache_creation = excluded.cache_creation,
      nb_messages    = excluded.nb_messages,
      nb_sessions    = excluded.nb_sessions
  `);for(let n of t)s.run(n.date,n.origin,n.repo,n.inputTokens,n.outputTokens,n.cacheRead,n.cacheCreation,n.nbMessages,n.nbSessions)}var b={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function v(e){return(e.input*b.input+e.output*b.output+e.cacheRead*b.cacheRead+e.cacheCreation*b.cacheCreation)/1e6}function F(e,t,s,n){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(t,s,n,De+1),a=r.find(o=>o.date===n),u=a&&a.output_tokens>0?a.cache_read/a.output_tokens:0,i=r.filter(o=>o.date!==n&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,m)=>o-m),c=0;if(i.length>0){let o=Math.floor(i.length/2);c=i.length%2===0?(i[o-1]+i[o])/2:i[o]}return{drift:c>0&&u>Se*c,ratio:u,median:c}}var R=24;function xe(e){let{date:t,velocity:s,toil:n,coldReads:r,retryStorms:a,tokens:u}=e,i=e.health??{ok:0,failed:0},c=n.length>0||r.length>0||a.length>0,o=[`# Dev Metrics \u2014 ${t}`,"","## Velocity",`- ${s.sessions} session(s) \xB7 ${s.tools} tool calls \xB7 ${s.failures} failure(s)`,""];o.push("## Tokens");let m=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${m}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(i.failed>0?`\u26A0 ${i.failed} silent collection failure(s) today (${i.ok} ok) \u2014 run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy \u2014 ${i.ok} write(s) recorded, 0 failures`),o.push(""),!c)o.push("## Frictions","","No friction detected \u2014 clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),n.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let d of n)o.push(`| \`${d.cmd}\` | ${d.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let d of r)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}if(a.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let d of a)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}}return o.join(`
`)}async function D(e){let{projectDir:t,now:s}=e,n=T(t),r=g(t),a=s.toISOString().slice(0,10),i=/-wt-\d+$/.test(Oe(t))?"worktree":"main",c=l(),o;try{let H=L(c,r,R),B=x(c,r,R,n.toilExclusions,n.thresholds.toilMin),W=M(c,r,R,n.thresholds.coldMin),G=I(c,r,R,n.thresholds.retryMin),p=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,i,a),{drift:J}=F(c,r,i,a),V={inputTokens:p.inputTokens,outputTokens:p.outputTokens,cacheRead:p.cacheRead,cacheCreation:p.cacheCreation,drift:J,costUsd:v({input:p.inputTokens,output:p.outputTokens,cacheRead:p.cacheRead,cacheCreation:p.cacheCreation})},Y=y(c,r,a);o=xe({date:a,velocity:H,toil:B,coldReads:W,retryStorms:G,tokens:V,health:Y})}finally{h(c)}let m=ye(n.outDir)?n.outDir:P(t,n.outDir);Ne(m,{recursive:!0});let d=P(m,`daily-${a}.md`);return Ae(d,o,"utf-8"),{path:d,markdown:o}}if(f("analyze-daily")){let{path:e}=await D({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}function j(e,t){if(process.env.CHARDON_DEBUG!=="1")return;let s=t instanceof Error?t.message:t!==void 0?String(t):"";try{process.stderr.write(`[chardon] ${e}${s?`: ${s}`:""}
`)}catch{}}async function Me(e,t){try{t.CHARDON_DB&&(process.env.CHARDON_DB=t.CHARDON_DB);let s="";try{if(typeof e!="object"||e===null)return;s=e.session_id??""}catch{return}if(!s)return;let n=t.CLAUDE_PROJECT_DIR??"";if(!n)return;let r=new Date().toISOString(),a=l();try{O(a,s,r)}finally{h(a)}try{let u=l();try{U(u,$(n))}finally{h(u)}}catch{}try{await D({projectDir:n,now:new Date})}catch{}}catch(s){j("stop",s)}}if(f("stop")){try{let e={};try{let t=Ie(0,"utf-8");e=JSON.parse(t)}catch{process.exit(0)}await Me(e,process.env)}catch{}process.exit(0)}export{Me as run};
