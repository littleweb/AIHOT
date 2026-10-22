import type { CheerioAPI } from "cheerio";
import type { SiteItemDetail } from "@aihot/contracts/site";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

/** Bind small reader controls to the original SSR layout without restoring API-driven routing. */
export async function adaptReader($: CheerioAPI, page: URL, item: SiteItemDetail | undefined, output: string, prefix: string) {
  const script = () => $("body").append($("<script>").attr({src:`${prefix}/assets/static-reader.js`,defer:""}));
  if (page.pathname === "/starred") {
    const container = $("h1[data-page-title]").closest("header").parent();
    if (container.length !== 1) throw new Error("Upstream collection page changed; review static reader adapter");
    container.find('button:contains("导入文件")').remove();
    container.find('input[type="file"]').remove();
    container.append($("<div>").attr("data-static-starred", prefix));
    script();
  }
  if (!item) return;
  const metadata = {id:item.id,title:item.title,summary:item.summary,sourceName:item.source.name,
    publishedAt:item.publishedAt,score:item.score,aiSelected:item.selected};
  const data = $("<script>").attr({type:"application/json",id:"static-reader-data"});
  // A title containing </script> must remain data, never become executable HTML.
  data.text(JSON.stringify({item:metadata,prefix,markdown:item.markdownAvailable}).replace(/</g,"\\u003c"));
  $("body").append(data);
  const stars = $('button[aria-label="收藏"], button[aria-label="取消收藏"]')
    .add($('nav[aria-label="阅读工具"] button').filter((_i,el)=>$(el).text().trim()==="收藏"));
  if (stars.length !== 2) throw new Error("Upstream bookmark controls changed; review static reader adapter");
  stars.each((_i,el)=>{ $(el).replaceWith($("<span>").attr({"data-reader-star":$(el).closest('nav[aria-label="阅读工具"]').length?"phone":"desktop",class:"contents"})); });
  const menus = $('button[aria-label="更多操作"]');
  if (menus.length !== 2) throw new Error("Upstream detail menus changed; review static reader adapter");
  menus.each((_i,el)=>{ $(el).replaceWith($("<span>").attr({"data-reader-menu":"",class:"relative"})); });
  if (item.markdownAvailable) {
    const response = await fetch(new URL(`/items/${item.id}/markdown`,page),{signal:AbortSignal.timeout(30_000)});
    if (!response.ok) throw new Error(`Public Markdown ${item.id}: ${response.status}`);
    await mkdir(path.join(output,"assets/markdown"),{recursive:true});
    await writeFile(path.join(output,"assets/markdown",`${item.id}.md`),await response.text());
  }
  script();
}
