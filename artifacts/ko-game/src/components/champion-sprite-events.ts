import type { GameState } from "../game/types/game-state";
import type { SpriteEvent } from "@workspace/cosmetics";

/** A per-match cursor, not a timer-based guess about effect batching. */
export type SpriteEventCursor = {
  game: string;
  count: number;
  summons: Set<string>;
  exits: Set<string>;
  healing: Record<string, number>;
};
export function spriteEventCursor(state: GameState): SpriteEventCursor {
  return {
    game: state.gameId,
    count: state.events.length,
    summons: new Set(),
    exits: new Set(),
    healing: Object.fromEntries(
      state.players.map((p) => [p.id, p.presentationHealing?.total ?? 0]),
    ),
  };
}
export function spriteIsLow(health: number) {
  return health >= 1 && health <= 5;
}
/** Only confirmed, public results; never observes selections, animations or image names. */
export function championSpriteEvents(
  previous: GameState,
  state: GameState,
  playerId: string,
  cursor: SpriteEventCursor,
): SpriteEvent[] {
  if (cursor.game !== state.gameId || state.events.length < cursor.count) {
    Object.assign(cursor, spriteEventCursor(state));
    return [];
  }
  const start = cursor.count;
  cursor.count = state.events.length;
  const player = state.players.find((p) => p.id === playerId)!;
  const old = previous.players.find((p) => p.id === playerId)!;
  const reactions: SpriteEvent[] = [];
  const board = new Map(
    old.board.flatMap((c) => (c ? [[c.instanceId, c] as const] : [])),
  );
  const cards = [
    ...old.board,
    ...old.hand,
    ...old.graveyard,
    ...old.removedFromGame,
    ...player.board,
    ...player.hand,
    ...player.graveyard,
    ...player.removedFromGame,
  ].filter((c) => c !== null);
  const pending = new Set<number>();
  for (let frame = state.targetingState; frame; frame = frame.continuation) {
    if (frame.playRollback) {
      // A rollback-capable play is not yet a successful cast. Revisit it after
      // confirmation rather than reacting to a cancellable targeting preview.
      for (
        let i = frame.playRollback.events.length;
        i < state.events.length;
        i++
      )
        pending.add(i);
    }
  }
  // Tentative, rollback-capable effects do not produce an early relief reaction.
  if (!pending.size) {
    const total = player.presentationHealing?.total ?? 0;
    if (total > (cursor.healing[playerId] ?? 0)) reactions.push("HEAL");
    cursor.healing[playerId] = total;
  }
  let revisit = state.events.length;
  for (let i = start; i < state.events.length; i++) {
    const e = state.events[i]!;
    if (pending.has(i)) {
      revisit = Math.min(revisit, i);
      continue;
    }
    if (
      e.type === "DAMAGE_DEALT" &&
      ((e.target?.type === "PLAYER" && e.target.playerId === playerId) ||
        (e.target?.type === "CARD" &&
          board.get(e.target.cardInstanceId)?.isDirectDeployedChampion)) &&
      Number(e.amount) > 0
    ) {
      reactions.push(Number(e.amount) >= 5 ? "HEAVY_HIT" : "HIT");
    }
    if (e.playerId !== playerId) continue;
    if (
      e.type === "CHAMPION_ABILITY_USED" ||
      (e.type === "CARD_PLAYED" && e.cardType === "TECHNIQUE")
    )
      reactions.push("ATTACK");
    if (e.type === "CHAMPION_QUEST_COMPLETED") reactions.push("AWAKEN");
    if (e.type === "ENTER_FIELD") {
      const card = cards.find((c) => c.instanceId === e.cardInstanceId);
      if (card) board.set(card.instanceId, card);
      if (e.cardType === "TECHNIQUE" || card?.cardType === "TECHNIQUE")
        continue;
      const key =
        e.presentationResolutionId ??
        e.sourceContext?.causationId ??
        e.sourceContext?.rootSourceEventId ??
        `entry:${i}`;
      if (!cursor.summons.has(key)) {
        cursor.summons.add(key);
        reactions.push("SUMMON");
      }
    }
    const leaving =
      e.type === "CARD_RETIRED" ||
      e.type === "CARD_DESTROYED" ||
      e.type === "CARD_VANISHED" ||
      (e.type === "CARD_REMOVED" && e.reason === "REMOVE_FROM_GAME");
    if (leaving && e.cardInstanceId) {
      const card =
        board.get(e.cardInstanceId) ??
        cards.find((c) => c.instanceId === e.cardInstanceId);
      const onField =
        board.has(e.cardInstanceId) ||
        e.boardSlot != null ||
        e.targetSnapshot?.boardSlot != null;
      const definitionId = e.cardDefinitionId ?? card?.definitionId;
      const definition =
        state.cardPool?.find((d) => d.id === definitionId) ??
        state.minionACardPool?.find((d) => d.id === definitionId);
      // ENTER_FIELD event index distinguishes revive/re-entry of the same instance.
      const entry = state.events
        .slice(0, i)
        .findLastIndex(
          (x) =>
            x.type === "ENTER_FIELD" && x.cardInstanceId === e.cardInstanceId,
        );
      const key = `${e.cardInstanceId}:${entry}`;
      if (
        onField &&
        definition?.rarity === "LEGENDARY" &&
        (e.cardType ?? card?.cardType) !== "TECHNIQUE" &&
        !cursor.exits.has(key)
      ) {
        cursor.exits.add(key);
        reactions.push("ALLY_RETIRED");
      }
      board.delete(e.cardInstanceId);
    }
    if (
      e.type === "CARD_TRANSFORMED" ||
      (e.type === "CARD_REMOVED" && !leaving)
    ) {
      if (e.cardInstanceId) board.delete(e.cardInstanceId);
    }
  }
  cursor.count = revisit;
  return reactions;
}
