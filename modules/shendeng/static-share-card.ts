// Reuse the original public metadata and poster renderer; static readers need no API.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheerioAPI } from "cheerio";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { beijingDate } from "@aihot/contracts/time";
import { ITEM_COPY, withSubject } from "@aihot/site";

export async function adaptShareCard($: CheerioAPI, page: URL, output: string, prefix: string, publishedUrl: string) {
  const match = /^\/items\/([a-zA-Z0-9_-]+)\/?$/.exec(page.pathname);
  if (!match) return;
  const buttons = $("button").filter((_i, el) => $(el).text().trim() === "分享卡片");
  if (buttons.length !== 2) throw new Error("Upstream detail share controls changed; review static card adapter");
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
  const folder = path.join(output, "assets/share-cards");
  await mkdir(folder, {recursive:true});
  await writeFile(path.join(folder, `${id}.png`), png);
  const src = `${prefix}/assets/share-cards/${id}.png`;
  buttons.removeAttr("disabled title").attr("data-share-card", "").attr("aria-haspopup", "dialog").attr("aria-controls", "share-card-dialog");
  const dialog = $("<dialog>").attr({id:"share-card-dialog", "aria-labelledby":"share-card-title"});
  dialog.append('<header><h2 id="share-card-title">分享卡片</h2><button type="button" data-close-share-card aria-label="关闭分享卡片">×</button></header>');
  dialog.append($("<img>").attr({src, alt:`${item.title} · 分享卡片`, width:"1080", height:"1440", loading:"lazy"}));
  dialog.append('<p>长按图片保存，或点击下方按钮下载</p>');
  dialog.append($("<a>").attr({href:src,download:`share-${id}.png`}).text("保存图片"));
  $("body").append(dialog);
  $("head").append(`<style>
    #share-card-dialog{box-sizing:border-box;width:min(420px,calc(100% - 24px));max-height:92dvh;overflow:auto;margin:auto;padding:16px;border:1px solid var(--line);border-radius:20px;background:var(--surface,#fff);color:var(--ink,#0e191b);box-shadow:0 20px 80px #0004}
    #share-card-dialog::backdrop{background:#0008}
    #share-card-dialog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    #share-card-dialog h2{font-size:16px;font-weight:600}
    #share-card-dialog button{width:44px;height:44px;font-size:28px;cursor:pointer}
    #share-card-dialog img{display:block;width:auto;max-width:100%;height:auto;max-height:calc(92dvh - 190px);margin:auto;border-radius:12px}
    #share-card-dialog p{margin:12px 0;font-size:12px;text-align:center;color:var(--ink-3,#66757a)}
    #share-card-dialog a{display:flex;min-height:44px;align-items:center;justify-content:center;border-radius:24px;background:var(--accent,#326873);color:white;font-size:14px;font-weight:600}
  </style>`);
  $("body").append($("<script>").attr({src:`${prefix}/assets/static-share-card.js`,defer:""}));
  return item;
}
