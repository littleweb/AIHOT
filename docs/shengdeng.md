# 神灯AI热点运行与发布

正式域名 https://shendeng.news/ ，源码仓库 https://github.com/littleweb/shengdeng.news 。域名与仓库名不同是已确认的安排，不要误改成 shengdeng.news 域名。

## 与 robot-taxi.news 相同的实现

前端保留 KKKKhazix/AIHOT 的原项目页面、导航、布局和主题行为，只定制站名、品牌与 AI 综合内容。发布时由临时 PostgreSQL 恢复公开期刊，启动原 API 与网页，再由 scripts/export-static.ts 抓取原 SSR 页面并复制原 CSS、字体、报头与必要资源。由 site/static/theme.js 补上静态版深浅色选择；日报、周报、月报、往期和主题使用原生页面链接。

旧的手写极简首页、RSS 标题发布模块、相关测试与 GitHub 定时抓取机制已经删除，线上不再发布那个版本。工作区位于本项目的 shendeng-site/。不修改 Rootaxi 项目的代码或内容。

静态版支持当前浏览器本机收藏、详情菜单与分享图片，不提供在线搜索、反馈提交、后台或实时 API/MCP。相关交互标明不可用，不能伪装成功。静态快照不会自动响应撤稿；更正或撤下内容需要重新导出发布。条款和隐私仍为标明状态的待确认草案。

## 内容与每日更新

六类关注方向为国内外 AI 热点、实用 AI 分享、AI 产品成效、AI 商业化、AI 报告与研究、AI 博主。保留原评分门槛和引擎，不凭感觉改分数。

当前与 robot-taxi.news 一样使用本地 Codex 搜索、打开原文、核对日期与出处、写中文标题摘要；不是依赖未配置的 LLM API。公开文件保存在 site/editions/YYYY-MM-DD.json，必须通过 modules/shendeng/validate-editions.ts 校验。导入走原材料入口、编辑覆盖与公开读取层。条目明确标为 Codex 来源核对，未经人工逐条审核，score 为 null，不冒充原模型五维评分。

本机常驻服务每小时检索一次新信息，每天北京时间 05:30 额外启动晨间采编，目标 08:00 前完成。桌面自动任务改为晨间巡检与故障恢复，避免重复采编；详见 continuous-service.md。任务提交新的公开内容后，触发 .github/workflows/publish.yml；GitHub 从全部期刊重建临时数据库、检查、导出并部署，失败保留上一版。需电脑开机联网、Codex 登录和额度有效，以及 GitHub 登录有效。调度和外部网络可能延迟，不提供严格准点保证。流程见 local-codex-update.md。

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

站名为神灯AI热点，左侧不显示反馈和 GitHub 开源入口。已保存 69 条来源记录（含一条区间外研究背景），10 月 15 日至 21 日建立七期日报；日期按北京时间的原始发布时间归档。历史期标明本次回填，researchedAt 保留实际检索时间。用户已于第二轮方案中选择 D「热点火花」，当前使用青绿色光芒、金色灯焰与光点的矢量标记；字标中的 AI 用青绿色强调，并统一应用到浏览器与手机收藏图标。

## 公开社交信源

site/social-sources.json 配置了 5 个公众号观察来源（量子位、机器之心、宝玉、归藏、数字生命卡兹克）和 2 个已匹配的小红书账号（歸藏、数字生命卡兹克）。每日本地 Codex 按名单查阅公开原文，经来源与日期核对后按相同 editions 流程导入。已收录一篇核对过的歸藏小红书视频笔记简介，未声称复测视频效果。

这些来源以 external 登记，自动 worker 抓取保持关闭；RSS 候选脚本只处理 RSS，另存社交查阅计划，不能把公众号或小红书配置误当 RSS。平台登录、访问限制和原文可读性会影响覆盖；拿不到原文就跳过并记录原因。后续如选用 mp_account 批量采集，需要核验 ghid 并由用户确认付费服务。

静态详情页和手机栏的返回保留原生父级链接，同站来路可返回原列表；直达时仍能返回父级。主题目录只展示已有内容的主题，导入时保留 entity:<id> 标记，不再因编辑覆盖丢失公司归类。

## 关键词观察

site/research-keywords.json 保存 AI产品、AI硬件、AI玩法、AI创业、AI赛道五组中英文关键词、检索式及收录边界。每日采编逐组检索，再与既有信源交叉核验。候选脚本另存 .data/keyword-research-plan.json，关键词命中不等于已核实或自动发布。五组对应同名主题入口；已有来源记录按原文范围补标签，保留原始日期。

## 持续兼容上游

用户要求非必要不改上游原始代码。优先使用原有 site/、industry/ 配置，特有能力集中在 modules/shendeng/ 和 scripts/export-static.ts。精选六类由 industry/taxonomy.ts 配置为模型、产品、行业、教程、论文、观点，分类 key 不变；汇总入口“头条”和隐藏精选一手入口由 site/featured-filters.json 配置，经 modules/shendeng/static-featured-filters.ts 在静态导出时适配。手机复用同一组原生分类链接。未修改 apps/ 或 packages/ 的分类组件。

上游升级先在隔离分支核对配置结构和公开接口，运行类型、后端、网页与冒烟检查，再验证电脑与手机的分类、详情返回、主题、报告日历和导出结果。现有核心差异（静态返回标记、主题空项过滤、原生报告日历）应在升级时逐项复核；上游具备等价能力后优先删除本站对应适配，不复制旧版本核心文件覆盖新版本。

## 模型榜与 SKILL榜

AIHOT 的模型榜从开源界面 v4 起已移除（见 docs/deploy.md），不能靠现成开关开启。本站按上游 docs/architecture.md 的模块接口增加 modules/rankings/，由 site/modules/ 三份清单注册路由、接口、侧栏、手机入口和“我的”工具，不改 apps/、packages/ 核心代码。侧栏顺序为模型榜、SKILL榜；手机共用榜单入口，页内可切换。

site/rankings.json 保存来源与条数，site/rankings/{models,skills}.json 保存公开快照。模型榜采用 Artificial Analysis Intelligence Index 前十项，保留原始分数和完整推理配置，不冒充 AIHOT 自营综合评分；SKILL榜采用 skills.sh 累计安装热度前二十项，保留来源顺序与缩写数值，同名技能以来源仓库区分。安装热度不代表质量评分。采集时间独立展示，不伪装来源发布日期。

每日采编时执行 `node modules/rankings/refresh.ts`，成功的榜单快照与期刊一起提交；失败返回非零，只保留该榜上一份文件和采集时间，并报告具体失败原因。GitHub 发布只读已提交的快照，不在构建期间依赖榜单来源。模块的 publication.ts 是榜单唯一公开读取面，只返回已校验的公开快照；不读取新闻私有表或绕开新闻原有公开层，前端仍通过 HTTP 读取。所有来源链接指向原榜或具体模型/技能，访问页面不请求第三方采集或运行任何技能。

上游升级时除原有检查外，验证两个模块路由、apiPaths、侧栏顺序、手机五项底栏、页内切换、“我的”和静态返回，并运行模块测试。来源 DOM 变化时让采集失败，不猜测列含义。恢复旧快照或撤下榜单数据后须重新导出发布。

品牌图标更新时，静态导出根据文件内容为图标链接添加版本参数，以便浏览器识别新图标。该适配仅在静态导出层，不修改上游页面核心。

实时采编与事件热点的原文发现、收录时间及必要核心导入接口说明见 docs/continuous-service.md。微信公众号若返回验证页，保留访问失败原因，不以聚合站可读的摘要冒充已读原文。

## 静态交互（2026-10-22）

导出器保留原项目的浏览器交互组件，并从原公共 HTTP 接口补齐只读数据快照，不再统一禁用按钮或删除所有脚本。详情分享卡片、列表与详情收藏、菜单、字体、日期折叠、未读筛选、事件筛选排序、图片查看、目录和回到顶部均在浏览器工作。检索覆盖本次快照的标题摘要和标签，RSS 与公开说明文件也随发布导出。

详情卡片复用原海报渲染器，包含本站 Logo、标题、描述及正式详情地址二维码。保存 PNG 和允许导出的 Markdown 不依赖运行中的 API；本机收藏沿用原 local-state 格式，支持备份和导入，不上传服务器。

需要在线服务的反馈提交、后台登录、原引擎实时全文检索和 API/MCP 保留明确的可点击说明，不伪装成功。本机服务只监听回环地址，不是公网 API。实现、依赖边界与升级检查见 [静态阅读交互与服务端依赖](static-interactions.md)。
