// Validate local Codex output before writing any public content.
import { createHash } from "node:crypto";
import { beijingDate } from "@aihot/contracts/time";
import { CATEGORIES, ENTITIES } from "../../industry/taxonomy.ts";
export interface CodexItem {id?:string;sourceId:string;sourceName:string;tier:"T1"|"T2";entity:string|null;date:string;url:string;title:string;summary:string;reason:string;category:string;quote:string;image?:string;video?:string;region:"国内"|"国外";tags:string[]}
export interface CodexEdition {date:string;researchedAt:string;items:CodexItem[]}
export function stableArticleId(url:string){return "r"+createHash("sha256").update(url).digest("hex").slice(0,24);}
export function validateEdition(input:unknown):asserts input is CodexEdition {
 const d=input as CodexEdition;
 if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isFinite(Date.parse(d.date))||!Number.isFinite(Date.parse(d.researchedAt))||!Array.isArray(d.items)||!d.items.length)throw new Error("Edition requires date, researchedAt and nonempty items");
 if(beijingDate(d.researchedAt)!==d.date||Date.parse(d.researchedAt)>Date.now()+300000)throw new Error("Edition date must match actual research time in Shanghai");
 const seen=new Set<string>();
 const https=(s:string)=>{const u=new URL(s);if(u.protocol!=="https:"||u.username||u.password||u.hostname==="localhost"||/^127\.|^10\.|^192\.168\./.test(u.hostname))throw new Error("Public HTTPS source required");};
 for(const i of d.items){
  for(const key of ["sourceId","sourceName","date","url","title","summary","reason","quote"] as const)if(typeof i[key]!=="string"||!i[key].trim())throw new Error(`Missing item ${key}`);
  if(!/^[a-z0-9-]+$/.test(i.sourceId)||!["T1","T2"].includes(i.tier)||!["国内","国外"].includes(i.region)||!CATEGORIES.some(c=>c.key===i.category)||!Array.isArray(i.tags)||i.tags.some(t=>typeof t!=="string")||i.entity!==null&&!Object.hasOwn(ENTITIES,i.entity))throw new Error("Invalid source, taxonomy or region");
  if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(i.date)||!Number.isFinite(Date.parse(i.date))||Date.parse(i.date)>Date.parse(d.researchedAt))throw new Error("Invalid or future source date");
  if(i.id!==undefined&&!/^[a-zA-Z0-9_-]{1,80}$/.test(i.id))throw new Error("Invalid preserved article ID");
  https(i.url);if(i.image)https(i.image);if(i.video)https(i.video);if(seen.has(i.url))throw new Error("Duplicate source URL");seen.add(i.url);
 }
}
