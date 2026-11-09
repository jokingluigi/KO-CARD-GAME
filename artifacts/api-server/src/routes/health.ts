import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.setHeader("Cache-Control", "no-store");
  res.json({...data, revision: process.env.RENDER_GIT_COMMIT ?? process.env.VITE_BUILD_REVISION ?? "local"});
});

export default router;
