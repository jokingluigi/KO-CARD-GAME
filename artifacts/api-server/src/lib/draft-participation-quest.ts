import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { dailyQuestDefinitionsTable, dailyQuestAssignmentsTable, dailyQuestProgressEventsTable, db } from "@workspace/db";
import type { RewardExecutor } from "./reward-service";
export const DRAFT_PARTICIPATION_QUEST_ID = "draft-five-minion-a";
const definition = {
 id: DRAFT_PARTICIPATION_QUEST_ID, title: "드래프트 도전자", description: "AI 또는 PvP 드래프트 대전을 합계 5회 완료하세요. 보상: 챔피언 미니언 A (1회 한정)",
 objectiveType: "PLAY_DRAFT_MATCH", targetValue: 5, rewardType: "CHAMPION", rewardAmount: 1, rewardTargetId: "champion-minion-a", enabled: false,
};
// Persistent assignment uses the existing quest/claim/reward schema, outside daily random slots.
export async function ensureDraftParticipationQuest(userId: string, executor: RewardExecutor = db) {
 await executor.insert(dailyQuestDefinitionsTable).values(definition).onConflictDoNothing();
 await executor.insert(dailyQuestAssignmentsTable).values({
  id: randomUUID(), userId, definitionId: definition.id, assignmentDate: "LIFETIME", slot: 0,
  title: definition.title, description: definition.description, objectiveType: definition.objectiveType,
  targetValue: definition.targetValue, rewardType: definition.rewardType, rewardAmount: definition.rewardAmount, rewardTargetId: definition.rewardTargetId,
 }).onConflictDoNothing();
 const [assignment] = await executor.select().from(dailyQuestAssignmentsTable).where(and(eq(dailyQuestAssignmentsTable.userId,userId),eq(dailyQuestAssignmentsTable.definitionId,definition.id),eq(dailyQuestAssignmentsTable.assignmentDate,"LIFETIME")));
 return assignment!;
}
export async function recordCompletedDraft(userId: string, matchId: string, executor: RewardExecutor) {
 const assignment = await ensureDraftParticipationQuest(userId,executor);
 if (assignment.status === "CLAIMED" || assignment.status === "COMPLETED") return;
 const [event] = await executor.insert(dailyQuestProgressEventsTable).values({id:randomUUID(),assignmentId:assignment.id,occurrenceKey:`${assignment.id}:${matchId}:DRAFT_FINISHED`,increment:1})
  .onConflictDoNothing({target:dailyQuestProgressEventsTable.occurrenceKey}).returning({id:dailyQuestProgressEventsTable.id});
 if (!event) return;
 await executor.update(dailyQuestAssignmentsTable).set({progress:sql`LEAST(${dailyQuestAssignmentsTable.progress} + 1, 5)`,status:sql`CASE WHEN ${dailyQuestAssignmentsTable.progress} + 1 >= 5 THEN 'COMPLETED' ELSE 'IN_PROGRESS' END`})
  .where(and(eq(dailyQuestAssignmentsTable.id,assignment.id),sql`${dailyQuestAssignmentsTable.status} <> 'CLAIMED'`));
}
