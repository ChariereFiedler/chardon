#!/usr/bin/env node
import{readFileSync as ve}from"node:fs";import{basename as X}from"node:path";function f(e){let t=process.argv[1];if(!t)return!1;let s=X(t);return s===`${e}.ts`||s===`${e}.mjs`||s===`${e}.js`}import{createRequire as ue}from"node:module";import{chmodSync as de,closeSync as pe,mkdirSync as me,openSync as le,readFileSync as he}from"node:fs";import{dirname as y,join as fe}from"node:path";import{fileURLToPath as ge}from"node:url";import{existsSync as K,readFileSync as T}from"node:fs";import{homedir as z}from"node:os";import{basename as Q,join as C,resolve as S,sep as Z}from"node:path";import{fileURLToPath as ee}from"node:url";var te=/-wt-\d+$/,ne=".chardon.json",oe=ee(new URL("../",import.meta.url)),se=C(oe,"config","chardon.default.json");function k(e){let t=JSON.parse(T(se,"utf-8")),s=C(e,ne),n={...t};if(K(s))try{let r=JSON.parse(T(s,"utf-8"));n={...t,...r},n.gitlab={...t.gitlab,...r.gitlab??{}},n.thresholds={...t.thresholds,...r.thresholds??{}}}catch{}return ae(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=ce(e,n.outDir,t.outDir),n}var re=100,ie=5;function ae(e){if(typeof e!="string"||e.length>re||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>ie)return null;try{return new RegExp(e)}catch{return null}}function N(){return process.env.CHARDON_DB??C(z(),".claude","chardon.db")}function g(e){return Q(e).replace(te,"")}function ce(e,t,s){let n=S(e),r=S(n,t);return r===n||r.startsWith(n+Z)?r:S(n,s)}function A(e){return e.replace(/\//g,"-")}function b(e,t){if(process.env.CHARDON_DEBUG!=="1")return;let s=t instanceof Error?t.message:t!==void 0?String(t):"";try{process.stderr.write(`[chardon] ${e}${s?`: ${s}`:""}
`)}catch{}}var be=ue(import.meta.url),{DatabaseSync:Re}=be("node:sqlite");function _e(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}_e();var Se=fe(y(ge(import.meta.url)),"schema.sql"),O=2;function l(){let e=N();me(y(e),{recursive:!0});try{pe(le(e,"a",384)),de(e,384)}catch(i){b("db-permissions",i)}let t=new Re(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let s=he(Se,"utf-8"),n=Ce(t);return n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(s),n&&Ee(t),t.prepare("PRAGMA user_version").get().user_version!==O&&t.exec(`PRAGMA user_version = ${O}`),t}function Ce(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function Ee(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function h(e){try{e.close()}catch{}}function x(e,t,s){e.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(s,t)}function I(e,t,s){return e.prepare("SELECT ok, failed FROM hook_health WHERE repo = ? AND date = ?").get(t,s)??{ok:0,failed:0}}import{mkdirSync as Me,writeFileSync as Le}from"node:fs";import{basename as we,isAbsolute as Ue,join as j}from"node:path";function M(e,t,s,n,r=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${s}`,r);if(n.length===0)return i;let u=new Set(n);return i.filter(a=>!u.has(a.cmd))}function L(e,t,s,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function w(e,t,s,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function U(e,t,s){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(t,`-${s}`)??{sessions:0,tools:0,failures:0}}import{readdirSync as De,readFileSync as Te}from"node:fs";import{homedir as ke}from"node:os";import{basename as Ne,join as E}from"node:path";var Ae=2,Oe=7,ye=/-wt-\d+$/;function xe(){return process.env.CHARDON_PROJECTS_DIR??E(ke(),".claude","projects")}function Ie(e){let t;try{t=Te(e,"utf-8")}catch{return[]}let s=new Map;for(let n of t.split(`
`)){if(!n.trim())continue;let r;try{r=JSON.parse(n)}catch{continue}if(r.type!=="assistant")continue;let i=r.message;if(!i?.usage)continue;let u=r.timestamp;if(!u)continue;let a=i.usage,c=u.slice(0,10),o=s.get(c);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,messages:0},s.set(c,o)),o.inputTokens+=a.input_tokens??0,o.outputTokens+=a.output_tokens??0,o.cacheRead+=a.cache_read_input_tokens??0,o.cacheCreation+=a.cache_creation_input_tokens??0,o.messages+=1}return Array.from(s.entries()).map(([n,r])=>({date:n,...r}))}function $(e){let t=[];try{for(let s of De(e,{withFileTypes:!0})){let n=E(e,s.name);s.isFile()&&s.name.endsWith(".jsonl")?t.push(n):s.isDirectory()&&t.push(...$(n))}}catch{}return t}function v(e){let t=ye.test(Ne(e))?"worktree":"main",s=g(e),n=E(xe(),A(e)),r=$(n),i=new Map;for(let u of r){let a=Ie(u);for(let c of a){let o=i.get(c.date);o||(o={inputTokens:0,outputTokens:0,cacheRead:0,cacheCreation:0,nbMessages:0,sessions:new Set},i.set(c.date,o)),o.inputTokens+=c.inputTokens,o.outputTokens+=c.outputTokens,o.cacheRead+=c.cacheRead,o.cacheCreation+=c.cacheCreation,o.nbMessages+=c.messages,o.sessions.add(u)}}return Array.from(i.entries()).map(([u,a])=>({date:u,origin:t,repo:s,inputTokens:a.inputTokens,outputTokens:a.outputTokens,cacheRead:a.cacheRead,cacheCreation:a.cacheCreation,nbMessages:a.nbMessages,nbSessions:a.sessions.size}))}function F(e,t){let s=e.prepare(`
    INSERT INTO token_usage (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, origin, repo) DO UPDATE SET
      input_tokens   = excluded.input_tokens,
      output_tokens  = excluded.output_tokens,
      cache_read     = excluded.cache_read,
      cache_creation = excluded.cache_creation,
      nb_messages    = excluded.nb_messages,
      nb_sessions    = excluded.nb_sessions
  `);for(let n of t)s.run(n.date,n.origin,n.repo,n.inputTokens,n.outputTokens,n.cacheRead,n.cacheCreation,n.nbMessages,n.nbSessions)}var R={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function P(e){return(e.input*R.input+e.output*R.output+e.cacheRead*R.cacheRead+e.cacheCreation*R.cacheCreation)/1e6}function H(e,t,s,n){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(t,s,n,Oe+1),i=r.find(o=>o.date===n),u=i&&i.output_tokens>0?i.cache_read/i.output_tokens:0,a=r.filter(o=>o.date!==n&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,m)=>o-m),c=0;if(a.length>0){let o=Math.floor(a.length/2);c=a.length%2===0?(a[o-1]+a[o])/2:a[o]}return{drift:c>0&&u>Ae*c,ratio:u,median:c}}var _=24;function $e(e){let{date:t,velocity:s,toil:n,coldReads:r,retryStorms:i,tokens:u}=e,a=e.health??{ok:0,failed:0},c=n.length>0||r.length>0||i.length>0,o=[`# Dev Metrics \xB7 ${t}`,"","## Velocity",`- ${s.sessions} session(s) \xB7 ${s.tools} tool calls \xB7 ${s.failures} failure(s)`,""];o.push("## Tokens");let m=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${m}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(a.failed>0?`\u26A0 ${a.failed} silent collection failure(s) today (${a.ok} ok): run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy: ${a.ok} write(s) recorded, 0 failures`),o.push(""),!c)o.push("## Frictions","","No friction detected, clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),n.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let d of n)o.push(`| \`${d.cmd}\` | ${d.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let d of r)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}if(i.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let d of i)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}}return o.join(`
`)}async function D(e){let{projectDir:t,now:s}=e,n=k(t),r=g(t),i=s.toISOString().slice(0,10),a=/-wt-\d+$/.test(we(t))?"worktree":"main",c=l(),o;try{let B=U(c,r,_),W=M(c,r,_,n.toilExclusions,n.thresholds.toilMin),G=w(c,r,_,n.thresholds.coldMin),J=L(c,r,_,n.thresholds.retryMin),p=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,a,i),{drift:V}=H(c,r,a,i),Y={inputTokens:p.inputTokens,outputTokens:p.outputTokens,cacheRead:p.cacheRead,cacheCreation:p.cacheCreation,drift:V,costUsd:P({input:p.inputTokens,output:p.outputTokens,cacheRead:p.cacheRead,cacheCreation:p.cacheCreation})},q=I(c,r,i);o=$e({date:i,velocity:B,toil:W,coldReads:G,retryStorms:J,tokens:Y,health:q})}finally{h(c)}let m=Ue(n.outDir)?n.outDir:j(t,n.outDir);Me(m,{recursive:!0});let d=j(m,`daily-${i}.md`);return Le(d,o,"utf-8"),{path:d,markdown:o}}if(f("analyze-daily")){let{path:e}=await D({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}async function Fe(e,t){try{t.CHARDON_DB&&(process.env.CHARDON_DB=t.CHARDON_DB);let s="";try{if(typeof e!="object"||e===null)return;s=e.session_id??""}catch{return}if(!s)return;let n=t.CLAUDE_PROJECT_DIR??"";if(!n)return;let r=new Date().toISOString(),i=l();try{x(i,s,r)}finally{h(i)}try{let u=l();try{F(u,v(n))}finally{h(u)}}catch{}try{await D({projectDir:n,now:new Date})}catch{}}catch(s){b("stop",s)}}if(f("stop")){try{let e={};try{let t=ve(0,"utf-8");e=JSON.parse(t)}catch{process.exit(0)}await Fe(e,process.env)}catch{}process.exit(0)}export{Fe as run};
