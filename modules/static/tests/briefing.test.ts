import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { config } from "@aihot/backend/config";
import { publicHttpUrl, readBriefing } from "@aihot/backend/publication/briefing";
import type { SourceRow } from "@aihot/backend/sources/types";

test("static publication rejects executable URLs and embedded credentials", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "https://user:password@example.com"]) assert.equal(publicHttpUrl(url), null);
  assert.equal(publicHttpUrl("https://example.com/news?q=ai"), "https://example.com/news?q=ai");
});
test("static edition filters old and future dates, deduplicates links and exposes failed feeds", async () => {
  const item = (url: string, date = "") => `<item><title>AI news &amp; research</title><link>https://example.com/${url}</link>${date ? `<pubDate>${date}</pubDate>` : ""}</item>`;
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/rss+xml");
    res.end(req.url === "/broken" ? "not a feed" : `<rss version="2.0"><channel><title>AI</title>${item("recent", "Wed, 21 Oct 2026 00:00:00 GMT")}${item("recent", "Wed, 21 Oct 2026 00:00:00 GMT")}${item("old", "Wed, 01 Jan 2020 00:00:00 GMT")}${item("future", "Wed, 21 Oct 2037 00:00:00 GMT")}${item("undated")}</channel></rss>`);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const previous = config.allowPrivateNetworkFetch;
  config.allowPrivateNetworkFetch = true;
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const source = (id: string, enabled = true, mode: SourceRow["participation_mode"] = "editorial"): SourceRow => ({ id, name: id, kind: "rss", config: { feedUrl: `${base}/${id}` }, tier: "T2", first_party: false, participation_mode: mode, interval_minutes: 120, enabled, cursor: null, fail_count: 0 });
  try {
    const result = await readBriefing([source("good"), source("broken"), source("disabled", false), source("isolated", true, "isolated")], new Date("2026-10-21T07:00:00Z"));
    assert.deepEqual(result.entries.map(e => e.url), ["https://example.com/recent", "https://example.com/undated"]);
    assert.equal(result.entries[1].publishedAt, null);
    assert.equal(result.entries[0].title, "AI news & research");
    assert.deepEqual(result.sources.map(s => s.ok), [true, false]);
    assert.match(result.sources[1].error!, /RSS/);
  } finally {
    config.allowPrivateNetworkFetch = previous;
    await new Promise<void>(r => server.close(() => r()));
  }
});
