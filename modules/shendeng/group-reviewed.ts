// Source-checked Codex identities enter the original event model; heat is calculated by upstream.
import { createHash } from "node:crypto";
import { ensureImportedFact, moveToFact } from "@aihot/backend/events/corrections";
import type { CodexItem } from "./edition.ts";

export async function groupReviewed(articleId: string, event: NonNullable<CodexItem["event"]>) {
  const hash = createHash("sha256").update(`shendeng-event:${event.key}`).digest("hex");
  const uuid = `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
  const factHash = createHash("sha256").update(`shendeng-fact:${event.key}:${event.factKey??event.key}`).digest("hex");
  const publicId = `fsh${factHash.slice(0,20)}`;
  await ensureImportedFact({storyPublicId:uuid,factPublicId:publicId,storyTitle:event.title,factTitle:event.factTitle??event.title},
    "本地 Codex 原文核对后导入的事件标识，不代表人工审核", "shendeng-codex");
  await moveToFact(articleId, publicId, "本地 Codex 核对原文后的同一事件归属，不代表人工审核或模型评分", "shendeng-codex");
}
