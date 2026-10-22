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
  assert.deepEqual(result.items, [prior, item]);
  assert.equal(mergeResearch(edition([prior]), [edition([prior])], now), null);
  assert.equal(mergeResearch(edition([]), [edition([prior])], now), null);
});
test("reject stale articles, historic rewrites and credential-bearing original links", () => {
  assert.throws(() => mergeResearch({ ...edition([item]), backfill: true }, [], now));
  assert.throws(() => mergeResearch(edition([{ ...item, date: new Date(+now - 90000000).toISOString() }]), [], now));
  assert.throws(() => mergeResearch(edition([{ ...item, url: "https://example.com/note?xsec_token=private" }]), [], now));
});
