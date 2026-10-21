// Research input only: source feed text is never an automatically selected publication.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fetchRss} from '@aihot/backend/sources/rss';
import type {SourceRow} from '@aihot/backend/sources/types';
if(process.env.COLLECT_ENABLED !== 'true')throw new Error('Explicit COLLECT_ENABLED=true required');
const {sources}=JSON.parse(await readFile('industry/sources.json','utf8'));
const results=[];
for(let n=0;n<sources.length;n+=5){results.push(...await Promise.all(sources.slice(n,n+5).map(async(s:any)=>{
 try{const r=await fetchRss({enabled:true,cursor:null,fail_count:0,first_party:s.tier==='T1',...s} as SourceRow,{force:true});
 return {sourceId:s.id,sourceName:s.name,tier:s.tier,entity:s.owner_entity_id,items:r.candidates.map(c=>({url:c.url,title:c.title,date:c.publishedAt?.toISOString()??null,excerpt:(c.excerpt??c.bodyText??'').slice(0,2200)}))};
 }catch(e){return {sourceId:s.id,sourceName:s.name,error:String(e)}}
})));}
await mkdir('.data',{recursive:true});await writeFile('.data/candidates.json',JSON.stringify({researchedAt:new Date().toISOString(),sources:results},null,2));
console.log('Research candidates saved; no public content written');
