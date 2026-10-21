// Public-page snapshots only. Never runs a skill, installs software or calls paid APIs.
import { mkdir, writeFile, rename } from "node:fs/promises";
import { parseModels, parseSkills, validateSnapshot, type RankingSnapshot } from "./data.ts";
import config from "../../site/rankings.json" with { type: "json" };
let failed = false;
for (const kind of ["models", "skills"] as const) {
  try {
    const source = config[kind];
    const response = await fetch(source.url, { headers: { "User-Agent": "ShendengNews/1.0 (+https://shendeng.news/)" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    const rows = (kind === "models" ? parseModels : parseSkills)(await response.text(), source.limit);
    if (rows.length !== source.limit) throw new Error(`Expected ${source.limit} entries, received ${rows.length}`);
    const snapshot: RankingSnapshot = { kind, capturedAt: new Date().toISOString(), sourceName: source.sourceName, sourceUrl: source.url, metric: source.metric, rows };
    validateSnapshot(snapshot);
    const target = new URL(`../../site/rankings/${kind}.json`, import.meta.url);
    await mkdir(new URL("../../site/rankings/", import.meta.url), { recursive: true });
    const temp = new URL(`${target.href}.tmp`);
    await writeFile(temp, JSON.stringify(snapshot, null, 2) + "\n"); await rename(temp, target);
    console.log(`${kind}: refreshed ${rows.length} entries`);
  } catch (error) { failed = true; console.error(`${kind}: refresh failed; previous snapshot unchanged: ${String(error)}`); }
}
if (failed) process.exitCode = 1;
