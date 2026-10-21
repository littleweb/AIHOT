import { load } from "cheerio";
export interface RankingRow { rank: number; name: string; owner: string; value: number; displayValue: string; url: string; context?: string; cost?: string; speed?: string }
export interface RankingSnapshot { kind: "models" | "skills"; capturedAt: string; sourceName: string; sourceUrl: string; metric: string; rows: RankingRow[] }
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
export function validateSnapshot(s: RankingSnapshot) {
  if (!["models", "skills"].includes(s.kind) || !Number.isFinite(Date.parse(s.capturedAt)) || !s.rows.length) throw new Error("Invalid ranking snapshot");
  const urls = new Set<string>();
  let prior = 0;
  for (const row of s.rows) {
    const url = new URL(row.url);
    if (!row.name || urls.has(row.url) || !Number.isInteger(row.rank) || row.rank <= prior || !Number.isFinite(row.value) || row.value < 0 || !row.displayValue || url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid ranking row");
    urls.add(row.url); prior = row.rank;
  }
}
export function parseModels(html: string, limit: number): RankingRow[] {
  const $ = load(html);
  const table = $("table").filter((_i, el) => clean($(el).find("thead").text()).includes("Artificial Analysis Intelligence Index")).first();
  if (!table.length) throw new Error("Model ranking table changed; preserve the previous snapshot");
  return table.find("tbody tr").slice(0, limit).map((i, tr) => {
    const cells = $(tr).find("td");
    if (cells.length !== 9) throw new Error("Model ranking columns changed");
    const name = clean(cells.eq(0).text());
    const score = clean(cells.eq(3).text());
    const href = cells.last().find('a[href^="/models/"]').first().attr("href");
    if (!href || !/^\d+(?:\.\d+)?$/.test(score)) throw new Error("Missing model evidence");
    return { rank: i + 1, name, owner: clean(cells.eq(2).text()), value: Number(score), displayValue: score, url: new URL(href, "https://artificialanalysis.ai").href, context: clean(cells.eq(1).text()), cost: clean(cells.eq(4).text()), speed: clean(cells.eq(5).text()) };
  }).get();
}
export function parseSkills(html: string, limit: number): RankingRow[] {
  const $ = load(html);
  return $("a[href]").filter((_i, a) => /^\/[^/]+\/[^/]+\/[^/]+$/.test($(a).attr("href")!) && $(a).find("h3").length === 1 && $(a).find("p").length === 1).slice(0, limit).map((_i, a) => {
    const link = $(a); const rank = Number(clean(link.children().first().text()));
    const displayValue = clean(link.children().last().find("span").last().text());
    const match = /^(\d+(?:\.\d+)?)([KM]?)$/.exec(displayValue);
    if (!match) throw new Error("Skill install count changed");
    return { rank, name: clean(link.find("h3").text()), owner: clean(link.find("p").text()), value: Number(match[1]) * (match[2] === "M" ? 1e6 : match[2] === "K" ? 1e3 : 1), displayValue, url: new URL(link.attr("href")!, "https://www.skills.sh").href };
  }).get();
}
