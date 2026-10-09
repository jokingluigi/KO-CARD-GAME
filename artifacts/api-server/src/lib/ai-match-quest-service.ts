import {processStoredAIQuestMatch} from './ai-quest-match-storage';
import { db, cardsTable, championsTable, rewardSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  completeMinionACatalog,
  canonicalCardCatalog,
  cardRecordToDefinition,
  championRecordToDefinition,
  chooseBestAction,
  createDeterministicRandom,
  createInitialGameState,
  executeAction,
  getLegalActions,
  startGame,
  situationalAiEmote,
  type GameState,
} from "@workspace/game-engine";
import { loadUserDeck, resolveDeck } from "../routes/decks";
import { listAIDecks } from "./ai-deck-service";
import { expandNamedCardReferences } from "./named-card-references";
import { processMatchEventsForDailyQuests } from "./daily-quest-service";
import { grantReward, type RewardGrantResult } from "./reward-service";
import { toServerAction } from "../online/action-parser";

const AI_DECISIONS_PER_TURN = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function collectCardReferences(value: unknown, references: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectCardReferences(entry, references));
    return;
  }
  if (!isRecord(value)) return;
  for (const key of ["cardDefinitionId", "championTokenDefinitionId"]) {
    if (typeof value[key] === "string") references.add(value[key] as string);
  }
  Object.values(value).forEach((entry) => collectCardReferences(entry, references));
}

function seedForMatchId(matchId: string): number {
  let hash = 2166136261;
  for (const character of matchId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stripClientPlayerId(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const { playerId: _untrustedPlayerId, actor: _actor, ...payload } = value;
  return payload;
}

export function advanceAIOpponent(state: GameState, aiPlayerId: string, difficulty?: "EASY" | "NORMAL" | "HARD" | "BOSS"): GameState {
  let next = state;
  const greet = next.status !== "IN_PROGRESS" || next.activePlayerId !== aiPlayerId || next.targetingState?.active
    ? null : situationalAiEmote(next, aiPlayerId, next.events.length);
  if (greet) {
    const spoken = executeAction(next, { type: "EMOTE", playerId: aiPlayerId, emote: greet });
    if (spoken.success) next = spoken.state;
  }
  for (let decision = 0; decision < AI_DECISIONS_PER_TURN; decision += 1) {
    if (next.status !== "IN_PROGRESS" || (next.targetingState?.active ? next.targetingState.playerId !== aiPlayerId : next.activePlayerId !== aiPlayerId)) break;
    const legalActions = getLegalActions(next, aiPlayerId);
    if (!legalActions.length) {
      if (next.targetingState?.active) break;
      const ended = executeAction(next, { type: "END_TURN", playerId: aiPlayerId });
      if (!ended.success) break;
      next = ended.state;
      return next;
    }
    const action = chooseBestAction(next, legalActions, aiPlayerId, difficulty);
    const eventStart = next.events.length;
    const result = executeAction(next, action);
    if (!result.success) break;
    next = result.state;
    if (!next.targetingState?.active) {
      const emote = situationalAiEmote(next, aiPlayerId, eventStart);
      if (emote) {
        const spoken = executeAction(next, { type: "EMOTE", playerId: aiPlayerId, emote });
        if (spoken.success) next = spoken.state;
      }
    }
  }

  if (
    next.status === "IN_PROGRESS" &&
    next.activePlayerId === aiPlayerId &&
    !next.targetingState?.active
  ) {
    const ended = executeAction(next, { type: "END_TURN", playerId: aiPlayerId });
    if (ended.success) next = ended.state;
  }
  return next;
}

export function replayAIMatch(
  initialState: GameState,
  userActions: unknown[],
  userPlayerId: string,
  aiPlayerId: string,
  difficulty?: "NORMAL" | "HARD" | "BOSS",
): GameState {
  if (userActions.some((action) => isRecord(action) && action.actor === "AI")) {
    let state = initialState;
    for (const rawAction of userActions) {
      if (state.status !== "IN_PROGRESS") throw new Error("경기가 끝난 뒤 추가 행동이 포함되어 있습니다.");
      const isAI = isRecord(rawAction) && rawAction.actor === "AI";
      const playerId = isAI ? aiPlayerId : userPlayerId;
      const action = toServerAction(stripClientPlayerId(rawAction), playerId);
      if (!action || (isAI && action.type === "SURRENDER")) throw new Error("경기 행동 형식이 올바르지 않습니다.");
      if (action.type !== "EMOTE" && action.type !== "SURRENDER" && (state.targetingState?.active ? state.targetingState.playerId !== playerId : state.activePlayerId !== playerId)) {
        throw new Error("경기 행동 순서가 올바르지 않습니다.");
      }
      // Replay the legal actions that actually occurred. Re-running AI scoring
      // is not a rule of the match and may differ across builds/catalog order.
      const result = executeAction(state, action);
      if (!result.success) throw new Error(result.message);
      state = result.state;
    }
    if (state.status !== "FINISHED") throw new Error("완료된 AI 경기 기록이 아닙니다.");
    return state;
  }
  let state = initialState;
  for (const rawAction of userActions) {
    if (state.status !== "IN_PROGRESS") {
      throw new Error("경기가 끝난 뒤 추가 행동이 포함되어 있습니다.");
    }
    const isOutOfTurnAction = isRecord(rawAction) && (rawAction.type === "SURRENDER" || rawAction.type === "EMOTE");
    if (!isOutOfTurnAction) state = advanceAIOpponent(state, aiPlayerId, difficulty);
    if (state.status !== "IN_PROGRESS") {
      throw new Error("AI 행동으로 경기가 먼저 끝났습니다.");
    }
    if ((state.targetingState?.active ? state.targetingState.playerId !== userPlayerId : state.activePlayerId !== userPlayerId) && !isOutOfTurnAction) {
      throw new Error("사용자 행동 순서가 올바르지 않습니다.");
    }
    const action = toServerAction(stripClientPlayerId(rawAction), userPlayerId);
    if (!action || action.type === "END_TURN" && state.activePlayerId !== userPlayerId) {
      throw new Error("경기 행동 형식이 올바르지 않습니다.");
    }
    const result = executeAction(state, action);
    if (!result.success) {
      throw new Error(result.message);
    }
    state = result.state;
  }

  state = advanceAIOpponent(state, aiPlayerId, difficulty);
  if (state.status !== "FINISHED") {
    throw new Error("완료된 AI 경기 기록이 아닙니다.");
  }
  return state;
}

type AIQuestInput = {userId:string;isTestAccount:boolean;deckId:string;aiDeckId:string;matchId:string;outcome:'WIN'|'LOSS';actions:unknown[]};
type AIQuestStart = {state:GameState;difficulty:'NORMAL'|'HARD'|'BOSS'};
export function completeAIMatchQuestProgress(input:AIQuestInput & {prepareOnly:true}):Promise<AIQuestStart>;
export function completeAIMatchQuestProgress(input:AIQuestInput):Promise<{reward:RewardGrantResult|null;completed:boolean;message?:string}>;
export async function completeAIMatchQuestProgress(input: {
  userId: string;
  isTestAccount: boolean;
  deckId: string;
  aiDeckId: string;
  matchId: string;
  outcome: "WIN" | "LOSS";
  actions: unknown[];
  prepareOnly?: boolean;
}): Promise<AIQuestStart | { reward: RewardGrantResult | null; completed: boolean; message?: string }> {
  if (!/^ai-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.matchId)) {
    throw new Error("AI 경기 식별자가 올바르지 않습니다.");
  }
  const settings = await db.select().from(rewardSettingsTable)
    .where(inArray(rewardSettingsTable.key, ["MATCH_ONLINE_WIN", "MATCH_ONLINE_LOSS"]));
  const rewardSetting = settings.find((setting) => setting.key === (input.outcome === "WIN" ? "MATCH_ONLINE_WIN" : "MATCH_ONLINE_LOSS"));
  const reward = !input.prepareOnly && rewardSetting?.enabled && rewardSetting.rewardType === "CURRENCY" && rewardSetting.amount > 0
    ? await db.transaction((tx) => grantReward({
        userId: input.userId,
        sourceType: "MATCH_AI_RESULT",
        sourceId: input.matchId,
        rewardType: rewardSetting.rewardType,
        amount: rewardSetting.amount,
        metadata: { resultReason: "GAME_FINISHED", outcome: input.outcome },
      }, tx))
    : null;

  // Daily quests may inspect the action transcript. A desynchronized replay
  // must not undo the match result reward that was already granted above.
  try {

  if (!input.prepareOnly && await processStoredAIQuestMatch(input, replayAIMatch)) return { reward, completed: true };

  const userDeck = await loadUserDeck(input.userId, input.deckId);
  if (!userDeck) throw new Error("사용할 수 있는 덱을 찾을 수 없습니다.");
  const resolvedUserDeck = await resolveDeck(userDeck, input.userId, input.isTestAccount);
  if (!resolvedUserDeck.isValid || !userDeck.championDefinitionId) {
    throw new Error("현재 사용할 수 없는 덱입니다.");
  }

  const availableAIDecks = (await listAIDecks({ enabledOnly: true, context: "AI_DECK" }))
    .filter((deck) =>
      deck.champion?.status !== "DISABLED" &&
      deck.cards.every((card) => card.status !== "DISABLED") &&
      deck.isValid,
    );
  const eligibleAIDecks = availableAIDecks
    .filter((deck) => deck.enabled && deck.championDefinitionId)
    .sort((left, right) =>
      left.displayOrder - right.displayOrder ||
      left.name.localeCompare(right.name, "ko") ||
      left.id.localeCompare(right.id),
    );
  const expectedAIDeck = eligibleAIDecks[
    Math.floor(createDeterministicRandom(input.matchId)() * eligibleAIDecks.length)
  ];
  const aiDeck = availableAIDecks.find((deck) => deck.id === input.aiDeckId);
  if (!expectedAIDeck || expectedAIDeck.id !== aiDeck?.id) {
    throw new Error("이 AI 경기에서 선택할 수 없는 AI 덱입니다.");
  }
  if (!aiDeck?.championDefinitionId || !aiDeck.cardDefinitionIds.length) {
    throw new Error("사용할 수 있는 AI 덱을 찾을 수 없습니다.");
  }

  const [cardRecords, championRecords] = await Promise.all([
    db.select().from(cardsTable),
    db.select().from(championsTable),
  ]);
  const requiredCardIds = new Set([
    ...userDeck.cardDefinitionIds,
    ...aiDeck.cardDefinitionIds,
  ]);
  // Follow generated-card and token references transitively, including DRAFT
  // definitions that the selected AI deck is allowed to use.
  const visitedReferences = new Set<string>();
  let pendingReferences = true;
  while (pendingReferences) {
    pendingReferences = false;
    for (const record of cardRecords) {
      if (record.status === "DISABLED" || !requiredCardIds.has(record.id) || visitedReferences.has(record.id)) continue;
      visitedReferences.add(record.id);
      const previousCount = requiredCardIds.size;
      collectCardReferences(record.effectConfig, requiredCardIds);
      if (requiredCardIds.size > previousCount) pendingReferences = true;
    }
  }
  expandNamedCardReferences(cardRecords, requiredCardIds);
  const selectedChampionIds = new Set([
    userDeck.championDefinitionId,
    aiDeck.championDefinitionId,
  ]);
  championRecords
    .filter((champion) => selectedChampionIds.has(champion.id))
    .forEach((champion) => {
      if (champion.championTokenDefinitionId) requiredCardIds.add(champion.championTokenDefinitionId);
    });

  const cardDefinitions = cardRecords
    .filter((record) => record.status === "PUBLISHED" || requiredCardIds.has(record.id))
    .map((record) => cardRecordToDefinition(record as unknown as Parameters<typeof cardRecordToDefinition>[0]));
  const championDefinitions = championRecords
    .filter((record) => record.status === "PUBLISHED" || selectedChampionIds.has(record.id))
    .map((record) => championRecordToDefinition(record as unknown as Parameters<typeof championRecordToDefinition>[0]));
  const userChampion = championDefinitions.find((champion) => champion.id === userDeck.championDefinitionId);
  const aiChampion = championDefinitions.find((champion) => champion.id === aiDeck.championDefinitionId);
  if (!userChampion || !aiChampion) {
    throw new Error("경기 Champion 데이터를 확인할 수 없습니다.");
  }

  const initialState = createInitialGameState(
    [userChampion.id, aiChampion.id],
    canonicalCardCatalog(cardDefinitions),
    championDefinitions,
    [userDeck.cardDefinitionIds, aiDeck.cardDefinitionIds],
    { gameId: input.matchId, randomSeed: seedForMatchId(input.matchId), minionACardPool: completeMinionACatalog(cardRecords) },
  );
  const startedState = startGame(initialState, createDeterministicRandom(input.matchId), undefined, { flexibleDeckPlayerId: 'player-2' });
  if(input.prepareOnly) return {state:startedState,difficulty:aiDeck.difficulty === 'HARD' || aiDeck.difficulty === 'BOSS' ? aiDeck.difficulty : 'NORMAL'};
  const userPlayerId = startedState.players[0]?.id;
  const aiPlayerId = startedState.players[1]?.id;
  if (!userPlayerId || !aiPlayerId) throw new Error("경기 참가자 데이터를 만들 수 없습니다.");
  const finalState = replayAIMatch(startedState, input.actions, userPlayerId, aiPlayerId, aiDeck.difficulty === "HARD" || aiDeck.difficulty === "BOSS" ? aiDeck.difficulty : "NORMAL");

  await db.transaction(async (tx) => {
    await processMatchEventsForDailyQuests(
      input.userId,
      userPlayerId,
      input.matchId,
      finalState,
      0,
      tx,
    );
  });
  } catch (error) {
    if(input.prepareOnly) throw error;
    const reason = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('[KO daily quest replay]', input.matchId, reason);
    return { reward, completed: false, message: `퀘스트 진행도를 저장하지 못했습니다: ${reason}` };
  }
  return { reward, completed: true };
}
