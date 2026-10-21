// Import the source-verified stories reviewed during the initial setup, with no model score.
// Source dates are preserved. --codex accepts local Codex research, explicitly labelled without human review.
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import type { EditionEntry } from "@aihot/backend/reports/edition";
import { validateEdition, stableArticleId } from "./edition.ts";
import { readFile } from "node:fs/promises";
import { detachFromFact } from "@aihot/backend/events/corrections";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { overrideFields } from "@aihot/backend/admin/content";
import { dailyEdition, arrangeDaily, sectionOf, SECTION_ORDER } from "@aihot/backend/reports/edition";
import { dailyMetrics } from "@aihot/backend/reports/compose";
import { beijingDate, beijingAt, addDays } from "@aihot/contracts/time";
import { EDITION_TIMES } from "@aihot/site";
import { stopBoss } from "@aihot/backend/jobs/queue";
const source = process.argv[2];
if (!source) throw new Error("Usage: node --env-file=.env modules/shendeng/import-reviewed.ts <reviewed.json>");
const codex = process.argv.includes("--codex");
const document = JSON.parse(await readFile(source, "utf8"));
if(codex) validateEdition(document);
const entries = (codex ? document.items : document) as Array<{id?:string;sourceId:string;sourceName:string;tier:string;entity:string|null;video?:string;region?:string;date:string;url:string;title:string;summary:string;reason:string;category:string;quote:string;image?:string;tags?:string[]}>;
const imported: Array<{id:string;source:typeof entries[number]}> = [];
for (const a of entries) {
  await sql`INSERT INTO sources(id,name,kind,tier,owner_entity_id,participation_mode,enabled,site_fulltext,syndicate_fulltext) VALUES(${a.sourceId},${a.sourceName},'external',${a.tier},${a.entity},'editorial',false,false,false) ON CONFLICT(id) DO NOTHING`;
  const {articleId:id}=await upsertMaterial({id:a.id??stableArticleId(a.url),sourceId:a.sourceId,url:a.url,title:a.title,publishedAt:new Date(a.date),publicationTime:a.date,bodyText:a.quote,bodyStatus:"ok",via:"import",backfill:document.backfill?"source-checked-historical-archive":null,raw:{editorialReview:!codex,codexResearch:codex,originalDate:a.date,video:a.video??null},media:a.image?[{kind:"image",url:a.image}]:[]});
  const [{revision}]=await sql<{revision:number}[]>`SELECT revision FROM articles WHERE id=${id}`;
  const [prior]=await sql`SELECT 1 FROM analyses WHERE article_id=${id} AND input_revision=${revision}`;
  if(!prior)
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,reason_zh,score,selected,tags,subjects,output) VALUES(${id},${revision},'rule','pass',${a.category},${a.title},${a.summary},${a.reason},null,false,${a.tags??['行业动态']},${a.entity?[a.entity]:[]},${sql.json({manualReview:!codex,codexResearch:codex,source:a.url})})`;
  await detachFromFact(id,codex?"本地 Codex 核对公开来源，作为独立报道导入":"迁移时逐条人工核实为独立报道，后续自动采集不得重写该决定",codex?"shendeng-codex":"shendeng-setup");
  await overrideFields(id,{fields:{title:a.title,summary:a.summary,reason:a.reason,category:a.category,tags:a.tags??["行业动态"],selected:true,score:null},version:Number((await sql`SELECT version FROM editorial_overrides WHERE article_id=${id}`)[0]?.version ?? 0),reason:codex?'本地 Codex 检索并核对公开来源，不代表原评分模型评分':'首次站点迁移：逐条核对原文的人工编辑导入，不代表模型评分'},codex?'shendeng-codex':'shendeng-setup');
  // This archive is indexed by verified source publication date, including historical backfill.
  if(codex) {
    await sql`UPDATE articles SET timeline_at=${new Date(a.date)} WHERE id=${id}`;
    await publishArticle(id);
  }
  imported.push({id,source:a});
  console.log('Imported source:',a.url);
}
const researched=codex?new Date(document.researchedAt):new Date(),date=codex?document.date:beijingDate(researched);
// Backfilled issues cover their full Beijing calendar date; current-day issues stop at actual research time.
const start=codex&&document.backfill?beijingAt(date,"00:00"):beijingAt(addDays(date,-1),EDITION_TIMES.daily);
const nextDay=beijingAt(addDays(date,1),"00:00");
const end=codex&&document.backfill?new Date(Math.min(+researched,+nextDay)):researched;
const codexEntries: EditionEntry[] = [];
if(codex) for(const {id,source:a} of imported){
 const result=await loadItemDetail(id);if(result.kind!=="found"||!result.item.selected)throw new Error(`Source is not publicly selectable: ${a.url}`);
 const i=result.item;if(Date.parse(a.date)<+start||Date.parse(a.date)>=+end)continue;
 codexEntries.push({entry:{itemId:i.id,factId:null,storyPublicId:null,title:i.title,summary:i.summary??"",sourceName:i.source.name,sourceUrl:i.links.original,sourceId:a.sourceId,firstParty:a.tier==="T1",role:a.tier==="T1"?"官方":"媒体",score:null,publishedAt:a.date,sources:1},category:i.category,tags:i.tags,storyId:null,mentions:new Set(),sourceIds:new Set([a.sourceId]),authority:a.tier==="T1"?0:3,importance:entries.length-codexEntries.length,previous:null});
}
const edition=codex?{entries:codexEntries}:await dailyEdition(date,start,end);const issue=arrangeDaily(edition.entries);const [lead,...rest]=issue.main;
if(lead){const content={date,lead:{title:lead.entry.title,leadParagraph:(codex?(document.backfill?"历史回填：按原始发布日期整理，来源于本次 Codex 检索，未经人工逐条审阅。":"本地 Codex 检索日报：已核对公开来源，未经人工逐条审阅。"):"首次迁移特刊：本期基于人工核实资料编排，尚未启用自动采集。")+lead.entry.summary},leadItemId:lead.entry.itemId,highlights:rest.slice(0,3).map(e=>e.entry.itemId),sections:SECTION_ORDER.map(label=>({label,items:issue.main.filter(e=>sectionOf(e.category)===label).map(e=>e.entry)})).filter(s=>s.items.length),flashes:issue.flashes.map(e=>e.entry),metrics:dailyMetrics(issue.main),windowStart:start.toISOString(),windowEnd:end.toISOString(),generator:{manualReview:!codex,codexResearch:codex,researchedAt:codex?document.researchedAt:null,backfill:document.backfill===true}};
await sql`INSERT INTO reports(kind,key,window_start,window_end,content,origin,generated_at) VALUES('daily',${date},${start},${end},${sql.json(content as never)},'manual',now()) ON CONFLICT(kind,key) DO UPDATE SET content=EXCLUDED.content,window_start=EXCLUDED.window_start,window_end=EXCLUDED.window_end,generated_at=EXCLUDED.generated_at WHERE reports.origin='manual' AND ${codex}`;}
if(codex&&!lead)throw new Error("No publishable source in this edition window; preserve previous site");
await stopBoss();await closeDb();
