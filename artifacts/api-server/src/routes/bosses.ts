import { Router, type IRouter, type Request, type Response } from "express";
import { getAuthenticatedUser } from "../lib/auth";
import { isTestAccountUser } from "../lib/test-account";
import { completeBossMatch, createBoss, deleteBoss, listAllBosses, listBossesForUser, startBossMatch, updateBoss } from "../lib/boss-service";

async function requireUser(request: Request, response: Response) {
  const user = request.authUser ?? await getAuthenticatedUser(request);
  if (!user) { response.status(401).json({ message: "로그인이 필요합니다." }); return null; }
  request.authUser = user;
  return user;
}
const fail = (response: Response, error: unknown, fallback: string) =>
  response.status(422).json({ message: error instanceof Error ? error.message : fallback });

/** 플레이어용: 보스 목록, 시작, 결과 저장 */
export const bossesRouter: IRouter = Router();
bossesRouter.get("/", async (request, response) => {
  const user = await requireUser(request, response); if (!user) return;
  try { response.setHeader("Cache-Control", "no-store"); response.json({ bosses: await listBossesForUser(user.id) }); }
  catch (error) { fail(response, error, "보스 목록을 불러오지 못했어요."); }
});
bossesRouter.post("/:bossId/start", async (request, response) => {
  const user = await requireUser(request, response); if (!user) return;
  const { deckId, startPhase } = request.body ?? {};
  if (typeof deckId !== "string" || !deckId) { response.status(400).json({ message: "덱을 골라 주세요." }); return; }
  try {
    response.json(await startBossMatch({
      userId: user.id, isTestAccount: isTestAccountUser(user), isAdmin: user.role === "ADMIN",
      bossId: String(request.params.bossId), deckId, startPhase: typeof startPhase === "number" ? startPhase : 0,
    }));
  } catch (error) { fail(response, error, "보스전을 준비하지 못했어요."); }
});
bossesRouter.post("/matches/:matchId/complete", async (request, response) => {
  const user = await requireUser(request, response); if (!user) return;
  const actions = request.body?.actions;
  if (!Array.isArray(actions) || actions.length > 4000) { response.status(400).json({ message: "경기 기록 형식이 올바르지 않아요." }); return; }
  try { response.json(await completeBossMatch({ userId: user.id, matchId: String(request.params.matchId), actions })); }
  catch (error) { fail(response, error, "보스전 결과를 저장하지 못했어요."); }
});

/** 관리자용: 보스 만들기·고치기·지우기 */
export const adminBossesRouter: IRouter = Router();
adminBossesRouter.use(async (request, response, next) => {
  const user = await requireUser(request, response); if (!user) return;
  if (user.role !== "ADMIN") { response.status(403).json({ message: "관리자 권한이 필요합니다." }); return; }
  next();
});
adminBossesRouter.get("/", async (_request, response) => {
  try { response.json({ bosses: await listAllBosses() }); } catch (error) { fail(response, error, "보스 목록을 불러오지 못했어요."); }
});
adminBossesRouter.post("/", async (request, response) => {
  try { response.json({ boss: await createBoss(request.body ?? {}) }); } catch (error) { fail(response, error, "보스를 만들지 못했어요."); }
});
adminBossesRouter.patch("/:id", async (request, response) => {
  try {
    const boss = await updateBoss(String(request.params.id), request.body ?? {});
    if (!boss) { response.status(404).json({ message: "보스를 찾을 수 없어요." }); return; }
    response.json({ boss });
  } catch (error) { fail(response, error, "보스를 저장하지 못했어요."); }
});
adminBossesRouter.delete("/:id", async (request, response) => {
  try { response.json({ deleted: await deleteBoss(String(request.params.id)) }); } catch (error) { fail(response, error, "보스를 지우지 못했어요."); }
});
