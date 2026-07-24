import{mkdirSync as Ie,writeFileSync as xe}from"node:fs";import{basename as Me,isAbsolute as ye,join as W}from"node:path";import{basename as X}from"node:path";function T(e){let t=process.argv[1];if(!t)return!1;let n=X(t);return n===`${e}.ts`||n===`${e}.mjs`||n===`${e}.js`}import{createRequire as ue}from"node:module";import{chmodSync as de,closeSync as le,mkdirSync as pe,openSync as me,readFileSync as he}from"node:fs";import{dirname as N,join as ge}from"node:path";import{fileURLToPath as Ee}from"node:url";import{existsSync as Z,readFileSync as f}from"node:fs";import{homedir as q}from"node:os";import{basename as K,join as h,resolve as E,sep as Q}from"node:path";import{fileURLToPath as ee}from"node:url";var te=/-wt-\d+$/,D=".chardon.json",se=ee(new URL("../",import.meta.url)),ne=h(se,"config","chardon.default.json");function S(e){let t=JSON.parse(f(ne,"utf-8")),n=h(e,D),s={...t};if(Z(n))try{let r=JSON.parse(f(n,"utf-8"));s={...t,...r},s.gitlab={...t.gitlab,...r.gitlab??{}},s.thresholds={...t.thresholds,...r.thresholds??{}},s.skillMap={...t.skillMap,...r.skillMap??{}}}catch{}return ie(s.ticketRegex)===null&&(s.ticketRegex=t.ticketRegex),s.outDir=ce(e,s.outDir,t.outDir),s}var oe=100,re=5;function ie(e){if(typeof e!="string"||e.length>oe||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]|(?<!\()\?/g)?.length??0)>re)return null;try{return new RegExp(e)}catch{return null}}function A(){return process.env.CHARDON_DB??h(q(),".claude","chardon.db")}var ae=/^[a-z0-9][a-z0-9._-]{0,63}$/;function _(e){try{let t=f(h(e,D),"utf-8"),n=JSON.parse(t).repoName;if(typeof n=="string"&&ae.test(n))return n}catch{}return K(e).replace(te,"")}function ce(e,t,n){let s=E(e),r=E(s,t);return r===s||r.startsWith(s+Q)?r:E(s,n)}function C(e,t,n=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let s=t instanceof Error?t.message:t!==void 0?String(t):"";try{let r=n().toISOString();process.stderr.write(`[chardon] ${r} ${e}${s?`: ${s}`:""}
`)}catch{}}var fe=ue(import.meta.url),{DatabaseSync:_e}=fe("node:sqlite");function Re(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}Re();var Te=ge(N(Ee(import.meta.url)),"schema.sql"),b=2;function k(){let e=A();pe(N(e),{recursive:!0});try{le(me(e,"a",384)),de(e,384)}catch(i){C("db-permissions",i)}let t=new _e(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let n=he(Te,"utf-8"),s=De(t);if(s&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(n),s&&Se(t),Ae(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}if(R(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}if(R(t,"purge_log","nudges"))try{t.exec("ALTER TABLE purge_log ADD COLUMN nudges INTEGER NOT NULL DEFAULT 0")}catch(i){if(!String(i.message).includes("duplicate column"))throw i}return t.prepare("PRAGMA user_version").get().user_version!==b&&t.exec(`PRAGMA user_version = ${b}`),t}function De(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(s=>s.name==="repo"):!1}function Se(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function R(e,t,n){let s=e.prepare(`PRAGMA table_info(${t})`).all();return s.length>0&&!s.some(r=>r.name===n)}function Ae(e){return R(e,"hook_health","last_error")}function O(e){try{e.close()}catch{}}function I(e,t,n){let s=e.prepare("SELECT ok, failed, last_error FROM hook_health WHERE repo = ? AND date = ?").get(t,n);return s?{ok:s.ok,failed:s.failed,lastError:s.last_error}:{ok:0,failed:0,lastError:null}}function x(e,t,n,s,r=3){let i=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,r);if(s.length===0)return i;let u=new Set(s);return i.filter(a=>!u.has(a.cmd))}function M(e,t,n,s=4){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${n}`,s)}function y(e,t,n,s=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${n}`,s)}var Ce=5,be=5,Ne="git commit";function L(e,t,n,s=Ce){return e.prepare(`SELECT e.session_id AS sessionId,
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
       LIMIT 20`).all(t,`-${n}`,s)}function w(e,t,n){let s=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd
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
       ORDER BY e.id`).all(t,`-${n}`,Ne);return{count:s.length,sample:s.slice(0,be).map(r=>r.cmd)}}function $(e,t,n){return e.prepare(`SELECT COUNT(DISTINCT e.session_id) AS sessions,
              COUNT(*) AS tools,
              SUM(CASE WHEN e.success = 0 THEN 1 ELSE 0 END) AS failures
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')`).get(t,`-${n}`)??{sessions:0,tools:0,failures:0}}function U(e,t){return e.prepare(`SELECT COUNT(DISTINCT root_hash) AS roots
       FROM sessions
       WHERE repo = ? AND root_hash IS NOT NULL AND root_hash != ''`).get(t)?.roots??0}var ke=2,Oe=7;var g={input:3,output:15,cacheRead:.3,cacheCreation:3.75};function v(e){return(e.input*g.input+e.output*g.output+e.cacheRead*g.cacheRead+e.cacheCreation*g.cacheCreation)/1e6}function F(e,t,n,s){let r=e.prepare(`SELECT date, cache_read, output_tokens
       FROM token_usage
       WHERE repo = ?
         AND origin = ?
         AND date <= ?
       ORDER BY date DESC
       LIMIT ?`).all(t,n,s,Oe+1),i=r.find(o=>o.date===s),u=i&&i.output_tokens>0?i.cache_read/i.output_tokens:0,a=r.filter(o=>o.date!==s&&o.output_tokens>0).map(o=>o.cache_read/o.output_tokens).sort((o,p)=>o-p),c=0;if(a.length>0){let o=Math.floor(a.length/2);c=a.length%2===0?(a[o-1]+a[o])/2:a[o]}return{drift:c>0&&u>ke*c,ratio:u,median:c}}var m=24;function Le(e){if(!e)return[];let{editedWithoutTests:t,unverifiedCommits:n}=e;if(t.length===0&&n.count===0)return[];let s=["## Method signals",""];if(t.length>0){s.push("### Edits without a test run (per session)"),s.push("| Session | Edits |"),s.push("|---|---|");for(let r of t)s.push(`| \`${r.sessionId}\` | ${r.edits} |`);s.push("")}if(n.count>0){s.push("### Commits without a prior passing test"),s.push(`${n.count} commit(s) went in with no successful test run earlier in the session.`);for(let r of n.sample)s.push(`- \`${r}\``);s.push("")}return s}function we(e){let{date:t,velocity:n,toil:s,coldReads:r,retryStorms:i,tokens:u}=e,a=e.health??{ok:0,failed:0},c=s.length>0||r.length>0||i.length>0,o=[`# Dev Metrics \xB7 ${t}`,"","## Velocity",`- ${n.sessions} session(s) \xB7 ${n.tools} tool calls \xB7 ${n.failures} failure(s)`,""];o.push("## Tokens");let p=u.costUsd!==void 0?` \xB7 ~$${u.costUsd.toFixed(2)} (est.)`:"";if(o.push(`input ${u.inputTokens} \xB7 output ${u.outputTokens} \xB7 cache read ${u.cacheRead} \xB7 cache creation ${u.cacheCreation}${p}`),u.drift&&o.push("\u26A0\uFE0F cache efficiency drift"),o.push(""),o.push("## Collection health"),o.push(a.failed>0?`\u26A0 ${a.failed} silent collection failure(s) today (${a.ok} ok): run with CHARDON_DEBUG=1 to see them`:`\u{1F7E2} healthy: ${a.ok} write(s) recorded, 0 failures`),a.failed>0&&a.lastError&&o.push(`last error: ${a.lastError}`),e.slugRoots!==void 0&&e.slugRoots>1&&e.repo&&o.push(`\u26A0 ${e.slugRoots} different project roots share the repo slug '${e.repo}': their metrics are merged. Set "repoName" in .chardon.json to separate them.`),o.push(""),!c)o.push("## Frictions","","No friction detected, clean session. \u{1F7E2}","");else{if(o.push("## Detected frictions",""),s.length>0){o.push("### Toil loops (same command repeated)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let d of s)o.push(`| \`${d.cmd}\` | ${d.count} |`);o.push("")}if(r.length>0){o.push("### Cold reads (file re-read often \u2192 memory/skill candidate)"),o.push("| File | Reads |"),o.push("|---|---|");for(let d of r)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}if(i.length>0){o.push("### Retry storms (same file edited repeatedly)"),o.push("| File | Edits |"),o.push("|---|---|");for(let d of i)o.push(`| \`${d.file}\` | ${d.count} |`);o.push("")}}return o.push(...Le(e.methodSignals)),o.join(`
`)}async function $e(e){let{projectDir:t,now:n}=e,s=S(t),r=_(t),i=n.toISOString().slice(0,10),a=/-wt-\d+$/.test(Me(t))?"worktree":"main",c=k(),o;try{let H=$(c,r,m),P=x(c,r,m,s.toilExclusions,s.thresholds.toilMin),j=y(c,r,m,s.thresholds.coldMin),B=M(c,r,m,s.thresholds.retryMin),l=c.prepare(`SELECT
           COALESCE(SUM(input_tokens), 0)   AS inputTokens,
           COALESCE(SUM(output_tokens), 0)  AS outputTokens,
           COALESCE(SUM(cache_read), 0)     AS cacheRead,
           COALESCE(SUM(cache_creation), 0) AS cacheCreation
         FROM token_usage
         WHERE repo = ? AND origin = ? AND date = ?`).get(r,a,i),{drift:G}=F(c,r,a,i),V={inputTokens:l.inputTokens,outputTokens:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation,drift:G,costUsd:v({input:l.inputTokens,output:l.outputTokens,cacheRead:l.cacheRead,cacheCreation:l.cacheCreation})},J=I(c,r,i),Y=U(c,r),z={editedWithoutTests:L(c,r,m),unverifiedCommits:w(c,r,m)};o=we({date:i,velocity:H,toil:P,coldReads:j,retryStorms:B,tokens:V,health:J,repo:r,slugRoots:Y,methodSignals:z})}finally{O(c)}let p=ye(s.outDir)?s.outDir:W(t,s.outDir);Ie(p,{recursive:!0});let d=W(p,`daily-${i}.md`);return xe(d,o,"utf-8"),{path:d,markdown:o}}if(T("analyze-daily"))try{let{path:e}=await $e({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}catch(e){let t=e instanceof Error?e.message:String(e);console.error(`analyze-daily: cannot generate the report: ${t}`),process.exit(1)}export{$e as generateDailyReport,we as renderDailyReport};
