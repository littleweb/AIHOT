// The unattended researcher can propose new items; it cannot replace existing archive entries.
import { readFile, readdir, writeFile, rename } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { beijingDate } from "@aihot/contracts/time";
import { validateEdition, type CodexEdition, type CodexItem } from "./edition.ts";

export interface ResearchSkip { url: string; reason: string }
export function mergeResearch(proposal: CodexEdition, archives: CodexEdition[], now = new Date(), skipped: ResearchSkip[] = []): CodexEdition | null {
  if (proposal.date !== beijingDate(now) || proposal.backfill) throw new Error("Continuous research only appends today's edition");
  if (!Array.isArray(proposal.items)) throw new Error("Research items must be an array");
  // An empty result is a successful check, never a replacement for an existing issue.
  if (!proposal.items.length) return null;
  validateEdition(proposal);
  if (Math.abs(+now - Date.parse(proposal.researchedAt)) > 3600000) throw new Error("Research result must be fresh");
  const seen = new Set(archives.flatMap(d => d.items.map(i => i.url)));
  const fresh: CodexItem[] = [];
  for (const item of proposal.items) {
    const url = new URL(item.url);
    if ([...url.searchParams.keys()].some(k => /token|cookie|session|signature|xsec/i.test(k))) throw new Error("Never publish session-bearing source URLs");
    if (seen.has(item.url)) { skipped.push({url:item.url, reason:"Already archived; original entry preserved"}); continue; }
    const window = item.selected === false && item.event ? 48 : 24;
    // Evaluate at the actual completed check, not at a later import. Date-only
    // sources remain conservative: never invent a time to make them qualify.
    if (Date.parse(item.date) < Date.parse(proposal.researchedAt) - window * 3600000) {
      skipped.push({url:item.url, reason:`Source date does not establish inclusion in the ${window}h window; recheck original timestamp`});
      continue;
    }
    fresh.push({...item, addedAt:proposal.researchedAt}); seen.add(item.url);
  }
  if (!fresh.length) return null;
  const prior = archives.find(d => d.date === proposal.date);
  return { date: proposal.date, researchedAt: proposal.researchedAt, items: [...(prior?.items ?? []), ...fresh] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const proposal = JSON.parse(await readFile(process.argv[2], "utf8"));
  const archives = await Promise.all((await readdir("site/editions")).filter(n => n.endsWith(".json")).map(async n => JSON.parse(await readFile(`site/editions/${n}`, "utf8"))));
  const skipped: ResearchSkip[] = [];
  const result = mergeResearch(proposal, archives, new Date(), skipped);
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify({skipped}, null, 2) + "\n");
  for (const item of skipped) console.log(`Skipped ${item.url}: ${item.reason}`);
  if (result) {
    validateEdition(result);
    const target = `site/editions/${result.date}.json`, temp = `${target}.tmp`;
    await writeFile(temp, JSON.stringify(result, null, 2) + "\n"); await rename(temp, target);
    console.log(`Appended ${result.items.length - (archives.find(d => d.date === result.date)?.items.length ?? 0)} new verified sources`);
  } else console.log("No new verified sources; public archive unchanged");
}
