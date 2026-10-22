// A few islands use the upstream menu, clipboard and local-state implementation.
// No router hydration, models, server writes or private API are needed on static hosting.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Menu, MenuItem } from "../../../apps/web/app/components/ui/Menu";
import { IconBookmark, IconCopy, IconDownload, IconImage, IconMenu, IconShare } from "../../../apps/web/app/components/icons";
import { getStarred, useStarred, toggleStar, removeStar, exportBundle, importBundle, type LocalStarredItem } from "../../../apps/web/app/lib/local-state";
import { copyText } from "../../../apps/web/app/lib/clipboard";

type Saved = Omit<LocalStarredItem,"savedAt">;
const raw = document.getElementById("static-reader-data")?.textContent;
const data = raw ? JSON.parse(raw) as {item:Saved;prefix:string;markdown:boolean} : null;
const status = document.createElement("p");
status.setAttribute("role","status");
status.className="fixed bottom-24 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-line bg-surface px-5 py-3 text-sm text-ink shadow-lg";
status.hidden=true;
document.body.append(status);
let noticeTimer: ReturnType<typeof setTimeout>;
function notice(message:string) { clearTimeout(noticeTimer);status.textContent=message;status.hidden=false;noticeTimer=setTimeout(()=>{status.hidden=true;},3500); }
function saveFile(blob:Blob,name:string) { const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

function Star({item,phone}:{item:Saved;phone:boolean}) {
  const on=useStarred().some(s=>s.id===item.id);
  const toggle=()=>{toggleStar(item);const saved=getStarred().some(s=>s.id===item.id);notice(saved===on?"浏览器未能保存收藏，请检查存储权限":saved?"已收藏，仅保存在当前浏览器":"已取消收藏");};
  return <button type="button" onClick={toggle} aria-pressed={on} aria-label={on?"取消收藏":"收藏"} title={on?"取消收藏":"收藏"}
    className={phone?"flex flex-col items-center justify-center gap-[2px] text-[10.5px] text-ink-3":"inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-3 hover:bg-bg-sunk"}>
    <IconBookmark size={phone?22:19} filled={on} className={on?"text-accent":""}/>{phone&&<span>{on?"已收藏":"收藏"}</span>}
  </button>;
}

function More({item,prefix,markdown}:{item:Saved;prefix:string;markdown:boolean}) {
  const copy=async()=>{try{await copyText(location.href);notice("链接已复制");}catch{notice("复制失败，请从浏览器地址栏复制链接");}};
  const share=async()=>{try{if(navigator.share)await navigator.share({title:item.title,url:location.href});else await copy();}catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))notice("分享未完成，可使用复制链接");}};
  return <Menu label="更多操作" trigger={<IconMenu size={17}/>}>
    {close=><>
      <MenuItem icon={<IconShare size={15}/>} onSelect={()=>{close();void share();}}>分享链接</MenuItem>
      <MenuItem icon={<IconImage size={15}/>} onSelect={()=>{close();document.querySelector<HTMLButtonElement>("[data-share-card]")?.click();}}>分享卡片</MenuItem>
      <MenuItem icon={<IconCopy size={15}/>} onSelect={()=>{close();void copy();}}>复制链接</MenuItem>
      {markdown&&<MenuItem icon={<IconDownload size={15}/>} href={`${prefix}/assets/markdown/${item.id}.md`} download onSelect={close}>导出 Markdown</MenuItem>}
    </>}
  </Menu>;
}

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

if(data) {
  document.querySelectorAll<HTMLElement>("[data-reader-star]").forEach(el=>createRoot(el).render(<Star item={data.item} phone={el.dataset.readerStar==="phone"}/>));
  document.querySelectorAll<HTMLElement>("[data-reader-menu]").forEach(el=>createRoot(el).render(<More {...data}/>));
}
document.querySelectorAll<HTMLElement>("[data-static-starred]").forEach(el=>createRoot(el).render(<Collection prefix={el.dataset.staticStarred??""}/>));
