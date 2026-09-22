import type { GameEvent, GameState } from "@workspace/game-engine";

function hiddenCardCount(cards: unknown[]): { hidden: true; count: number } {
  return { hidden: true, count: cards.length };
}

function eventExposesHiddenCard(event: GameEvent, viewerId: string): boolean {
  if (event.playerId === viewerId) return false;
  return event.type === "CARD_DRAWN" || event.type === "CARD_GENERATED";
}

function sanitizeEvent(event: GameEvent, viewerId: string): unknown {
  if (!eventExposesHiddenCard(event, viewerId)) return event;
  const {
    cardInstanceId: _cardInstanceId,
    sourceSnapshot: _sourceSnapshot,
    targetSnapshot: _targetSnapshot,
    source: _source,
    target: _target,
    ...safeEvent
  } = event;
  return safeEvent;
}

export function sanitizeGameStateForViewer(state: GameState, viewerId: string): unknown {
  const { randomSeed: _randomSeed, ...publicState } = state;
  const players = state.players.map((player) => {
    if (player.id === viewerId) return player;
    const { hand: opponentHand, deck: opponentDeck, ...opponent } = player;
    return { ...opponent, hand: hiddenCardCount(opponentHand), deck: hiddenCardCount(opponentDeck) };
  });
  const targetingState = state.targetingState?.playerId === viewerId ? state.targetingState : undefined;
  return {
    ...publicState,
    players,
    events: state.events.map((event) => sanitizeEvent(event, viewerId)),
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
    event: sanitizeEvent(event, viewerId),
  }));
}