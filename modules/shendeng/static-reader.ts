import type { CheerioAPI } from "cheerio";

/** Collections use original browser storage, with availability checked against this export only. */
export function adaptReader($: CheerioAPI, page: URL, prefix: string) {
  if (page.pathname !== "/starred") return;
  const container = $("h1[data-page-title]").closest("header").parent();
  if (container.length !== 1) throw new Error("Upstream collection page changed; review static reader adapter");
  container.find('button:contains("导入文件")').remove();
  container.find('input[type="file"]').remove();
  container.append($("<div>").attr("data-static-starred", prefix));
}
