import { loader } from "./loader.ts";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { Link, useLoaderData } from "react-router";
import { pageHeaders } from "../../../apps/web/app/lib/api.server.ts";
import { pageMeta } from "../../../apps/web/app/lib/seo.ts";
import { PhoneBar } from "../../../apps/web/app/components/shell/PhoneBar.tsx";
import { PillTabs } from "../../../apps/web/app/components/ui/Tabs.tsx";
import type { Screen } from "../../../apps/web/app/components/shell/screens.ts";
import type { RankingSnapshot } from "../data.ts";
export const handle: Screen = { tab: "rankings", name: "榜单" };
export const headers = pageHeaders;
export { loader } from "./loader.ts";
export function meta({ loaderData }: { loaderData?: RankingSnapshot }) {
  return pageMeta({ title: loaderData?.kind === "skills" ? "SKILL榜 · 热门 Agent 技能" : "模型榜 · 第三方评测", path: loaderData?.kind === "skills" ? "/skills" : "/leaderboard" });
}
export default function RankingPage() {
  const snapshot = useLoaderData<typeof loader>();
  const skills = snapshot.kind === "skills";
  const title = skills ? "SKILL榜" : "模型榜";
  const captured = `${beijingDate(snapshot.capturedAt)} ${beijingTime(snapshot.capturedAt)}`;
  return <div className="pb-10">
    <PhoneBar title={title} back={{ to: "/", label: "精选" }} />
    <h1 data-page-title className="mb-4 text-[24px] font-semibold text-ink">{title}</h1>
    <PillTabs label="切换榜单" layoutId="ranking-kind" active={snapshot.kind} items={[{ key: "models", label: "模型榜", to: "/leaderboard" }, { key: "skills", label: "SKILL榜", to: "/skills" }]} />
    <p className="mt-5 max-w-3xl text-[14px] leading-7 text-ink-2">{skills ? "按 skills.sh 累计安装热度展示热门 Agent Skills，保留来源的顺序和缩写数值。安装量反映热度，不代表质量评分或安全审计；查看原文与仓库后再决定是否使用。" : "按 Artificial Analysis Intelligence Index 展示前十项评测配置，保留原始分数、完整模型名称与推理模式。不同推理配置分别列项，分数不是正确率，详细评测口径以来源说明为准。"}</p>
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-4">
      <span>来源：<a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{snapshot.sourceName} ↗</a></span>
      <span>采集时间：{captured}（北京时间）</span><span>{snapshot.rows.length} 项 · 每日更新快照</span>
    </div>
    <div className="mt-6 overflow-x-auto rounded-panel border border-line">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">{title}，按{snapshot.metric}排序</caption>
        <thead className="bg-well text-[12px] text-ink-3"><tr>
          <th scope="col" className="whitespace-nowrap p-4 font-medium">名次</th><th scope="col" className="p-4 font-medium">{skills ? "技能 / 来源" : "模型 / 机构"}</th><th scope="col" className="whitespace-nowrap p-4 text-right font-medium">{skills ? snapshot.metric : "智能指数"}</th>
          {!skills && <th scope="col" className="hidden p-4 font-medium lg:table-cell">上下文 / 输出速度</th>}
        </tr></thead>
        <tbody>{snapshot.rows.map(row => <tr key={`${row.rank}-${row.name}`} className="border-t border-line">
          <td className="num p-4 align-top text-ink-4">{String(row.rank).padStart(2, "0")}</td>
          <td className="p-4"><a href={row.url} target="_blank" rel="noopener noreferrer" className="font-semibold leading-6 text-ink hover:text-accent">{row.name} ↗</a><div className="mt-1 text-[12px] text-ink-4">{row.owner}</div></td>
          <td className="num whitespace-nowrap p-4 text-right align-top font-semibold text-accent">{row.displayValue}</td>
          {!skills && <td className="hidden p-4 align-top text-ink-3 lg:table-cell">{row.context}<div className="mt-1 text-[12px] text-ink-4">{row.speed} tokens/s</div></td>}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="mt-5 flex flex-wrap gap-5 text-[13px] text-ink-3"><a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">查看完整原榜与计算方法 ↗</a><Link to={skills ? "/leaderboard" : "/skills"} className="hover:text-accent">{skills ? "查看模型榜 →" : "查看 SKILL榜 →"}</Link></div>
    <p className="mt-5 text-[12px] leading-6 text-ink-4">这是公开榜单的定期快照，采集时间不等于来源发布或评测时间。来源不可用时保留上次成功数据和原采集时间。</p>
  </div>;
}
