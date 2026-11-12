const { invoke } = window.__TAURI__.core;
const byId = (id) => document.getElementById(id);
const taskInfo = {
  research: ["新闻采编", "Codex CLI", "采编一次"],
  rankings: ["榜单更新", "模型榜与 SKILL 榜", "刷新榜单"],
  fulltext: ["正文翻译", "Codex CLI", "检查正文"],
  publish: ["线上发布", "同步 GitHub 并验证网站", "检查并发布"],
  oss: ["香港 OSS", "shendeng-news-hk", "导出并同步"],
};
const phases = {
  idle: "无待处理任务", discovering: "发现候选信源", "reading-sources": "读取候选原文",
  researching: "Codex 正在采编", validating: "校验内容", checked: "完成",
  fetching: "读取原始数据", translating: "Codex 正在翻译", partial: "部分完成",
  "syncing-github": "同步公开内容到 GitHub", "waiting-for-pages": "等待 GitHub Pages",
  "pages-running": "GitHub Pages 正在构建", "publishing-oss": "正在部署至香港 OSS",
  "up-to-date": "内容已同步", checking: "检查发布配置", exporting: "导出静态页面",
  "local-ready": "本地静态产物已就绪", uploading: "增量上传对象",
  verifying: "核验线上内容", published: "发布已验证", failed: "执行失败", disabled: "已关闭",
};
const finalPhases = new Set(["checked", "partial", "up-to-date", "local-ready", "published", "failed", "idle", "disabled"]);
const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const formatTime = (value) => value ? dateFormat.format(new Date(value * 1000)) : "";
let dashboard;
let historyKey;
let busy = false;

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function phaseLabel(status) {
  return phases[status?.phase] ?? "等待首次运行";
}

function phaseClass(status) {
  const phase = status?.phase;
  if (phase === "failed") return "bad";
  if (["partial", "local-ready"].includes(phase)) return "warn";
  if (phase && !finalPhases.has(phase)) return "running";
  if (["checked", "published", "up-to-date"].includes(phase)) return "good";
  return "";
}

function details(status) {
  if (!status) return "";
  const parts = [];
  if (Number.isInteger(status.steps)) parts.push(`已完成 ${status.steps} 个 CLI 步骤`);
  if (Number.isInteger(status.candidates)) parts.push(`${status.candidates} 个候选链接`);
  if (status.sourceFailures) parts.push(`${status.sourceFailures} 个来源暂不可读`);
  if (Number.isInteger(status.proposedItems)) parts.push(`本轮候选 ${status.proposedItems} 条`);
  if (status.phase === "exporting") parts.push(`已导出 ${status.completed} 页`);
  else if (status.phase === "local-ready") parts.push(`本地产物 ${status.total} 个文件`);
  else if (Number.isInteger(status.completed)) parts.push(
    Number.isInteger(status.total) ? `${status.completed} / ${status.total}` : `完成 ${status.completed}`);
  if (status.failed) parts.push(`${status.failed} 条待重试`);
  if (status.remaining) parts.push(`${status.remaining} 条待处理`);
  if (status.changed) parts.push(`${status.changed} 个公开文件`);
  if (status.runNumber) parts.push(`GitHub 运行 #${status.runNumber}`);
  return parts.join(" · ");
}

function errorText(status) {
  const message = status?.error ?? "";
  if (message.includes("OSS upload needs")) return "等待本机 OSS 上传授权";
  if (message.includes("Public HTTPS domain")) return "正式域名尚未通过 OSS HTTPS 验证";
  if (message.includes("Ranking refresh failed")) return "榜单源读取失败，已保留可用快照";
  if (message.includes("Local Codex research failed")) return "Codex 采编失败，可在本机服务日志排查";
  if (message.includes("Static export failed")) return "导出失败，可查看本机 oss-export.log";
  return message;
}

function summary(label, value, mode) {
  const box = element("div", "", "summary-item");
  box.append(element("span", label, "eyebrow"), element("strong", value, mode));
  return box;
}

for (const [id, [title, subtitle, action]] of Object.entries(taskInfo)) {
  const card = element("article", "", "card");
  card.id = `task-${id}`;
  const titleRow = element("div", "", "task-heading");
  titleRow.append(element("h2", title), element("span", "", "badge"));
  const progress = element("progress");
  progress.setAttribute("aria-label", `${title}进度`);
  progress.hidden = true;
  const button = element("button", action);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await invoke("request_task", { task: id });
      byId("message").textContent = `已提交「${title}」，常驻服务会接手执行。`;
    } catch (error) {
      byId("message").textContent = String(error);
    }
    await refresh();
  });
  card.append(titleRow, element("p", subtitle, "subtitle"), element("p", "", "metrics"),
    progress, element("p", "", "issue"), element("time"), button);
  byId("tasks").append(card);
}
const filter = byId("filter");
for (const [value, name] of [["all", "全部任务"], ...Object.entries(taskInfo).map(([id, [name]]) => [id, name])]) {
  const option = element("option", name);
  option.value = value;
  filter.append(option);
}
filter.addEventListener("change", () => dashboard && renderHistory(dashboard.events));

function renderHistory(events) {
  const key = `${filter.value}|${events[0]?.updatedAt}|${events.length}`;
  if (historyKey === key) return;
  historyKey = key;
  const groups = new Map();
  for (const event of events) {
    if (filter.value !== "all" && event.task !== filter.value) continue;
    if (!groups.has(event.runId)) groups.set(event.runId, []);
    groups.get(event.runId).push(event);
  }
  const open = new Set([...byId("runs").querySelectorAll("details[open]")].map((node) => node.dataset.run));
  const rows = [...groups.entries()].slice(0, 50).map(([id, events]) => {
    const latest = events[0];
    const row = element("li");
    const disclosure = element("details");
    disclosure.dataset.run = id;
    disclosure.open = open.has(id);
    const title = element("summary");
    title.append(element("strong", taskInfo[latest.task][0]),
      element("span", phaseLabel(latest), `badge ${phaseClass(latest)}`),
      element("time", formatTime(latest.updatedAt)));
    const timeline = element("ol", "", "timeline");
    const chronological = [...events].reverse();
    for (const [i, event] of chronological.entries()) {
      if (event.phase === chronological[i + 1]?.phase) continue;
      const line = element("li");
      line.append(element("time", formatTime(event.updatedAt)), element("strong", phaseLabel(event)),
        element("span", [details(event), errorText(event)].filter(Boolean).join(" · ")));
      timeline.append(line);
    }
    disclosure.append(title, timeline);
    row.append(disclosure);
    return row;
  });
  if (!rows.length) rows.push(element("li", "该任务的下一次运行会在这里留下执行记录。", "empty"));
  byId("runs").replaceChildren(...rows);
}

function render(state) {
  const connection = byId("connection");
  connection.textContent = state.running ? "常驻服务在线" : "常驻服务未连接";
  connection.className = `badge ${state.running ? "good" : "bad"}`;
  byId("summary").replaceChildren(
    summary("Codex CLI", state.codexReady ? "已接入" : "未找到", state.codexReady ? "positive" : ""),
    summary("正式站点", state.ossActive ? "香港 OSS（已配置）" : "GitHub Pages"),
    summary("香港 OSS 上传", state.ossReady ? "已配置" : "等待上传授权", state.ossReady ? "positive" : "attention"),
  );
  for (const [id, task] of Object.entries(state.tasks)) {
    const card = byId(`task-${id}`);
    const status = task.status;
    const badge = card.querySelector(".badge");
    const active = status?.phase && !finalPhases.has(status.phase);
    badge.className = `badge ${phaseClass(status)}`;
    badge.textContent = phaseLabel(status);
    card.querySelector(".metrics").textContent = details(status);
    card.querySelector(".issue").textContent = errorText(status);
    card.querySelector("time").textContent = formatTime(status?.updatedAt);
    const progress = card.querySelector("progress");
    progress.hidden = !(active && state.running);
    if (status?.total > 0 && Number.isInteger(status.completed)) {
      progress.max = status.total;
      progress.value = status.completed;
    } else {
      progress.removeAttribute("value");
    }
    const button = card.querySelector("button");
    button.disabled = !state.running || task.queued;
    button.textContent = task.queued ? "已排队" : taskInfo[id][2];
  }
  renderHistory(state.events);
}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    dashboard = await invoke("dashboard");
    render(dashboard);
  } catch {
    byId("connection").textContent = "无法读取本机任务";
    byId("connection").className = "badge bad";
  } finally {
    busy = false;
  }
}

void refresh();
setInterval(refresh, 2000);
