#!/usr/bin/env node
import{readFileSync as ge}from"node:fs";import{basename as P}from"node:path";function _(e){let t=process.argv[1];if(!t)return!1;let r=P(t);return r===`${e}.ts`||r===`${e}.mjs`||r===`${e}.js`}import{createRequire as Q}from"node:module";import{chmodSync as ee,closeSync as te,mkdirSync as ne,openSync as re,readFileSync as oe}from"node:fs";import{dirname as O,join as se}from"node:path";import{fileURLToPath as ie}from"node:url";import{existsSync as B,readFileSync as h}from"node:fs";import{homedir as G}from"node:os";import{basename as D,join as p,resolve as f,sep as W}from"node:path";import{fileURLToPath as j}from"node:url";var b=/-wt-\d+$/,C=".chardon.json",J=j(new URL("../",import.meta.url)),V=p(J,"config","chardon.default.json");function T(e){let t=JSON.parse(h(V,"utf-8")),r=p(e,C),n={...t};if(B(r))try{let o=JSON.parse(h(r,"utf-8"));n={...t,...o},n.gitlab={...t.gitlab,...o.gitlab??{}},n.thresholds={...t.thresholds,...o.thresholds??{}}}catch{}return Z(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=X(e,n.outDir,t.outDir),n}var z=100,Y=5;function Z(e){if(typeof e!="string"||e.length>z||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>Y)return null;try{return new RegExp(e)}catch{return null}}function A(){return process.env.CHARDON_DB??p(G(),".claude","chardon.db")}var q=/^[a-z0-9][a-z0-9._-]{0,63}$/;function E(e){try{let t=h(p(e,C),"utf-8"),r=JSON.parse(t).repoName;if(typeof r=="string"&&q.test(r))return r}catch{}return D(e).replace(b,"")}function R(e){return b.test(D(e))?"worktree":"main"}function X(e,t,r){let n=f(e),o=f(n,t);return o===n||o.startsWith(n+W)?o:f(n,r)}function g(e,t,r=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let o=r().toISOString();process.stderr.write(`[chardon] ${o} ${e}${n?`: ${n}`:""}
`)}catch{}}var K=[[/glpat-[A-Za-z0-9_-]{10,}/g,"[REDACTED]"],[/glrt-[A-Za-z0-9_-]{10,}/g,"[REDACTED]"],[/ghp_[A-Za-z0-9]{36,}/g,"[REDACTED]"],[/github_pat_[A-Za-z0-9_]{20,}/g,"[REDACTED]"],[/ATATT[A-Za-z0-9+/=]{40,}/g,"[REDACTED]"],[/\bAKIA[0-9A-Z]{16}\b/g,"[REDACTED]"],[/sk-ant-[A-Za-z0-9_-]{20,}/g,"[REDACTED]"],[/\bsk_(?:live|test)_[A-Za-z0-9]{20,}/g,"[REDACTED]"],[/\bnpm_[A-Za-z0-9]{36}\b/g,"[REDACTED]"],[/\bxox[baprs]-[A-Za-z0-9-]{10,}/g,"[REDACTED]"],[/\bAIza[0-9A-Za-z_-]{35}\b/g,"[REDACTED]"],[/((?:^|\s)(?:-u|--user)[ =])[^\s:@]+:\S+/g,"$1[REDACTED]"],[/(\bsshpass\s+-p\s*)\S+/g,"$1[REDACTED]"],[/\b((?:[a-z0-9]+[_-])*(?:token|key|secret|password|passwd|pass|pwd|auth|credential)s?)=("[^"]*"|'[^']*'|\S+)/g,"$1=[REDACTED]"],[/(--?(?:token|key|secret|password|passwd|pwd|api[-_]?key|auth)(?:\s+|=)|[Bb]earer\s+)\S+/g,"$1[REDACTED]"],[/\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASS|PWD|AUTH|CREDENTIAL)[A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g,"$1=[REDACTED]"],[/((?:postgres|mysql|mongodb|http|https|sftp|ftp):\/\/)[^:@\s]+:[^@\s]+@/g,"$1[REDACTED]@"],[/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[JWT_REDACTED]"],[/\b[0-9a-fA-F]{32,}\b/g,"[HEX_REDACTED]"]];function S(e){if(typeof e!="string")return"";let t=e;for(let[r,n]of K)t=t.replace(r,n);return t}function N(e){return S(e).slice(0,60)}var ae=Q(import.meta.url),{DatabaseSync:ce}=ae("node:sqlite");function ue(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}ue();var de=se(O(ie(import.meta.url)),"schema.sql"),k=2;function x(){let e=A();ne(O(e),{recursive:!0});try{te(re(e,"a",384)),ee(e,384)}catch(s){g("db-permissions",s)}let t=new ce(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let r=oe(de,"utf-8"),n=le(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(r),n&&me(t),pe(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(s){if(!String(s.message).includes("duplicate column"))throw s}if(I(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(s){if(!String(s.message).includes("duplicate column"))throw s}return t.prepare("PRAGMA user_version").get().user_version!==k&&t.exec(`PRAGMA user_version = ${k}`),t}function le(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function me(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function I(e,t,r){let n=e.prepare(`PRAGMA table_info(${t})`).all();return n.length>0&&!n.some(o=>o.name===r)}function pe(e){return I(e,"hook_health","last_error")}function y(e){try{e.close()}catch{}}function u(e,t){return e.prepare(`INSERT OR IGNORE INTO nudges (date, repo, kind, target)
       VALUES (?, ?, ?, ?)`).run(t.date,t.repo,t.kind,t.target).changes>0}function M(e,t,r,n,o=3){let s=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,o);if(n.length===0)return s;let i=new Set(n);return s.filter(a=>!i.has(a.cmd))}function L(e,t,r,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n)}function w(e,t,r,n=3,o=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n,o)}function U(e,t,r,n){return e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(t,r,n)?.total??0}var $=2,F=24,fe=.8,he=1e3,v="tokens";function Ee(e,t,r,n){let o=M(e,t,$,n.toilExclusions);if(o.length===0)return null;let s=o[0];return u(e,{date:r,repo:t,kind:"toil",target:s.cmd})?`\u26A0\uFE0F  [chardon] toil loop: "${s.cmd}" \xD7${s.count} in ${$}h: consider a script or dedicated skill.`:null}function _e(e,t,r,n,o){let i=L(e,t,F,o.thresholds.failMin).find(a=>a.cmd===n);return!i||!u(e,{date:r,repo:t,kind:"failing-cmd",target:n})?null:`\u26A0\uFE0F  [chardon] this command failed ${i.count} times today; consider systematic debugging before rerunning.`}function De(e,t,r,n,o){let i=w(e,t,F,o.thresholds.slowMin,o.thresholds.slowMs).find(c=>c.cmd===n);return!i||!u(e,{date:r,repo:t,kind:"slow-cmd",target:n})?null:`\u26A0\uFE0F  [chardon] this command averages ${Math.round(i.avgMs/he)}s per run today; consider running it in the background.`}function be(e,t,r,n,o){let s=o.tokenBudgetPerDay;if(s<=0)return null;let i=U(e,t,R(n),r);return i>=s?u(e,{date:r,repo:t,kind:"budget-100",target:v})?`\u26A0\uFE0F  [chardon] token budget exceeded: ${i} of ${s} tokens used today.`:null:i>=s*fe&&u(e,{date:r,repo:t,kind:"budget-80",target:v})?`\u26A0\uFE0F  [chardon] token budget warning: ${i} of ${s} tokens used today (over 80%).`:null}function Ce(e,t,r=new Date){try{if(t.CHARDON_DB&&(process.env.CHARDON_DB=t.CHARDON_DB),t.CHARDON_ACTIVE!=="1")return;let n="",o="";try{if(n=t.CLAUDE_PROJECT_DIR??"",!n)return;o=E(n)}catch{return}let s="",i="";try{if(typeof e!="object"||e===null)return;let l=e;s=l.tool_name??"",i=String(l.tool_input?.command??"")}catch{return}if(s!=="Bash")return;let a=T(n),c=r.toISOString().slice(0,10),m=N(i),d=x();try{let l=[Ee(d,o,c,a),m?_e(d,o,c,m,a):null,m?De(d,o,c,m,a):null,be(d,o,c,n,a)].filter(H=>H!==null);l.length>0&&process.stdout.write(`
${l.join(`
`)}
`)}finally{y(d)}}catch(n){g("notify",n)}}if(_("notify")){try{let e={};try{let t=ge(0,"utf-8");e=JSON.parse(t)}catch{process.exit(0)}Ce(e,process.env,new Date)}catch{}process.exit(0)}export{Ce as run};
