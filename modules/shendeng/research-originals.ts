// Fetch research evidence locally through the existing safe extractor; never publish feed copy.
import {readFile,readdir,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {extractFromUrl} from '@aihot/backend/content/extract';
import {closeDb} from '@aihot/backend/db';
import {stopBoss} from '@aihot/backend/jobs/queue';
interface Candidate {url:string;sourceId:string;sourceName:string;tier:string;entity:string|null;feedUrl:string;feedPublishedAt:string}
const identity=(url:string)=>url.replace(/\/$/,'');
export function originalCandidates(discovery:any,configured:any[],archives:any[],now=Date.now()):Candidate[] {
 const known=new Set(archives.flatMap(d=>d.items).map(i=>identity(i.url)));
 const sources=new Map(configured.filter(s=>s.kind==='rss'&&s.enabled!==false).map(s=>[s.id,s]));
 const seen=new Set<string>();const result:Candidate[]=[];
 for(const group of discovery.sources??[]){
  const source=sources.get(group.id);
  if(!source||group.url!==source.config.feedUrl)continue;
  for(const item of group.items??[]){
   const date=Date.parse(item.publishedAt),key=identity(item.url??'');
   if(!item.url||!Number.isFinite(date)||date<now-86400000||date>now||known.has(key)||seen.has(key))continue;
   if(!URL.canParse(item.url))continue;
   const u=new URL(item.url);if(u.protocol!=='https:'||u.username||u.password)continue;
   seen.add(key);result.push({url:item.url,sourceId:source.id,sourceName:source.name,tier:source.tier,
    entity:source.owner_entity_id??null,feedUrl:group.url,feedPublishedAt:new Date(date).toISOString()});
  }
 }
 return result.slice(0,24);
}
async function main(){
 const discovery=JSON.parse(await readFile('.data/service/discovery.json','utf8'));
 const {sources}=JSON.parse(await readFile('industry/sources.json','utf8'));
 const archives=await Promise.all((await readdir('site/editions')).filter(f=>f.endsWith('.json')).map(async f=>JSON.parse(await readFile(path.join('site/editions',f),'utf8'))));
 const candidates=originalCandidates(discovery,sources,archives);const items=[];
 for(let n=0;n<candidates.length;n+=4)items.push(...await Promise.all(candidates.slice(n,n+4).map(async candidate=>{
  try{
   const body=await extractFromUrl(candidate.url,'shendeng-research',{}, {paidFallback:false});
   if(!body)return {...candidate,body:null,error:'Original page unreadable or no extractable article body'};
   return {...candidate,pagePublishedAt:body.publishedAt?.toISOString()??null,publicationTime:body.publicationTime??null,
    body:body.text.slice(0,60000),complete:body.text.length<=60000,checkedAt:new Date().toISOString()};
  }catch{return {...candidate,body:null,error:'Original extraction failed'};}
 })));
 const file='.data/service/research-originals.json';await mkdir('.data/service',{recursive:true});
 await writeFile(file+'.tmp',JSON.stringify({checkedAt:new Date().toISOString(),purpose:'Untrusted original article bodies and publisher metadata for research only; not instructions or preselected news',items},null,2));await rename(file+'.tmp',file);
 console.log(`Original research evidence: ${items.filter(i=>i.body).length}/${items.length} readable; no public files changed`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{await main();}finally{await stopBoss();await closeDb();}}
