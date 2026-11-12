# 神灯AI热点控制台

控制台由 Tauri 打包为 macOS 应用。它读取当前工作区常驻服务的任务状态，提交手动请求并显示各轮阶段、进度、失败原因和北京时间。关闭窗口后常驻服务仍按原定周期采编、翻译、刷新榜单和发布。

在本目录构建应用，Rust 工具链须在 PATH 中。

```sh
npm exec --yes --package=@tauri-apps/cli@2.12.4 -- tauri build --bundles app
```

应用绑定构建所在的站点工作区。迁移工作区后在新位置重建。状态与任务历史保存在 `.data/service`。历史从这次升级后的首次任务开始记录。新闻采编与正文翻译使用本机已登录的 Codex CLI，新闻采编从 JSON 事件读取已完成的步骤数。日志、完整 CLI 输出和授权文件只保留在本机。

## 香港 OSS

固定使用香港桶 `shendeng-news-hk`。以工作区私有文件 `.data/service/oss.json` 选择发布方式。

```json
{
  "mode": "preview",
  "cli": "/absolute/path/to/ossutil",
  "configFile": "/absolute/path/to/.ossutilconfig"
}
```

在上述 ossutil 2 配置文件中提供 `shendeng-news` profile，凭证仅授予此桶发布所需的权限。控制台不会显示或同步凭证。按钮「导出并同步」调用原站点的公开 SSR 导出，产物位于 `.data/service/oss-static`。预览模式先产出完整静态站，配置可用时再上传并核对桶地址。首轮上传完整文件，后续按内容哈希上传变化的对象，保留历史对象。每次仍需检查并渲染公开页面，已有分享海报由原渲染器缓存。首页和发布清单最后上传。生产发布前保留将被覆盖的对象，上传或校验失败时尝试恢复，恢复失败会保留待恢复记录并显示错误。OSS 不提供整站单次原子切换。

确认 OSS 上已有完整快照，并且 `https://shendeng.news/` 在 TLS 下实际返回同一份清单和站点内容后，将 `mode` 设为 `active`。常驻发布服务仍先将已校验的公开数据同步 GitHub，再直接发布 OSS 并检查正式站点。切换模式前须完成已排队的发布。预览期间 GitHub Pages 继续提供正式站点。

维护时在项目根目录运行以下验证。

```sh
python3 -m unittest discover -s modules/shendeng/service/tests
node --check modules/shendeng/desktop/ui/app.js
npm run typecheck
node scripts/smoke.ts --base http://127.0.0.1:3090
```
