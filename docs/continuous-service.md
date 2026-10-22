# 本机常驻服务与持续发布

用户已于 2026-10-22 授权本机常驻运行，并在有已核实内容更新时同步本地与线上。新增能力集中在 `modules/shendeng/service/`、`modules/shendeng/merge-research.ts` 和 `site/continuous.json`，不修改上游 apps/packages。

## 运行安排

- macOS 登录后由 LaunchAgent `news.shendeng.local` 启动，进程退出后重新拉起。启动原 API（127.0.0.1:3091）、生产网页（127.0.0.1:3090）和原 worker，同时启动采编与发布两个独立进程。
- `site/continuous.json` 控制频率：每小时一次公开来源检索，每天北京时间 05:30 额外检查晨间任务，发布进程每 60 秒检查公开 JSON 变化。正在执行的采编不会重叠启动。合盖休眠、关机或退出登录期间不能采编，唤醒后补查；线上旧版仍由 GitHub Pages 提供。
- 沿用本地已登录 Codex CLI，不需要本次聊天持续打开。Codex 在只读沙箱中读取公开配置和历史、查阅原文，输出符合 JSON Schema 的候选结果；没有任何新闻入选时允许空结果。程序负责验证、去重和追加当天 JSON，模型不直接写仓库、操作 Git 或发布。原 `COLLECT_ENABLED`、`MODEL_CALLS_ENABLED` 与推送阀保持关闭，没有启用原项目双模型自动评分。
- 每天更新一次模型榜和 SKILL榜。单榜失败保留旧数据与真实旧时间，成功的另一榜可发布。首次启用服务时允许一次即时更新。
- 采编时间取实际核对完成时间，新增条目只接受过去24小时原文。同网址已经归档的不会再次导入；当天旧条目保持不变，不覆盖历史。跨来源同事件的语义去重仍由采编按原文判断。
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
