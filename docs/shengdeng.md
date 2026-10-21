# 神灯AI热点运行与发布

正式域名 https://shendeng.news/ ，源码仓库 https://github.com/littleweb/shengdeng.news 。域名与仓库名不同是已确认的安排，不要误改成 shengdeng.news 域名。

## 与 robot-taxi.news 相同的实现

前端保留 KKKKhazix/AIHOT 的原项目页面、导航、布局和主题行为，只定制站名、品牌与 AI 综合内容。发布时由临时 PostgreSQL 恢复公开期刊，启动原 API 与网页，再由 scripts/export-static.ts 抓取原 SSR 页面并复制原 CSS、字体、报头与必要资源。由 site/static/theme.js 补上静态版深浅色选择；日报、周报、月报、往期和主题使用原生页面链接。

旧的手写极简首页、RSS 标题发布模块、相关测试与 GitHub 定时抓取机制已经删除，线上不再发布那个版本。工作区位于本项目的 shendeng-site/。不修改 Rootaxi 项目的代码或内容。

静态版不提供在线搜索、收藏写入、反馈提交、后台或实时 API/MCP。相关交互标明不可用，不能伪装成功。静态快照不会自动响应撤稿；更正或撤下内容需要重新导出发布。条款和隐私仍为标明状态的待确认草案。

## 内容与每日更新

六类关注方向为国内外 AI 热点、实用 AI 分享、AI 产品成效、AI 商业化、AI 报告与研究、AI 博主。保留原评分门槛和引擎，不凭感觉改分数。

当前与 robot-taxi.news 一样使用本地 Codex 搜索、打开原文、核对日期与出处、写中文标题摘要；不是依赖未配置的 LLM API。公开文件保存在 site/editions/YYYY-MM-DD.json，必须通过 modules/shendeng/validate-editions.ts 校验。导入走原材料入口、编辑覆盖与公开读取层。条目明确标为 Codex 来源核对，未经人工逐条审核，score 为 null，不冒充原模型五维评分。

每日本地 Codex 任务计划北京时间 05:30 启动，目标在 08:00 前完成采编与发布。任务提交新的公开内容后，触发 .github/workflows/publish.yml；GitHub 从全部期刊重建临时数据库、检查、导出并部署，失败保留上一版。需电脑开机联网、Codex 登录和额度有效，以及 GitHub 登录有效。调度和外部网络可能延迟，不提供严格准点保证。流程见 local-codex-update.md。

首期含 10 条核对资料，其中 10 月 12 日的研究是背景资料，保留原日期，不计作今天的新消息。没有足够新资料时宁可少收，不以旧闻凑数。尚未生成的周报、月报显示原项目空状态，不伪造期刊。

## 本机检查和导出

使用 Node >=24.11 和 PostgreSQL 17。本机数据库端口 55439，API 为 3091，网页为 3090。密钥只存在本地 .env，不上传。原采集、模型和推送安全阀保持关闭。

```bash
npm ci
npm run typecheck
DATABASE_URL=postgres://.../shendeng_test npm test
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3090
npm run export:static -- --base http://localhost:3090 --prefix '' --site-url https://shendeng.news
```

静态产物在 dist/static/，export-manifest.json 列出实际导出的页面。GitHub Actions 保存可下载的 shendeng-static-html 产物 30 天，并发布 Pages。工作流自动读取 Pages 的域名和 base_path，不硬编码项目路径。

## DNS

阿里云 @ 的四条 A 记录为 185.199.108.153、185.199.109.153、185.199.110.153、185.199.111.153；www 的 CNAME 为 littleweb.github.io，TTL 10 分钟。Pages 绑定 shendeng.news，主域名 HTTPS 已验证并开启强制 HTTPS；www 证书的状态需要另外核对。

## 2026-10-21 内容扩充

站名为神灯AI热点，左侧不显示反馈和 GitHub 开源入口。已保存 69 条来源记录（含一条区间外研究背景），10 月 15 日至 21 日建立七期日报；日期按北京时间的原始发布时间归档。历史期标明本次回填，researchedAt 保留实际检索时间。用户已选择 A「神灯火花」，已应用矢量字标和浏览器、手机收藏图标。
