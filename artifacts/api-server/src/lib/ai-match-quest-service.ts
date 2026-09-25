import { db, cardsTable, championsTable } from "@workspace/db";
import {
  cardRecordToDefinition,
  championRecordToDefinition,
  chooseBestAction,
  createDeterministicRandom,
  createInitialGameState,
  executeAction,
  getLegalActions,
  startGame,
  type GameState,
} from "@workspace/game-engine";
import { loadUserDeck, resolveDeck } from "../routes/decks";
import { listAIDecks } from "./ai-deck-service";
import { processMatchEventsForDailyQuests } from "./daily-quest-service";
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
  const { playerId: _untrustedPlayerId, ...payload } = value;
  return payload;
}

function advanceAIOpponent(state: GameState, aiPlayerId: string): GameState {
  let next = state;
  for (let decision = 0; decision < AI_DECISIONS_PER_TURN; decision += 1) {
    if (next.status !== "IN_PROGRESS" || next.activePlayerId !== aiPlayerId) break;
    const legalActions = getLegalActions(next, aiPlayerId);
    if (!legalActions.length) {
      if (next.targetingState?.active) break;
      const ended = executeAction(next, { type: "END_TURN", playerId: aiPlayerId });
      if (!ended.success) break;
      next = ended.state;
      return next;
    }
    const action = chooseBestAction(next, legalActions, aiPlayerId);
    const result = executeAction(next, action);
    if (!result.success) break;
    next = result.state;
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
): GameState {
  let state = initialState;
  for (const rawAction of userActions) {
    if (state.status !== "IN_PROGRESS") {
      throw new Error("경기가 끝난 뒤 추가 행동이 포함되어 있습니다.");
    }
    const isSurrender = isRecord(rawAction) && rawAction.type === "SURRENDER";
    if (!isSurrender) state = advanceAIOpponent(state, aiPlayerId);
    if (state.status !== "IN_PROGRESS") {
      throw new Error("AI 행동으로 경기가 먼저 끝났습니다.");
    }
    if (state.activePlayerId !== userPlayerId && !isSurrender) {
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

  state = advanceAIOpponent(state, aiPlayerId);
  if (state.status !== "FINISHED") {
    throw new Error("완료된 AI 경기 기록이 아닙니다.");
  }
  return state;
}

export async function completeAIMatchQuestProgress(input: {
  userId: string;
  isTestAccount: boolean;
  deckId: string;
  aiDeckId: string;
  matchId: string;
  actions: unknown[];
}): Promise<void> {
  if (!/^ai-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.matchId)) {
    throw new Error("AI 경기 식별자가 올바르지 않습니다.");
  }
  if (input.actions.length > 2000) {
    throw new Error("AI 경기 행동 수가 허용 범위를 넘었습니다.");
  }

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
    cardDefinitions,
    championDefinitions,
    [userDeck.cardDefinitionIds, aiDeck.cardDefinitionIds],
    { gameId: input.matchId, randomSeed: seedForMatchId(input.matchId) },
  );
  const startedState = startGame(initialState, createDeterministicRandom(input.matchId), undefined, { flexibleDeckPlayerId: 'player-2' });
  const userPlayerId = startedState.players[0]?.id;
  const aiPlayerId = startedState.players[1]?.id;
  if (!userPlayerId || !aiPlayerId) throw new Error("경기 참가자 데이터를 만들 수 없습니다.");
  const finalState = replayAIMatch(startedState, input.actions, userPlayerId, aiPlayerId);

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
}
