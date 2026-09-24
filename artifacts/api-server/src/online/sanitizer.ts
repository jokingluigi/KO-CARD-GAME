import type { GameEvent, GameState } from "@workspace/game-engine";

function hiddenCardCount(cards: unknown[]): { hidden: true; count: number } {
  return { hidden: true, count: cards.length };
}

function eventReferencesCard(event: GameEvent, cardIds: Set<string>): boolean {
  const candidate = event as GameEvent & {
    cardInstanceId?: string;
    source?: { cardInstanceId?: string };
    target?: { cardInstanceId?: string };
    sourceSnapshot?: { cardInstanceId?: string };
    targetSnapshot?: { cardInstanceId?: string };
  };
  return [
    candidate.cardInstanceId,
    candidate.source?.cardInstanceId,
    candidate.target?.cardInstanceId,
    candidate.sourceSnapshot?.cardInstanceId,
    candidate.targetSnapshot?.cardInstanceId,
  ].some((id) => typeof id === "string" && cardIds.has(id));
}

function isLegacyHiddenEvent(event: GameEvent, viewerId: string): boolean {
  return event.playerId !== viewerId &&
    (event.type === "CARD_DRAWN" || event.type === "CARD_GENERATED");
}

function sanitizeEvent(
  event: GameEvent,
  hiddenCardIds: Set<string>,
  redactEntireEvent = false,
): unknown {
  if (!redactEntireEvent && !eventReferencesCard(event, hiddenCardIds)) return event;
  const candidate = event as GameEvent & {
    source?: { cardInstanceId?: string };
    target?: { cardInstanceId?: string };
    sourceSnapshot?: { cardInstanceId?: string };
    targetSnapshot?: { cardInstanceId?: string };
  };
  const safeEvent = { ...event } as Record<string, unknown>;
  delete safeEvent.cardInstanceId;
  if (redactEntireEvent) {
    delete safeEvent.source;
    delete safeEvent.target;
    delete safeEvent.sourceSnapshot;
    delete safeEvent.targetSnapshot;
    delete safeEvent.grantedFromDefinitionId;
    return safeEvent;
  }
  for (const [field, reference] of [
    ["source", candidate.source],
    ["target", candidate.target],
    ["sourceSnapshot", candidate.sourceSnapshot],
    ["targetSnapshot", candidate.targetSnapshot],
  ] as const) {
    if (reference && hiddenCardIds.has(reference.cardInstanceId ?? "")) delete safeEvent[field];
  }
  if (hiddenCardIds.has(event.cardInstanceId ?? "")) {
    delete safeEvent.grantedFromDefinitionId;
  }
  return safeEvent;
}

function sanitizeTargetingState(
  targetingState: NonNullable<GameState["targetingState"]>,
  hiddenCardIds: Set<string>,
): NonNullable<GameState["targetingState"]> {
  const safe = { ...targetingState };
  safe.validTargetIds = targetingState.validTargetIds.filter((id) => !hiddenCardIds.has(id));
  safe.selectedTargetIds = targetingState.selectedTargetIds.filter((id) => !hiddenCardIds.has(id));
  safe.lastTargetIds = targetingState.lastTargetIds.filter((id) => !hiddenCardIds.has(id));
  if (safe.sourceCard && hiddenCardIds.has(safe.sourceCard.instanceId)) delete safe.sourceCard;
  if (safe.scriptContinuation) {
    safe.scriptContinuation = {
      ...safe.scriptContinuation,
      registers: Object.fromEntries(
        Object.entries(safe.scriptContinuation.registers).map(([key, value]) => [
          key,
          "ids" in value
            ? { ids: value.ids.filter((id) => !hiddenCardIds.has(id)) }
            : value,
        ]),
      ),
    };
  }
  if (safe.continuation) {
    safe.continuation = sanitizeTargetingState(safe.continuation, hiddenCardIds);
  }
  return safe;
}

export function sanitizeGameStateForViewer(state: GameState, viewerId: string): unknown {
  const {
    randomSeed: _randomSeed,
    championQuestEventCursorByPlayer: _questEventCursors,
    championQuestProcessedEventIdentitiesByPlayer: _processedQuestEventIdentities,
    ...publicState
  } = state;
  const hiddenCardIds = new Set(
    state.players
      .filter((player) => player.id !== viewerId)
      .flatMap((player) => [...player.hand, ...player.deck])
      .map((card) => card.instanceId),
  );
  const players = state.players.map((player) => {
    if (player.id === viewerId) return player;
    const { hand: opponentHand, deck: opponentDeck, ...opponent } = player;
    return { ...opponent, hand: hiddenCardCount(opponentHand), deck: hiddenCardCount(opponentDeck) };
  });
  const targetingState = state.targetingState?.playerId === viewerId
    ? sanitizeTargetingState(state.targetingState, hiddenCardIds)
    : undefined;
  return {
    ...publicState,
    players,
    pendingCardEffects: (state.pendingCardEffects ?? []).filter(
      (pending) => !hiddenCardIds.has(pending.sourceInstanceId),
    ),
    pendingDelayedEffects: (state.pendingDelayedEffects ?? []).filter(
      (pending) =>
        !hiddenCardIds.has(pending.sourceInstanceId) &&
        !hiddenCardIds.has(pending.sourceCard?.instanceId ?? ""),
    ),
    pendingRuleListeners: (state.pendingRuleListeners ?? []).filter(
      (listener) => !hiddenCardIds.has(listener.sourceInstanceId),
    ),
    events: state.events.map((event) =>
      sanitizeEvent(event, hiddenCardIds, isLegacyHiddenEvent(event, viewerId))),
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
    event: sanitizeEvent(event, new Set(
      state.players
        .filter((player) => player.id !== viewerId)
        .flatMap((player) => [...player.hand, ...player.deck])
        .map((card) => card.instanceId),
    ), isLegacyHiddenEvent(event, viewerId)),
  }));
}