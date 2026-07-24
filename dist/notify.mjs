#!/usr/bin/env node
import{readFileSync as _e}from"node:fs";import{basename as G}from"node:path";function R(e){let t=process.argv[1];if(!t)return!1;let s=G(t);return s===`${e}.ts`||s===`${e}.mjs`||s===`${e}.js`}import{createRequire as ne}from"node:module";import{chmodSync as se,closeSync as oe,mkdirSync as re,openSync as ie,readFileSync as ae}from"node:fs";import{dirname as L,join as ce}from"node:path";import{fileURLToPath as ue}from"node:url";import{existsSync as j,readFileSync as _}from"node:fs";import{homedir as J}from"node:os";import{basename as C,join as g,resolve as f,sep as V}from"node:path";import{fileURLToPath as Y}from"node:url";var N=/-wt-\d+$/,S=".chardon.json",z=Y(new URL("../",import.meta.url)),X=g(z,"config","chardon.default.json");function b(e){let t=JSON.parse(_(X,"utf-8")),s=g(e,S),n={...t};if(j(s))try{let o=JSON.parse(_(s,"utf-8"));n={...t,...o},n.gitlab={...t.gitlab,...o.gitlab??{}},n.thresholds={...t.thresholds,...o.thresholds??{}},n.skillMap={...t.skillMap,...o.skillMap??{}}}catch{}return K(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=ee(e,n.outDir,t.outDir),n}var Z=100,q=5;function K(e){if(typeof e!="string"||e.length>Z||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]|(?<!\()\?/g)?.length??0)>q)return null;try{return new RegExp(e)}catch{return null}}function O(){return process.env.CHARDON_DB??g(J(),".claude","chardon.db")}var Q=/^[a-z0-9][a-z0-9._-]{0,63}$/;function h(e){try{let t=_(g(e,S),"utf-8"),s=JSON.parse(t).repoName;if(typeof s=="string"&&Q.test(s))return s}catch{}return C(e).replace(N,"")}function k(e){return N.test(C(e))?"worktree":"main"}function ee(e,t,s){let n=f(e),o=f(n,t);return o===n||o.startsWith(n+V)?o:f(n,s)}function E(e,t,s=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let o=s().toISOString();process.stderr.write(`[chardon] ${o} ${e}${n?`: ${n}`:""}
`)}catch{}}var te=[[/glpat-[A-Za-z0-9_-]{10,}/g,"[REDACTED]"],[/glrt-[A-Za-z0-9_-]{10,}/g,"[REDACTED]"],[/ghp_[A-Za-z0-9]{36,}/g,"[REDACTED]"],[/github_pat_[A-Za-z0-9_]{20,}/g,"[REDACTED]"],[/ATATT[A-Za-z0-9+/=]{40,}/g,"[REDACTED]"],[/\bAKIA[0-9A-Z]{16}\b/g,"[REDACTED]"],[/sk-ant-[A-Za-z0-9_-]{20,}/g,"[REDACTED]"],[/\bsk_(?:live|test)_[A-Za-z0-9]{20,}/g,"[REDACTED]"],[/\bnpm_[A-Za-z0-9]{36}\b/g,"[REDACTED]"],[/\bxox[baprs]-[A-Za-z0-9-]{10,}/g,"[REDACTED]"],[/\bAIza[0-9A-Za-z_-]{35}\b/g,"[REDACTED]"],[/((?:^|\s)(?:-u|--user)[ =])[^\s:@]+:\S+/g,"$1[REDACTED]"],[/(\bsshpass\s+-p\s*)\S+/g,"$1[REDACTED]"],[/\b((?:[a-z0-9]+[_-])*(?:token|key|secret|password|passwd|pass|pwd|auth|credential)s?)=("[^"]*"|'[^']*'|\S+)/g,"$1=[REDACTED]"],[/(--?(?:token|key|secret|password|passwd|pwd|api[-_]?key|auth)(?:\s+|=)|[Bb]earer\s+)\S+/g,"$1[REDACTED]"],[/\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASS|PWD|AUTH|CREDENTIAL)[A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g,"$1=[REDACTED]"],[/((?:postgres|mysql|mongodb|http|https|sftp|ftp):\/\/)[^:@\s]+:[^@\s]+@/g,"$1[REDACTED]@"],[/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[JWT_REDACTED]"],[/\b[0-9a-fA-F]{32,}\b/g,"[HEX_REDACTED]"]];function I(e){if(typeof e!="string")return"";let t=e;for(let[s,n]of te)t=t.replace(s,n);return t}function x(e){return I(e).slice(0,60)}var de=ne(import.meta.url),{DatabaseSync:le}=de("node:sqlite");function me(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}me();var pe=ce(L(ue(import.meta.url)),"schema.sql"),M=2;function y(){let e=O();re(L(e),{recursive:!0});try{oe(ie(e,"a",384)),se(e,384)}catch(r){E("db-permissions",r)}let t=new le(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let s=ae(pe,"utf-8"),n=ge(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(s),n&&Ee(t),fe(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(r){if(!String(r.message).includes("duplicate column"))throw r}if(T(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(r){if(!String(r.message).includes("duplicate column"))throw r}if(T(t,"purge_log","nudges"))try{t.exec("ALTER TABLE purge_log ADD COLUMN nudges INTEGER NOT NULL DEFAULT 0")}catch(r){if(!String(r.message).includes("duplicate column"))throw r}return t.prepare("PRAGMA user_version").get().user_version!==M&&t.exec(`PRAGMA user_version = ${M}`),t}function ge(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function Ee(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function T(e,t,s){let n=e.prepare(`PRAGMA table_info(${t})`).all();return n.length>0&&!n.some(o=>o.name===s)}function fe(e){return T(e,"hook_health","last_error")}function w(e){try{e.close()}catch{}}function u(e,t){return e.prepare(`INSERT OR IGNORE INTO nudges (date, repo, kind, target)
       VALUES (?, ?, ?, ?)`).run(t.date,t.repo,t.kind,t.target).changes>0}function U(e,t,s,n,o=3){let r=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${s}`,o);if(n.length===0)return r;let i=new Set(n);return r.filter(c=>!i.has(c.cmd))}function D(e,t,s,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.success = 0
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ?
       ORDER BY count DESC
       LIMIT 20`).all(t,`-${s}`,n)}function $(e,t,s,n=3,o=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
              COUNT(*) AS count,
              AVG(e.duration_ms) AS avgMs
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.duration_ms IS NOT NULL
         AND s.repo = ?
         AND e.ts > datetime('now', ? || ' hours')
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       GROUP BY json_extract(e.meta, '$.cmd')
       HAVING count >= ? AND avgMs >= ?
       ORDER BY avgMs DESC
       LIMIT 20`).all(t,`-${s}`,n,o)}function v(e,t,s,n){return e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(t,s,n)?.total??0}var F=2,A=24,he=.8,Te=1e3,H="tokens",De="git commit",B=/\b(vitest|jest|playwright|pytest|cargo test|go test|(npm|pnpm|yarn|bun)( run)? test|npx (vitest|jest|playwright))\b/,P="commit",Ae=200;function Re(e,t,s,n){let o=U(e,t,F,n.toilExclusions);if(o.length===0)return null;let r=o[0];return u(e,{date:s,repo:t,kind:"toil",target:r.cmd})?`\u26A0\uFE0F  [chardon] toil loop: "${r.cmd}" \xD7${r.count} in ${F}h: consider a script or dedicated skill.`:null}function Ce(e,t,s,n,o){let i=D(e,t,A,o.thresholds.failMin).find(c=>c.cmd===n);return!i||!u(e,{date:s,repo:t,kind:"failing-cmd",target:n})?null:`\u26A0\uFE0F  [chardon] this command failed ${i.count} times today; consider systematic debugging before rerunning.`}function Ne(e,t,s,n,o){let i=$(e,t,A,o.thresholds.slowMin,o.thresholds.slowMs).find(a=>a.cmd===n);return!i||!u(e,{date:s,repo:t,kind:"slow-cmd",target:n})?null:`\u26A0\uFE0F  [chardon] this command averages ${Math.round(i.avgMs/Te)}s per run today; consider running it in the background.`}function Se(e,t,s){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
              e.success AS success
       FROM events e
       JOIN sessions s ON e.session_id = s.id
       WHERE e.tool = 'Bash'
         AND e.session_id = ?
         AND s.repo = ?
         AND json_extract(e.meta, '$.cmd') IS NOT NULL
       ORDER BY e.id DESC
       LIMIT ?`).all(s,t,Ae).find(o=>B.test(o.cmd))??null}function be(e,t,s,n,o){let r=n?Se(e,t,n):null,i=r!==null&&r.success!==0,c=D(e,t,A,o.thresholds.failMin).filter(a=>B.test(a.cmd));if(c.length>0&&!i){let a=c[0];return u(e,{date:s,repo:t,kind:"commit-gate",target:P})?`\u26A0\uFE0F  [chardon] tests failed ${a.count} times today (${a.cmd}); commit anyway?`:null}return r?.success!==0||!u(e,{date:s,repo:t,kind:"commit-gate",target:P})?null:`\u26A0\uFE0F  [chardon] the last test run this session failed (${r.cmd}); commit anyway?`}function Oe(e,t,s,n,o){let r=o.tokenBudgetPerDay;if(r<=0)return null;let i=v(e,t,k(n),s);return i>=r?u(e,{date:s,repo:t,kind:"budget-100",target:H})?`\u26A0\uFE0F  [chardon] token budget exceeded: ${i} of ${r} tokens used today.`:null:i>=r*he&&u(e,{date:s,repo:t,kind:"budget-80",target:H})?`\u26A0\uFE0F  [chardon] token budget warning: ${i} of ${r} tokens used today (over 80%).`:null}function ke(e,t,s=new Date){try{if(t.CHARDON_DB&&(process.env.CHARDON_DB=t.CHARDON_DB),t.CHARDON_ACTIVE!=="1")return;let n="",o="";try{if(n=t.CLAUDE_PROJECT_DIR??"",!n)return;o=h(n)}catch{return}let r="",i="",c="";try{if(typeof e!="object"||e===null)return;let l=e;r=l.tool_name??"",i=String(l.tool_input?.command??""),c=String(l.session_id??"")}catch{return}if(r!=="Bash")return;let a=b(n),m=s.toISOString().slice(0,10),p=x(i),d=y();try{let l=[Re(d,o,m,a),p?Ce(d,o,m,p,a):null,p?Ne(d,o,m,p,a):null,p.startsWith(De)?be(d,o,m,c,a):null,Oe(d,o,m,n,a)].filter(W=>W!==null);l.length>0&&process.stdout.write(`
${l.join(`
`)}
`)}finally{w(d)}}catch(n){E("notify",n)}}if(R("notify")){try{let e={};try{let t=_e(0,"utf-8");e=JSON.parse(t)}catch{process.exit(0)}ke(e,process.env,new Date)}catch{}process.exit(0)}export{ke as run};
