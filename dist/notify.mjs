#!/usr/bin/env node
import{readFileSync as me}from"node:fs";import{basename as F}from"node:path";function E(e){let t=process.argv[1];if(!t)return!1;let r=F(t);return r===`${e}.ts`||r===`${e}.mjs`||r===`${e}.js`}import{createRequire as X}from"node:module";import{chmodSync as K,closeSync as Q,mkdirSync as ee,openSync as te,readFileSync as ne}from"node:fs";import{dirname as k,join as re}from"node:path";import{fileURLToPath as oe}from"node:url";import{existsSync as H,readFileSync as _}from"node:fs";import{homedir as P}from"node:os";import{basename as b,join as f,resolve as g,sep as B}from"node:path";import{fileURLToPath as G}from"node:url";var D=/-wt-\d+$/,W=".chardon.json",j=G(new URL("../",import.meta.url)),J=f(j,"config","chardon.default.json");function C(e){let t=JSON.parse(_(J,"utf-8")),r=f(e,W),n={...t};if(H(r))try{let o=JSON.parse(_(r,"utf-8"));n={...t,...o},n.gitlab={...t.gitlab,...o.gitlab??{}},n.thresholds={...t.thresholds,...o.thresholds??{}}}catch{}return Z(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=z(e,n.outDir,t.outDir),n}var V=100,Y=5;function Z(e){if(typeof e!="string"||e.length>V||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>Y)return null;try{return new RegExp(e)}catch{return null}}function R(){return process.env.CHARDON_DB??f(P(),".claude","chardon.db")}function h(e){return b(e).replace(D,"")}function A(e){return D.test(b(e))?"worktree":"main"}function z(e,t,r){let n=g(e),o=g(n,t);return o===n||o.startsWith(n+B)?o:g(n,r)}function p(e,t,r=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let o=r().toISOString();process.stderr.write(`[chardon] ${o} ${e}${n?`: ${n}`:""}
`)}catch{}}var q=[[/glpat-[A-Za-z0-9_-]{10,}/g,"[REDACTED]"],[/glrt-[A-Za-z0-9_-]{10,}/g,"[REDACTED]"],[/ghp_[A-Za-z0-9]{36,}/g,"[REDACTED]"],[/github_pat_[A-Za-z0-9_]{20,}/g,"[REDACTED]"],[/ATATT[A-Za-z0-9+/=]{40,}/g,"[REDACTED]"],[/\bAKIA[0-9A-Z]{16}\b/g,"[REDACTED]"],[/sk-ant-[A-Za-z0-9_-]{20,}/g,"[REDACTED]"],[/\bsk_(?:live|test)_[A-Za-z0-9]{20,}/g,"[REDACTED]"],[/\bnpm_[A-Za-z0-9]{36}\b/g,"[REDACTED]"],[/\bxox[baprs]-[A-Za-z0-9-]{10,}/g,"[REDACTED]"],[/\bAIza[0-9A-Za-z_-]{35}\b/g,"[REDACTED]"],[/((?:^|\s)(?:-u|--user)[ =])[^\s:@]+:\S+/g,"$1[REDACTED]"],[/(\bsshpass\s+-p\s*)\S+/g,"$1[REDACTED]"],[/\b((?:[a-z0-9]+[_-])*(?:token|key|secret|password|passwd|pass|pwd|auth|credential)s?)=("[^"]*"|'[^']*'|\S+)/g,"$1=[REDACTED]"],[/(--?(?:token|key|secret|password|passwd|pwd|api[-_]?key|auth)(?:\s+|=)|[Bb]earer\s+)\S+/g,"$1[REDACTED]"],[/\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASS|PWD|AUTH|CREDENTIAL)[A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g,"$1=[REDACTED]"],[/((?:postgres|mysql|mongodb|http|https|sftp|ftp):\/\/)[^:@\s]+:[^@\s]+@/g,"$1[REDACTED]@"],[/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[JWT_REDACTED]"],[/\b[0-9a-fA-F]{32,}\b/g,"[HEX_REDACTED]"]];function T(e){if(typeof e!="string")return"";let t=e;for(let[r,n]of q)t=t.replace(r,n);return t}function S(e){return T(e).slice(0,60)}var se=X(import.meta.url),{DatabaseSync:ie}=se("node:sqlite");function ae(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}ae();var ce=re(k(oe(import.meta.url)),"schema.sql"),N=2;function O(){let e=R();ee(k(e),{recursive:!0});try{Q(te(e,"a",384)),K(e,384)}catch(s){p("db-permissions",s)}let t=new ie(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let r=ne(ce,"utf-8"),n=ue(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(r),n&&de(t),le(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(s){if(!String(s.message).includes("duplicate column"))throw s}return t.prepare("PRAGMA user_version").get().user_version!==N&&t.exec(`PRAGMA user_version = ${N}`),t}function ue(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function de(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function le(e){let t=e.prepare("PRAGMA table_info(hook_health)").all();return t.length>0&&!t.some(r=>r.name==="last_error")}function x(e){try{e.close()}catch{}}function u(e,t){return e.prepare(`INSERT OR IGNORE INTO nudges (date, repo, kind, target)
       VALUES (?, ?, ?, ?)`).run(t.date,t.repo,t.kind,t.target).changes>0}function I(e,t,r,n,o=3){let s=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,o);if(n.length===0)return s;let i=new Set(n);return s.filter(a=>!i.has(a.cmd))}function y(e,t,r,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n)}function M(e,t,r,n=3,o=3e4){return e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n,o)}function L(e,t,r,n){return e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND origin = ? AND date = ?`).get(t,r,n)?.total??0}var w=2,$=24,pe=.8,ge=1e3,U="tokens";function fe(e,t,r,n){let o=I(e,t,w,n.toilExclusions);if(o.length===0)return null;let s=o[0];return u(e,{date:r,repo:t,kind:"toil",target:s.cmd})?`\u26A0\uFE0F  [chardon] toil loop: "${s.cmd}" \xD7${s.count} in ${w}h: consider a script or dedicated skill.`:null}function he(e,t,r,n,o){let i=y(e,t,$,o.thresholds.failMin).find(a=>a.cmd===n);return!i||!u(e,{date:r,repo:t,kind:"failing-cmd",target:n})?null:`\u26A0\uFE0F  [chardon] this command failed ${i.count} times today; consider systematic debugging before rerunning.`}function Ee(e,t,r,n,o){let i=M(e,t,$,o.thresholds.slowMin,o.thresholds.slowMs).find(c=>c.cmd===n);return!i||!u(e,{date:r,repo:t,kind:"slow-cmd",target:n})?null:`\u26A0\uFE0F  [chardon] this command averages ${Math.round(i.avgMs/ge)}s per run today; consider running it in the background.`}function _e(e,t,r,n,o){let s=o.tokenBudgetPerDay;if(s<=0)return null;let i=L(e,t,A(n),r);return i>=s?u(e,{date:r,repo:t,kind:"budget-100",target:U})?`\u26A0\uFE0F  [chardon] token budget exceeded: ${i} of ${s} tokens used today.`:null:i>=s*pe&&u(e,{date:r,repo:t,kind:"budget-80",target:U})?`\u26A0\uFE0F  [chardon] token budget warning: ${i} of ${s} tokens used today (over 80%).`:null}function be(e,t,r=new Date){try{if(t.CHARDON_DB&&(process.env.CHARDON_DB=t.CHARDON_DB),t.CHARDON_ACTIVE!=="1")return;let n="",o="";try{if(n=t.CLAUDE_PROJECT_DIR??"",!n)return;o=h(n)}catch{return}let s="",i="";try{if(typeof e!="object"||e===null)return;let l=e;s=l.tool_name??"",i=String(l.tool_input?.command??"")}catch{return}if(s!=="Bash")return;let a=C(n),c=r.toISOString().slice(0,10),m=S(i),d=O();try{let l=[fe(d,o,c,a),m?he(d,o,c,m,a):null,m?Ee(d,o,c,m,a):null,_e(d,o,c,n,a)].filter(v=>v!==null);l.length>0&&process.stdout.write(`
${l.join(`
`)}
`)}finally{x(d)}}catch(n){p("notify",n)}}if(E("notify")){try{let e={};try{let t=me(0,"utf-8");e=JSON.parse(t)}catch{process.exit(0)}be(e,process.env,new Date)}catch{}process.exit(0)}export{be as run};
