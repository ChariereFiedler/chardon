import{mkdirSync as Re,writeFileSync as be}from"node:fs";import{basename as Te,isAbsolute as De,join as w}from"node:path";import{basename as W}from"node:path";function _(e){let t=process.argv[1];if(!t)return!1;let s=W(t);return s===`${e}.ts`||s===`${e}.mjs`||s===`${e}.js`}import{createRequire as ne}from"node:module";import{chmodSync as oe,closeSync as se,mkdirSync as re,openSync as ae,readFileSync as ie}from"node:fs";import{dirname as A,join as ce}from"node:path";import{fileURLToPath as ue}from"node:url";import{existsSync as G,readFileSync as R}from"node:fs";import{homedir as B}from"node:os";import{basename as V,join as f,resolve as h,sep as J}from"node:path";import{fileURLToPath as z}from"node:url";var Y=/-wt-\d+$/,Z=".chardon.json",X=z(new URL("../",import.meta.url)),q=f(X,"config","chardon.default.json");function b(e){let t=JSON.parse(R(q,"utf-8")),s=f(e,Z),n={...t};if(G(s))try{let r=JSON.parse(R(s,"utf-8"));n={...t,...r},n.gitlab={...t.gitlab,...r.gitlab??{}},n.thresholds={...t.thresholds,...r.thresholds??{}}}catch{}return ee(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=te(e,n.outDir,t.outDir),n}var K=100,Q=5;function ee(e){if(typeof e!="string"||e.length>K||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>Q)return null;try{return new RegExp(e)}catch{return null}}function T(){return process.env.CHARDON_DB??f(B(),".claude","chardon.db")}function E(e){return V(e).replace(Y,"")}function te(e,t,s){let n=h(e),r=h(n,t);return r===n||r.startsWith(n+J)?r:h(n,s)}function D(e,t,s=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let r=s().toISOString();process.stderr.write(`[chardon] ${r} ${e}${n?`: ${n}`:""}
`)}catch{}}var de=ne(import.meta.url),{DatabaseSync:le}=de("node:sqlite");function pe(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}pe();var me=ce(A(ue(import.meta.url)),"schema.sql"),C=2;function S(){let e=T();re(A(e),{recursive:!0});try{se(ae(e,"a",384)),oe(e,384)}catch(a){D("db-permissions",a)}let t=new le(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let s=ie(me,"utf-8"),n=ge(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(s),n&&he(t),fe(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(a){if(!String(a.message).includes("duplicate column"))throw a}return t.prepare("PRAGMA user_version").get().user_version!==C&&t.exec(`PRAGMA user_version = ${C}`),t}function ge(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function he(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function fe(e){let t=e.prepare("PRAGMA table_info(hook_health)").all();return t.length>0&&!t.some(s=>s.name==="last_error")}function k(e){try{e.close()}catch{}}function N(e,t,s){let n=e.prepare("SELECT ok, failed, last_error FROM hook_health WHERE repo = ? AND date = ?").get(t,s);return n?{ok:n.ok,failed:n.failed,lastError:n.last_error}:{ok:0,failed:0,lastError:null}}function O(e,t,s,n,r=3){let a=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${s}`,r);if(n.length===0)return a;let u=new Set(n);return a.filter(i=>!u.has(i.cmd))}function x(e,t,s,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function I(e,t,s,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function y(e,t,s){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(t,`-${s}`)??{sessions:0,tools:0,failures:0}}var Ee=2,_e=7;var m={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function M(e){return(e.input*m.input+e.output*m.output+e.cacheRead*m.cacheRead+e.cacheCreation*m.cacheCreation)/1e6}function L(e,t,s,n){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(t,s,n,_e+1),a=r.find(o=>o.date===n),u=a&&a.output_tokens>0?a.cache_read/a.output_tokens:0,i=r.filter(o=>o.date!==n&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,p)=>o-p),c=0;if(i.length>0){let o=Math.floor(i.length/2);c=i.length%2===0?(i[o-1]+i[o])/2:i[o]}return{drift:c>0&&u>Ee*c,ratio:u,median:c}}var g=24;function Ce(e){let{date:t,velocity:s,toil:n,coldReads:r,retryStorms:a,tokens:u}=e,i=e.health??{ok:0,failed:0},c=n.length>0||r.length>0||a.length>0,o=[`# Dev Metrics \xB7 ${t}`,"","## Velocity",`- ${s.sessions} session(s) \xB7 ${s.tools} tool calls \xB7 ${s.failures} failure(s)`,""];o.push("## Tokens");let p=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${p}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(i.failed>0?`\u26A0 ${i.failed} silent collection failure(s) today (${i.ok} ok): run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy: ${i.ok} write(s) recorded, 0 failures`),i.failed>0&&i.lastError&&o.push(`last error: ${i.lastError}`),o.push(""),!c)o.push("## Frictions","","No friction detected, clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),n.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let d of n)o.push(`| \`${d.cmd}\` | ${d.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let d of r)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}if(a.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let d of a)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}}return o.join(`
`)}async function Ae(e){let{projectDir:t,now:s}=e,n=b(t),r=E(t),a=s.toISOString().slice(0,10),i=/-wt-\d+$/.test(Te(t))?"worktree":"main",c=S(),o;try{let $=y(c,r,g),U=O(c,r,g,n.toilExclusions,n.thresholds.toilMin),F=I(c,r,g,n.thresholds.coldMin),v=x(c,r,g,n.thresholds.retryMin),l=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,i,a),{drift:P}=L(c,r,i,a),H={inputTokens:l.inputTokens,outputTokens:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation,drift:P,costUsd:M({input:l.inputTokens,output:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation})},j=N(c,r,a);o=Ce({date:a,velocity:$,toil:U,coldReads:F,retryStorms:v,tokens:H,health:j})}finally{k(c)}let p=De(n.outDir)?n.outDir:w(t,n.outDir);Re(p,{recursive:!0});let d=w(p,`daily-${a}.md`);return be(d,o,"utf-8"),{path:d,markdown:o}}if(_("analyze-daily"))try{let{path:e}=await Ae({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}catch(e){let t=e instanceof Error?e.message:String(e);console.error(`analyze-daily: cannot generate the report: ${t}`),process.exit(1)}export{Ae as generateDailyReport,Ce as renderDailyReport};
