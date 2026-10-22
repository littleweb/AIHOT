import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeResearch } from "../merge-research.ts";
import type { CodexEdition, CodexItem } from "../edition.ts";

const now = new Date();
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
const item: CodexItem = { sourceId: "test-source", sourceName: "Source", tier: "T1", entity: null, date: new Date(+now - 1000).toISOString(), url: "https://example.com/new", title: "已核实的新内容", summary: "摘要", reason: "来源核对", category: "ai-products", quote: "evidence", region: "国外", tags: ["产品更新"] };
const edition = (items: CodexItem[]): CodexEdition => ({ date, researchedAt: now.toISOString(), items });
test("incremental research preserves existing entries and skips URLs already archived", () => {
  const prior = { ...item, url: "https://example.com/old", title: "旧标题" };
  const result = mergeResearch(edition([item, { ...prior, title: "不应覆盖" }]), [edition([prior])], now)!;
  assert.deepEqual(result.items, [prior, {...item,addedAt:now.toISOString()}]);
  assert.equal(mergeResearch(edition([prior]), [edition([prior])], now), null);
  assert.equal(mergeResearch(edition([]), [edition([prior])], now), null);
});
test("reject historic rewrites and credential-bearing original links", () => {
  assert.throws(() => mergeResearch({ ...edition([item]), backfill: true }, [], now));
  assert.throws(() => mergeResearch(edition([{ ...item, url: "https://example.com/note?xsec_token=private" }]), [], now));
});
test("stale or already archived candidates cannot block valid new sources", () => {
  const stale = {...item, url:"https://example.com/stale", date:new Date(+now-49*3600000).toISOString()};
  const archived = {...stale, url:"https://example.com/archived", title:"保留旧内容"};
  const skipped: {url:string;reason:string}[] = [];
  const result = mergeResearch(edition([stale, {...archived,title:"不得替换"}, item]), [edition([archived])], now, skipped)!;
  assert.deepEqual(result.items, [archived,{...item,addedAt:now.toISOString()}]);
  assert.deepEqual(skipped.map(s=>s.url),[stale.url,archived.url]);
  assert.equal(mergeResearch(edition([stale]), [], now),null);
});
test("use the actual research window and allow 48h only for event corroboration", () => {
  const checked = new Date(+now-30*60000);
  const edge = {...item,date:new Date(+checked-24*3600000+1000).toISOString()};
  assert.ok(mergeResearch({...edition([edge]),researchedAt:checked.toISOString()},[],now));
  const old = {...item,date:new Date(+now-30*3600000).toISOString(),selected:false};
  assert.equal(mergeResearch(edition([old]),[],now),null);
  assert.ok(mergeResearch(edition([{...old,event:{key:"verified-event",title:"交叉核对事件"}}]),[],now));
});
