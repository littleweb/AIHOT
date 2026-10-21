# 本地 Codex 晨间采编

用户已授权每日更新、公开提交并发布到 littleweb/shengdeng.news，正式站点为 https://shendeng.news/ 。使用当前本地 Codex 的搜索和写作能力，不把 Codex 登录信息或其他密钥传到 GitHub；原模型 API、推送与自动采集安全阀保持关闭。

每天北京时间 05:30 开始，目标 08:00 前完成。

1. 先读 AGENTS.md、docs/customize.md 和 docs/shengdeng.md。检查 git 工作区与登录；不得改动用户未提交文件。
2. 先读取 site/research-keywords.json，按 AI产品、AI硬件、AI玩法、AI创业、AI赛道五组中英文关键词与检索式逐组查找近24小时资料，结合已有 RSS、公众号、小红书来源拓展候选；关键词命中仅作发现线索，必须打开原文核验后再判断。然后读取 site/social-sources.json，每天逐一查阅其中的公众号公开原文与已核对的小红书账号，把来源平台和原帖链接保留下来；同文在官网、公众号、小红书重复发布时只收一次。无法读取原文、账号不匹配或发布时间不明时不入选，记录在本地 .data/ 供后续检查。不得把登录态、xsec_token、Cookie 或付费服务密钥传到仓库。再使用联网搜索并打开原文，覆盖近 24 小时国内外 AI 热点、实用分享、产品成效、商业化、报告和创作者经验。必要时可显式打开 COLLECT_ENABLED=true 运行 modules/shendeng/collect-candidates.ts 取得候选输入；它只写 .data/candidates.json，不直接公开内容。
3. 与 site/editions/ 去重。优先官方一手与原创资料，补充可靠媒体；保留真实日期、统计口径、适用条件与已验证程度，区分计划与结果。目标 10–20 条，有多少可信新信息就收多少，禁止凑数、夸大收益、编造新闻、复制全文或冒充人工审核。图片或视频仅使用已核实的原文媒体链接。
4. 生成 site/editions/YYYY-MM-DD.json，结构见 modules/shendeng/edition.ts 和现有一期。researchedAt 使用实际核对完成时间。quote 仅摘极短原文作为证据。subjects 写报道主体公司的词表 ID（不是来源网站所属公司），tags 补齐有原文依据的方向和内容类型；公众号、小红书只在确实对应的平台原帖上加平台标签。按实际内容添加 AI产品、AI硬件、AI玩法、AI创业、AI赛道标签，可多选；只介绍模型能力不算硬件，融资不等于创业成功。若没有足够资料组成一期，保持现有期刊并说明情况，不用导出时间冒充内容更新时间。
5. 运行 node modules/shendeng/validate-editions.ts 和 npm run typecheck。只提交本轮公开内容文件。推送 main 会触发 publish.yml，不重复手动触发；如果因网络无法 Git push，可用 gh api 的 Git trees/commits 更新 main，以远端最新提交作为 parent，不能覆盖其他人的变更。
6. 等待本次工作流完成并核对线上 /daily/index.html、/export-manifest.json、文章详情、原文链接、主题和深浅色切换。失败保留线上旧版，报告具体原因，不宣布成功。仅在新发布完成、失败或需要用户操作时通知；无变化保持安静。

GitHub 每次使用临时数据库，从全部公开期刊恢复历史，不需要长期云数据库或模型 API 密钥。原项目报告入口保留，未生成的周报、月报不伪造。后台、在线搜索、收藏写入、实时 API/MCP 不属于静态版功能。

依赖本机开机联网、Codex 登录与可用额度、GitHub 登录及原项目工作区访问。若要求严格时限，需要常驻执行主机。用户已要求增加模型榜、SKILL榜，使用已接入的 modules/rankings/ 扩展接口；除此之外不增加菜单或重新设计，不得创建手写主页或强制主题。

历史回填用 `backfill: true`，`researchedAt` 保留实际检索时间。回填日报按北京时间自然日归档，不伪造当日采编或人工审核。导入时间线使用原文发布日期，避免历史内容聚集到今天。

维护原则：非必要不改上游原始代码，先用 site/ 和 industry/ 已有配置；本站特有逻辑集中于模块与静态适配层。精选固定显示头条、模型、产品、行业、教程、论文、观点，五组新关键词继续作为主题与检索范围。分类按上游正文重心规则，不重新将六类关注方向当作基础分类名称。

榜单每日更新：采编时运行 `node modules/rankings/refresh.ts`，从 site/rankings.json 指定的 Artificial Analysis 和 skills.sh 读取公开榜单。成功快照保留真实采集时间，与本轮期刊一并提交 site/rankings/；即使没有新新闻，也可单独发布已成功更新的榜单。某一来源失败保留该榜旧文件与旧时间，记录并报告失败，禁止用新日期包装旧数据、改分数或执行/安装技能。发布后核对 /leaderboard/index.html 与 /skills/index.html 的来源、数据、页内切换及返回。
