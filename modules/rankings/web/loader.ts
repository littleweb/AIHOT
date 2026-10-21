import { apiGet, cachedPage } from "../../../apps/web/app/lib/api.server.ts";
import type { RankingSnapshot } from "../data.ts";
export async function loader({ request }: { request: Request }) {
  const kind = new URL(request.url).pathname.replace(/\.data$/, "") === "/skills" ? "skills" : "models";
  return cachedPage(300, await apiGet<RankingSnapshot>(`/api/site/rankings/${kind}`, { signal: request.signal }));
}
