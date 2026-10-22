// The static edition must keep native navigation and assets without exporting admin/backend calls.
import { CATEGORIES } from "../industry/taxonomy.ts";
import { APPEARANCE_BOOT_SCRIPT } from "../apps/web/app/lib/local-state.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
test("static snapshot rewrites original report/archive links and excludes private dynamic operations", async () => {
 const temp=await mkdtemp(path.join(os.tmpdir(),'robotaxi-static-'));const root=path.resolve(import.meta.dirname,'..');
 const server=createServer((_req,res)=>{if(_req.url?.startsWith('/starred')){res.setHeader('content-type','text/html');res.end('<html><head><meta charset="utf-8"></head><body><main><header><h1 data-page-title>收藏</h1></header></main></body></html>');return;}if(_req.url?.startsWith('/example.svg')){res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');return;}res.setHeader('content-type','text/html');res.end(`<html><head><title>神灯AI研究院</title><link rel="canonical" href="http://localhost/"><meta property="og:url" content="http://localhost/"><script>${APPEARANCE_BOOT_SCRIPT}</script><link rel="stylesheet" href="/assets/site.css"><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-icon.png"><link rel="manifest" href="/manifest.webmanifest"><link rel="alternate" type="application/rss+xml" href="/feed.xml"><script>fetch("/admin/private")</script></head><body><div class="hidden lg:block"><h1>精选</h1><button aria-label="筛选（已选）">筛选</button><div><div><nav data-pill-track aria-label="筛选"><a href="/"><span>全部</span></a><a href="/?channel=firstParty"><span>一手</span></a>${CATEGORIES.map(c=>`<a href="/?category=${c.key}"><span>${c.label}</span></a>`).join("")}</nav></div><input placeholder="搜索" /></div></div><div role="radiogroup" aria-label="外观"><span aria-hidden="true"></span><button role="radio" title="深色">深色</button><button role="radio" title="跟随系统">跟随系统</button><button role="radio" title="浅色">浅色</button></div><button id="dynamic">动态操作</button><form role="search" action="/all"><input name="q"><button>搜索</button></form><nav aria-label="十月出刊日历"><a href="/daily/2026-10-15">15</a></nav><a href="/daily?kind=review#one">日报</a><a href="/admin">后台</a><img src="/example.svg"><button data-static-back="/topics">返回主题</button><form action="/api/feedback"><button>提交</button></form></body></html>`);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;
 try{await mkdir(path.join(temp,'apps/web/build/client/assets'),{recursive:true});await writeFile(path.join(temp,'apps/web/build/client/assets/site.css'),'body{color:white}');await writeFile(path.join(temp,'LICENSE'),'MIT');
 const status=await new Promise<number|null>((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'scripts/export-static.ts'),'--base',`http://127.0.0.1:${port}`,'--prefix','robot-taxi.news','--out',path.join(temp,'result')],{cwd:temp,stdio:'ignore'});child.once('error',reject);child.once('exit',resolve);});assert.equal(status,0);
 const html=await readFile(path.join(temp,'result/index.html'),'utf8');assert.match(html,/\/robot-taxi\.news\/daily\/query-[a-f0-9]+\/index\.html#one/);assert.ok(html.includes(APPEARANCE_BOOT_SCRIPT));assert.ok(!html.includes('fetch("/admin/private")'));assert.doesNotMatch(html,/<html[^>]*data-theme=/);assert.ok(!html.includes('href="/admin"'));assert.ok(!html.includes('<form'));assert.ok(!html.includes('/api/feedback'));assert.match(html,/assets\/snapshot\/.*\.svg/);assert.match(html,/静态阅读版/);assert.match(html,/data-theme-choice="dark"/);assert.match(html,/src="\/robot-taxi\.news\/assets\/static-theme\.js"/);const {load}=await import("cheerio");const $=load(html);assert.equal($("[data-theme-choice][disabled]").length,0);assert.equal($("#dynamic[disabled]").length,1);assert.match($('link[rel="icon"]').attr('href')!,/^\/robot-taxi\.news\/favicon\.ico\?v=[a-f0-9]{12}$/);assert.match($('link[rel="apple-touch-icon"]').attr('href')!,/apple-icon\.png\?v=[a-f0-9]{12}$/);assert.deepEqual(await readFile(path.join(temp,'result/favicon.ico')),await readFile(path.join(root,'site/brand/favicon.ico')));assert.equal($('nav[aria-label="十月出刊日历"] a').attr("href"),"/robot-taxi.news/daily/2026-10-15/index.html");assert.equal($('a[data-static-back]').attr("href"),"/robot-taxi.news/topics/index.html");assert.equal($('a[data-static-back][disabled]').length,0);assert.equal($('link[rel="manifest"],link[rel="alternate"]').length,0);assert.equal($('input[name="q"][disabled]').length,1);
 const featured=$('nav[aria-label="筛选"]');assert.deepEqual(featured.find('a').map((_i,a)=>$(a).text()).get(),["头条",...CATEGORIES.map(c=>c.label)]);assert.equal(featured.find('a').length,7);assert.equal($('button[aria-label^="筛选"]').length,0);assert.equal(featured.find('a').first().attr('href'),'/robot-taxi.news/index.html');const all=load(await readFile(path.join(temp,'result/all/index.html'),'utf8'));assert.equal(all('nav[aria-label="筛选"] a').first().text(),"全部");assert.equal(all('nav[aria-label="筛选"] a').length,8);
 const manifest=JSON.parse(await readFile(path.join(temp,'result/export-manifest.json'),'utf8'));assert.ok(manifest.pages.includes('/daily?kind=review'));assert.ok(!manifest.pages.includes('/admin'));
 const customStatus=await new Promise<number|null>((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'scripts/export-static.ts'),'--base',`http://127.0.0.1:${port}`,'--prefix','','--site-url','https://robot-taxi.news','--out',path.join(temp,'custom')],{cwd:temp,stdio:'ignore'});child.once('error',reject);child.once('exit',resolve);});assert.equal(customStatus,0);
 const custom=load(await readFile(path.join(temp,'custom/index.html'),'utf8'));assert.equal(custom('link[rel=canonical]').attr('href'),'https://robot-taxi.news/');assert.equal(custom('link[rel=stylesheet]').attr('href'),'/assets/site.css');assert.equal(custom('nav[aria-label="十月出刊日历"] a').attr('href'),'/daily/2026-10-15/index.html');assert.equal(custom('a[data-static-back]').attr('href'),'/topics/index.html');assert.equal(custom('script[src]').attr('src'),'/assets/static-theme.js');
 }finally{await new Promise<void>(r=>server.close(()=>r()));await rm(temp,{recursive:true,force:true});}
});

test("static details save local bookmarks, open menus and download share cards without a live API", async () => {
 const temp=await mkdtemp(path.join(os.tmpdir(),"shendeng-reader-"));const root=path.resolve(import.meta.dirname,"..");
 const item={id:"static-card",title:"静态分享检查",summary:'描述含 </script><script>window.cardInjected=true</script>',source:{name:"公开来源"},publishedAt:"2026-10-21T10:00:00Z",timelineAt:"2026-10-21T10:00:00Z",category:"industry",selected:true,score:null,markdownAvailable:true};
 const html=`<html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/site.css"></head><body><nav data-pill-track aria-label="筛选"><a href="/"><span>全部</span></a></nav><h1>${item.title}</h1><button>分享卡片</button><button aria-label="收藏">收藏</button><button aria-label="更多操作">更多</button><nav aria-label="阅读工具"><button>收藏</button><button>分享卡片</button></nav><button aria-label="更多操作">更多</button><a href="/items/static-card">详情</a><a href="/starred">收藏列表</a></body></html>`;
 const api=createServer((req,res)=>{
  if(req.url==="/api/site/items/static-card"){res.setHeader("content-type","application/json");res.end(JSON.stringify(item));return;}
  if(req.url==="/items/static-card/markdown"){res.end("# 静态分享检查\n\n描述");return;}
  res.setHeader("content-type","text/html");res.end(req.url==="/starred"?'<html><head><meta charset="utf-8"></head><body><main><header><h1 data-page-title>收藏</h1></header></main></body></html>':html);
 });
 await new Promise<void>(r=>api.listen(0,"127.0.0.1",r));const port=(api.address() as {port:number}).port;
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 let server:ReturnType<typeof createServer>|undefined;
 try {
  await mkdir(path.join(temp,"apps/web/build/client/assets"),{recursive:true});await writeFile(path.join(temp,"apps/web/build/client/assets/site.css"),"body{font-family:sans-serif}");await writeFile(path.join(temp,"LICENSE"),"MIT");
  let exportError="";const exit=await new Promise<number|null>((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,"scripts/export-static.ts"),"--base",`http://127.0.0.1:${port}`,"--prefix","/news","--site-url","https://example.org/news","--out",path.join(temp,"result")],{cwd:temp,stdio:["ignore","ignore","pipe"]});child.stderr.on("data",d=>{exportError+=d;});child.once("error",reject);child.once("exit",resolve);});assert.equal(exit,0,exportError);
  server=createServer(async(req,res)=>{try{const p=new URL(req.url!,"http://localhost").pathname;const file=path.join(temp,"result",p.replace(/^\/news\//,""));res.setHeader("content-type",file.endsWith(".js")?"application/javascript":file.endsWith(".png")?"image/png":file.endsWith(".json")?"application/json":"text/html");res.end(await readFile(file));}catch{res.statusCode=404;res.end("not found");}});
  await new Promise<void>(r=>server!.listen(0,"127.0.0.1",r));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  browser=await chromium.launch({channel:"chromium"});const context=await browser.newContext();const page=await context.newPage();
  const requests:string[]=[];page.on("request",r=>requests.push(r.url()));
  await page.goto(origin+"/news/items/static-card/index.html");
  await expect(page.getByRole("button",{name:"收藏",exact:true}).first()).toBeEnabled();
  await page.getByRole("button",{name:"收藏",exact:true}).first().click();
  await expect(page.getByRole("button",{name:"取消收藏",exact:true}).first()).toHaveAttribute("aria-pressed","true");
  await page.reload();await expect(page.getByRole("button",{name:"取消收藏",exact:true}).first()).toHaveAttribute("aria-pressed","true");
  assert.equal(await page.evaluate(()=>Object.hasOwn(window,"cardInjected")),false);
  await page.getByRole("button",{name:"更多操作"}).first().click();await expect(page.getByRole("menuitem",{name:"复制链接"})).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.getByRole("menu")).not.toBeVisible();
  await page.getByRole("button",{name:"分享卡片",exact:true}).first().click();const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img")).toHaveJSProperty("naturalWidth",1080);
  const download=page.waitForEvent("download");await dialog.getByRole("link",{name:"保存图片"}).click();assert.match((await download).suggestedFilename(),/static-card\.png$/);
  await page.keyboard.press("Escape");
  await page.goto(origin+"/news/starred/index.html");await expect(page.getByRole("link",{name:item.title})).toHaveAttribute("href","/news/items/static-card/index.html");
  await page.getByRole("button",{name:`取消收藏：${item.title}`}).click();await expect(page.getByText("还没有收藏内容。在详情页点击收藏即可添加。")).toBeVisible();
  assert.equal(requests.some(url=>new URL(url).pathname.includes("/api/")),false);
  await context.close();
  const denied=await browser.newContext();await denied.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error("storage denied");};});const blocked=await denied.newPage();await blocked.goto(origin+"/news/items/static-card/index.html");await blocked.getByRole("button",{name:"收藏",exact:true}).first().click();await expect(blocked.getByRole("status")).toContainText("浏览器未能保存收藏");await expect(blocked.getByRole("button",{name:"收藏",exact:true}).first()).toHaveAttribute("aria-pressed","false");await denied.close();
 } finally {
  await browser?.close();if(server)await new Promise<void>(r=>server!.close(()=>r()));await new Promise<void>(r=>api.close(()=>r()));await rm(temp,{recursive:true,force:true});
 }
});
