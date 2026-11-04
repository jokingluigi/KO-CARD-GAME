import { enterField } from "./enter-field";
import type { GameState } from "../types/game-state";
import type { CardInstance } from "../cards/types";
import {
  normalizeCardForZone,
  resetCardForGraveyard,
} from "../cards/zone-state";
import { MAX_HAND_SIZE } from "../rules/constants";
import {
  resolveHandAdditionListeners,
  resolvePendingEffects,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";

export type HandCompletion = {
  playerId: string;
  token: CardInstance;
  boardSlot: 0 | 1 | 2 | 3;
  championId: string;
};
export type HandArrival = {
  card: CardInstance;
  returnedFromBoard?: boolean;
  notifyListeners?: boolean;
};

/** Non-draw arrivals own a durable resolution frame, never an oversized hand. */
export function addCardsToHand(
  state: GameState,
  playerId: string,
  cards: HandArrival[],
  completion?: HandCompletion,
): GameState {
  if (!cards.length) return state;
  if (state.targetingState?.handAddition?.playerId === playerId) {
    return resumeHandAddition({
      ...state,
      targetingState: {
        ...state.targetingState,
        handAddition: {
          ...state.targetingState.handAddition,
          cards: [...state.targetingState.handAddition.cards, ...cards],
        },
      },
    });
  }
  return resumeHandAddition({
    ...state,
    targetingState: {
      active: true,
      playerId,
      sourceInstanceId: `hand-addition:${playerId}:${cards[0].card.instanceId}`,
      effects: [],
      effectIndex: 0,
      selectedTargetIds: [],
      lastTargetIds: [],
      validTargetIds: [],
      minTargets: 1,
      maxTargets: 1,
      mandatory: true,
      cancelable: false,
      handAddition: { playerId, cards, completion },
      continuation: state.targetingState,
    },
  });
}

export function resumeHandAddition(state: GameState): GameState {
  const pending = state.targetingState,
    addition = pending?.handAddition;
  if (!pending || !addition) return state;
  const owner = state.players.find((p) => p.id === addition.playerId);
  if (!owner) return state;
  if (!addition.cards.length) {
    let finished: GameState = {
      ...state,
      targetingState: pending.continuation,
    };
    const c = addition.completion;
    if (c) {
      finished = {
        ...finished,
        players: finished.players.map((p) =>
          p.id !== c.playerId || !p.champion?.awakening
            ? p
            : {
                ...p,
                champion: {
                  ...p.champion,
                  awakening: {
                    ...p.champion.awakening,
                    activeStageInstanceId: c.token.instanceId,
                    pendingStage: false,
                    championInvulnerable: true,
                  },
                },
              },
        ),
      };
      finished = enterField(
        finished,
        c.playerId,
        c.token,
        c.boardSlot,
        { type: "CHAMPION", championId: c.championId },
        undefined,
        "CHAMPION_DEPLOY",
      );
    }
    return finished;
  }
  if (owner.hand.length >= MAX_HAND_SIZE)
    return {
      ...state,
      targetingState: {
        ...pending,
        validTargetIds: owner.hand.map((c) => c.instanceId),
        selectedTargetIds: [],
      },
    };
  const [arrival, ...remaining] = addition.cards;
  const card = normalizeCardForZone(arrival.card, "HAND");
  let added: GameState = {
    ...state,
    targetingState: {
      ...pending,
      validTargetIds: [],
      handAddition: { ...addition, cards: remaining },
    },
    players: state.players.map((p) =>
      p.id === owner.id ? { ...p, hand: [...p.hand, card] } : p,
    ),
    events: [
      ...state.events,
      {
        type: "CARD_ADDED_TO_HAND",
        playerId: owner.id,
        cardInstanceId: card.instanceId,
        cardDefinitionId: card.definitionId,
        reason: "NON_DRAW",
      },
    ],
  };
  if (arrival.notifyListeners !== false)
    added = resolveHandAdditionListeners(added, owner.id, [card]);
  if (arrival.returnedFromBoard)
    added = resolveTriggeredAbilities(
      added,
      owner.id,
      card,
      "SELF_RETURNED_TO_HAND",
    );
  return added.targetingState?.handAddition ? resumeHandAddition(added) : added;
}

export function selectHandDiscard(
  state: GameState,
  targetId: string,
): GameState {
  const pending = state.targetingState,
    addition = pending?.handAddition;
  const owner = state.players.find((p) => p.id === addition?.playerId);
  const card = owner?.hand.find((c) => c.instanceId === targetId);
  if (
    !addition?.cards.length ||
    !pending ||
    !owner ||
    !card ||
    owner.hand.length < MAX_HAND_SIZE ||
    !pending.validTargetIds.includes(targetId)
  )
    return state;
  return resumeHandAddition({
    ...state,
    players: state.players.map((p) =>
      p.id === owner.id
        ? {
            ...p,
            hand: p.hand.filter((c) => c.instanceId !== card.instanceId),
            graveyard: [...p.graveyard, resetCardForGraveyard(card)],
          }
        : p,
    ),
    events: [
      ...state.events,
      {
        type: "CARD_DISCARDED",
        playerId: owner.id,
        cardInstanceId: card.instanceId,
        cardDefinitionId: card.definitionId,
        reason: "HAND_OVERFLOW",
      },
    ],
  });
}

export function hasPendingHandAddition(state: GameState): boolean {
  for (let frame = state.targetingState; frame; frame = frame.continuation)
    if (frame.handAddition) return true;
  return false;
}
