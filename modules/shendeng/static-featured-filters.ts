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
    if (target.pathname === "/" && !target.searchParams.has("category") && !target.searchParams.has("channel")) link.children("span").last().text(filters.headlineLabel);
  }
  if (filters.showAllFeed && !nav.find('[data-static-all-feed]').length) {
    const template=nav.find('a:not([aria-current])').first();
    const link=(template.length?template:nav.find('a').first()).clone().empty().removeAttr('aria-current')
      .attr('href','/all').attr('data-static-all-feed','').append($("<span>").attr('class','relative inline-flex items-center gap-1').text('全部'));
    nav.find('a').first().after(link);
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
