import {
  evaluateChampionQuestCondition,
  validChampionQuestCondition,
} from "../../../../../lib/game-engine/src/champion-quest-conditions";
import type { ChampionQuest, FinisherChoice } from "./types";
import type { GameState } from "../types/game-state";
import { generateCardInstance } from "../cards/generation";
import { addCardsToHand } from "../engine/hand-addition";

// Core resolution is synchronous. Nesting suppresses partial-action decisions without
// adding control flags to persistent state, rollback snapshots or network payloads.
let finisherResolutionDepth = 0;
export function deferFinisherChoiceResolution<T>(run: () => T): T {
  finisherResolutionDepth++;
  try {
    return run();
  } finally {
    finisherResolutionDepth--;
  }
}

/** Existing champions keep their authored rewards until options are explicitly configured. */
export function preparationCompletionReward(
  quest: ChampionQuest,
): ChampionQuest["reward"] {
  return quest.reward;
}

export function validFinisherChoices(
  value: unknown,
): value is FinisherChoice[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8)
    return false;
  const ids = new Set<string>();
  return value.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return false;
    if (
      Object.keys(entry).some(
        (key) =>
          ![
            "id",
            "name",
            "description",
            "condition",
            "cardDefinitionId",
          ].includes(key),
      )
    )
      return false;
    if (
      typeof entry.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id) ||
      ids.has(entry.id)
    )
      return false;
    ids.add(entry.id);
    return (
      typeof entry.name === "string" &&
      entry.name.trim().length > 0 &&
      entry.name.length <= 120 &&
      typeof entry.description === "string" &&
      entry.description.length <= 2000 &&
      typeof entry.cardDefinitionId === "string" &&
      entry.cardDefinitionId.length > 0 &&
      entry.cardDefinitionId.length <= 120 &&
      validChampionQuestCondition(entry.condition)
    );
  });
}

export function finisherTargetId(optionId: string): string {
  return `finisher:${optionId}`;
}

/** The normal SELECT_EFFECT_TARGET action also resolves this durable, mandatory choice. */
export function selectPreparedFinisher(
  state: GameState,
  playerId: string,
  targetId: string,
): GameState {
  const player = state.players.find((p) => p.id === playerId),
    champion = player?.champion;
  if (!champion || champion.selectedFinisherId || champion.questCompleted)
    return state;
  const option = champion.quest?.finisherChoices?.find(
    (o) => finisherTargetId(o.id) === targetId,
  );
  if (!option || !champion.finisherProgress?.[option.id]?.completed)
    return state;
  const definition = state.cardPool?.find(
    (d) => d.id === option.cardDefinitionId,
  );
  if (
    !definition ||
    definition.cardType !== "TECHNIQUE" ||
    definition.rarity !== "CHAMPION" ||
    !definition.isChampionToken
  )
    return state;
  const pending = state.targetingState;
  if (
    pending &&
    (!pending.finisherChoice ||
      pending.playerId !== playerId ||
      !pending.validTargetIds.includes(targetId))
  )
    return state;
  const next: GameState = {
    ...state,
    targetingState: undefined,
    players: state.players.map((p) =>
      p.id === playerId && p.champion
        ? {
            ...p,
            champion: {
              ...p.champion,
              selectedFinisherId: option.id,
              questCompleted: true,
              questProgress: p.champion.quest?.requiredProgress ?? 1,
            },
          }
        : p,
    ),
    latestQuestCompletedChampionId: champion.id,
    events: [
      ...state.events,
      {
        type: "CHAMPION_QUEST_COMPLETED",
        turn: state.turn,
        playerId,
        championId: champion.id,
        source: { type: "SYSTEM" },
        target: { type: "CHAMPION", championId: champion.id },
        reason: `FINISHER:${option.id}`,
      },
    ],
  };
  // Same non-draw arrival path, including mandatory discard and reconnect, as every generated card.
  const card = generateCardInstance(definition, {
    instanceId: `${state.gameId}:finisher:${playerId}:${option.id}`,
    isGenerated: true,
  });
  return addCardsToHand(next, playerId, [{ card }]);
}

/** Evaluate all alternatives against one completed effect/action before deciding the winner. */
export function processFinisherChoices(
  previous: GameState,
  state: GameState,
): GameState {
  if (finisherResolutionDepth > 0 || state.status !== "IN_PROGRESS")
    return state;
  let next = state;
  for (const player of state.players) {
    const champion = player.champion,
      options = champion?.quest?.finisherChoices;
    if (
      !champion ||
      !options?.length ||
      champion.selectedFinisherId ||
      champion.questCompleted
    )
      continue;
    const from = Math.max(
      previous.events.length,
      champion.finisherEventCursor ?? 0,
    );
    const identities = new Set<string>(champion.finisherEventIdentities ?? []);
    const events = state.events.slice(from).filter((event) => {
      const root = event.sourceContext?.rootSourceEventId,
        cause = event.sourceContext?.causationId;
      const target =
        event.cardInstanceId ??
        (event.target?.type === "CARD"
          ? event.target.cardInstanceId
          : undefined);
      if ((!root && !cause) || !target) return true;
      const key = JSON.stringify([root, cause, event.type, target]);
      if (identities.has(key)) return false;
      identities.add(key);
      return true;
    });
    const progress = { ...champion.finisherProgress };
    for (const option of options) {
      if (progress[option.id]?.completed) continue;
      const result = evaluateChampionQuestCondition(
        option.condition,
        state,
        player.id,
        events,
        progress[option.id]?.counts,
      );
      progress[option.id] = result;
    }
    next = {
      ...next,
      players: next.players.map((p) =>
        p.id === player.id && p.champion
          ? {
              ...p,
              champion: {
                ...p.champion,
                finisherProgress: progress,
                finisherEventCursor: state.events.length,
                finisherEventIdentities: [...identities],
              },
            }
          : p,
      ),
    };
  }
  // Other committed effects/hand arrivals finish first; never replace their resolution frame.
  if (
    next.targetingState?.active ||
    next.pendingComboAttack ||
    next.openingMulligan
  )
    return next;
  for (const player of next.players) {
    const champion = player.champion,
      options = champion?.quest?.finisherChoices;
    if (
      !champion ||
      !options?.length ||
      champion.selectedFinisherId ||
      champion.questCompleted ||
      player.health <= 0
    )
      continue;
    const ready = options.filter(
      (o) =>
        champion.finisherProgress?.[o.id]?.completed &&
        next.cardPool?.some(
          (d) =>
            d.id === o.cardDefinitionId &&
            d.cardType === "TECHNIQUE" &&
            d.rarity === "CHAMPION" &&
            d.isChampionToken,
        ),
    );
    if (ready.length === 1) {
      next = selectPreparedFinisher(
        next,
        player.id,
        finisherTargetId(ready[0]!.id),
      );
      if (next.targetingState?.active) return next;
    } else if (ready.length > 1) {
      return {
        ...next,
        targetingState: {
          active: true,
          playerId: player.id,
          sourceInstanceId: `finisher:${champion.id}`,
          finisherChoice: { optionIds: ready.map((o) => o.id) },
          effects: [],
          effectIndex: 0,
          selectedTargetIds: [],
          lastTargetIds: [],
          validTargetIds: ready.map((o) => finisherTargetId(o.id)),
          minTargets: 1,
          maxTargets: 1,
          mandatory: true,
          cancelable: false,
        },
      };
    }
  }
  return next;
}
