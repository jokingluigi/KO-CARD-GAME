import { summarizeUsage, type UsageStart } from './usage-statistics-events';
import { and, eq, sql } from "drizzle-orm";
import { db, aiQuestMatchesTable } from "@workspace/db";
import type { GameState } from "@workspace/game-engine";
import {
  dailyDate,
  ensureDailyQuestAssignments, ensureSeasonQuestAssignments,
  processMatchEventsForDailyQuests, questSettings,
} from "./daily-quest-service";
type MatchIdentity = {
  userId: string;
  deckId: string;
  aiDeckId: string;
  matchId: string;
};
export async function storedAIQuestMatch(input: MatchIdentity) {
  const [saved] = await db
    .select()
    .from(aiQuestMatchesTable)
    .where(eq(aiQuestMatchesTable.id, input.matchId))
    .limit(1);
  if (
    saved &&
    (saved.userId !== input.userId ||
      saved.deckId !== input.deckId ||
      saved.aiDeckId !== input.aiDeckId)
  )
    throw new Error("AI match record does not belong to this request");
  return saved ?? null;
}
export async function saveAIQuestStart(
  input: MatchIdentity,
  state: GameState,
  difficulty: string,
  startingDeck?: string[],
) {
  const existing = await storedAIQuestMatch(input);
  if (existing)
    return {
      state: existing.initialState as unknown as GameState,
      difficulty: existing.difficulty,
    };
  const settings = await questSettings();
  const questDate = dailyDate(new Date(),settings.timezone);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"quest:"+input.userId}))`);
    await ensureDailyQuestAssignments(input.userId, questDate, tx);
    await ensureSeasonQuestAssignments(input.userId,tx);
    await tx
      .insert(aiQuestMatchesTable)
      .values({
        id: input.matchId,
        userId: input.userId,
        deckId: input.deckId,
        aiDeckId: input.aiDeckId,
        difficulty,
        initialState: state as unknown as Record<string, unknown>,
        usageStart: {version:1,startedAt:new Date().toISOString(),champions:{[state.players[0]!.id]:state.players[0]!.champion!.id},decks:{[state.players[0]!.id]:startingDeck??null}},
        questDate,
      })
      .onConflictDoNothing();
  });
  const saved = await storedAIQuestMatch(input);
  if (!saved) throw new Error("Could not save AI quest starting state");
  return {
    state: saved.initialState as unknown as GameState,
    difficulty: saved.difficulty,
  };
}
export async function processStoredAIQuestMatch(
  input: MatchIdentity & { actions: unknown[] },
  replay: (
    state: GameState,
    actions: unknown[],
    user: string,
    ai: string,
    difficulty: "NORMAL" | "HARD" | "BOSS",
  ) => GameState,
) {
  const saved = await storedAIQuestMatch(input);
  if (!saved) return false;
  if (saved.processedAt) return true;
  const initial = JSON.parse(JSON.stringify(saved.initialState)) as GameState;
  const [user, ai] = initial.players;
  if (!user || !ai) throw new Error("Match participants missing");
  const final = replay(
    initial,
    input.actions,
    user.id,
    ai.id,
    saved.difficulty === "HARD" || saved.difficulty === "BOSS"
      ? saved.difficulty
      : "NORMAL",
  );
  const usage=summarizeUsage(final,saved.usageStart as UsageStart|null,new Date(),[user.id]);
  // Retain the verified result before unrelated daily-quest work. A crash/retry cannot lose it.
  if(usage)try{
    await db.update(aiQuestMatchesTable).set({usageSummary:usage as unknown as Record<string,unknown>}).where(and(eq(aiQuestMatchesTable.id,input.matchId),eq(aiQuestMatchesTable.userId,input.userId),sql`usage_summary IS NULL AND usage_recorded_at IS NULL`));
  }catch(error){console.error('[KO usage statistics] AI receipt checkpoint will retry in result transaction',{code:(error as {code?:string}).code??'CHECKPOINT_FAILED'});}
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(aiQuestMatchesTable)
      .where(
        and(
          eq(aiQuestMatchesTable.id, input.matchId),
          eq(aiQuestMatchesTable.userId, input.userId),
        ),
      )
      .limit(1)
      .for("update");
    if (!locked || locked.processedAt) return;
    await processMatchEventsForDailyQuests(
      input.userId,
      user.id,
      input.matchId,
      final,
      0,
      tx,
      saved.questDate,
    );
    await tx
      .update(aiQuestMatchesTable)
      .set({ processedAt: new Date(), usageSummary:usage?sql`CASE WHEN usage_recorded_at IS NULL THEN COALESCE(usage_summary,${JSON.stringify(usage)}::jsonb) ELSE usage_summary END`:null })
      .where(eq(aiQuestMatchesTable.id, input.matchId));
  });
  return true;
}
