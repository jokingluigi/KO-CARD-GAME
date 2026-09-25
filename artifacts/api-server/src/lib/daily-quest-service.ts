import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  dailyQuestAssignmentsTable,
  dailyQuestDefinitionsTable,
  dailyQuestProgressEventsTable,
  db,
  type DailyQuestAssignmentRecord,
} from "@workspace/db";
import {
  questEventIncrement,
  validateQuestCondition,
  QUEST_CONDITION_SCHEMA_VERSION,
  type GameEvent,
  type GameState,
} from "@workspace/game-engine";
import { grantReward, isRewardType, type RewardExecutor } from "./reward-service";

export const DAILY_TIME_ZONE = process.env["KO_DAILY_TIMEZONE"]?.trim() || "UTC";
export const DAILY_QUEST_OBJECTIVES = [
  "PLAY_MATCH",
  "WIN_MATCH",
  "CARD_PLAYED",
  "TECHNIQUE_PLAYED",
  "ATTACK_DECLARED",
  "DAMAGE_DEALT",
] as const;
export type DailyQuestObjective = (typeof DAILY_QUEST_OBJECTIVES)[number];
export const DAILY_QUEST_STATUSES = ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "CLAIMED"] as const;
type QuestConfigRecord = { schemaVersion?: string; condition?: unknown };

function eventCardMetadata(state: GameState, event: GameEvent) {
  const instanceId = event.cardInstanceId ?? event.sourceSnapshot?.cardInstanceId ?? event.targetSnapshot?.cardInstanceId;
  if (!instanceId || !state.cardPool) return { cardMetadataAvailable: false as const };
  const instance = state.players.flatMap((player) => [
    ...player.deck, ...player.hand, ...player.board.filter(Boolean), ...player.graveyard, ...player.removedFromGame,
  ]).find((card) => card?.instanceId === instanceId);
  const definitionId = instance?.definitionId;
  const definition = definitionId ? state.cardPool.find((card) => card.id === definitionId) : undefined;
  if (!definition) return { cardMetadataAvailable: false as const };
  return { cardMetadataAvailable: true as const, cardTags: definition.tags ?? [] };
}

export function isDailyQuestClaimable(status: string, progress: number, targetValue: number): boolean {
  return status === "COMPLETED" && progress >= targetValue;
}

export function dailyDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function seededOrder<T>(items: T[], seed: string): T[] {
  return [...items]
    .map((item, index) => {
      let hash = 2166136261;
      for (const character of `${seed}:${index}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      return { item, hash: hash >>> 0 };
    })
    .sort((left, right) => left.hash - right.hash)
    .map(({ item }) => item);
}

export function selectDailyQuestDefinitions<T>(definitions: T[], userId: string, assignmentDate: string): T[] {
  return seededOrder(definitions, `${userId}:${assignmentDate}`).slice(0, 3);
}

export function objectiveIncrement(
  objectiveType: string,
  event: GameEvent,
  playerId: string,
  cardType: string | null,
): number {
  if (event.playerId !== playerId) return 0;
  if (objectiveType === "CARD_PLAYED") {
    return event.type === "CARD_PLAYED" && (!cardType || event.cardType === cardType) ? 1 : 0;
  }
  if (objectiveType === "TECHNIQUE_PLAYED") {
    return event.type === "CARD_PLAYED" && event.cardType === "TECHNIQUE" ? 1 : 0;
  }
  if (objectiveType === "ATTACK_DECLARED") return event.type === "ATTACK_DECLARED" ? 1 : 0;
  if (objectiveType === "DAMAGE_DEALT") return event.type === "DAMAGE_DEALT" ? 1 : 0;
  return 0;
}

export async function ensureDailyQuestAssignments(
  userId: string,
  assignmentDate = dailyDate(),
  executor: RewardExecutor = db,
): Promise<DailyQuestAssignmentRecord[]> {
  const existing = await executor.select().from(dailyQuestAssignmentsTable)
    .where(and(
      eq(dailyQuestAssignmentsTable.userId, userId),
      eq(dailyQuestAssignmentsTable.assignmentDate, assignmentDate),
    ))
    .orderBy(asc(dailyQuestAssignmentsTable.slot));
  if (existing.length > 0) return existing;

  const definitions = await executor.select().from(dailyQuestDefinitionsTable)
    .where(eq(dailyQuestDefinitionsTable.enabled, true))
    .orderBy(asc(dailyQuestDefinitionsTable.createdAt), asc(dailyQuestDefinitionsTable.id));
  const selected = selectDailyQuestDefinitions(definitions, userId, assignmentDate);
  if (selected.length > 0) {
    await executor.insert(dailyQuestAssignmentsTable)
      .values(selected.map((definition, slot) => {
        const config = definition as typeof definition & QuestConfigRecord;
        return {
        id: randomUUID(),
        userId,
        definitionId: definition.id,
        assignmentDate,
        slot,
        title: definition.title,
        description: definition.description,
        objectiveType: definition.objectiveType,
        cardType: definition.cardType,
        targetValue: definition.targetValue,
        rewardType: definition.rewardType,
        rewardAmount: definition.rewardAmount,
        rewardTargetId: definition.rewardTargetId,
        schemaVersion: config.schemaVersion ?? "QUEST_CONDITION_V1",
        condition: config.condition ?? null,
      };
      }))
      .onConflictDoNothing();
  }
  return executor.select().from(dailyQuestAssignmentsTable)
    .where(and(
      eq(dailyQuestAssignmentsTable.userId, userId),
      eq(dailyQuestAssignmentsTable.assignmentDate, assignmentDate),
    ))
    .orderBy(asc(dailyQuestAssignmentsTable.slot));
}

export async function processMatchEventsForDailyQuests(
  userId: string,
  playerId: string,
  matchId: string,
  state: GameState,
  eventStart: number,
  executor: RewardExecutor,
): Promise<void> {
  const assignmentDate = dailyDate();
  const assignments = await ensureDailyQuestAssignments(userId, assignmentDate, executor);
  for (const assignment of assignments) {
    const config = assignment as typeof assignment & QuestConfigRecord;
    if (assignment.status === "CLAIMED") continue;
    const increments: Array<{ occurrenceKey: string; increment: number }> = [];
    const v2 = config.schemaVersion === QUEST_CONDITION_SCHEMA_VERSION
      ? validateQuestCondition(config.condition)
      : null;
    if (state.status === "FINISHED" && assignment.objectiveType === "PLAY_MATCH") {
      increments.push({ occurrenceKey: `${assignment.id}:${matchId}:FINISHED:PLAY_MATCH`, increment: 1 });
    }
    if (
      state.status === "FINISHED" &&
      assignment.objectiveType === "WIN_MATCH" &&
      state.winnerId === playerId
    ) {
      increments.push({ occurrenceKey: `${assignment.id}:${matchId}:FINISHED:WIN_MATCH`, increment: 1 });
    }
    state.events.slice(eventStart).forEach((event, offset) => {
      const increment = config.schemaVersion === QUEST_CONDITION_SCHEMA_VERSION
        ? (v2 ? questEventIncrement(v2, event, playerId, eventCardMetadata(state, event)) : 0)
        : objectiveIncrement(assignment.objectiveType, event, playerId, assignment.cardType);
      if (increment > 0) {
        increments.push({
          occurrenceKey: `${assignment.id}:${matchId}:EVENT:${eventStart + offset}:${assignment.objectiveType}:${config.schemaVersion ?? "QUEST_CONDITION_V1"}`,
          increment,
        });
      }
    });

    for (const increment of increments) {
      const [event] = await executor.insert(dailyQuestProgressEventsTable)
        .values({
          id: randomUUID(),
          assignmentId: assignment.id,
          occurrenceKey: increment.occurrenceKey,
          increment: increment.increment,
        })
        .onConflictDoNothing({ target: dailyQuestProgressEventsTable.occurrenceKey })
        .returning({ id: dailyQuestProgressEventsTable.id });
      if (!event) continue;
      await executor.update(dailyQuestAssignmentsTable)
        .set({
          progress: sql`LEAST(${dailyQuestAssignmentsTable.progress} + ${increment.increment}, ${dailyQuestAssignmentsTable.targetValue})`,
          status: sql`CASE WHEN ${dailyQuestAssignmentsTable.progress} + ${increment.increment} >= ${dailyQuestAssignmentsTable.targetValue} THEN 'COMPLETED' ELSE 'IN_PROGRESS' END`,
        })
        .where(and(
          eq(dailyQuestAssignmentsTable.id, assignment.id),
          sql`${dailyQuestAssignmentsTable.status} <> 'CLAIMED'`,
        ));
    }
  }
}

export async function claimDailyQuest(userId: string, assignmentId: string) {
  return db.transaction(async (tx) => {
    const [assignment] = await tx.select().from(dailyQuestAssignmentsTable)
      .where(and(
        eq(dailyQuestAssignmentsTable.id, assignmentId),
        eq(dailyQuestAssignmentsTable.userId, userId),
      ))
      .limit(1);
    if (!assignment) throw new Error("일일 퀘스트를 찾을 수 없습니다.");
    if (assignment.status === "CLAIMED") {
      return { assignment, reward: null, alreadyClaimed: true };
    }
    if (!isDailyQuestClaimable(assignment.status, assignment.progress, assignment.targetValue)) {
      throw new Error("완료된 일일 퀘스트만 보상을 받을 수 있습니다.");
    }
    const reward = await grantReward({
      userId,
      sourceType: "DAILY_QUEST_CLAIM",
      sourceId: assignment.id,
      rewardType: assignment.rewardType,
      amount: assignment.rewardAmount,
      rewardTargetId: assignment.rewardTargetId,
      metadata: { assignmentDate: assignment.assignmentDate, definitionId: assignment.definitionId },
    }, tx);
    const [claimed] = await tx.update(dailyQuestAssignmentsTable)
      .set({ status: "CLAIMED", claimedAt: new Date() })
      .where(and(
        eq(dailyQuestAssignmentsTable.id, assignment.id),
        eq(dailyQuestAssignmentsTable.status, "COMPLETED"),
      ))
      .returning();
    return { assignment: claimed ?? assignment, reward, alreadyClaimed: false };
  });
}

export function publicDailyQuest(assignment: DailyQuestAssignmentRecord) {
  const config = assignment as typeof assignment & QuestConfigRecord;
  return {
    id: assignment.id,
    definitionId: assignment.definitionId,
    assignmentDate: assignment.assignmentDate,
    slot: assignment.slot,
    title: assignment.title,
    description: assignment.description,
    objectiveType: assignment.objectiveType,
    cardType: assignment.cardType,
    targetValue: assignment.targetValue,
    rewardType: assignment.rewardType,
    rewardAmount: assignment.rewardAmount,
    rewardTargetId: assignment.rewardTargetId,
    schemaVersion: config.schemaVersion ?? "QUEST_CONDITION_V1",
    condition: config.condition ?? null,
    progress: assignment.progress,
    status: assignment.status,
    claimedAt: assignment.claimedAt,
  };
}

export function isDailyQuestObjective(value: unknown): value is DailyQuestObjective {
  return typeof value === "string" && (DAILY_QUEST_OBJECTIVES as readonly string[]).includes(value);
}

export function validateDailyQuestInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const objectiveType = input.objectiveType;
  const cardType = input.cardType === "WRESTLER" || input.cardType === "TECHNIQUE" ? input.cardType : null;
  const targetValue = typeof input.targetValue === "number" ? input.targetValue : Number.NaN;
  const rewardType = input.rewardType ?? "CURRENCY";
  const rewardTargetId = typeof input.rewardTargetId === "string" && input.rewardTargetId.trim()
    ? input.rewardTargetId.trim()
    : null;
  const rewardAmount = typeof input.rewardAmount === "number" ? input.rewardAmount : Number.NaN;
  const enabled = input.enabled !== false;
  const condition = input.condition === undefined ? null : validateQuestCondition(input.condition);
  const schemaVersion = input.schemaVersion ?? (condition ? QUEST_CONDITION_SCHEMA_VERSION : "QUEST_CONDITION_V1");
  if (
    !title || title.length > 120 ||
    description.length > 2000 ||
    !isDailyQuestObjective(objectiveType) ||
    (schemaVersion === QUEST_CONDITION_SCHEMA_VERSION && !condition) ||
    (condition !== null && condition.required !== targetValue) ||
    (schemaVersion !== QUEST_CONDITION_SCHEMA_VERSION && schemaVersion !== "QUEST_CONDITION_V1") ||
    (objectiveType !== "CARD_PLAYED" && cardType !== null) ||
    !Number.isSafeInteger(targetValue) || targetValue < 1 || targetValue > 1000 ||
    !isRewardType(rewardType) ||
    (rewardType === "CURRENCY" && rewardTargetId !== null) ||
    (rewardType !== "CURRENCY" && rewardTargetId === null) ||
    !Number.isSafeInteger(rewardAmount) || rewardAmount < 1 || rewardAmount > 2_147_483_647
  ) return null;
  return { title, description, objectiveType, cardType, targetValue, rewardType, rewardAmount, rewardTargetId, enabled, schemaVersion, condition };
}