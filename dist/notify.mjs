#!/usr/bin/env node
import{readFileSync as V}from"node:fs";import{basename as O}from"node:path";function l(e){let t=process.argv[1];if(!t)return!1;let n=O(t);return n===`${e}.ts`||n===`${e}.mjs`||n===`${e}.js`}import{createRequire as y}from"node:module";import{chmodSync as $,readFileSync as w}from"node:fs";import{dirname as v,join as U}from"node:path";import{fileURLToPath as H}from"node:url";import{existsSync as h,readFileSync as p}from"node:fs";import{homedir as D}from"node:os";import{basename as b,join as d,resolve as u,sep as A}from"node:path";import{fileURLToPath as x}from"node:url";var T=/-wt-\d+$/,I=".chardon.json",L=x(new URL("../",import.meta.url)),M=d(L,"config","chardon.default.json");function f(e){let t=JSON.parse(p(M,"utf-8")),n=d(e,I),o={...t};if(h(n))try{let r=JSON.parse(p(n,"utf-8"));o={...t,...r},o.gitlab={...t.gitlab,...r.gitlab??{}},o.thresholds={...t.thresholds,...r.thresholds??{}}}catch{}try{new RegExp(o.ticketRegex)}catch{o.ticketRegex=t.ticketRegex}return o.outDir=k(e,o.outDir,t.outDir),o}function N(){return process.env.CHARDON_DB??d(D(),".claude","chardon.db")}function g(e){return b(e).replace(T,"")}function k(e,t,n){let o=u(e),r=u(o,t);return r===o||r.startsWith(o+A)?r:u(o,n)}var B=y(import.meta.url),{DatabaseSync:j}=B("node:sqlite");function P(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}P();var F=U(v(H(import.meta.url)),"schema.sql"),E=2;function _(){let e=N(),t=new j(e);try{$(e,384)}catch{}t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let n=w(F,"utf-8"),o=G(t);return o&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(n),o&&W(t),t.prepare("PRAGMA user_version").get().user_version!==E&&t.exec(`PRAGMA user_version = ${E}`),t}function G(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(o=>o.name==="repo"):!1}function W(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function S(e){try{e.close()}catch{}}function C(e,t,n,o,r=3){let s=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${n}`,r);if(o.length===0)return s;let i=new Set(o);return s.filter(a=>!i.has(a.cmd))}function R(e,t){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{process.stderr.write(`[chardon] ${e}${n?`: ${n}`:""}
`)}catch{}}function J(e,t){try{if(t.CHARDON_DB&&(process.env.CHARDON_DB=t.CHARDON_DB),t.CHARDON_ACTIVE!=="1")return;let n="",o="";try{if(n=t.CLAUDE_PROJECT_DIR??"",!n)return;o=g(n)}catch{return}let r="";try{if(typeof e!="object"||e===null)return;r=e.tool_name??""}catch{return}if(r!=="Bash")return;let s=f(n),i=2,a=_();try{let c=C(a,o,i,s.toilExclusions);if(c.length>0){let m=c[0];process.stdout.write(`
\u26A0\uFE0F  [chardon] toil loop: "${m.cmd}" \xD7${m.count} in ${i}h \u2014 consider a script or dedicated skill.
`)}}finally{S(a)}}catch(n){R("notify",n)}}if(l("notify")){try{let e={};try{let t=V(0,"utf-8");e=JSON.parse(t)}catch{process.exit(0)}J(e,process.env)}catch{}process.exit(0)}export{J as run};
