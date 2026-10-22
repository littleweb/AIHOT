# 本机常驻服务与持续发布

用户已于 2026-10-22 授权本机常驻运行，并在有已核实内容更新时同步本地与线上。新增能力集中在 `modules/shendeng/service/`、`modules/shendeng/merge-research.ts` 和 `site/continuous.json`，不改上游界面和热度规则；必要的事件导入接口见末节。

## 运行安排

- macOS 登录后由 LaunchAgent `news.shendeng.local` 启动，进程退出后重新拉起。启动原 API（127.0.0.1:3091）、生产网页（127.0.0.1:3090）和原 worker，同时启动采编与发布两个独立进程。
- `site/continuous.json` 控制频率：每小时一次公开来源检索，每天北京时间 05:30 额外检查晨间任务，发布进程每 60 秒检查公开 JSON 变化。正在执行的采编不会重叠启动。合盖休眠、关机或退出登录期间不能采编，唤醒后补查；线上旧版仍由 GitHub Pages 提供。
- 沿用本地已登录 Codex CLI，不需要本次聊天持续打开。Codex 在只读沙箱中读取公开配置和历史、查阅原文，输出符合 JSON Schema 的候选结果；没有任何新闻入选时允许空结果。程序负责验证、去重和追加当天 JSON，模型不直接写仓库、操作 Git 或发布。每轮先读取已配 RSS 和 site/discovery.json 的公开原文索引，将候选链接保存至 .data/service/discovery.json；聚合索引仅用于发现，不复用其摘要、评分或收录时间，仍须打开原文核对。原 `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 与推送阀保持关闭，没有启用原项目双模型自动评分。
- 每天更新一次模型榜和 SKILL榜。单榜失败保留旧数据与真实旧时间，成功的另一榜可发布。首次启用服务时允许一次即时更新。
- 采编时间取实际核对完成时间，新增条目只接受过去24小时原文。同网址已经归档的不会再次导入；当天旧条目保持不变，不覆盖历史。跨来源同事件的语义去重仍由采编按原文判断。实时条目持久保存 addedAt（首次核对入选时间），按上游收录时间规则进入精选；原文日期保留在 date。历史回填仍按原文日期排序。重复导入和重新构建不得改写 addedAt。
- 发布进程发现变化后校验全部期刊、运行类型检查、导入本地数据库并做冒烟检查；仅把 `site/editions/*.json`、`site/rankings/*.json` 本轮变动写入公开仓库。使用远端最新 main 为父提交，不强推，不覆盖独立远端内容编辑。
- 现有 `publish.yml` 从全部公开期刊重建临时库并导出原 SSR 页面，保留静态 HTML 产物，部署 GitHub Pages。服务等待本次工作流成功，再核对线上首页、日报、主题、详情原文及返回、两个榜单和导出清单。部署失败保留原线上版本，记录失败，不能报告发布成功。待完成的提交保存到本机状态，重启后继续检查。

## 本机入口与状态

- 网站：<http://127.0.0.1:3090/>
- 状态：<http://127.0.0.1:3092/>（只监听本机，不向公网开放）
- 原 API 健康：<http://127.0.0.1:3091/api/health>
- 所有日志、数据库备份、候选、跳过原因、机器路径与发布状态放在 `.data/service/`，不提交。密钥仅由原 API/worker 从本机 `.env` 读取；网页进程不接收数据库和模型密钥。Codex 复用本机已有登录，绝不复制登录凭据到仓库或 GitHub。

已有每日 05:30 的桌面自动任务改为晨间巡检：服务正常时不重复采编或发布。服务明确失败、需要补采时，必须先取得同一 `research` / `publish` 文件锁；不能与后台任务同时写当天期刊。

## 安装与维护

需要 Node >=24.11、Python 3、PostgreSQL 17、已登录的 gh 和 Codex CLI。安装前备份数据库、运行迁移和构建网页。安装器接收本机已有程序和数据库路径，写入 `.data/service/runtime.json`；不把机器绝对路径写进公开配置。可用 `--proxy` 指定系统已经使用的本地 HTTP 代理，localhost 固定绕过代理。该参数不更改系统网络设置。

```bash
python3 modules/shendeng/service/manage.py install \
  --node /absolute/path/to/node \
  --codex /absolute/path/to/codex \
  --pg-bin /absolute/path/to/postgres/bin \
  --pg-data /absolute/path/to/existing/database
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/news.shendeng.local.plist
python3 modules/shendeng/service/manage.py status
```

项目位于“文稿”文件夹时，macOS 可能要求 Python 访问文稿的许可；需用户本人在系统提示中允许。服务启动成功以健康检查为准，不能以 plist 已安装为准。

暂停服务用 `launchctl bootout gui/$(id -u)/news.shendeng.local`；它会停止自己的子进程，不停止共享 PostgreSQL、不删除数据。修改启动代码或频率后停止再 bootstrap。服务不自动拉取和部署上游代码；升级先在独立分支验证，避免把未经检查的代码推到线上。

手工补采可执行 `python3 modules/shendeng/service/research.py --once`；手工同步可执行 `python3 modules/shendeng/service/publish.py --once`。运行中的对应进程持有文件锁，会拒绝并发手工任务。发布失败须先查看 `publish-status.json` 和私有日志，不手动清除 pending 提交冒充完成。

## 验证与升级

除 AGENTS.md 的类型、后端、网页、冒烟检查外，运行 `python3 -m unittest discover -s modules/shendeng/service/tests -v`。重点验证空结果不发布、增量不覆盖历史、远端并发编辑不会被覆盖、晨间额外运行、进程故障后重启以及线上详情返回/主题/榜单。升级上游时核对 importer 与公开接口、worker 安全阀和现有静态导出流程，不复制旧核心文件覆盖新核心。

## 事件与热点（2026-10-22 修复）

此前导入把全部文章设为 standalone，导致事件、事实与热度证据始终为零；运行 worker 本身不能修复缺失的身份数据。现由 Codex 核对原文后填写 event 的 key/title 与 factKey/factTitle，分别代表同一事件与其具体事实。跨来源同一事实归组，不同直接进展保留不同事实。同属一家公司或方向不构成归组依据。selected=false 的交叉核对材料只补证据，不重复进入精选；它们可覆盖热点所需的近48小时窗口，并保留真实原文日期。

modules/shendeng/group-reviewed.ts 使用原事件模型及 moveToFact，原 computeHotRanking/snapshotHeat 生成热点。独立参与方去重、48小时窗口、24小时半衰期、至少两个独立参与方和至少一个报道来源的规则不变，不手写分数或假趋势。只有两个热点时首页的热点条仍按原规则隐藏（首页条要求至少三个），独立热点页照常显示。

必要核心差异只有 packages/backend/src/events/corrections.ts 的 ensureImportedFact 导入接口。上游创建事件/事实的函数仅供自动归组内部使用，没有可调用的编辑导入接口；模块直接写核心表也被 architecture.test.ts 明确禁止。因此把幂等创建和审计放回 events 所属层，模块只调用接口，不更改原有归组、公开读取、阈值或热度计算。升级时核对该接口、moveToFact 与 source participant 规则，并运行 import-topics.test.ts 的双来源热点、重复导入和收录时间测试。上游若提供等价接口，删除此小差异。

发布进程还检查原公开热点接口：排名成员、独立参与数或公开热度数值变化（包括48小时证据到期）时，调用既有 workflow_dispatch 重新导出当前公开源，不制造新闻提交；未变化时不重复发布。发布后核对热点条目及事件页均在 export-manifest.json 中，抽查事件详情和返回。

2026-10-22 午间修复：已发生两轮因单条日期窗口校验而整批失败。增量合并先跳过已归档网址，再按实际核对完成时间分别判断新消息24小时、事件交叉证据48小时；窗口外或仅有日期而无法证明在窗口内的记录跳过并写入本机 research-merge.json 和采编状态，其余合格条目照常追加。原文日期精度不得补造，安全链接、结构和未来日期校验仍保留。升级时运行 continuous.standalone.test.ts 的混合候选回归，核对旧档案及 addedAt 不变。

## 热点数值变化的持续发布

2026-10-22 修复热点同步只比较排名、标题和参与人数的遗漏。发布进程每分钟读取原公开 `/api/site/hot`，同时比较热度、趋势、涨跌幅、徽标、热度曲线和最新进展。原 worker 仍每 5 分钟计算一次；这些公开数值变化时，使用现有 `publish.yml` 从公开期刊恢复数据库并重新导出，不产生虚假的新闻提交。只变计算时间、不变数值时不重复发布。新新闻只有一个来源时可能进入精选而不满足原热点榜的多来源条件，不将其强行写入热点。

线上更新时间保留真实计算时间，静态发布还需等待构建与部署。已打开的页面是加载时的快照，重新打开或刷新才能加载最新发布；不能将浏览器停留时显示的时间当作后台进程的运行状态。
