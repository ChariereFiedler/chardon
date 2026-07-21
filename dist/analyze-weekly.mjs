import{mkdirSync as re,writeFileSync as se}from"node:fs";import{isAbsolute as ie,join as I}from"node:path";import{basename as M}from"node:path";function S(e){let t=process.argv[1];if(!t)return!1;let r=M(t);return r===`${e}.ts`||r===`${e}.mjs`||r===`${e}.js`}import{createRequire as G}from"node:module";import{chmodSync as Y,readFileSync as V}from"node:fs";import{dirname as J,join as q}from"node:path";import{fileURLToPath as K}from"node:url";import{existsSync as y,readFileSync as E}from"node:fs";import{homedir as $}from"node:os";import{basename as v,join as f,resolve as h,sep as U}from"node:path";import{fileURLToPath as W}from"node:url";var P=/-wt-\d+$/,j=".chardon.json",H=W(new URL("../",import.meta.url)),F=f(H,"config","chardon.default.json");function N(e){let t=JSON.parse(E(F,"utf-8")),r=f(e,j),o={...t};if(y(r))try{let n=JSON.parse(E(r,"utf-8"));o={...t,...n},o.gitlab={...t.gitlab,...n.gitlab??{}},o.thresholds={...t.thresholds,...n.thresholds??{}}}catch{}try{new RegExp(o.ticketRegex)}catch{o.ticketRegex=t.ticketRegex}return o.outDir=B(e,o.outDir,t.outDir),o}function R(){return process.env.CHARDON_DB??f($(),".claude","chardon.db")}function C(e){return v(e).replace(P,"")}function B(e,t,r){let o=h(e),n=h(o,t);return n===o||n.startsWith(o+U)?n:h(o,r)}var X=G(import.meta.url),{DatabaseSync:z}=X("node:sqlite");function Q(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}Q();var Z=q(J(K(import.meta.url)),"schema.sql"),_=2;function b(){let e=R(),t=new z(e);try{Y(e,384)}catch{}t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let r=V(Z,"utf-8"),o=ee(t);return o&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(r),o&&te(t),t.prepare("PRAGMA user_version").get().user_version!==_&&t.exec(`PRAGMA user_version = ${_}`),t}function ee(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(o=>o.name==="repo"):!1}function te(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function k(e){try{e.close()}catch{}}function D(e,t,r,o,n=3){let s=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${r}`,n);if(o.length===0)return s;let i=new Set(o);return s.filter(a=>!i.has(a.cmd))}function A(e,t,r,o=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${r}`,o)}var m=168,oe="claude-opus-4-8",ne=4096;function T(e,t,r){let o=r.toISOString().slice(0,10),n=3600*1e3,s=new Date(r.getTime()-m*n).toISOString().slice(0,10),i=new Date(r.getTime()-2*m*n).toISOString().slice(0,10),a=D(e,t,m,[]),l=A(e,t,m),g=e.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(t,s),d=e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(t,i,s),c=g??{input:0,output:0,cacheRead:0},p=c.input+c.output,u=d?.total??0,L=u>0?Math.round((p-u)/u*100):null;return{repo:t,weekStart:s,weekEnd:o,toil:a,coldReads:l,tokens:c,tokenTrend:{thisWeek:p,lastWeek:u,pct:L}}}function O(e){let t=e.toil.length>0?e.toil.map(n=>`  - "${n.cmd}" repeated ${n.count}x`).join(`
`):"  (none above threshold)",r=e.coldReads.length>0?e.coldReads.map(n=>`  - "${n.file}" read ${n.count}x`).join(`
`):"  (none above threshold)",o=e.toil.length===0&&e.coldReads.length===0?`
> No toil loops or repeated cold reads detected this week \u2014 no friction to address.
`:"";return`You are a software workflow analyst. Below is a one-week activity summary for the repository "${e.repo}" (${e.weekStart} \u2192 ${e.weekEnd}).
${o}
## Toil loops (repeated identical Bash commands)
${t}

## Cold reads (files read repeatedly without modification)
${r}

## Token usage
- Input tokens:      ${e.tokens.input}
- Output tokens:     ${e.tokens.output}
- Cache read tokens: ${e.tokens.cacheRead}

Based on this data, provide:
1. A short synthesis (2-3 sentences) describing the main workflow patterns observed.
2. Up to 3 concrete, actionable workflow improvements the developer could adopt to reduce toil and improve efficiency.

Be specific: reference the actual commands and files listed above where relevant.`}async function x(e){if(!process.env.ANTHROPIC_API_KEY)return null;let t="@anthropic-ai/sdk",r;try{r=await import(t)}catch{return null}let o=r.default;try{return(await new o().messages.create({model:process.env.CHARDON_MODEL??oe,max_tokens:ne,messages:[{role:"user",content:e}]})).content.filter(i=>i.type==="text").map(i=>i.text).join(`
`)||null}catch{return null}}var w=8e3;function ae(e,t,r){let o=[`# Weekly Workflow Report \u2014 ${t.weekStart} \u2192 ${e}`,"",`**Repository:** ${t.repo}`,"","## Token usage",`- Input: ${t.tokens.input}`,`- Output: ${t.tokens.output}`,`- Cache read: ${t.tokens.cacheRead}`];if(t.tokenTrend){let{thisWeek:n,lastWeek:s,pct:i}=t.tokenTrend,a=i===null?"n/a":`${i>0?"+":""}${i}%`;o.push(`- Week-over-week: ${n} vs ${s} (${a})`)}if(o.push(""),t.toil.length>0){o.push("## Toil loops (repeated identical commands)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let n of t.toil)o.push(`| \`${n.cmd}\` | ${n.count} |`);o.push("")}if(t.coldReads.length>0){o.push("## Cold reads (files re-read often)"),o.push("| File | Reads |"),o.push("|---|---|");for(let n of t.coldReads)o.push(`| \`${n.file}\` | ${n.count} |`);o.push("")}if(r!==null){let n=r.length>w?`${r.slice(0,w)}\u2026 (truncated)`:r;o.push("## AI synthesis"),o.push(n),o.push("")}else o.push("> Set ANTHROPIC_API_KEY to enable the weekly synthesis."),o.push("");return o.join(`
`)}function ce(e){let t=new Date(e.getTime()),r=e.getUTCDay();t.setUTCDate(e.getUTCDate()+(4-(r===0?7:r)));let o=t.getUTCFullYear(),n=new Date(Date.UTC(o,0,4)),s=1+Math.round((t.getTime()-n.getTime())/(10080*60*1e3));return`${o}-W${String(s).padStart(2,"0")}`}async function ue(e){let{projectDir:t,now:r,model:o=x}=e,n=N(t),s=C(t),i=b(),a;try{let c=T(i,s,r),p=O(c),u=await o(p).catch(()=>null);a=ae(c.weekEnd,c,u)}finally{k(i)}let l=ie(n.outDir)?n.outDir:I(t,n.outDir);re(l,{recursive:!0});let g=ce(r),d=I(l,`weekly-${g}.md`);return se(d,a,"utf-8"),{path:d,markdown:a}}if(S("analyze-weekly")){let{path:e}=await ue({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}export{ue as generateWeeklyReport,ce as isoWeekLabel,ae as renderWeeklyReport};
