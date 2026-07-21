import{mkdirSync as ne,writeFileSync as re}from"node:fs";import{isAbsolute as se,join as x}from"node:path";import{basename as L}from"node:path";function S(t){let e=process.argv[1];if(!e)return!1;let r=L(e);return r===`${t}.ts`||r===`${t}.mjs`||r===`${t}.js`}import{createRequire as G}from"node:module";import{chmodSync as Y,readFileSync as V}from"node:fs";import{dirname as J,join as q}from"node:path";import{fileURLToPath as K}from"node:url";import{existsSync as y,readFileSync as E}from"node:fs";import{homedir as $}from"node:os";import{basename as v,join as f,resolve as h,sep as U}from"node:path";import{fileURLToPath as W}from"node:url";var P=/-wt-\d+$/,j=".chardon.json",H=W(new URL("../",import.meta.url)),F=f(H,"config","chardon.default.json");function N(t){let e=JSON.parse(E(F,"utf-8")),r=f(t,j),o={...e};if(y(r))try{let n=JSON.parse(E(r,"utf-8"));o={...e,...n},o.gitlab={...e.gitlab,...n.gitlab??{}},o.thresholds={...e.thresholds,...n.thresholds??{}}}catch{}try{new RegExp(o.ticketRegex)}catch{o.ticketRegex=e.ticketRegex}return o.outDir=B(t,o.outDir,e.outDir),o}function R(){return process.env.CHARDON_DB??f($(),".claude","chardon.db")}function C(t){return v(t).replace(P,"")}function B(t,e,r){let o=h(t),n=h(o,e);return n===o||n.startsWith(o+U)?n:h(o,r)}var X=G(import.meta.url),{DatabaseSync:z}=X("node:sqlite"),Q=q(J(K(import.meta.url)),"schema.sql"),_=2;function b(){let t=R(),e=new z(t);try{Y(t,384)}catch{}e.exec("PRAGMA busy_timeout = 5000"),e.exec("PRAGMA journal_mode = WAL"),e.exec("PRAGMA foreign_keys = ON");let r=V(Q,"utf-8"),o=Z(e);return o&&e.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),e.exec(r),o&&ee(e),e.prepare("PRAGMA user_version").get().user_version!==_&&e.exec(`PRAGMA user_version = ${_}`),e}function Z(t){return t.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!t.prepare("PRAGMA table_info(token_usage)").all().some(o=>o.name==="repo"):!1}function ee(t){t.exec("BEGIN");try{t.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),t.exec("DROP TABLE token_usage_legacy"),t.exec("COMMIT")}catch(e){throw t.exec("ROLLBACK"),e}}function k(t){try{t.close()}catch{}}function D(t,e,r,o,n=3){let s=t.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(e,`-${r}`,n);if(o.length===0)return s;let i=new Set(o);return s.filter(a=>!i.has(a.cmd))}function A(t,e,r,o=3){return t.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(e,`-${r}`,o)}var m=168,te="claude-opus-4-8",oe=4096;function T(t,e,r){let o=r.toISOString().slice(0,10),n=3600*1e3,s=new Date(r.getTime()-m*n).toISOString().slice(0,10),i=new Date(r.getTime()-2*m*n).toISOString().slice(0,10),a=D(t,e,m,[]),l=A(t,e,m),g=t.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(e,s),d=t.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(e,i,s),c=g??{input:0,output:0,cacheRead:0},p=c.input+c.output,u=d?.total??0,M=u>0?Math.round((p-u)/u*100):null;return{repo:e,weekStart:s,weekEnd:o,toil:a,coldReads:l,tokens:c,tokenTrend:{thisWeek:p,lastWeek:u,pct:M}}}function O(t){let e=t.toil.length>0?t.toil.map(n=>`  - "${n.cmd}" repeated ${n.count}x`).join(`
`):"  (none above threshold)",r=t.coldReads.length>0?t.coldReads.map(n=>`  - "${n.file}" read ${n.count}x`).join(`
`):"  (none above threshold)",o=t.toil.length===0&&t.coldReads.length===0?`
> No toil loops or repeated cold reads detected this week \u2014 no friction to address.
`:"";return`You are a software workflow analyst. Below is a one-week activity summary for the repository "${t.repo}" (${t.weekStart} \u2192 ${t.weekEnd}).
${o}
## Toil loops (repeated identical Bash commands)
${e}

## Cold reads (files read repeatedly without modification)
${r}

## Token usage
- Input tokens:      ${t.tokens.input}
- Output tokens:     ${t.tokens.output}
- Cache read tokens: ${t.tokens.cacheRead}

Based on this data, provide:
1. A short synthesis (2-3 sentences) describing the main workflow patterns observed.
2. Up to 3 concrete, actionable workflow improvements the developer could adopt to reduce toil and improve efficiency.

Be specific: reference the actual commands and files listed above where relevant.`}async function I(t){if(!process.env.ANTHROPIC_API_KEY)return null;let e="@anthropic-ai/sdk",r;try{r=await import(e)}catch{return null}let o=r.default;try{return(await new o().messages.create({model:process.env.CHARDON_MODEL??te,max_tokens:oe,messages:[{role:"user",content:t}]})).content.filter(i=>i.type==="text").map(i=>i.text).join(`
`)||null}catch{return null}}var w=8e3;function ie(t,e,r){let o=[`# Weekly Workflow Report \u2014 ${e.weekStart} \u2192 ${t}`,"",`**Repository:** ${e.repo}`,"","## Token usage",`- Input: ${e.tokens.input}`,`- Output: ${e.tokens.output}`,`- Cache read: ${e.tokens.cacheRead}`];if(e.tokenTrend){let{thisWeek:n,lastWeek:s,pct:i}=e.tokenTrend,a=i===null?"n/a":`${i>0?"+":""}${i}%`;o.push(`- Week-over-week: ${n} vs ${s} (${a})`)}if(o.push(""),e.toil.length>0){o.push("## Toil loops (repeated identical commands)"),o.push("| Command | Repetitions |"),o.push("|---|---|");for(let n of e.toil)o.push(`| \`${n.cmd}\` | ${n.count} |`);o.push("")}if(e.coldReads.length>0){o.push("## Cold reads (files re-read often)"),o.push("| File | Reads |"),o.push("|---|---|");for(let n of e.coldReads)o.push(`| \`${n.file}\` | ${n.count} |`);o.push("")}if(r!==null){let n=r.length>w?`${r.slice(0,w)}\u2026 (truncated)`:r;o.push("## AI synthesis"),o.push(n),o.push("")}else o.push("> Set ANTHROPIC_API_KEY to enable the weekly synthesis."),o.push("");return o.join(`
`)}function ae(t){let e=new Date(t.getTime()),r=t.getUTCDay();e.setUTCDate(t.getUTCDate()+(4-(r===0?7:r)));let o=e.getUTCFullYear(),n=new Date(Date.UTC(o,0,4)),s=1+Math.round((e.getTime()-n.getTime())/(10080*60*1e3));return`${o}-W${String(s).padStart(2,"0")}`}async function ce(t){let{projectDir:e,now:r,model:o=I}=t,n=N(e),s=C(e),i=b(),a;try{let c=T(i,s,r),p=O(c),u=await o(p).catch(()=>null);a=ie(c.weekEnd,c,u)}finally{k(i)}let l=se(n.outDir)?n.outDir:x(e,n.outDir);ne(l,{recursive:!0});let g=ae(r),d=x(l,`weekly-${g}.md`);return re(d,a,"utf-8"),{path:d,markdown:a}}if(S("analyze-weekly")){let{path:t}=await ce({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(t)}export{ce as generateWeeklyReport,ae as isoWeekLabel,ie as renderWeeklyReport};
