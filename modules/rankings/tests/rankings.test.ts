import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { parseModels, parseSkills, validateSnapshot, type RankingSnapshot } from "../data.ts";
import { loader } from "../web/loader.ts";
import { rankingsServer } from "../server.ts";

const modelHtml = `<table><thead><tr><th>Artificial Analysis Intelligence Index</th></tr></thead><tbody><tr>${["Model X (high)", "200k", "Example", "57.2", "$2.00", "100", "1", "2", '<a href="/models/model-x">Details</a>'].map(v => `<td>${v}</td>`).join("")}</tr></tbody></table>`;
const skillHtml = (rank: number, name: string, count: string) => `<a href="/owner/repo/${name}"><div>${rank}</div><div><h3>${name}</h3><p>owner/repo</p></div><div><span>12</span><span>${count}</span></div></a>`;

test("model parser preserves reasoning configuration, original score and evidence URL", () => {
  const [row] = parseModels(modelHtml, 10);
  assert.equal(row.name, "Model X (high)");
  assert.equal(row.owner, "Example");
  assert.equal(row.value, 57.2);
  assert.equal(row.context, "200k");
  assert.equal(row.url, "https://artificialanalysis.ai/models/model-x");
  assert.throws(() => parseModels(modelHtml.replace("57.2", "—"), 10), /Missing model evidence/);
  assert.throws(() => parseModels(modelHtml.replace("<td>2</td>", ""), 10), /columns changed/);
  assert.throws(() => parseModels("<p>No ranking</p>", 10), /table changed/);
});

test("skills parser keeps source order and rounded install counts distinct from chart values", () => {
  const rows = parseSkills(skillHtml(1, "skill-a", "1.2M") + skillHtml(2, "skill-b", "1.2M") + skillHtml(3, "skill-c", "54.3K"), 3);
  assert.deepEqual(rows.map(r => [r.rank, r.name, r.displayValue, r.value]), [[1, "skill-a", "1.2M", 1200000], [2, "skill-b", "1.2M", 1200000], [3, "skill-c", "54.3K", 54300]]);
  assert.equal(rows[0].url, "https://www.skills.sh/owner/repo/skill-a");
  assert.throws(() => parseSkills(skillHtml(1, "bad", "unknown"), 1), /install count changed/);
});

test("snapshot validation rejects empty, duplicate and unsafe ranking evidence", () => {
  const snapshot: RankingSnapshot = { kind: "models", capturedAt: "2026-10-21T05:00:00Z", sourceName: "Example", sourceUrl: "https://example.com/", metric: "Index", rows: parseModels(modelHtml, 1) };
  validateSnapshot(snapshot);
  assert.throws(() => validateSnapshot({ ...snapshot, rows: [] }));
  assert.throws(() => validateSnapshot({ ...snapshot, rows: [snapshot.rows[0], { ...snapshot.rows[0], rank: 2 }] }));
  assert.throws(() => validateSnapshot({ ...snapshot, rows: [{ ...snapshot.rows[0], url: "javascript:alert(1)" }] }));
});

test("public ranking endpoints serve validated local snapshots with source and capture time", async () => {
  const app = Fastify();
  // The module HTTP hook has no database or request-time third-party dependency.
  await rankingsServer.http!(app);
  try {
    for (const kind of ["models", "skills"] as const) {
      const response = await app.inject({ method: "GET", url: `/api/site/rankings/${kind}` });
      assert.equal(response.statusCode, 200);
      const snapshot = response.json<RankingSnapshot>();
      assert.equal(snapshot.kind, kind);
      assert.ok(snapshot.sourceUrl.startsWith("https://"));
      assert.ok(Number.isFinite(Date.parse(snapshot.capturedAt)));
      validateSnapshot(snapshot);
      assert.match(response.headers["cache-control"]!, /public/);
    }
  } finally { await app.close(); }
});

// React Router's client navigation requests use .data URLs rather than HTML paths.
test("HTML and client navigation load the requested ranking, including single-fetch URLs", async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify({ kind: url.endsWith("/skills") ? "skills" : "models" }), { headers: { "content-type": "application/json" } });
  });
  for (const path of ["/skills", "/skills.data", "/leaderboard", "/leaderboard.data"]) {
    const result = await loader({ request: new Request(`https://shendeng.news${path}`) });
    const kind = path.startsWith("/skills") ? "skills" : "models";
    assert.equal(result.data.kind, kind);
    assert.ok(urls.at(-1)!.endsWith(`/api/site/rankings/${kind}`));
  }
});
