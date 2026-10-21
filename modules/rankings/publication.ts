// The module's public read layer: expose only validated, locally published snapshots.
import { readFile } from "node:fs/promises";
import { validateSnapshot, type RankingSnapshot } from "./data.ts";
export async function readRanking(kind: "models" | "skills"): Promise<RankingSnapshot> {
  const snapshot = JSON.parse(await readFile(new URL(`../../site/rankings/${kind}.json`, import.meta.url), "utf8")) as RankingSnapshot;
  validateSnapshot(snapshot);
  if (snapshot.kind !== kind) throw new Error("Ranking kind mismatch");
  return snapshot;
}
