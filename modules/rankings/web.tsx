import type { WebModule } from "../../apps/web/app/modules.ts";
import { IconChart, IconCode } from "../../apps/web/app/components/icons.tsx";
export const rankingsWeb: WebModule = {
  name: "rankings",
  sidebar: { section: "榜单", items: [{ to: "/leaderboard", label: "模型榜", icon: IconChart }, { to: "/skills", label: "SKILL榜", icon: IconCode }] },
  tabs: [{ key: "rankings", to: "/leaderboard", label: "模型榜", icon: IconChart }],
  tools: [{ to: "/leaderboard", label: "模型榜", icon: <IconChart size={18} /> }, { to: "/skills", label: "SKILL榜", icon: <IconCode size={18} /> }],
};
