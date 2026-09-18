import type { GameEvent, GameState } from "@workspace/game-engine";

function hiddenCardCount(cards: unknown[]): { hidden: true; count: number } {
  return { hidden: true, count: cards.length };
}

function eventExposesHiddenCard(event: GameEvent, state: GameState, viewerId: string): boolean {
  if (!event.cardInstanceId || event.playerId === viewerId) return false;
  if (event.type !== "CARD_DRAWN" && event.type !== "CARD_GENERATED") return false;
  const opponent = state.players.find((player) => player.id === event.playerId);
  return Boolean(opponent?.hand.some((card) => card.instanceId === event.cardInstanceId));
}

function sanitizeEvent(event: GameEvent, state: GameState, viewerId: string): unknown {
  if (!eventExposesHiddenCard(event, state, viewerId)) return event;
  const {
    cardInstanceId: _cardInstanceId,
    sourceSnapshot: _sourceSnapshot,
    targetSnapshot: _targetSnapshot,
    ...safeEvent
  } = event;
  return safeEvent;
}

/**
 * Only this viewer projection is sent over the wire. The full state remains
 * inside the server runtime and is never serialized into a client message.
 */
export function sanitizeGameStateForViewer(state: GameState, viewerId: string): unknown {
  const {
    cardPool: _cardPool,
    randomSeed: _randomSeed,
    ...publicState
  } = state;
  const players = state.players.map((player) => {
    if (player.id === viewerId) {
      return player;
    }

    const {
      hand: opponentHand,
      deck: opponentDeck,
      ...opponent
    } = player;

    return {
      ...opponent,
      hand: hiddenCardCount(opponentHand),
      deck: hiddenCardCount(opponentDeck),
    };
  });

  const targetingState = state.targetingState?.playerId === viewerId
    ? state.targetingState
    : undefined;

  return {
    ...publicState,
    players,
    events: state.events.map((event) => sanitizeEvent(event, state, viewerId)),
    ...(targetingState ? { targetingState } : { targetingState: undefined }),
  };
}

export function eventsSince(state: GameState, previousEventCount: number): unknown[] {
  return state.events.slice(previousEventCount);
}

export function sequencedEventsForViewer(
  state: GameState,
  viewerId: string,
  events: readonly GameEvent[],
  startSequence = 0,
): unknown[] {
  return events.map((event, index) => ({
    sequenceNumber: startSequence + index,
    event: sanitizeEvent(event, state, viewerId),
  }));
}