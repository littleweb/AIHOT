import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {beijingDate} from '@aihot/contracts/time';
import {loadTopicPage} from '@aihot/backend/publication/topics';
import {closeDb} from '@aihot/backend/db';
import {stopBoss} from '@aihot/backend/jobs/queue';
import {stableArticleId} from '../edition.ts';
after(async()=>{await stopBoss();await closeDb();});
test('Codex import appears in company and field topics after editorial overrides',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shendeng-topic-'));
 const now=new Date();const url='https://example.com/source-checked-openai-agent';
 const file=path.join(dir,'edition.json');
 const item={sourceId:'test-shendeng-codex',sourceName:'Test editorial source',tier:'T1',entity:'hugging-face',subjects:['openai'],date:new Date(+now-3600000).toISOString(),url,title:'OpenAI 智能体实践',summary:'来源核对后的中文摘要',reason:'核对原文',category:'ai-models',quote:'Source evidence',tags:['模型发布','Agent'],region:'国外'};
 try{
  await writeFile(file,JSON.stringify({date:beijingDate(now),researchedAt:now.toISOString(),items:[item]}));
  const imported=spawnSync(process.execPath,['modules/shendeng/import-reviewed.ts',file,'--codex'],{encoding:'utf8',timeout:30000});
  assert.equal(imported.status,0,imported.stderr);
  const id=stableArticleId(url);
  for(const slug of ['openai','agent']){
   const page=await loadTopicPage(slug,1,new Date());
   assert.ok(page?.items.some(i=>i.id===id),`${slug} contains the imported article`);
  }
  const publisher=await loadTopicPage('hugging-face',1,new Date());
  assert.ok(!publisher?.items.some(i=>i.id===id),'publisher ownership is not article subject');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('verified independent reports form the native hot event, remain grouped on reimport, and keep admission time',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'shendeng-event-'));
 const now=new Date(), addedAt=now.toISOString(), date=new Date(+now-3600000).toISOString();
 const event={key:'test-codex-verified-launch',title:'可核验的同一产品发布'};
 const base={tier:'T2',entity:null,date,addedAt,event,title:'产品发布的来源报道',summary:'两个独立来源核对同一具体发布。',reason:'Codex 来源核对',category:'ai-products',quote:'same launch',tags:['产品更新'],region:'国外'};
 const items=[{...base,sourceId:'test-event-one',sourceName:'Independent One',url:'https://example.com/verified-launch'},
  {...base,sourceId:'test-event-two',sourceName:'Independent Two',url:'https://example.org/verified-launch',selected:false}];
 const file=path.join(dir,'edition.json');
 try{
  await writeFile(file,JSON.stringify({date:beijingDate(now),researchedAt:addedAt,items}));
  for(let n=0;n<2;n++){
   const result=spawnSync(process.execPath,['modules/shendeng/import-reviewed.ts',file,'--codex'],{encoding:'utf8',timeout:30000});
   assert.equal(result.status,0,result.stderr);
  }
  const {sql}=await import('@aihot/backend/db');
  const [row]=await sql`SELECT p.timeline_at,p.fact_id FROM publications p WHERE p.article_id=${stableArticleId(items[0].url)}`;
  assert.equal(row.timeline_at.toISOString(),addedAt);
  const members=await sql`SELECT article_id FROM fact_articles WHERE fact_id=${row.fact_id}`;
  assert.equal(members.length,2);
  const {latestHotRanking}=await import('@aihot/backend/publication/hot');
  const ranking=await latestHotRanking();
  const hot=ranking?.entries.find(e=>e.title===event.title);
  assert.equal(hot?.participantCount,2,'native independent-participant threshold, no invented heat');
  assert.equal(hot?.reportCount,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
