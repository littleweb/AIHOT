// Site-only adaptation of upstream SSR navigation; the original application stays untouched.
import type { CheerioAPI } from "cheerio";
import filters from "../../site/featured-filters.json" with { type: "json" };

export function adaptFeaturedFilters($: CheerioAPI, page: URL) {
  if (page.pathname !== "/") return;
  const nav = $('nav[data-pill-track][aria-label="筛选"]');
  if (!nav.length) throw new Error("Featured filter navigation changed upstream; review the static adapter");
  for (const a of nav.find("a[href]").toArray()) {
    const link = $(a);
    const target = new URL(link.attr("href")!, page);
    if (!filters.showFirstParty && target.searchParams.get("channel") === "firstParty") { link.remove(); continue; }
    if (!target.searchParams.has("category") && !target.searchParams.has("channel")) link.children("span").last().text(filters.headlineLabel);
  }
  // The upstream phone filter uses a hydrated sheet. Reuse its native desktop links on phones.
  const scroller = nav.parent();
  const row = scroller.parent();
  const heading = row.parent();
  if (heading.hasClass("hidden")) {
    heading.removeClass("hidden");
    heading.children("h1").addClass("hidden lg:block");
    row.children().not(scroller).addClass("hidden lg:block");
  }
  $('button[aria-label^="筛选"]').remove();
}
