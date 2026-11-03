import assert from "node:assert/strict";
import {
  startTutorialFixture,
  lessonProof,
} from "./tutorial-rewards-fixture.mjs";
export { lessonProof };
export async function startClaimAllFixture() {
  const f = await startTutorialFixture();
  const s = f.schema;
  const now = Date.now();
  await f.db
    .insert(s.questSeasonsTable)
    .values({
      id: "claim-all-season",
      name: "묶음 수령 시즌",
      startsAt: new Date(now - 86400000),
      endsAt: new Date(now + 86400000),
      status: "ACTIVE",
    });
  for (let i = 0; i < 3; i++)
    await f.db
      .insert(s.dailyQuestDefinitionsTable)
      .values({
        id: "claim-all-daily-" + i,
        title: "완료 퀘스트 " + (i + 1),
        description: "격리 검증용",
        objectiveType: "PLAY_MATCH",
        targetValue: 1,
        rewardType: "CURRENCY",
        rewardAmount: 10,
        enabled: true,
      });
  await f.db.insert(s.dailyQuestDefinitionsTable).values({
    id: "claim-all-season-quest",
    title: "시즌 보상",
    description: "격리 검증용",
    objectiveType: "PLAY_MATCH",
    targetValue: 1,
    rewardType: "CURRENCY",
    rewardAmount: 20,
    enabled: true,
    platform: {
      questType: "SEASON",
      seasonId: "claim-all-season",
      version: 1,
      rewards: [
        { rewardType: "CURRENCY", rewardAmount: 20, rewardTargetId: null },
        { rewardType: "PACK", rewardAmount: 2, rewardTargetId: "normal-pack" },
      ],
    },
  });
  await f.db
    .insert(s.attendanceRewardDefinitionsTable)
    .values({
      dayIndex: 1,
      rewardType: "CURRENCY",
      rewardAmount: 5,
      enabled: true,
    });
  await f.db
    .insert(s.rewardSettingsTable)
    .values({
      key: "DAILY_QUEST_COMPLETION_BONUS",
      rewardType: "CURRENCY",
      amount: 7,
      enabled: true,
    });
  const { ensureAllQuestAssignments } =
    await import("../../artifacts/api-server/src/lib/daily-quest-service.ts");
  await ensureAllQuestAssignments("tutorial-user");
  const { eq } = await import("../../lib/db/node_modules/drizzle-orm/index.js");
  await f.db
    .update(s.dailyQuestAssignmentsTable)
    .set({ status: "COMPLETED", progress: 1 })
    .where(eq(s.dailyQuestAssignmentsTable.userId, "tutorial-user"));
  const proofs = await Promise.all(
    ["basics", "combat", "rush", "spell", "active", "champion"].map((id) =>
      lessonProof(id),
    ),
  );
  return { ...f, proofs };
}
export async function createClaimAllAccount(f, id) {
  const { hashPassword } =
    await import("../../artifacts/api-server/src/lib/auth.ts");
  const { ensureAllQuestAssignments } =
    await import("../../artifacts/api-server/src/lib/daily-quest-service.ts");
  const { eq } = await import("../../lib/db/node_modules/drizzle-orm/index.js");
  await f.db
    .insert(f.schema.usersTable)
    .values({
      id,
      email: id + "@example.invalid",
      nickname: "보상 " + id,
      role: "USER",
      passwordHash: await hashPassword("ClaimAll-Isolated-QA-123"),
      currencyBalance: 0,
      shopCurrencyStarterGrantedAt: new Date(),
    });
  await ensureAllQuestAssignments(id);
  await f.db
    .update(f.schema.dailyQuestAssignmentsTable)
    .set({ status: "COMPLETED", progress: 1 })
    .where(eq(f.schema.dailyQuestAssignmentsTable.userId, id));
  const r = await fetch(f.origin + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: id + "@example.invalid",
      password: "ClaimAll-Isolated-QA-123",
    }),
  });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
