# RoboTaxi 运行与发布

品牌为 RoboTaxi，内容不限自动驾驶。六个栏目为国内外 AI 热点、实用 AI 分享、AI 成功产品、AI 赚钱、AI 报告、AI 博主。保留分类 URL key，显示名称和模型指引已调整。精选分数与五维权重不变，需运营者标注 100–200 条后再校准。

## 公开静态版

公开仓库 https://github.com/littleweb/shengdeng.news ，Pages 使用 GitHub Actions 发布。公开版只包含信源原始标题、来源及原文链接，不展示全文、不做收益背书，也不声称经过模型精选。六个栏目当前是编辑关注方向，列表尚未逐条语义归类；搜索可按标题或来源过滤。

工作流 `.github/workflows/publish.yml` 每天 UTC 23:00（次日北京时间 07:00）启动，35 分钟超时，目标北京时间 08:00 前完成。GitHub 调度与外部源可用性不提供严格时间保证。失败时不部署，保留前次版本；Actions 会显示失败，可手动重跑。若业务要求严格早八点，需另选长期在线主机或有时限保障的调度服务。

每次抓取近 30 天的数据，每个源最多 12 条；无日期资料明确标注，未来资料剔除，按原文 URL 去重。少数派为综合源，仅按标题中的 AI 关键词初筛，可能漏收。成功读取少于半数或全站没有条目时构建失败。单源错误在页面及 briefing.json 公开，生成时间与文章发布时间分开。源失效时旧条目不自动沿用。无需数据库、模型密钥或本机常开；不使用原站的 API 或内容。

静态 HTML 产物在 `dist/`，每次 Actions 保存 30 天的 `robotaxi-static-html` 下载包并发布 Pages。

```bash
npm ci
COLLECT_ENABLED=true MODEL_CALLS_ENABLED=false node modules/static/scripts/build.ts
python3 -m http.server 8080 --directory dist
```

构建脚本的第一个参数可改产物目录。页面不提供动态版的登录、MCP、评分或日报接口，不发布假接口。

## 完整动态引擎

依照 docs/deploy.md 部署 PostgreSQL、API、worker 和 web；配置模型 API、管理员及签名密钥后，才显式设置 COLLECT_ENABLED=true 和 MODEL_CALLS_ENABLED=true。开发配置默认关闭外部采集和模型调用。模型费用受原有预算与回执控制。日报已调整到北京时间 07:00。静态版与完整引擎目前是两个明确区分的出口，静态版不自动获得动态版的评分与摘要。

## 运营者仍需确定

- 信源白名单和具体博主名单，是否接受目前的公开 AI 源；国内综合源的覆盖与质量。
- 对“重要/噪声”的样本标注，成功产品与商业化数据的证明要求。
- 模型供应商、密钥、月度预算，以及是否部署完整引擎的长期主机。
- 正式运营主体、联系方式、条款和隐私政策；site/pages 的草案尚未获确认。静态页只说明当前实际行为与预览状态。
- 是否拥有 shengdeng.news 域名及其 DNS 管理权。仓库名称不会自动获得域名；当前不写 CNAME，避免误绑定。
