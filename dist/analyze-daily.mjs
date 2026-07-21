import{mkdirSync as me,writeFileSync as le}from"node:fs";import{basename as he,isAbsolute as fe,join as L}from"node:path";import{basename as H}from"node:path";function R(e){let t=process.argv[1];if(!t)return!1;let s=H(t);return s===`${e}.ts`||s===`${e}.mjs`||s===`${e}.js`}import{createRequire as Q}from"node:module";import{chmodSync as Z,mkdirSync as ee,readFileSync as te}from"node:fs";import{dirname as T,join as ne}from"node:path";import{fileURLToPath as oe}from"node:url";import{existsSync as W,readFileSync as _}from"node:fs";import{homedir as B}from"node:os";import{basename as G,join as g,resolve as f,sep as V}from"node:path";import{fileURLToPath as J}from"node:url";var Y=/-wt-\d+$/,q=".chardon.json",K=J(new URL("../",import.meta.url)),X=g(K,"config","chardon.default.json");function C(e){let t=JSON.parse(_(X,"utf-8")),s=g(e,q),n={...t};if(W(s))try{let r=JSON.parse(_(s,"utf-8"));n={...t,...r},n.gitlab={...t.gitlab,...r.gitlab??{}},n.thresholds={...t.thresholds,...r.thresholds??{}}}catch{}try{new RegExp(n.ticketRegex)}catch{n.ticketRegex=t.ticketRegex}return n.outDir=z(e,n.outDir,t.outDir),n}function S(){return process.env.CHARDON_DB??g(B(),".claude","chardon.db")}function b(e){return G(e).replace(Y,"")}function z(e,t,s){let n=f(e),r=f(n,t);return r===n||r.startsWith(n+V)?r:f(n,s)}var se=Q(import.meta.url),{DatabaseSync:re}=se("node:sqlite");function ie(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}ie();var ae=ne(T(oe(import.meta.url)),"schema.sql"),E=2;function k(){let e=S();ee(T(e),{recursive:!0});let t=new re(e);try{Z(e,384)}catch{}t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let s=te(ae,"utf-8"),n=ce(t);return n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(s),n&&ue(t),t.prepare("PRAGMA user_version").get().user_version!==E&&t.exec(`PRAGMA user_version = ${E}`),t}function ce(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function ue(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function D(e){try{e.close()}catch{}}function N(e,t,s){return e.prepare("SELECT ok, failed FROM hook_health WHERE repo = ? AND date = ?").get(t,s)??{ok:0,failed:0}}function A(e,t,s,n,r=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${s}`,r);if(n.length===0)return i;let u=new Set(n);return i.filter(a=>!u.has(a.cmd))}function O(e,t,s,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function x(e,t,s,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function I(e,t,s){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(t,`-${s}`)??{sessions:0,tools:0,failures:0}}var de=2,pe=7;var l={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function y(e){return(e.input*l.input+e.output*l.output+e.cacheRead*l.cacheRead+e.cacheCreation*l.cacheCreation)/1e6}function M(e,t,s,n){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(t,s,n,pe+1),i=r.find(o=>o.date===n),u=i&&i.output_tokens>0?i.cache_read/i.output_tokens:0,a=r.filter(o=>o.date!==n&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,m)=>o-m),c=0;if(a.length>0){let o=Math.floor(a.length/2);c=a.length%2===0?(a[o-1]+a[o])/2:a[o]}return{drift:c>0&&u>de*c,ratio:u,median:c}}var h=24;function ge(e){let{date:t,velocity:s,toil:n,coldReads:r,retryStorms:i,tokens:u}=e,a=e.health??{ok:0,failed:0},c=n.length>0||r.length>0||i.length>0,o=[`# Dev Metrics \u2014 ${t}`,"","## Velocity",`- ${s.sessions} session(s) \xB7 ${s.tools} tool calls \xB7 ${s.failures} failure(s)`,""];o.push("## Tokens");let m=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${m}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(a.failed>0?`\u26A0 ${a.failed} silent collection failure(s) today (${a.ok} ok) \u2014 run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy \u2014 ${a.ok} write(s) recorded, 0 failures`),o.push(""),!c)o.push("## Frictions","","No friction detected \u2014 clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),n.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let d of n)o.push(`| \`${d.cmd}\` | ${d.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let d of r)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}if(i.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let d of i)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}}return o.join(`
`)}async function be(e){let{projectDir:t,now:s}=e,n=C(t),r=b(t),i=s.toISOString().slice(0,10),a=/-wt-\d+$/.test(he(t))?"worktree":"main",c=k(),o;try{let w=I(c,r,h),$=A(c,r,h,n.toilExclusions,n.thresholds.toilMin),U=x(c,r,h,n.thresholds.coldMin),F=O(c,r,h,n.thresholds.retryMin),p=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,a,i),{drift:v}=M(c,r,a,i),P={inputTokens:p.inputTokens,outputTokens:p.outputTokens,cacheRead:p.cacheRead,cacheCreation:p.cacheCreation,drift:v,costUsd:y({input:p.inputTokens,output:p.outputTokens,cacheRead:p.cacheRead,cacheCreation:p.cacheCreation})},j=N(c,r,i);o=ge({date:i,velocity:w,toil:$,coldReads:U,retryStorms:F,tokens:P,health:j})}finally{D(c)}let m=fe(n.outDir)?n.outDir:L(t,n.outDir);me(m,{recursive:!0});let d=L(m,`daily-${i}.md`);return le(d,o,"utf-8"),{path:d,markdown:o}}if(R("analyze-daily")){let{path:e}=await be({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}export{be as generateDailyReport,ge as renderDailyReport};
