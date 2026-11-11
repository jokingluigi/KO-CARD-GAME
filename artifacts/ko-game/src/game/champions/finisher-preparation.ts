export { validFinisherChoices, validFinisherReward } from "./finisher-config";
import { evaluateChampionQuestCondition } from "../../../../../lib/game-engine/src/champion-quest-conditions";
import {
  resolvePendingEffects,
  resolveQueuedEffectsForPlayedTechnique,
} from "../effects/effect-engine";
import { resolveCommittedTechnique } from "../engine/resolve-technique";
import { resetCardForGraveyard } from "../cards/zone-state";
import type { ChampionQuest, FinisherChoice, FinisherReward } from "./types";
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
  return quest.finisher
    ? { type: "FINISHER", ...quest.finisher }
    : quest.reward;
}

/** Deterministic once-only arrival; instant casts are durable and wait behind committed selections. */
export function grantPreparedFinisher(
  state: GameState,
  playerId: string,
  reward: FinisherReward,
  key: string,
): GameState {
  const definition = state.cardPool?.find(
    (d) => d.id === reward.cardDefinitionId,
  );
  if (
    !definition ||
    definition.cardType !== "TECHNIQUE" ||
    definition.rarity !== "CHAMPION" ||
    !definition.isChampionToken
  )
    return state;
  const card = generateCardInstance(definition, {
    instanceId: `${state.gameId}:finisher:${playerId}:${key}`,
    isGenerated: true,
  });
  if (reward.delivery === "CAST")
    return {
      ...state,
      pendingFinisherCasts: [
        ...(state.pendingFinisherCasts ?? []),
        { playerId, card },
      ],
    };
  return addCardsToHand(state, playerId, [{ card }]);
}

function resolvePreparedFinisherCasts(state: GameState): GameState {
  let next = state;
  while (
    next.status === "IN_PROGRESS" &&
    !next.targetingState?.active &&
    !next.pendingComboAttack &&
    !next.openingMulligan &&
    next.pendingFinisherCasts?.length
  ) {
    const [pending, ...rest] = next.pendingFinisherCasts;
    next = { ...next, pendingFinisherCasts: rest.length ? rest : undefined };
    const owner = next.players.find((p) => p.id === pending.playerId);
    if (!owner || owner.health <= 0) continue;
    next = {
      ...next,
      players: next.players.map((p) =>
        p.id === owner.id
          ? {
              ...p,
              graveyard: [...p.graveyard, resetCardForGraveyard(pending.card)],
            }
          : p,
      ),
      events: [
        ...next.events,
        {
          type: "CARD_PLAYED",
          playerId: owner.id,
          cardInstanceId: pending.card.instanceId,
          cardDefinitionId: pending.card.definitionId,
          cardType: "TECHNIQUE",
          source: { type: "SYSTEM" },
          target: { type: "CARD", cardInstanceId: pending.card.instanceId },
          reason: "FINISHER_AUTO_CAST",
          tags: pending.card.tags ? [...pending.card.tags] : [],
        },
      ],
    };
    next = {
      ...next,
      targetingState: {
        active: true,
        finisherAutoCast: true,
        playerId: owner.id,
        sourceInstanceId: pending.card.instanceId,
        sourceCard: pending.card,
        effects: [],
        effectIndex: 0,
        selectedTargetIds: [],
        lastTargetIds: [],
        validTargetIds: [],
        minTargets: 0,
        maxTargets: 0,
        mandatory: true,
        cancelable: false,
      },
    };
    next = resolveQueuedEffectsForPlayedTechnique(
      next,
      owner.id,
      pending.card.instanceId,
    );
    const source =
      next.players
        .find((p) => p.id === owner.id)
        ?.graveyard.find((c) => c.instanceId === pending.card.instanceId) ??
      pending.card;
    next = resolveCommittedTechnique(next, owner.id, source, false);
    if (next.targetingState?.finisherAutoCast)
      next = resolvePendingEffects(next);
  }
  return next.status !== "IN_PROGRESS" && next.pendingFinisherCasts
    ? { ...next, pendingFinisherCasts: undefined }
    : next;
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
  return grantPreparedFinisher(next, playerId, option, option.id);
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
  return resolvePreparedFinisherCasts(next);
}
