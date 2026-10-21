import {test} from "node:test";
import assert from "node:assert/strict";
import {validateEdition,stableArticleId} from "../edition.ts";
const edition=()=>({date:"2026-10-21",researchedAt:"2026-10-21T05:00:00Z",items:[{sourceId:"deepseek-blog",sourceName:"DeepSeek",tier:"T1",entity:"deepseek",date:"2026-10-20",url:"https://deepseek.com/blog/example",title:"测试标题",summary:"来源摘要",reason:"核对原因",category:"ai-models",quote:"来源标题",region:"国外",tags:["行业动态"]}]});
test("Codex edition keeps original source dates and rejects unpublishable evidence",()=>{
 assert.equal(stableArticleId("https://example.com/a"),stableArticleId("https://example.com/a"));assert.notEqual(stableArticleId("https://example.com/a"),stableArticleId("https://example.com/b"));
 const d=edition();assert.doesNotThrow(()=>validateEdition(d));assert.equal(d.items[0].date,"2026-10-20");
 for(const update of [{url:"javascript:alert(1)"},{url:"http://localhost/private"},{date:"2099-01-01"},{category:"not-a-category"},{entity:"unknown"},{summary:""}]){const bad=edition();Object.assign(bad.items[0],update);assert.throws(()=>validateEdition(bad));}
 const duplicate=edition();duplicate.items.push({...duplicate.items[0]});assert.throws(()=>validateEdition(duplicate));
 assert.throws(()=>validateEdition({...edition(),date:"2026-10-20"}));
 assert.doesNotThrow(()=>validateEdition({...edition(),date:"2026-10-15",backfill:true}));
 assert.throws(()=>validateEdition({...edition(),date:"2099-01-01",backfill:true}));
 assert.throws(()=>validateEdition({...edition(),items:[]}));
});
