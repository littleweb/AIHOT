// Reuse the original public metadata and poster renderer; static readers need no API.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { beijingDate } from "@aihot/contracts/time";
import { ITEM_COPY, withSubject } from "@aihot/site";

export async function adaptShareCard(page: URL, output: string, publishedUrl: string) {
  const match = /^\/items\/([a-zA-Z0-9_-]+)\/?$/.exec(page.pathname);
  if (!match) return;
  const id = match[1]!;
  const response = await fetch(new URL(`/api/site/items/${encodeURIComponent(id)}`, page), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Public share metadata ${id}: ${response.status}`);
  const item = await response.json() as SiteItemDetail;
  if (item.id !== id || !item.title) throw new Error("Invalid public share metadata");
  const url = `${publishedUrl}${page.pathname.replace(/\/$/, "")}/index.html`;
  // Imported only after the export command selects SITE_URL, so the original
  // renderer prints the published host rather than the loopback SSR server.
  const { renderPoster } = await import("../../packages/backend/src/media/poster.ts");
  const { png } = await renderPoster({ url, title:item.title, summary:item.summary,
    kicker:item.category ? CATEGORY_LABELS[item.category] : withSubject("动态"),
    source:item.source.name, date:beijingDate(item.timelineAt),
    score:item.selected && ITEM_COPY.showScore ? item.score : null });
  await mkdir(path.join(output,"og/posters"),{recursive:true});
  await writeFile(path.join(output,"og/posters",`${id}.png`),png);
  return item;
}
