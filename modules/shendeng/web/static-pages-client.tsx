import { useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import Home from "../../../apps/web/app/routes/home";
import All from "../../../apps/web/app/routes/all";
import Item from "../../../apps/web/app/routes/item";
import Topic from "../../../apps/web/app/routes/topic";
import Story from "../../../apps/web/app/routes/story";
import Hot from "../../../apps/web/app/routes/hot";
import Changelog from "../../../apps/web/app/routes/changelog";
import More from "../../../apps/web/app/routes/more";
import Agent from "../../../apps/web/app/routes/agent";
import { Sheet } from "../../../apps/web/app/components/ui/Sheet";
import { BackToTop } from "../../../apps/web/app/components/shell/Chrome";
import { ThemeSwitch } from "../../../apps/web/app/components/shell/ThemeSwitch";
import { OutlineSheet } from "../../../apps/web/app/components/ui/OutlineSheet";
import { getStarred, useAppearanceSync } from "../../../apps/web/app/lib/local-state";
import { copyText } from "../../../apps/web/app/lib/clipboard";
import featured from "../../../site/featured-filters.json";

const components:Record<string,ComponentType>={home:Home,all:All,item:Item,topic:Topic,story:Story,hot:Hot,changelog:Changelog,more:More,agent:Agent};
type CatalogItem={id:string;title:string;summary:string|null;sourceName:string;category:string|null;tags:string[]};
type PublicData={navigation:Record<string,string>;apiFiles:Record<string,string>;catalog:CatalogItem[]};
const pageNode=document.getElementById("static-page-data");
const info=pageNode?.textContent?JSON.parse(pageNode.textContent):null;
const prefix=info?.prefix??document.querySelector<HTMLElement>("[data-static-prefix]")?.dataset.staticPrefix??"";
const originalFetch=window.fetch.bind(window);
const version=document.body.dataset.staticSnapshot??"";
const publicData=originalFetch(`${prefix}/assets/static-public.json?v=${version}`).then(r=>{if(!r.ok)throw new Error("Static public snapshot unavailable");return r.json() as Promise<PublicData>;});
const sorted=(path:string)=>{const u=new URL(path,location.origin);u.searchParams.sort();return u.pathname+u.search;};

function BrowserTools() {
  useAppearanceSync();
  const [search,setSearch]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [items,setItems]=useState<CatalogItem[]>([]);
  const [service,setService]=useState<string|null>(null);
  const [outline,setOutline]=useState(false);
  const headings=[...document.querySelectorAll<HTMLElement>("main h2[id],main h3[id],main [id]:is(section)")].map(e=>({id:e.id,text:e.querySelector("h2,h3")?.textContent??e.textContent??"",level:e.tagName==="H3"?3:2}));
  const openSearch=(value:string)=>{setSearch(value);setQuery(value);void publicData.then(d=>setItems(d.catalog)).catch(()=>setService("快照检索文件暂不可用，请刷新后重试"));};
  // One listener set, mounted alongside the original browser-only page components.
  useEffect(()=>{
    const click=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target:null;
      const serviceLink=target?.closest<HTMLElement>("[data-service-required]");
      if(serviceLink){event.preventDefault();event.stopPropagation();setService(serviceLink.dataset.serviceRequired??"此操作");return;}
      const button=target?.closest("button");
      if(button?.hasAttribute("data-static-back")) {
        let sameSite=false;try{sameSite=new URL(document.referrer).origin===location.origin;}catch{}
        if(sameSite&&history.length>1){event.preventDefault();event.stopPropagation();history.back();return;}
      }
      if(button&&["收藏","取消收藏"].includes(button.getAttribute("aria-label")??"")) {
        const before=JSON.stringify(getStarred());
        queueMicrotask(()=>{if(before===JSON.stringify(getStarred())){
          const status=document.querySelector<HTMLElement>("[data-static-notice]");if(status){status.hidden=false;status.textContent="浏览器未能保存收藏，请检查存储权限";}
        }});
      }
      if(button?.getAttribute("aria-label")==="搜索"){event.preventDefault();event.stopPropagation();openSearch("");}
      if(button?.getAttribute("aria-label")==="本期目录"){event.preventDefault();event.stopPropagation();setOutline(true);}
    };
    const submit=(event:SubmitEvent)=>{
      const form=event.target;if(!(form instanceof HTMLFormElement))return;
      if(form.hasAttribute("data-service-form")){event.preventDefault();event.stopPropagation();setService("在线表单提交");return;}
      if(form.getAttribute("role")!=="search")return;
      event.preventDefault();event.stopPropagation();openSearch(String(new FormData(form).get("q")??""));
    };
    document.addEventListener("click",click,true);document.addEventListener("submit",submit,true);
    const serviceEvent=(event:Event)=>setService((event as CustomEvent<string>).detail);
    window.addEventListener("static-service-required",serviceEvent);
    return()=>{document.removeEventListener("click",click,true);document.removeEventListener("submit",submit,true);window.removeEventListener("static-service-required",serviceEvent);};
  },[]);
  const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results=items.filter(item=>words.every(word=>`${item.title} ${item.summary??""} ${item.sourceName} ${item.tags?.join(" ")??""}`.toLowerCase().includes(word)));
  return <>
    <Sheet open={search!==null} onClose={()=>setSearch(null)} title="搜索当前静态快照" centered>
      <div className="px-5 pb-5"><input autoFocus aria-label="搜索标题和摘要" className="h-11 w-full rounded-full border border-line bg-surface px-4 text-ink" value={query} onChange={e=>setQuery(e.target.value)} maxLength={200}/>
        <p className="my-3 text-xs text-ink-3">检索本次发布的标题、摘要和标签；不代表实时全文搜索。</p>
        <ul className="space-y-3">{results.slice(0,100).map(item=><li key={item.id} className="border-b border-line pb-3"><a className="font-semibold text-ink" href={`${prefix}/items/${item.id}/index.html`}>{item.title}</a><p className="mt-1 text-sm text-ink-3">{item.summary}</p></li>)}</ul>
        {words.length>0&&!results.length&&<p className="text-sm text-ink-3">当前快照没有匹配结果。</p>}
      </div>
    </Sheet>
    <Sheet open={service!==null} onClose={()=>setService(null)} title="需要在线服务" centered><div className="px-5 pb-5 text-sm leading-7 text-ink-2">{service}需要公网可访问的 API 服务。当前站点发布静态快照，本机后台不对外提供连接；尚未完成提交或连接。反馈可通过<a className="text-accent" href="https://github.com/littleweb/shengdeng.news/issues">仓库 Issues</a>提出。</div></Sheet>
    <OutlineSheet open={outline} onClose={()=>setOutline(false)} outline={headings}/>
    <BackToTop/>
  </>;
}

export async function initStaticPages() {
  const shared=await publicData;
  // Only known, exported GET responses are redirected. No server write is simulated.
  window.fetch=(input,init)=>{
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url,location.href);
    const method=init?.method??(input instanceof Request?input.method:"GET");
    if(url.origin===location.origin&&method==="GET") {
      const key=sorted(url.href);const mapped=Object.entries(shared.apiFiles).find(([k])=>sorted(k)===key)?.[1];
      if(mapped)return originalFetch(mapped,init);
      if(url.pathname.startsWith("/api/")) {
        window.dispatchEvent(new CustomEvent("static-service-required",{detail:url.pathname}));
        return Promise.reject(new Error("This API requires a public server; no static response is available"));
      }
    }
    return originalFetch(input,init);
  };
  const metadata=document.querySelector<HTMLElement>("[data-static-prefix]");
  if(metadata)metadata.querySelector('button[aria-label="回到顶部"]')?.remove();
  document.querySelectorAll('button[aria-label="回到顶部"]').forEach(b=>b.remove());
  document.querySelectorAll('[role="radiogroup"][aria-label="外观"]').forEach(group=>{
    if(group.closest("[data-static-page]"))return;
    const host=document.createElement("div");host.className="mx-1";group.replaceWith(host);createRoot(host).render(<ThemeSwitch/>);
  });
  const tools=document.createElement("div");document.body.append(tools);createRoot(tools).render(<BrowserTools/>);
  const root=document.querySelector<HTMLElement>("[data-static-page]");
  if(info&&root&&components[info.kind]) {
    const Component=components[info.kind];
    function ReadyPage() {useEffect(()=>{root!.dataset.staticReady="true";},[]);return <Component/>;}
    const router=createMemoryRouter([{id:"static-page",path:"*",loader:()=>info.data,element:<ReadyPage/>}],{initialEntries:[info.canonical+location.hash]});
    const navigate=router.navigate.bind(router);
    router.navigate=((to:any,options:any)=>{
      if(typeof to==="number"){history.go(to);return Promise.resolve();}
      const target=typeof to==="string"?to:(to.pathname??router.state.location.pathname)+(to.search??"")+(to.hash??"");
      const current=new URL(router.state.location.pathname+router.state.location.search,location.origin);
      const url=new URL(target,current);const mapped=shared.navigation[sorted(url.href)];
      if(mapped&&sorted(url.href)!==sorted(info.canonical)){location.assign(mapped+url.hash);return Promise.resolve();}
      return navigate(to,options);
    }) as typeof router.navigate;
    createRoot(root).render(<RouterProvider router={router}/>);
  }
  const rewrite=()=>{
    document.querySelectorAll<HTMLAnchorElement>("[data-static-page] a[href]").forEach(a=>{
      if(!a.dataset.originalHref)a.dataset.originalHref=a.getAttribute("href")??"";
      const u=new URL(a.getAttribute("href")!,location.origin);
      if(u.origin!==location.origin)return;
      const key=sorted(u.href),mapped=shared.navigation[key]??shared.apiFiles[key];
      if(mapped)a.href=mapped+u.hash;
      else if(/^\/(api|admin|feedback)(\/|$)/.test(u.pathname)){a.dataset.serviceRequired=u.pathname;a.href="#online-service";}
    });
    document.querySelectorAll<HTMLImageElement>('img[src^="/og/posters/"]').forEach(img=>{const mapped=shared.apiFiles[new URL(img.src).pathname];if(mapped&&img.getAttribute("src")!==mapped)img.src=mapped;});
    if(info?.kind==="home") {
      document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="筛选"] a, [role="dialog"] a').forEach(a=>{
        if(!featured.showFirstParty&&(a.dataset.originalHref??a.getAttribute("href"))?.includes("channel=firstParty"))a.style.display="none";
        const text=a.querySelector("span.relative")??a.querySelector("span");
        if(text?.textContent==="全部")text.textContent=featured.headlineLabel;
      });
    }
    if(info?.kind==="agent")document.querySelectorAll("[data-static-page] span").forEach(span=>{
      if(span.textContent==="服务异常"){span.textContent="静态版 · API 未部署";span.classList.remove("text-hot");span.classList.add("text-ink-3");}
    });
  };
  // Capture native navigation before React Router's links; the site's directory/index URLs stay valid.
  document.addEventListener("click",event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const a=(event.target as Element)?.closest<HTMLAnchorElement>("[data-static-page] a[href]");if(!a||a.hasAttribute("download")||a.target==="_blank")return;
    const url=new URL(a.href);if(url.origin!==location.origin)return;
    if(a.dataset.serviceRequired)return;
    if(url.pathname.endsWith("/index.html")||shared.apiFiles[sorted(url.href)])event.stopPropagation();
  },true);
  let scheduled=false;
  new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;rewrite();});}}).observe(document.body,{childList:true,subtree:true});
  rewrite();
  // Static code panels (outside the islands) also keep copying available.
  document.querySelectorAll<HTMLButtonElement>('button[aria-label="复制"],button[aria-label="复制地址"]').forEach(button=>button.addEventListener("click",async()=>{
    const text=button.closest("div.rounded-card")?.querySelector("code")?.textContent??button.parentElement?.textContent??"";
    try{await copyText(text);button.setAttribute("aria-label","已复制");}catch{button.title="复制失败，请手动选择文本";}
  }));
}
