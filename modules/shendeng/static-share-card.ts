// Reuse the original public metadata and poster renderer; static readers need no API.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { beijingDate } from "@aihot/contracts/time";
import { ITEM_COPY, withSubject } from "@aihot/site";

const posters = new Map<string, Promise<void>>();

async function loadItem(page: URL, id: string, language = "") {
  const response = await fetch(new URL(`/api/site/items/${encodeURIComponent(id)}${language}`, page), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Public share metadata ${id}: ${response.status}`);
  const item = await response.json() as SiteItemDetail;
  if (item.id !== id || !item.title) throw new Error("Invalid public share metadata");
  return item;
}

export async function adaptShareCard(page: URL, output: string, publishedUrl: string) {
  const match = /^\/items\/([a-zA-Z0-9_-]+)(\/original)?\/?$/.exec(page.pathname);
  if (!match) return;
  const id = match[1]!;
  const language = match[2];
  const item = await loadItem(page, id, language);
  const posterFile = path.join(output, "og/posters", `${id}.png`);
  let poster = posters.get(posterFile);
  if (!poster) {
    poster = (async () => {
      // The original language route can be exported first in a concurrent run.
      const canonicalItem = language ? await loadItem(page, id) : item;
      await writePoster(posterFile, `${publishedUrl}/items/${id}/index.html`, canonicalItem);
    })();
    posters.set(posterFile, poster);
  }
  await poster;
  return item;
}

async function writePoster(posterFile: string, url: string, item: SiteItemDetail) {
  // Imported after the export command sets SITE_URL, so the renderer prints the public host.
  const { renderPoster } = await import("../../packages/backend/src/media/poster.ts");
  const { png } = await renderPoster({ url, title:item.title, summary:item.summary,
    kicker:item.category ? CATEGORY_LABELS[item.category] : withSubject("动态"),
    source:item.source.name, date:beijingDate(item.timelineAt),
    score:item.selected && ITEM_COPY.showScore ? item.score : null });
  await mkdir(path.dirname(posterFile), {recursive:true});
  await writeFile(posterFile, png);
}
