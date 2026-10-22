// Public body snapshots survive the ephemeral Pages database. Network/model work stays local.
import { readFile, readdir, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import { z } from "zod";
import { sql, closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { updateSource } from "@aihot/backend/admin/sources";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { extractFromUrl, pageFetchable } from "@aihot/backend/content/extract";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { isChineseText } from "@aihot/backend/lib/text";
import { sha256 } from "@aihot/backend/lib/ids";
import { importBodyTranslation, segmentsOf, shield, unshield } from "@aihot/backend/editorial/translate";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadItemDetail } from "@aihot/backend/publication/detail";

const directory = path.resolve("site/fulltext");
const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const BodySnapshot = z.object({
  version: z.literal(1), articleId: Id, url: z.url(), fetchedAt: z.iso.datetime(),
  sourceHtml: z.string().min(1).max(1_000_000), sourceHash: z.string(), language: z.enum(["zh", "en", "und"]),
  translation: z.object({ method: z.literal("local-codex"), translatedAt: z.iso.datetime(),
    html: z.string().min(1).max(1_000_000), complete: z.boolean() }).nullable(),
}).strict();
export type Snapshot = z.infer<typeof BodySnapshot>;
export function validateSnapshot(value: unknown): Snapshot {
  const s = BodySnapshot.parse(value);
  const clean = sanitizeBody(s.sourceHtml);
  if (clean !== s.sourceHtml || sha256(s.sourceHtml) !== s.sourceHash) throw new Error("Body snapshot source hash or sanitization mismatch");
  if (s.translation && sanitizeBody(s.translation.html) !== s.translation.html) throw new Error("Unsafe translation snapshot");
  return s;
}
export function translationSegments(html: string) {
  const $ = cheerio.load(html, null, false);
  return segmentsOf($).map(el => shield($(el).html() ?? "").html);
}
export function assembleTranslation(html: string, answers: string[]) {
  const $ = cheerio.load(html, null, false), blocks = segmentsOf($);
  if (!blocks.length || answers.length !== blocks.length) throw new Error("Translation segment count differs from source");
  blocks.forEach((el, i) => {
    const restored = unshield(answers[i]!, shield($(el).html() ?? ""));
    if (!restored || !cheerio.load(restored, null, false).text().trim()) throw new Error(`Translation segment ${i} is incomplete or lost protected content`);
    $(el).html(restored);
  });
  if (!isChineseText($.root().text())) throw new Error("Translation contains no Chinese text");
  return sanitizeBody($.html());
}
async function save(s: Snapshot) {
  validateSnapshot(s);
  await mkdir(directory, {recursive:true});
  const file = path.join(directory, s.articleId + ".json");
  await writeFile(file + ".tmp", JSON.stringify(s, null, 2) + "\n");
  await rename(file + ".tmp", file);
}
async function existing(id: string) {
  try { return validateSnapshot(JSON.parse(await readFile(path.join(directory, Id.parse(id) + ".json"), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function restoreBody(snapshot: Snapshot) {
  const s = validateSnapshot(snapshot);
  const [a] = await sql`SELECT * FROM articles WHERE id=${s.articleId}`;
  if (!a || a.url !== s.url) throw new Error("Body snapshot does not match imported article");
  const [admission] = await sql`SELECT p.selected,coalesce(p.visible_after,p.selected_ready_at,p.discovered_at) AS released_at,
    o.fields->>'selected' AS editorial_selected FROM publications p LEFT JOIN editorial_overrides o ON o.article_id=p.article_id
    WHERE p.article_id=${s.articleId}`;
  const body = sanitizeBody(s.sourceHtml);
  await upsertMaterial({id:a.id,sourceId:a.source_id,url:a.url,title:a.title,author:a.author,
    publishedAt:a.published_at,publicationTime:a.publication_time,discoveredAt:a.discovered_at,
    language:s.language,bodyHtml:body,bodyText:cheerio.load(body,null,false).root().text().trim(),bodyStatus:"ok",media:a.media??[],
    raw:a.raw,via:"shendeng-fulltext"});
  // These snapshots enrich an already admitted article. Material revision resets grouping;
  // restore the existing import decision through the original historical-publication entrance.
  if (admission && (admission.selected || (a.raw?.codexResearch && admission.editorial_selected === "true"))) {
    await publishArticle(s.articleId,{releasedAt:new Date(admission.released_at)});
  }
  if (s.translation) await importBodyTranslation({articleId:s.articleId,sourceHtml:s.sourceHtml,title:a.title,
    html:s.translation.html,complete:s.translation.complete});
  const result = await loadItemDetail(s.articleId);
  if (result.kind !== "found" || !result.item.body) throw new Error("Restored full text is not publicly readable");
}
async function prepare(id: string, jobFile: string) {
  Id.parse(id);
  const published = await loadItemDetail(id);
  if (published.kind !== "found" || !published.item.selected) throw new Error("Not a selected public article");
  let s = await existing(id);
  if (!s) {
    const [row] = await sql`SELECT a.url,s.kind,s.site_fulltext FROM articles a JOIN sources s ON s.id=a.source_id WHERE a.id=${id}`;
    if (!row?.site_fulltext || !pageFetchable(row.url, row.kind)) throw new Error("Source page requires a dedicated collector or fulltext permission");
    const body = await extractFromUrl(row.url, id, {}, {paidFallback:false});
    if (!body) throw new Error("Original page unreadable or no extractable article body");
    const clean = sanitizeBody(body.html);
    s = {version:1,articleId:id,url:row.url,fetchedAt:new Date().toISOString(),sourceHtml:clean,
      sourceHash:sha256(clean),language:isChineseText(cheerio.load(clean,null,false).root().text())?"zh":"und",translation:null};
    await restoreBody(s);await save(s);
  } else await restoreBody(s);
  const segments = s.language === "zh" || s.translation?.complete ? [] : translationSegments(s.sourceHtml);
  if (segments.join("").length > 60_000) throw new Error("Body exceeds automatic translation cap; original retained");
  if (s.language !== "zh" && !s.translation && !segments.length) throw new Error("No translatable text blocks; original retained");
  await writeFile(jobFile,JSON.stringify({articleId:id,sourceHash:s.sourceHash,segments})+"\n");
}
async function complete(jobFile: string, responseFile: string) {
  const job = JSON.parse(await readFile(jobFile,"utf8"));
  const answer = z.object({t:z.array(z.string())}).strict().parse(JSON.parse(await readFile(responseFile,"utf8")));
  const s = await existing(Id.parse(job.articleId));
  if (!s || s.sourceHash !== job.sourceHash) throw new Error("Source changed while translation was running");
  const html = assembleTranslation(s.sourceHtml,answer.t);
  s.translation = {method:"local-codex",translatedAt:new Date().toISOString(),html,complete:true};
  await restoreBody(s);await save(s);
}
async function main() {
  const [command,arg,output] = process.argv.slice(2);
  if (command === "enable") {
    for (const s of await sql`SELECT id,updated_at FROM sources WHERE NOT site_fulltext`) {
      await updateSource(s.id,{patch:{site_fulltext:true},version:new Date(s.updated_at).toISOString(),reason:"用户要求所有信源开启站内全文"},"shendeng-fulltext");
    }
  } else if (command === "queue") {
    const rows = await sql`SELECT a.id FROM articles a JOIN publications p ON p.article_id=a.id JOIN sources s ON s.id=a.source_id
      LEFT JOIN translations t ON t.article_id=a.id AND t.lang='zh' AND t.revision>=a.revision AND t.complete
      WHERE p.visibility='public' AND p.selected AND s.site_fulltext
        AND (a.body_html IS NULL OR (coalesce(a.language,'en') <> 'zh' AND t.article_id IS NULL))
      ORDER BY p.discovered_at DESC,a.id`;
    console.log(JSON.stringify(rows.map(r=>r.id)));
  } else if (command === "prepare" && arg && output) await prepare(arg,output);
  else if (command === "complete" && arg && output) await complete(arg,output);
  else if (command === "import") {
    const files = arg ? [arg] : (await readdir(directory).catch((error:NodeJS.ErrnoException)=>{if(error.code==="ENOENT")return [];throw error;})).filter(f=>f.endsWith(".json")).sort().map(f=>path.join(directory,f));
    for (const f of files) await restoreBody(validateSnapshot(JSON.parse(await readFile(f,"utf8"))));
    console.log(`Restored ${files.length} full-text snapshots`);
  } else throw new Error("Usage: fulltext.ts enable|queue|prepare <id> <job>|complete <job> <response>|import [snapshot]");
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await main(); } finally { await stopBoss(); await closeDb(); }
}
