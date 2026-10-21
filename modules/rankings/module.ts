import { defineModule } from "@aihot/contracts/modules";
export const rankingsModule = defineModule({
  name: "rankings",
  pages: [{ path: "leaderboard", file: "web/page.tsx", id: "model-leaderboard" }, { path: "skills", file: "web/page.tsx", id: "skill-leaderboard" }],
  apiPaths: [/^\/api\/site\/rankings\/(models|skills)$/],
});
