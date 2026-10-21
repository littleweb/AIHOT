# 本地 Codex 晨间采编

用户已授权每日更新、公开提交并发布到 littleweb/shengdeng.news，正式站点为 https://shendeng.news/ 。使用当前本地 Codex 的搜索和写作能力，不把 Codex 登录信息或其他密钥传到 GitHub；原模型 API、推送与自动采集安全阀保持关闭。

每天北京时间 05:30 开始，目标 08:00 前完成。

1. 先读 AGENTS.md、docs/customize.md 和 docs/shengdeng.md。检查 git 工作区与登录；不得改动用户未提交文件。
2. 使用联网搜索并打开原文，覆盖近 24 小时国内外 AI 热点、实用分享、产品成效、商业化、报告和创作者经验。必要时可显式打开 COLLECT_ENABLED=true 运行 modules/shendeng/collect-candidates.ts 取得候选输入；它只写 .data/candidates.json，不直接公开内容。
3. 与 site/editions/ 去重。优先官方一手与原创资料，补充可靠媒体；保留真实日期、统计口径、适用条件与已验证程度，区分计划与结果。目标 10–20 条，有多少可信新信息就收多少，禁止凑数、夸大收益、编造新闻、复制全文或冒充人工审核。图片或视频仅使用已核实的原文媒体链接。
4. 生成 site/editions/YYYY-MM-DD.json，结构见 modules/shendeng/edition.ts 和现有一期。researchedAt 使用实际核对完成时间。quote 仅摘极短原文作为证据。若没有足够资料组成一期，保持现有期刊并说明情况，不用导出时间冒充内容更新时间。
5. 运行 node modules/shendeng/validate-editions.ts 和 npm run typecheck。只提交本轮公开内容文件。推送 main 会触发 publish.yml，不重复手动触发；如果因网络无法 Git push，可用 gh api 的 Git trees/commits 更新 main，以远端最新提交作为 parent，不能覆盖其他人的变更。
6. 等待本次工作流完成并核对线上 /daily/index.html、/export-manifest.json、文章详情、原文链接、主题和深浅色切换。失败保留线上旧版，报告具体原因，不宣布成功。仅在新发布完成、失败或需要用户操作时通知；无变化保持安静。

GitHub 每次使用临时数据库，从全部公开期刊恢复历史，不需要长期云数据库或模型 API 密钥。原项目报告入口保留，未生成的周报、月报不伪造。后台、在线搜索、收藏写入、实时 API/MCP 不属于静态版功能。

依赖本机开机联网、Codex 登录与可用额度、GitHub 登录及原项目工作区访问。若要求严格时限，需要常驻执行主机。用户没有要求扩展菜单或重新设计，不得再创建手写主页、强制主题或行业定制导航。

历史回填用 `backfill: true`，`researchedAt` 保留实际检索时间。回填日报按北京时间自然日归档，不伪造当日采编或人工审核。导入时间线使用原文发布日期，避免历史内容聚集到今天。
