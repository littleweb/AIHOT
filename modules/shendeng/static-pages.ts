// Static snapshots supply public loader data; the UI remains the original upstream components.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "@babel/parser";
import type { Plugin } from "vite";
import type { CheerioAPI } from "cheerio";
import type { SiteItemDetail } from "@aihot/contracts/site";
import featured from "../../site/featured-filters.json" with { type: "json" };

const pages = new Set(["home", "all", "item", "topic", "story", "hot", "changelog", "more", "agent"]);
const filterParams=(f:any)=>({channel:f.channel==="all"?null:f.channel,category:f.category,tag:f.tag});
const listPath=(route:string,values:Record<string,unknown>)=>{const p=new URLSearchParams();for(const[k,v]of Object.entries(values))if(v!==null&&v!==undefined)p.set(k,String(v));return route+(p.size?"?"+p:"");};
/** Remove server-only route exports in this dedicated browser build, never edit upstream source. */
export function staticPagePlugin(): Plugin {
  return { name:"static-public-pages", enforce:"pre", transform(code,id) {
    if(id.endsWith("/apps/web/app/features/feed/Filters.tsx")) {
      const option='{ key: "all", label: noneLabel, to: hrefWith(base, params, { category: null, channel: null }) },';
      if(!code.includes(option))throw new Error("Upstream feed filters changed; review the static adapter");
      return code.replace(option,
        `{ key: "all", label: base === "/" ? ${JSON.stringify(featured.headlineLabel)} : noneLabel, to: hrefWith(base, params, { category: null, channel: null }) },\n`+
        `    ...(base === "/" && ${featured.showAllFeed} ? [{ key: "allFeed", label: "全部", to: "/all" }] : []),`);
    }
    if(id.endsWith("/apps/web/app/components/ui/IntentLink.tsx")) {
      // Framework prefetch needs HydratedRouter's manifest; static islands only have a data router.
      const condition="const shouldPrefetch = ready && differentPage";
      if(!code.includes(condition))throw new Error("Upstream link prefetch changed; review the static adapter");
      return code.replace(condition,"const shouldPrefetch = !!framework && ready && differentPage");
    }
    const name=/\/apps\/web\/app\/routes\/([^/]+)\.tsx$/.exec(id)?.[1];
    if(!name||!pages.has(name))return;
    const file=parse(code,{sourceType:"module",plugins:["typescript","jsx"]});
    const server=new Set(["loader","clientLoader","shouldRevalidate","meta","headers"]);
    return file.program.body.filter(statement=>{
      if(statement.type==="ImportDeclaration"&&/api\.server|page-reuse/.test(statement.source.value))return false;
      if(statement.type==="ExportNamedDeclaration"&&statement.source?.value.includes(".server"))return false;
      const node=statement.type==="ExportNamedDeclaration"?statement.declaration:statement;
      if(node?.type==="FunctionDeclaration"&&node.id&&server.has(node.id.name))return false;
      if(node?.type==="VariableDeclaration"&&node.declarations.some(d=>
        d.init?.type==="CallExpression"&&d.init.callee.type==="Identifier"&&d.init.callee.name==="pageReuse"||
        (d.id.type==="Identifier"?server.has(d.id.name):d.id.type==="ObjectPattern"&&d.id.properties.some(e=>e.type==="ObjectProperty"&&e.value.type==="Identifier"&&server.has(e.value.name)))))return false;
      if(node?.type==="ExpressionStatement"&&code.slice(node.start!,node.end!).startsWith("clientLoader.hydrate"))return false;
      return true;
    }).map(node=>code.slice(node.start!,node.end!)).join("\n");
  }};
}

export class StaticPages {
  responses = new Map<string, unknown>();
  navigation: Record<string,string> = {};
  catalog = new Map<string,unknown>();
  apiFiles: Record<string,string> = {};
  private origin:URL; private output:string; private prefix:string; private publishedUrl:string;
  private addPage:(route:string)=>void;
  constructor(origin:URL, output:string, prefix:string, publishedUrl:string, addPage:(route:string)=>void=()=>{}) {
    this.origin=origin;this.output=output;this.prefix=prefix;this.publishedUrl=publishedUrl;
    this.addPage=addPage;
  }
  async json(route:string):Promise<any> {
    if(this.responses.has(route))return this.responses.get(route);
    const res=await fetch(new URL(route,this.origin),{signal:AbortSignal.timeout(30_000)});
    if(!res.ok)throw new Error(`Public page snapshot ${route}: ${res.status}`);
    const value:any=await res.json();this.responses.set(route,value);
    const article=(entry:any)=>{if(entry?.id&&entry.source&&/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id))this.addPage(`/items/${entry.id}`);if(entry?.representative)article(entry.representative);};
    for(const entry of [...(value.items??[]),...(value.reports??[]),...(value.timeline??[])])article(entry);
    for(const card of value.cards??[])article(card.item);
    return value;
  }
  async prepare($:CheerioAPI,u:URL,item:SiteItemDetail|undefined, rewrite:(v:any)=>Promise<any>) {
    if(!$("#main > div").length)return false;
    let kind:string|undefined, data:any;
    const query=u.search;
    if(u.pathname==="/") {
      kind="home";const route="/api/site/timeline"+query;
      const first=await this.json(route);const filters=first.filters;const timeline={...first,cards:[...first.cards]};const cursors=new Set<string>();
      while(timeline.nextCursor) {
        if(cursors.has(timeline.nextCursor))throw new Error("Repeated public timeline cursor");cursors.add(timeline.nextCursor);
        const more=await this.json(listPath("/api/site/timeline",{...filterParams(filters),cursor:timeline.nextCursor}));
        timeline.cards.push(...more.cards);timeline.nextCursor=more.nextCursor;
      }
      data={data:timeline,filters};
      for(const card of timeline.cards)await this.group(card.group,filters);
    } else if(u.pathname==="/all") {
      kind="all";data={data:await this.json("/api/site/pool"+query)};
      for(const card of data.data.items??[])await this.group(card.group,data.data.filters);
    } else if(/^\/items\/[^/]+(?:\/original)?$/.test(u.pathname)&&item) {
      kind="item";data={item};if(item.hasTranslation)this.addPage(`/items/${item.id}/original`);await this.group(item.group,undefined);
      if(item.story)await this.json(`/api/site/stories/${encodeURIComponent(item.story.publicId)}/followups`);
    }
    else if(/^\/story\/[^/]+$/.test(u.pathname)) {kind="story";data={story:await this.json("/api/site/stories/"+u.pathname.split("/").at(-1))};}
    else if(/^\/topics\/[^/]+(?:\/page\/\d+)?$/.test(u.pathname)) {
      const parts=u.pathname.split("/");kind="topic";data={data:await this.json(`/api/site/topics/${parts[2]}?page=${parts[4]??1}`)};
    } else if(u.pathname==="/hot") {kind="hot";data={hot:await this.json("/api/site/hot")};}
    else if(u.pathname==="/changelog") {kind="changelog";data=await this.json("/api/site/changelog");}
    else if(u.pathname==="/more") {kind="more";data={};}
    else if(u.pathname==="/agent") {kind="agent";data={healthy:false,base:this.publishedUrl,now:Date.now()};}
    if(!kind)return false;
    if(item) {
      this.catalog.set(item.id,{id:item.id,title:item.title,summary:item.summary,sourceName:item.source.name,
        publishedAt:item.publishedAt,score:item.score,aiSelected:item.selected,category:item.category,tags:item.tags});
      if(item.markdownAvailable) {
        const res=await fetch(new URL(`/items/${item.id}/markdown`,u));if(!res.ok)throw new Error("Public Markdown snapshot failed");
        await mkdir(path.join(this.output,"assets/markdown"),{recursive:true});await writeFile(path.join(this.output,"assets/markdown",`${item.id}.md`),await res.text());
        this.apiFiles[`/items/${item.id}/markdown`]=`${this.prefix}/assets/markdown/${item.id}.md`;
      }
      const {createHash}=await import("node:crypto");
      const version=createHash("sha256").update(await readFile(path.join(this.output,"og/posters",`${item.id}.png`))).digest("hex").slice(0,12);
      this.apiFiles[`/og/posters/${item.id}.png`]=`${this.prefix}/og/posters/${item.id}.png?v=${version}`;
    }
    const value={kind,canonical:u.pathname+query,prefix:this.prefix,data:await rewrite(data)};
    const script=$("<script>").attr({type:"application/json",id:"static-page-data"}).text(JSON.stringify(value).replace(/</g,"\\u003c"));
    $("body").append(script);$("#main > div").attr("data-static-page","");
    return true;
  }
  private async group(group:any,filters:any) {
    if(!group?.factId)return;
    const route=listPath(`/api/site/groups/${encodeURIComponent(group.factId)}/reports`,filters?filterParams(filters):{});
    await this.json(route);
  }
  async finish(rewrite:(v:any)=>Promise<any>) {
    const {createHash}=await import("node:crypto");
    const folder=path.join(this.output,"assets/public-snapshots");await mkdir(folder,{recursive:true});
    for(const [route,value] of this.responses) {
      if(!route.startsWith("/api/site/groups/")&&!route.endsWith("/followups"))continue;
      const content=JSON.stringify(await rewrite(value));
      const file=createHash("sha256").update(route).update(content).digest("hex").slice(0,20)+".json";
      await writeFile(path.join(folder,file),content);this.apiFiles[route]=`${this.prefix}/assets/public-snapshots/${file}`;
    }
    await writeFile(path.join(this.output,"assets/static-public.json"),JSON.stringify({navigation:this.navigation,apiFiles:this.apiFiles,catalog:[...this.catalog.values()]}));
  }
}
