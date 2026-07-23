import{mkdirSync as de,writeFileSync as pe}from"node:fs";import{isAbsolute as me,join as M}from"node:path";import{basename as $}from"node:path";function S(e){let t=process.argv[1];if(!t)return!1;let o=$(t);return o===`${e}.ts`||o===`${e}.mjs`||o===`${e}.js`}import{createRequire as X}from"node:module";import{chmodSync as K,closeSync as Q,mkdirSync as z,openSync as Z,readFileSync as ee}from"node:fs";import{dirname as k,join as te}from"node:path";import{fileURLToPath as ne}from"node:url";import{existsSync as v,readFileSync as E}from"node:fs";import{homedir as U}from"node:os";import{basename as W,join as h,resolve as f,sep as P}from"node:path";import{fileURLToPath as H}from"node:url";var j=/-wt-\d+$/,F=".chardon.json",B=H(new URL("../",import.meta.url)),G=h(B,"config","chardon.default.json");function R(e){let t=JSON.parse(E(G,"utf-8")),o=h(e,F),n={...t};if(v(o))try{let r=JSON.parse(E(o,"utf-8"));n={...t,...r},n.gitlab={...t.gitlab,...r.gitlab??{}},n.thresholds={...t.thresholds,...r.thresholds??{}}}catch{}return J(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=q(e,n.outDir,t.outDir),n}var Y=100,V=5;function J(e){if(typeof e!="string"||e.length>Y||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>V)return null;try{return new RegExp(e)}catch{return null}}function N(){return process.env.CHARDON_DB??h(U(),".claude","chardon.db")}function C(e){return W(e).replace(j,"")}function q(e,t,o){let n=f(e),r=f(n,t);return r===n||r.startsWith(n+P)?r:f(n,o)}function _(e,t){if(process.env.CHARDON_DEBUG!=="1")return;let o=t instanceof Error?t.message:t!==void 0?String(t):"";try{process.stderr.write(`[chardon] ${e}${o?`: ${o}`:""}
`)}catch{}}var oe=X(import.meta.url),{DatabaseSync:re}=oe("node:sqlite");function se(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}se();var ie=te(k(ne(import.meta.url)),"schema.sql"),b=2;function A(){let e=N();z(k(e),{recursive:!0});try{Q(Z(e,"a",384)),K(e,384)}catch(s){_("db-permissions",s)}let t=new re(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let o=ee(ie,"utf-8"),n=ae(t);return n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(o),n&&ce(t),t.prepare("PRAGMA user_version").get().user_version!==b&&t.exec(`PRAGMA user_version = ${b}`),t}function ae(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function ce(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function D(e){try{e.close()}catch{}}function T(e,t,o,n,r=3){let s=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,r);if(n.length===0)return s;let i=new Set(n);return s.filter(a=>!i.has(a.cmd))}function O(e,t,o,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${o}`,n)}var m=168,ue="claude-opus-4-8",le=4096;function x(e,t,o){let n=o.toISOString().slice(0,10),r=3600*1e3,s=new Date(o.getTime()-m*r).toISOString().slice(0,10),i=new Date(o.getTime()-2*m*r).toISOString().slice(0,10),a=T(e,t,m,[]),l=O(e,t,m),g=e.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(t,s),d=e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(t,i,s),c=g??{input:0,output:0,cacheRead:0},p=c.input+c.output,u=d?.total??0,y=u>0?Math.round((p-u)/u*100):null;return{repo:t,weekStart:s,weekEnd:n,toil:a,coldReads:l,tokens:c,tokenTrend:{thisWeek:p,lastWeek:u,pct:y}}}function I(e){let t=e.toil.length>0?e.toil.map(r=>`  - "${r.cmd}" repeated ${r.count}x`).join(`
`):"  (none above threshold)",o=e.coldReads.length>0?e.coldReads.map(r=>`  - "${r.file}" read ${r.count}x`).join(`
`):"  (none above threshold)",n=e.toil.length===0&&e.coldReads.length===0?`
> No toil loops or repeated cold reads detected this week; no friction to address.
`:"";return`You are a software workflow analyst. Below is a one-week activity summary for the repository "${e.repo}" (${e.weekStart} \u2192 ${e.weekEnd}).
${n}
## Toil loops (repeated identical Bash commands)
${t}

## Cold reads (files read repeatedly without modification)
${o}

## Token usage
- Input tokens:      ${e.tokens.input}
- Output tokens:     ${e.tokens.output}
- Cache read tokens: ${e.tokens.cacheRead}

Based on this data, provide:
1. A short synthesis (2-3 sentences) describing the main workflow patterns observed.
2. Up to 3 concrete, actionable workflow improvements the developer could adopt to reduce toil and improve efficiency.

Be specific: reference the actual commands and files listed above where relevant.`}async function w(e){if(!process.env.ANTHROPIC_API_KEY)return null;let t="@anthropic-ai/sdk",o;try{o=await import(t)}catch{return null}let n=o.default;try{return(await new n().messages.create({model:process.env.CHARDON_MODEL??ue,max_tokens:le,messages:[{role:"user",content:e}]})).content.filter(i=>i.type==="text").map(i=>i.text).join(`
`)||null}catch{return null}}var L=8e3;function ge(e,t,o){let n=[`# Weekly Workflow Report \xB7 ${t.weekStart} \u2192 ${e}`,"",`**Repository:** ${t.repo}`,"","## Token usage",`- Input: ${t.tokens.input}`,`- Output: ${t.tokens.output}`,`- Cache read: ${t.tokens.cacheRead}`];if(t.tokenTrend){let{thisWeek:r,lastWeek:s,pct:i}=t.tokenTrend,a=i===null?"n/a":`${i>0?"+":""}${i}%`;n.push(`- Week-over-week: ${r} vs ${s} (${a})`)}if(n.push(""),t.toil.length>0){n.push("## Toil loops (repeated identical commands)"),n.push("| Command | Repetitions |"),n.push("|---|---|");for(let r of t.toil)n.push(`| \`${r.cmd}\` | ${r.count} |`);n.push("")}if(t.coldReads.length>0){n.push("## Cold reads (files re-read often)"),n.push("| File | Reads |"),n.push("|---|---|");for(let r of t.coldReads)n.push(`| \`${r.file}\` | ${r.count} |`);n.push("")}if(o!==null){let r=o.length>L?`${o.slice(0,L)}\u2026 (truncated)`:o;n.push("## AI synthesis"),n.push(r),n.push("")}else n.push("> Set ANTHROPIC_API_KEY to enable the weekly synthesis."),n.push("");return n.join(`
`)}function fe(e){let t=new Date(e.getTime()),o=e.getUTCDay();t.setUTCDate(e.getUTCDate()+(4-(o===0?7:o)));let n=t.getUTCFullYear(),r=new Date(Date.UTC(n,0,4)),s=1+Math.round((t.getTime()-r.getTime())/(10080*60*1e3));return`${n}-W${String(s).padStart(2,"0")}`}async function he(e){let{projectDir:t,now:o,model:n=w}=e,r=R(t),s=C(t),i=A(),a;try{let c=x(i,s,o),p=I(c),u=await n(p).catch(()=>null);a=ge(c.weekEnd,c,u)}finally{D(i)}let l=me(r.outDir)?r.outDir:M(t,r.outDir);de(l,{recursive:!0});let g=fe(o),d=M(l,`weekly-${g}.md`);return pe(d,a,"utf-8"),{path:d,markdown:a}}if(S("analyze-weekly")){let{path:e}=await he({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}export{he as generateWeeklyReport,fe as isoWeekLabel,ge as renderWeeklyReport};
