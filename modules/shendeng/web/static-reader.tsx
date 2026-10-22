// A few islands use the upstream menu, clipboard and local-state implementation.
// No router hydration, models, server writes or private API are needed on static hosting.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useStarred, removeStar, exportBundle, importBundle } from "../../../apps/web/app/lib/local-state";
import { initStaticPages } from "./static-pages-client";

const status = document.createElement("p");
status.setAttribute("role","status");
status.dataset.staticNotice="";
status.className="fixed bottom-24 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-line bg-surface px-5 py-3 text-sm text-ink shadow-lg";
status.hidden=true;
document.body.append(status);
let noticeTimer: ReturnType<typeof setTimeout>;
function notice(message:string) { clearTimeout(noticeTimer);status.textContent=message;status.hidden=false;noticeTimer=setTimeout(()=>{status.hidden=true;},3500); }
function saveFile(blob:Blob,name:string) { const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

function Collection({prefix}:{prefix:string}) {
  const items=useStarred();
  const [available,setAvailable]=useState<Set<string>|null>(null);
  useEffect(()=>{void fetch(`${prefix}/export-manifest.json`).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(m=>setAvailable(new Set<string>(m.pages))).catch(()=>notice("暂时无法核对收藏页面状态，请稍后刷新"));},[prefix]);
  const upload=async(file?:File)=>{if(!file)return;try{const result=importBundle(await file.text());notice(`已导入 ${result.starredAdded} 条收藏`);}catch(e){notice(e instanceof Error?e.message:"导入失败");}};
  return <>
    <div className="my-3 flex gap-4 text-sm text-ink-3">
      <label className="cursor-pointer">导入文件<input aria-label="导入收藏文件" className="sr-only" type="file" accept=".json,application/json" onChange={e=>{void upload(e.target.files?.[0]);e.target.value="";}}/></label>
      <button type="button" onClick={()=>saveFile(new Blob([JSON.stringify(exportBundle(),null,2)],{type:"application/json"}),"local-collections.json")}>导出收藏</button>
    </div>
    {!items.length?<p className="my-8 text-center text-sm text-ink-3">还没有收藏内容。在详情页点击收藏即可添加。</p>:<ul className="mt-3 space-y-3">{items.map(s=><li key={s.id} className="card border border-line p-4">
      <div className="flex items-center justify-between text-xs text-ink-3"><span>{s.sourceName}</span><button type="button" aria-label={`取消收藏：${s.title}`} onClick={()=>removeStar(s.id)}>取消收藏</button></div>
      <h2 className="mt-2 text-base font-semibold text-ink">{available?.has(`/items/${s.id}`)?<a href={`${prefix}/items/${s.id}/index.html`}>{s.title}</a>:s.title}</h2>
      {s.summary&&<p className="mt-2 text-sm text-ink-3">{s.summary}</p>}
      {available&&!available.has(`/items/${s.id}`)&&<p className="mt-2 text-xs text-ink-3">当前静态版本中暂无此页面，已保留本机收藏。</p>}
    </li>)}</ul>}
  </>;
}

document.querySelectorAll<HTMLElement>("[data-static-starred]").forEach(el=>createRoot(el).render(<Collection prefix={el.dataset.staticStarred??""}/>));
if(document.querySelector("[data-static-prefix]"))void initStaticPages().catch(()=>notice("本页交互加载失败，请刷新后重试；正文仍可阅读"));
