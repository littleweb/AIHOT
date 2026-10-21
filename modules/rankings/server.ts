import type { ServerModule } from "@aihot/backend/modules";
import { readRanking } from "./publication.ts";
export const rankingsServer: ServerModule = {
  name: "rankings",
  http(app) {
    for (const kind of ["models", "skills"] as const) app.get(`/api/site/rankings/${kind}`, async (_request, reply) => {
      const snapshot = await readRanking(kind);
      return reply.header("Cache-Control", "public, max-age=60, s-maxage=300").send(snapshot);
    });
  },
};
