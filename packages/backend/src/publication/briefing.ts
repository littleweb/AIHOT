// The static edition publishes source titles only. It never labels unscored material as selected.
import { fetchRss } from "../sources/rss.ts";
import type { SourceRow } from "../sources/types.ts";

export interface BriefingEntry { title: string; url: string; source: string; publishedAt: string | null }
export interface BriefingSource { name: string; url: string; ok: boolean; count: number; error?: string }
export function publicHttpUrl(value: string): string | null {
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export async function readBriefing(sources: SourceRow[], now = new Date()) {
  if (process.env.COLLECT_ENABLED !== "true") throw new Error("COLLECT_ENABLED must be true to fetch public feeds");
  const results = await Promise.all(sources.filter(s => s.enabled && s.kind === "rss" && s.participation_mode === "editorial").map(async source => {
    const status: BriefingSource = { name: source.name, url: String(source.config.feedUrl), ok: false, count: 0 };
    try {
      const { candidates } = await fetchRss(source, { force: true });
      const entries: BriefingEntry[] = candidates.flatMap(c => {
        const url = publicHttpUrl(c.url);
        const date = c.publishedAt;
        // Undated items stay visibly undated; future entries never masquerade as news already published.
        if (source.id === "rss-sspai" && !/\bAI\b|人工智能|大模型|ChatGPT|Claude|Gemini|DeepSeek|提示词|智能体|机器学习/i.test(c.title)) return [];
        if (!url || !c.title.trim() || date && (date > now || now.getTime() - date.getTime() > 30 * 86400000)) return [];
        return [{ title: c.title.slice(0, 350), url, source: source.name, publishedAt: date?.toISOString() ?? null }];
      }).slice(0, 12);
      return { status: { ...status, ok: true, count: entries.length }, entries };
    } catch (error) {
      return { status: { ...status, error: error instanceof Error ? error.message.slice(0, 200) : "读取失败" }, entries: [] as BriefingEntry[] };
    }
  }));
  const entries = [...new Map(results.flatMap(r => r.entries).map(e => [e.url, e])).values()]
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return { generatedAt: now.toISOString(), entries, sources: results.map(r => r.status) };
}
