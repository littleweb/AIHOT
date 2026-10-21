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
