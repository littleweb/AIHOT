// Snapshot the original public SSR pages; never reads the database or admin routes.
// Serve the result with any static host. Links are rewritten for GitHub project Pages.
import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adaptFeaturedFilters } from "../modules/shendeng/static-featured-filters.ts";
import { adaptShareCard } from "../modules/shendeng/static-share-card.ts";
import { adaptReader } from "../modules/shendeng/static-reader.ts";
import { build } from "vite";
import { SITE } from "@aihot/site";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import { APPEARANCE_BOOT_SCRIPT } from "../apps/web/app/lib/local-state.ts";
const arg = (key: string, fallback: string) => { const n = process.argv.indexOf(key); return n < 0 ? fallback : process.argv[n + 1]; };
const origin = new URL(arg("--base", "http://localhost:3100"));
const output = path.resolve(arg("--out", "dist/static"));
const prefix = `/${arg("--prefix", "").split("/").filter(Boolean).join("/")}`.replace(/\/$/, "");
const publishedUrl = arg("--site-url", "https://shendeng.news").replace(/\/$/, "");
// Poster QR codes and the printed host must use the final public deployment URL.
process.env.SITE_URL = publishedUrl;
const maxPages = Number(arg("--max-pages", "2000"));
const publicPage = (u: URL) => u.origin === origin.origin && !/^\/(admin|api|img|og|assets)(\/|$)/.test(u.pathname) && !/\.(xml|txt|json|png|ico|svg|webmanifest)$/.test(u.pathname) && !/^\/(feedback|all\/search-busy|search-busy)(\/|$)/.test(u.pathname);
const key = (u: URL) => { u.hash = ""; u.searchParams.sort(); return u.pathname + u.search; };
const pageFile = (u: URL) => `${u.pathname.replace(/\/$/, "")}${u.search ? `/query-${createHash("sha256").update(u.search).digest("hex").slice(0, 12)}` : ""}/index.html`.replace(/^\//, "");
const pageHref = (u: URL) => `${prefix}/${pageFile(u)}${u.hash}`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp("apps/web/build/client", output, { recursive: true });
const brandFiles = ["logo.svg", "favicon.ico", "icon.png", "icon-192.png", "apple-icon.png"];
const brandVersions = new Map<string, string>();
for (const file of brandFiles) {
  const source = new URL(`../site/brand/${file}`, import.meta.url);
  await cp(source, path.join(output, file));
  brandVersions.set(file, createHash("sha256").update(await readFile(source)).digest("hex").slice(0, 12));
}
await mkdir(path.join(output, "assets"), { recursive: true });
await cp(new URL("../site/static/theme.js", import.meta.url), path.join(output, "assets/static-theme.js"));
await cp(new URL("../site/static/share-card.js", import.meta.url), path.join(output, "assets/static-share-card.js"));
await build({configFile:false,logLevel:"warn",define:{"process.env.NODE_ENV":'"production"'},oxc:{jsx:{runtime:"automatic"}},build:{outDir:path.join(output,"assets"),emptyOutDir:false,
  lib:{entry:fileURLToPath(new URL("../modules/shendeng/web/static-reader.tsx",import.meta.url)),name:"StaticReader",formats:["iife"],fileName:()=>"static-reader.js"}}});
const pending = ["/", "/all", "/hot", "/daily", "/daily/archive", "/weekly", "/monthly", "/topics", "/about", "/terms", "/privacy", "/changelog", "/more", "/starred"].map((p) => new URL(p, origin));
const seen = new Set<string>();
const assets = new Map<string, string>();
async function asset(u: URL) {
  if (brandFiles.includes(u.pathname.slice(1))) return `${prefix}${u.pathname}?v=${brandVersions.get(u.pathname.slice(1))}`;
  if (u.pathname.startsWith("/assets/") && !u.search) return prefix + u.pathname;
  const id = u.pathname + u.search;
  if (assets.has(id)) return assets.get(id)!;
  const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`public asset ${u.pathname}: ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  const ext = type.includes("svg") ? "svg" : type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("jpeg") ? "jpg" : "bin";
  const file = `assets/snapshot/${createHash("sha256").update(id).digest("hex").slice(0, 20)}.${ext}`;
  await mkdir(path.join(output, "assets/snapshot"), { recursive: true });
  await writeFile(path.join(output, file), Buffer.from(await res.arrayBuffer()));
  assets.set(id, `${prefix}/${file}`);
  return `${prefix}/${file}`;
}
while (pending.length) {
  const u = pending.shift()!;
  const id = key(new URL(u));
  if (seen.has(id)) continue;
  if (seen.size >= maxPages) throw new Error(`Export exceeds ${maxPages} pages; no partial deployment`);
  seen.add(id);
  const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`public page ${id}: ${res.status}`);
  const $ = load(await res.text());
  // Static edition has no backend: keep report tabs, archive disclosures and original links as native HTML.
  $("script").each((_i, el) => { if ($(el).text() !== APPEARANCE_BOOT_SCRIPT) $(el).remove(); });
  $("link[rel=modulepreload], link[rel=preload][as=script], link[rel=manifest], link[rel=alternate][type=\"application/rss+xml\"]").remove();
  $("link[rel=canonical]").attr("href", publishedUrl + u.pathname + u.search);
  $("meta[property='og:url']").attr("content", publishedUrl + u.pathname + u.search);
  $("meta[property='og:image'], meta[name='twitter:image']").remove();
  adaptFeaturedFilters($, u);
  for (const a of $("a[href]").toArray()) {
    const href = $(a).attr("href")!;
    if (/^(#|mailto:|tel:)/.test(href)) continue;
    const next = new URL(href, u);
    if (next.origin !== origin.origin) continue;
    if (publicPage(next)) { pending.push(next); $(a).attr("href", pageHref(next)); }
    else if (next.pathname.startsWith("/assets/")) $(a).attr("href", prefix + next.pathname);
    else $(a).replaceWith($('<span>').text($(a).text()).attr("title", "静态版不提供此在线服务"));
  }
  for (const el of $("img[src], use[href], link[rel=stylesheet], link[rel=icon], link[rel=apple-touch-icon]").toArray()) {
    const attribute = $(el).attr("src") ? "src" : "href";
    const raw = $(el).attr(attribute);
    if (!raw || raw.startsWith("data:") || raw.startsWith("#")) continue;
    const item = new URL(raw, u);
    if (item.origin === origin.origin) { const hash = item.hash; item.hash = ""; $(el).attr(attribute, (await asset(item)) + hash); }
    if ($(el).is("img")) $(el).removeAttr("srcset sizes");
  }
  $("form").each((_i, el) => {
    const form = $(el);
    if (form.attr("role") === "search") {
      form.find("input").attr("disabled", "disabled").attr("placeholder", "请按分类或主题浏览").attr("title", "在线搜索需要动态服务");
      form.replaceWith($("<div>").attr("class", form.attr("class") ?? "").append(form.contents()));
    } else form.replaceWith('<p class="text-sm text-ink-4">静态版不提供在线提交，请通过仓库 Issues 联系站长。</p>');
  });
  const choices: Record<string,string> = { "深色": "dark", "跟随系统": "system", "浅色": "light" };
  for (const group of $('[role="radiogroup"][aria-label="外观"]').toArray()) {
    const buttons = $(group).find('button[role="radio"]');
    if(buttons.length !== 3) throw new Error("Upstream appearance controls changed; review the static theme adapter");
    buttons.each((_i, button) => { const choice=choices[$(button).attr("title")??""]; if(!choice)throw new Error("Unknown upstream appearance choice"); $(button).attr("data-theme-choice",choice).removeAttr("disabled"); });
  }
  // Preserve native parent navigation even when JavaScript or browser history is unavailable.
  $("button[data-static-back]").each((_i, el) => {
    const button = $(el);
    const parent = new URL(button.attr("data-static-back")!, origin);
    button.find("span").last().text("返回");
    pending.push(parent);
    button.replaceWith($("<a>").attr("href", pageHref(parent)).attr("data-static-back", "").attr("aria-label", "返回").attr("class", button.attr("class") ?? "").append(button.contents()));
  });
  $("button").not("[data-theme-choice]").each((_i, el) => { const b = $(el); b.attr("disabled", "disabled").attr("title", "此操作需使用动态服务；静态版保留阅读和页面导航。"); });
  const shareItem = await adaptShareCard($, u, output, prefix, publishedUrl);
  await adaptReader($, u, shareItem, output, prefix);
  $("head").append('<style>button:disabled{cursor:default}#static-edition{font:12px/1.7 system-ui;color:#89979d;padding:12px 16px;border-top:1px solid #ffffff14}</style>');
  $("body").append(`<script src="${prefix}/assets/static-theme.js" defer></script>`);
  $("body").append(`<div id="static-edition">${SITE.name} 静态阅读版 · 导出于 ${new Date().toISOString()} · 页面日期以各期原始出刊时间为准。阅读、收藏、分享卡片、报告切换和往期导航可用；收藏仅保存在当前浏览器，实时搜索、后台与反馈表单需动态服务。<a href="https://github.com/littleweb/shengdeng.news/issues">联系站长 ↗</a></div>`);
  const file = path.join(output, pageFile(u));
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, $.html());
  console.log(`export ${id}`);
}
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(path.join(output, "export-manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), pages: [...seen], staticReadingEdition: true }, null, 2));
await cp("LICENSE", path.join(output, "LICENSE.txt"));
console.log(`Exported ${seen.size} original public pages to ${output}`);
