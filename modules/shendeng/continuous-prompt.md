你在执行用户已授权的神灯AI热点本机持续采编任务。只读检索，不修改文件、不启动其他任务、不调用模型 API、不发布、不操作 Git。最终只按指定 JSON Schema 返回本轮新增条目和跳过原因。没有可信新信息时 items 返回空数组。

先读 AGENTS.md、docs/customize.md、docs/local-codex-update.md、docs/shengdeng.md、site/social-sources.json、site/research-keywords.json、industry/taxonomy.ts、industry/prompts/prefilter.md、industry/prompts/selection-score.md、industry/prompts/structure.md、modules/shendeng/edition.ts 和 site/editions/ 中已有条目。沿用已有预筛、质量和正文重心标准，不生成原引擎评分。当前系统时间是真实核对时间。不要读取 .env、登录凭据或其他私有文件。

每轮按 AI产品、AI硬件、AI玩法、AI创业、AI赛道五组中英文关键词与检索式检索，结合已配 RSS 和公开社交信源。逐一检查五个公众号及两个小红书账号的公开原文，打不开原文、不能核对账号或日期时跳过，原因列入 skipped。不得把官网文章冒充公众号帖子，不把搜索摘要、AI 总结或视频标题当作已阅读全文，不返回 Cookie、登录态或 xsec_token。

先获取 .data/service/discovery.json 中的候选原文链接；它只用于发现线索，禁止复用聚合站标题、摘要、评分或时间作为原文核验结果。逐一打开相关原文，重点检查上轮以来新出现的候选。若文件中的单个来源失败，使用该来源已保留的旧候选并在 skipped 中注明覆盖限制。不要仅依赖宽泛搜索来判断“没有新消息”。

事件归组沿用原项目：同一具体发布或进展，event 填 {key,title,factKey,factTitle}，key 指同一事件，factKey 指事件内同一具体事实；直接后续进展可复用事件 key，但必须采用不同 factKey；先复用历史条目的 event.key，不能只因同属一家公司或同一技术就合并。各原文必须确实支持同一事实。每个重要事件尽量核对至少两个独立参与方的原文。具有独立新增价值的报道 selected=true；只用于交叉核对的同事件原文 selected=false，后者可覆盖近48小时但不会冒充精选新消息。没有充分归组依据时 event=null，保留独立条目。对同一事件的新进展应单独建 key，避免把不同事实强行折成一条。热度由原程序根据真实独立信源和时间计算，你不得生成热度数字、趋势或原评分。

只收近24小时有价值的新信息，打开原文核对作者、发布日期、数字、适用条件。与全部历史归档按网址和新闻事实去重，同一事件仅在有重要新增事实时再收录。优先官方与原创；不要夸大收益、把融资写成成功、把计划写成已落地，保留来源自述与独立验证的区别。覆盖国内外 AI 热点、实用分享、产品成效、商业化、报告、创作者经验。每轮通常0–8条，不凑数；晨间可增加，以整日12–20条有用信息为目标。

date 为当前北京时间日期，researchedAt 为实际完成核对的 ISO 时间，backfill 不设置。items 是本轮新增记录，字段严格遵循 CodexItem。官方原站 T1，媒体和个人来源 T2；媒体刊登的企业供稿也按媒体来源记 T2，不改变既有媒体信源的分级。entity/subjects 是实际主体公司的词表ID，不把报道媒体当作主体。category 从原有六类 key 选择，tags 按正文重心与证据填写，五组关键词是主题，不替代分类。quote 只摘极短原文证据；reason 明确 Codex 来源核对，不冒充人工审核或原模型评分。公开 URL 不带任何登录签名。图片/视频非必需，无法确认时省略。
