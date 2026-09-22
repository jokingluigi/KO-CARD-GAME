import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  attendanceRewardDefinitionsTable,
  dailyQuestDefinitionsTable,
  db,
  rewardSettingsTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import {
  DAILY_QUEST_OBJECTIVES,
  validateDailyQuestInput,
} from "../lib/daily-quest-service";
import { validateAttendanceInput } from "../lib/attendance-service";
import { REWARD_TYPE } from "../lib/reward-service";

const router: IRouter = Router();

function requireAdmin(request: Request, response: Response): boolean {
  if (request.authUser?.role === "ADMIN") return true;
  response.status(request.authUser ? 403 : 401).json({ message: request.authUser ? "관리자 권한이 필요합니다." : "로그인이 필요합니다." });
  return false;
}

router.use(async (request, response, next) => {
  try {
    request.authUser = (await getAuthenticatedUser(request)) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [settings, dailyQuests, attendance] = await Promise.all([
    db.select().from(rewardSettingsTable).orderBy(asc(rewardSettingsTable.key)),
    db.select().from(dailyQuestDefinitionsTable).orderBy(asc(dailyQuestDefinitionsTable.createdAt), asc(dailyQuestDefinitionsTable.id)),
    db.select().from(attendanceRewardDefinitionsTable).orderBy(asc(attendanceRewardDefinitionsTable.dayIndex)),
  ]);
  response.json({ settings, dailyQuests, attendance, rewardType: REWARD_TYPE, objectiveTypes: DAILY_QUEST_OBJECTIVES });
});

router.patch("/match", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const winAmount = request.body?.winAmount;
  const lossAmount = request.body?.lossAmount;
  const enabled = request.body?.enabled === true;
  if (
    !Number.isSafeInteger(winAmount) || winAmount < 1 ||
    !Number.isSafeInteger(lossAmount) || lossAmount < 1
  ) {
    response.status(400).json({ message: "승리/패배 보상은 1 이상의 정수여야 합니다." });
    return;
  }
  await db.transaction(async (tx) => {
    for (const [key, amount] of [["MATCH_ONLINE_WIN", winAmount], ["MATCH_ONLINE_LOSS", lossAmount]] as const) {
      await tx.insert(rewardSettingsTable)
        .values({ key, rewardType: REWARD_TYPE, amount, enabled, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: rewardSettingsTable.key,
          set: { rewardType: REWARD_TYPE, amount, enabled, updatedAt: new Date() },
        });
    }
  });
  response.json({ updated: true });
});

router.post("/daily-quests", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = validateDailyQuestInput(request.body);
  if (!input) {
    response.status(400).json({ message: "일일 퀘스트 입력값을 확인해 주세요." });
    return;
  }
  const [definition] = await db.insert(dailyQuestDefinitionsTable)
    .values({ id: randomUUID(), ...input })
    .returning();
  response.status(201).json({ definition });
});

router.patch("/daily-quests/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = validateDailyQuestInput(request.body);
  if (!input) {
    response.status(400).json({ message: "일일 퀘스트 입력값을 확인해 주세요." });
    return;
  }
  const [definition] = await db.update(dailyQuestDefinitionsTable)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(dailyQuestDefinitionsTable.id, request.params.id))
    .returning();
  if (!definition) {
    response.status(404).json({ message: "일일 퀘스트를 찾을 수 없습니다." });
    return;
  }
  response.json({ definition });
});

router.post("/attendance", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = validateAttendanceInput(request.body);
  if (!input) {
    response.status(400).json({ message: "출석 보상 입력값을 확인해 주세요." });
    return;
  }
  const [definition] = await db.insert(attendanceRewardDefinitionsTable)
    .values(input)
    .onConflictDoUpdate({
      target: attendanceRewardDefinitionsTable.dayIndex,
      set: { rewardType: input.rewardType, rewardAmount: input.rewardAmount, enabled: input.enabled, updatedAt: new Date() },
    })
    .returning();
  response.status(201).json({ definition });
});

router.patch("/attendance/:dayIndex", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = validateAttendanceInput({ ...request.body, dayIndex: Number(request.params.dayIndex) });
  if (!input) {
    response.status(400).json({ message: "출석 보상 입력값을 확인해 주세요." });
    return;
  }
  const [definition] = await db.update(attendanceRewardDefinitionsTable)
    .set({ rewardType: input.rewardType, rewardAmount: input.rewardAmount, enabled: input.enabled, updatedAt: new Date() })
    .where(eq(attendanceRewardDefinitionsTable.dayIndex, input.dayIndex))
    .returning();
  if (!definition) {
    response.status(404).json({ message: "출석 보상을 찾을 수 없습니다." });
    return;
  }
  response.json({ definition });
});

export default router;