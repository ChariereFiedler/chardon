import{mkdirSync as ge,writeFileSync as Ee}from"node:fs";import{isAbsolute as he,join as y}from"node:path";import{basename as U}from"node:path";function A(e){let t=process.argv[1];if(!t)return!1;let o=U(t);return o===`${e}.ts`||o===`${e}.mjs`||o===`${e}.js`}import{createRequire as q}from"node:module";import{chmodSync as K,closeSync as Q,mkdirSync as ee,openSync as te,readFileSync as ne}from"node:fs";import{dirname as N,join as oe}from"node:path";import{fileURLToPath as re}from"node:url";import{existsSync as W,readFileSync as f}from"node:fs";import{homedir as H}from"node:os";import{basename as P,join as m,resolve as h,sep as F}from"node:path";import{fileURLToPath as j}from"node:url";var B=/-wt-\d+$/,S=".chardon.json",G=j(new URL("../",import.meta.url)),Y=m(G,"config","chardon.default.json");function D(e){let t=JSON.parse(f(Y,"utf-8")),o=m(e,S),n={...t};if(W(o))try{let r=JSON.parse(f(o,"utf-8"));n={...t,...r},n.gitlab={...t.gitlab,...r.gitlab??{}},n.thresholds={...t.thresholds,...r.thresholds??{}}}catch{}return Z(n.ticketRegex)===null&&(n.ticketRegex=t.ticketRegex),n.outDir=X(e,n.outDir,t.outDir),n}var z=100,V=5;function Z(e){if(typeof e!="string"||e.length>z||/\\[1-9]/.test(e)||/\)[+*{]/.test(e)||(e.match(/[+*{]/g)?.length??0)>V)return null;try{return new RegExp(e)}catch{return null}}function _(){return process.env.CHARDON_DB??m(H(),".claude","chardon.db")}var J=/^[a-z0-9][a-z0-9._-]{0,63}$/;function R(e){try{let t=f(m(e,S),"utf-8"),o=JSON.parse(t).repoName;if(typeof o=="string"&&J.test(o))return o}catch{}return P(e).replace(B,"")}function X(e,t,o){let n=h(e),r=h(n,t);return r===n||r.startsWith(n+F)?r:h(n,o)}function T(e,t,o=()=>new Date){if(process.env.CHARDON_DEBUG!=="1")return;let n=t instanceof Error?t.message:t!==void 0?String(t):"";try{let r=o().toISOString();process.stderr.write(`[chardon] ${r} ${e}${n?`: ${n}`:""}
`)}catch{}}var se=q(import.meta.url),{DatabaseSync:ie}=se("node:sqlite");function ae(){process.removeAllListeners("warning"),process.on("warning",e=>{e.name==="ExperimentalWarning"&&e.message.includes("SQLite")||process.stderr.write(`${e.stack??`${e.name}: ${e.message}`}
`)})}ae();var ce=oe(N(re(import.meta.url)),"schema.sql"),C=2;function b(){let e=_();ee(N(e),{recursive:!0});try{Q(te(e,"a",384)),K(e,384)}catch(s){T("db-permissions",s)}let t=new ie(e);t.exec("PRAGMA busy_timeout = 5000"),t.exec("PRAGMA journal_mode = WAL"),t.exec("PRAGMA foreign_keys = ON");let o=ne(ce,"utf-8"),n=le(t);if(n&&t.exec("ALTER TABLE token_usage RENAME TO token_usage_legacy"),t.exec(o),n&&ue(t),de(t))try{t.exec("ALTER TABLE hook_health ADD COLUMN last_error TEXT")}catch(s){if(!String(s.message).includes("duplicate column"))throw s}if(k(t,"sessions","root_hash"))try{t.exec("ALTER TABLE sessions ADD COLUMN root_hash TEXT")}catch(s){if(!String(s.message).includes("duplicate column"))throw s}return t.prepare("PRAGMA user_version").get().user_version!==C&&t.exec(`PRAGMA user_version = ${C}`),t}function le(e){return e.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'token_usage'").get()?!e.prepare("PRAGMA table_info(token_usage)").all().some(n=>n.name==="repo"):!1}function ue(e){e.exec("BEGIN");try{e.exec(`INSERT INTO token_usage
         (date, origin, repo, input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions)
       SELECT date, origin, '', input_tokens, output_tokens, cache_read, cache_creation, nb_messages, nb_sessions
       FROM token_usage_legacy`),e.exec("DROP TABLE token_usage_legacy"),e.exec("COMMIT")}catch(t){throw e.exec("ROLLBACK"),t}}function k(e,t,o){let n=e.prepare(`PRAGMA table_info(${t})`).all();return n.length>0&&!n.some(r=>r.name===o)}function de(e){return k(e,"hook_health","last_error")}function O(e){try{e.close()}catch{}}function x(e,t,o,n,r=3){let s=e.prepare(`SELECT json_extract(e.meta, '$.cmd') AS cmd,
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
       LIMIT 20`).all(t,`-${o}`,r);if(n.length===0)return s;let i=new Set(n);return s.filter(a=>!i.has(a.cmd))}function I(e,t,o,n=3){return e.prepare(`SELECT json_extract(e.meta, '$.file') AS file,
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
       LIMIT 20`).all(t,`-${o}`,n)}var g=168,pe="claude-opus-4-8",me=4096;function L(e,t,o){let n=o.toISOString().slice(0,10),r=3600*1e3,s=new Date(o.getTime()-g*r).toISOString().slice(0,10),i=new Date(o.getTime()-2*g*r).toISOString().slice(0,10),a=x(e,t,g,[]),u=I(e,t,g),E=e.prepare(`SELECT
         COALESCE(SUM(input_tokens), 0) AS input,
         COALESCE(SUM(output_tokens), 0) AS output,
         COALESCE(SUM(cache_read), 0)   AS cacheRead
       FROM token_usage
       WHERE repo = ? AND date >= ?`).get(t,s),d=e.prepare(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total
       FROM token_usage
       WHERE repo = ? AND date >= ? AND date < ?`).get(t,i,s),c=E??{input:0,output:0,cacheRead:0},p=c.input+c.output,l=d?.total??0,v=l>0?Math.round((p-l)/l*100):null;return{repo:t,weekStart:s,weekEnd:n,toil:a,coldReads:u,tokens:c,tokenTrend:{thisWeek:p,lastWeek:l,pct:v}}}function w(e){let t=e.toil.length>0?e.toil.map(r=>`  - "${r.cmd}" repeated ${r.count}x`).join(`
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

Be specific: reference the actual commands and files listed above where relevant.`}async function M(e){if(!process.env.ANTHROPIC_API_KEY)return null;let t="@anthropic-ai/sdk",o;try{o=await import(t)}catch{return null}let n=o.default;try{return(await new n().messages.create({model:process.env.CHARDON_MODEL??pe,max_tokens:me,messages:[{role:"user",content:e}]})).content.filter(i=>i.type==="text").map(i=>i.text).join(`
`)||null}catch{return null}}var $=8e3;function fe(e,t,o){let n=[`# Weekly Workflow Report \xB7 ${t.weekStart} \u2192 ${e}`,"",`**Repository:** ${t.repo}`,"","## Token usage",`- Input: ${t.tokens.input}`,`- Output: ${t.tokens.output}`,`- Cache read: ${t.tokens.cacheRead}`];if(t.tokenTrend){let{thisWeek:r,lastWeek:s,pct:i}=t.tokenTrend,a=i===null?"n/a":`${i>0?"+":""}${i}%`;n.push(`- Week-over-week: ${r} vs ${s} (${a})`)}if(n.push(""),t.toil.length>0){n.push("## Toil loops (repeated identical commands)"),n.push("| Command | Repetitions |"),n.push("|---|---|");for(let r of t.toil)n.push(`| \`${r.cmd}\` | ${r.count} |`);n.push("")}if(t.coldReads.length>0){n.push("## Cold reads (files re-read often)"),n.push("| File | Reads |"),n.push("|---|---|");for(let r of t.coldReads)n.push(`| \`${r.file}\` | ${r.count} |`);n.push("")}if(o!==null){let r=o.length>$?`${o.slice(0,$)}\u2026 (truncated)`:o;n.push("## AI synthesis"),n.push(r),n.push("")}else n.push("> Set ANTHROPIC_API_KEY to enable the weekly synthesis."),n.push("");return n.join(`
`)}function Ae(e){let t=new Date(e.getTime()),o=e.getUTCDay();t.setUTCDate(e.getUTCDate()+(4-(o===0?7:o)));let n=t.getUTCFullYear(),r=new Date(Date.UTC(n,0,4)),s=1+Math.round((t.getTime()-r.getTime())/(10080*60*1e3));return`${n}-W${String(s).padStart(2,"0")}`}async function Se(e){let{projectDir:t,now:o,model:n=M}=e,r=D(t),s=R(t),i=b(),a;try{let c=L(i,s,o),p=w(c),l=await n(p).catch(()=>null);a=fe(c.weekEnd,c,l)}finally{O(i)}let u=he(r.outDir)?r.outDir:y(t,r.outDir);ge(u,{recursive:!0});let E=Ae(o),d=y(u,`weekly-${E}.md`);return Ee(d,a,"utf-8"),{path:d,markdown:a}}if(A("analyze-weekly")){let{path:e}=await Se({projectDir:process.env.CLAUDE_PROJECT_DIR??process.cwd(),now:new Date});console.log(e)}export{Se as generateWeeklyReport,Ae as isoWeekLabel,fe as renderWeeklyReport};
