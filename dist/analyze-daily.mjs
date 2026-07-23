import{mkdirSync as Ce,writeFileSync as Ae}from"node:fs";import{basename as Se,isAbsolute as Ne,join as F}from"node:path";import{basename as z}from"node:path";function R(e){let t=process.argv[1];if(!t)return!1;let s=z(t);return s===`${e}.ts`||s===`${e}.mjs`||s===`${e}.js`}import{createRequire as ie}from"node:module";import{chmodSync as ae,closeSync as ce,mkdirSync as ue,openSync as de,readFileSync as le}from"node:fs";import{dirname as S,join as pe}from"node:path";import{fileURLToPath as me}from"node:url";import{existsSync as J,readFileSync as E}from"node:fs";import{homedir as Y}from"node:os";import{basename as Z,join as m,resolve as f,sep as X}from"node:path";import{fileURLToPath as q}from"node:url";var K=/-wt-\d+$/,b=".chardon.json",Q=q(new URL("../",import.meta.url)),ee=m(Q,"config","chardon.default.json");function T(e){let t=JSON.parse(E(ee,"utf-8")),s=m(e,b),n={...t};if(J(s))try{let r=JSON.parse(E(s,"utf-8"));n={...t,...r},n.gitlab={...t.gitlab,...r.gitlab??{}},n.thresholds={...t.thresholds,...r.thresholds??{}}}catch{}return oe(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=re(e,n.outDir,t.outDir),n}var te=100,ne=5;function oe(e){if(typeof e!="string"||e.length>te||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>ne)return null;try{return new RegExp(e)}catch{return null}}function D(){return process.env.CHARDON_DB??m(Y(),".claude","chardon.db")}var se=/^[a-z0-9][a-z0-9._-]{0,63}$/;function _(e){try{let t=E(m(e,b),"utf-8"),s=JSON.parse(t).repoName;if(typeof s=="string"&&se.test(s))return s}catch{}return Z(e).replace(K,"")}function re(e,t,s){let n=f(e),r=f(n,t);return r===n||r.startsWith(n+X)?r:f(n,s)}function C(e,t,s=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let r=s().toISOString();process.stderr.write(`[chardon] ${r} ${e}${n?`: ${n}`:""}
`)}catch{}}var ge=ie(import.meta.url),{DatabaseSync:he}=ge("node:sqlite");function fe(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}fe();var Ee=pe(S(me(import.meta.url)),"schema.sql"),A=2;function N(){let e=D();ue(S(e),{recursive:!0});try{ce(de(e,"a",384)),ae(e,384)}catch(i){C("db-permissions",i)}let t=new he(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let s=le(Ee,"utf-8"),n=_e(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(s),n&&Re(t),be(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}if(k(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}return t.prepare("PRAGMA user_version").get().user_version!==A&&t.exec(`PRAGMA user_version = ${A}`),t}function _e(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function Re(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function k(e,t,s){let n=e.prepare(`PRAGMA table_info(${t})`).all();return n.length>0&&!n.some(r=>r.name===s)}function be(e){return k(e,"hook_health","last_error")}function O(e){try{e.close()}catch{}}function x(e,t,s){let n=e.prepare("SELECT ok, failed, last_error FROM hook_health WHERE repo = ? AND date = ?").get(t,s);return n?{ok:n.ok,failed:n.failed,lastError:n.last_error}:{ok:0,failed:0,lastError:null}}function I(e,t,s,n,r=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${s}`,r);if(n.length===0)return i;let u=new Set(n);return i.filter(a=>!u.has(a.cmd))}function y(e,t,s,n=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function L(e,t,s,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${s}`,n)}function M(e,t,s){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(t,`-${s}`)??{sessions:0,tools:0,failures:0}}function w(e,t){return e.prepare(`SELECT COUNT(DISTINCT root_hash) AS roots
       FROM sessions
       WHERE repo = ? AND root_hash IS NOT NULL AND root_hash != ''`).get(t)?.roots??0}var Te=2,De=7;var g={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function $(e){return(e.input*g.input+e.output*g.output+e.cacheRead*g.cacheRead+e.cacheCreation*g.cacheCreation)/1e6}function U(e,t,s,n){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(t,s,n,De+1),i=r.find(o=>o.date===n),u=i&&i.output_tokens>0?i.cache_read/i.output_tokens:0,a=r.filter(o=>o.date!==n&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,p)=>o-p),c=0;if(a.length>0){let o=Math.floor(a.length/2);c=a.length%2===0?(a[o-1]+a[o])/2:a[o]}return{drift:c>0&&u>Te*c,ratio:u,median:c}}var h=24;function ke(e){let{date:t,velocity:s,toil:n,coldReads:r,retryStorms:i,tokens:u}=e,a=e.health??{ok:0,failed:0},c=n.length>0||r.length>0||i.length>0,o=[`# Dev Metrics \xB7 ${t}`,"","## Velocity",`- ${s.sessions} session(s) \xB7 ${s.tools} tool calls \xB7 ${s.failures} failure(s)`,""];o.push("## Tokens");let p=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${p}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(a.failed>0?`\u26A0 ${a.failed} silent collection failure(s) today (${a.ok} ok): run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy: ${a.ok} write(s) recorded, 0 failures`),a.failed>0&&a.lastError&&o.push(`last error: ${a.lastError}`),e.slugRoots!==void 0&&e.slugRoots>1&&e.repo&&o.push(`\u26A0 ${e.slugRoots} different project roots share the repo slug '${e.repo}': their metrics are merged. Set "repoName" in .chardon.json to separate them.`),o.push(""),!c)o.push("## Frictions","","No friction detected, clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),n.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let d of n)o.push(`| \`${d.cmd}\` | ${d.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let d of r)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}if(i.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let d of i)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}}return o.join(`
`)}async function Oe(e){let{projectDir:t,now:s}=e,n=T(t),r=_(t),i=s.toISOString().slice(0,10),a=/-wt-\d+$/.test(Se(t))?"worktree":"main",c=N(),o;try{let v=M(c,r,h),H=I(c,r,h,n.toilExclusions,n.thresholds.toilMin),P=L(c,r,h,n.thresholds.coldMin),j=y(c,r,h,n.thresholds.retryMin),l=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,a,i),{drift:W}=U(c,r,a,i),G={inputTokens:l.inputTokens,outputTokens:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation,drift:W,costUsd:$({input:l.inputTokens,output:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation})},B=x(c,r,i),V=w(c,r);o=ke({date:i,velocity:v,toil:H,coldReads:P,retryStorms:j,tokens:G,health:B,repo:r,slugRoots:V})}finally{O(c)}let p=Ne(n.outDir)?n.outDir:F(t,n.outDir);Ce(p,{recursive:!0});let d=F(p,`daily-${i}.md`);return Ae(d,o,"utf-8"),{path:d,markdown:o}}if(R("analyze-daily"))try{let{path:e}=await Oe({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}catch(e){let t=e instanceof Error?e.message:String(e);console.error(`analyze-daily: cannot generate the report: ${t}`),process.exit(1)}export{Oe as generateDailyReport,ke as renderDailyReport};
