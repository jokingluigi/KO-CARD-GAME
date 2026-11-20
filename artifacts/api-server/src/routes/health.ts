import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { CARD_TEXT_REVISION_SET } from "@workspace/game-engine";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("Cache-Control", "no-store");
  res.json({...data, revision: process.env.RENDER_GIT_COMMIT ?? process.env.VITE_BUILD_REVISION ?? "local", cardTextRevisions: CARD_TEXT_REVISION_SET});
});

export default router;
