#!/usr/bin/env node
import{readFileSync as W}from"node:fs";import{basename as O}from"node:path";function l(t){let e=process.argv[1];if(!e)return!1;let n=O(e);return n===`${t}.ts`||n===`${t}.mjs`||n===`${t}.js`}import{createRequire as y}from"node:module";import{chmodSync as w,readFileSync as $}from"node:fs";import{dirname as v,join as U}from"node:path";import{fileURLToPath as H}from"node:url";import{existsSync as h,readFileSync as p}from"node:fs";import{homedir as D}from"node:os";import{basename as b,join as d,resolve as u,sep as A}from"node:path";import{fileURLToPath as T}from"node:url";var I=/-wt-\d+$/,x=".chardon.json",L=T(new URL("../",import.meta.url)),M=d(L,"config","chardon.default.json");function N(t){let e=JSON.parse(p(M,"utf-8")),n=d(t,x),o={...e};if(h(n))try{let r=JSON.parse(p(n,"utf-8"));o={...e,...r},o.gitlab={...e.gitlab,...r.gitlab??{}},o.thresholds={...e.thresholds,...r.thresholds??{}}}catch{}try{new RegExp(o.ticketRegex)}catch{o.ticketRegex=e.ticketRegex}return o.outDir=k(t,o.outDir,e.outDir),o}function f(){return process.env.CHARDON_DB??d(D(),".claude","chardon.db")}function g(t){return b(t).replace(I,"")}function k(t,e,n){let o=u(t),r=u(o,e);return r===o||r.startsWith(o+A)?r:u(o,n)}var B=y(import.meta.url),{DatabaseSync:j}=B("node:sqlite"),P=U(v(H(import.meta.url)),"schema.sql"),_=2;function E(){let t=f(),e=new j(t);try{w(t,384)}catch{}e.exec("PRAGMA busy_timeout = 5000"),e.exec("PRAGMA journal_mode = WAL"),e.exec("PRAGMA foreign_keys = ON");let n=$(P,"utf-8"),o=F(e);return o&&e.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),e.exec(n),o&&G(e),e.prepare("PRAGMA user_version").get().user_version!==_&&e.exec(`PRAGMA user_version = ${_}`),e}function F(t){return t.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!t.prepare("PRAGMA table_info(token_usage)").all().some(o=>o.name==="repo"):!1}function G(t){t.exec("BEGIN");try{t.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),t.exec("DROP TABLE token_usage_legacy"),t.exec("COMMIT")}catch(e){throw t.exec("ROLLBACK"),e}}function C(t){try{t.close()}catch{}}function R(t,e,n,o,r=3){let s=t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(e,`-${n}`,r);if(o.length===0)return s;let i=new Set(o);return s.filter(a=>!i.has(a.cmd))}function S(t,e){if(process.env.CHARDON_DEBUG!=="1")return;let n=e instanceof Error?e.message:e!==void 0?String(e):"";try{process.stderr.write(`[chardon] ${t}${n?`: ${n}`:""}
`)}catch{}}function V(t,e){try{if(e.CHARDON_DB&&(process.env.CHARDON_DB=e.CHARDON_DB),e.CHARDON_ACTIVE!=="1")return;let n="",o="";try{if(n=e.CLAUDE_PROJECT_DIR??"",!n)return;o=g(n)}catch{return}let r="";try{if(typeof t!="object"||t===null)return;r=t.tool_name??""}catch{return}if(r!=="Bash")return;let s=N(n),i=2,a=E();try{let c=R(a,o,i,s.toilExclusions);if(c.length>0){let m=c[0];process.stdout.write(`
\u26A0\uFE0F  [chardon] toil loop: "${m.cmd}" \xD7${m.count} in ${i}h \u2014 consider a script or dedicated skill.
`)}}finally{C(a)}}catch(n){S("notify",n)}}if(l("notify")){try{let t={};try{let e=W(0,"utf-8");t=JSON.parse(e)}catch{process.exit(0)}V(t,process.env)}catch{}process.exit(0)}export{V as run};
