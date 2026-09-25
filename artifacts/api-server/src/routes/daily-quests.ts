import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { CompleteAIMatchQuestProgressBody } from "@workspace/api-zod";
import { dailyQuestAssignmentsTable, dailyQuestDefinitionsTable, db } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { isTestAccountUser } from "../lib/test-account";
import { completeAIMatchQuestProgress } from "../lib/ai-match-quest-service";
import {
  claimDailyQuest,
  ensureDailyQuestAssignments,
  publicDailyQuest,
} from "../lib/daily-quest-service";

const router: IRouter = Router();

router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    request.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/", async (request, response): Promise<void> => {
  const assignments = await ensureDailyQuestAssignments(request.authUser!.id);
  response.setHeader("Cache-Control", "no-store");
  response.json({ assignments: assignments.map(publicDailyQuest) });
});

router.post("/ai-match-progress", async (request, response): Promise<void> => {
  const parsed = CompleteAIMatchQuestProgressBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "AI 경기 기록 형식이 올바르지 않습니다." });
    return;
  }
  try {
    await completeAIMatchQuestProgress({
      ...parsed.data,
      userId: request.authUser!.id,
      isTestAccount: isTestAccountUser(request.authUser!),
    });
    response.json({ completed: true });
  } catch (error) {
    response.status(422).json({
      message: error instanceof Error ? error.message : "AI 경기 Quest 진행을 저장할 수 없습니다.",
    });
  }
});

router.post("/:id/claim", async (request, response): Promise<void> => {
  try {
    const result = await claimDailyQuest(request.authUser!.id, request.params.id);
    response.json({
      assignment: publicDailyQuest(result.assignment),
      reward: result.reward,
      alreadyClaimed: result.alreadyClaimed,
    });
  } catch (error) {
    response.status(422).json({ message: error instanceof Error ? error.message : "일일 퀘스트 보상을 받을 수 없습니다." });
  }
});

export default router;