import { randomUUID } from "node:crypto";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { db, questProgressOutboxTable } from "@workspace/db";
import type { GameState } from "@workspace/game-engine";
import {
  dailyDate,
  loadQuestProcessingContext,
  processMatchEventsForDailyQuests,
  type QuestProcessingContext,
} from "./daily-quest-service";
import { recordPerformance } from "../online/performance";
import { logger } from "./logger";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Job = {
  state: GameState;
  context: QuestProcessingContext;
  date: string;
  eventOffset: number;
};
function questState(state: GameState, offset: number): GameState {
  const cards = (zone: any[]) =>
    zone.map((c) =>
      c ? { instanceId: c.instanceId, definitionId: c.definitionId } : null,
    );
  return {
    gameId: state.gameId,
    status: state.status,
    winnerId: state.winnerId,
    events: state.events.slice(offset),
    players: state.players.map((p) => ({
      id: p.id,
      hand: cards(p.hand),
      deck: cards(p.deck),
      board: cards(p.board),
      graveyard: cards(p.graveyard),
      removedFromGame: cards(p.removedFromGame),
    })),
    cardPool: state.cardPool?.map((c) => ({
      id: c.id,
      tags: c.tags,
      rarity: c.rarity,
    })),
  } as unknown as GameState;
}
export async function enqueueQuestProgress(
  tx: Tx,
  matchId: string,
  one: string,
  two: string,
  state: GameState,
  eventStart: number,
) {
  const context = await loadQuestProcessingContext(tx),
    eventOffset = state.status === "FINISHED" ? 0 : eventStart;
  const payload: Job = {
    state: questState(state, eventOffset),
    context,
    date: dailyDate(context.observedAt, context.settings.timezone),
    eventOffset,
  };
  await tx
    .insert(questProgressOutboxTable)
    .values({
      id: randomUUID(),
      matchId,
      playerOneUserId: one,
      playerTwoUserId: two,
      payload,
    });
}
function revive(job: Job): Job {
  const context = job.context;
  context.observedAt = new Date(context.observedAt!);
  context.definitions = context.definitions.map((d) => ({
    ...d,
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.updatedAt),
  }));
  context.seasons = context.seasons.map((s) => ({
    ...s,
    startsAt: new Date(s.startsAt),
    endsAt: new Date(s.endsAt),
    updatedAt: new Date(s.updatedAt),
  }));
  return job;
}
export async function processNextQuestProgress(
  userId?: string,
  ignoreDelay = false,
): Promise<boolean> {
  const start = performance.now();
  let selectedId: string | undefined;
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(questProgressOutboxTable)
        .where(
          and(
            sql`NOT EXISTS (SELECT 1 FROM quest_progress_outbox earlier WHERE (earlier.created_at < ${questProgressOutboxTable.createdAt} OR (earlier.created_at = ${questProgressOutboxTable.createdAt} AND earlier.id < ${questProgressOutboxTable.id})) AND (earlier.player_one_user_id IN (${questProgressOutboxTable.playerOneUserId},${questProgressOutboxTable.playerTwoUserId}) OR earlier.player_two_user_id IN (${questProgressOutboxTable.playerOneUserId},${questProgressOutboxTable.playerTwoUserId})))`,
            ignoreDelay
              ? undefined
              : lte(questProgressOutboxTable.availableAt, new Date()),
            userId
              ? or(
                  eq(questProgressOutboxTable.playerOneUserId, userId),
                  eq(questProgressOutboxTable.playerTwoUserId, userId),
                )
              : undefined,
          ),
        )
        .orderBy(
          asc(questProgressOutboxTable.createdAt),
          asc(questProgressOutboxTable.id),
        )
        .limit(1)
        .for("update", { skipLocked: true });
      const row = rows[0];
      if (!row) return false;
      selectedId = row.id;
      const job = revive(row.payload as Job);
      for (const [user, seat] of [
        [row.playerOneUserId, "PLAYER_ONE"],
        [row.playerTwoUserId, "PLAYER_TWO"],
      ].sort((a, b) => a[0]!.localeCompare(b[0]!)))
        await processMatchEventsForDailyQuests(
          user!,
          seat!,
          row.matchId,
          job.state,
          0,
          tx,
          job.date,
          "PVP",
          job.context,
          job.eventOffset,
        );
      await tx
        .delete(questProgressOutboxTable)
        .where(eq(questProgressOutboxTable.id, row.id));
      recordPerformance("questWorkerMs", performance.now() - start);
      recordPerformance(
        "questQueueAgeMs",
        Date.now() - row.createdAt.getTime(),
      );
      return true;
    });
  } catch (error) {
    if (selectedId)
      await db
        .update(questProgressOutboxTable)
        .set({
          attempts: sql`${questProgressOutboxTable.attempts}+1`,
          availableAt: new Date(Date.now() + 5000),
        })
        .where(eq(questProgressOutboxTable.id, selectedId));
    throw error;
  }
}
export async function flushQuestProgress(userId: string) {
  const deadline = Date.now() + 15000;
  for (;;) {
    const [pending] = await db
      .select({ id: questProgressOutboxTable.id })
      .from(questProgressOutboxTable)
      .where(
        or(
          eq(questProgressOutboxTable.playerOneUserId, userId),
          eq(questProgressOutboxTable.playerTwoUserId, userId),
        ),
      )
      .limit(1);
    if (!pending) return;
    if (Date.now() > deadline)
      throw Error(
        "진행도 저장을 마무리하고 있습니다. 잠시 후 다시 확인해 주세요.",
      );
    if (!(await processNextQuestProgress(userId, true)))
      await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
export function startQuestProgressWorker() {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      for (let i = 0; i < 30; i++)
        if (!(await processNextQuestProgress())) break;
    } catch (error) {
      logger.error({ err: error }, "Quest progress outbox retry scheduled");
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 500);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
