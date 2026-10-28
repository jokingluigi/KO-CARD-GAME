import type { GameState } from "../game/types/game-state";
import { SPRITE_EMOTES, type SpriteEvent } from "@workspace/cosmetics";

/** A per-match cursor, not a timer-based guess about effect batching. */
import {
  explicitSingleDamageTarget,
  type ChampionMotionCue,
  type ChampionMotionKind,
} from "./champion-sprite-motion";
export type SpriteEventCursor = {
  game: string;
  count: number;
  summons: Set<string>;
  exits: Set<string>;
  surprises: Set<string>;
  healing: Record<string, number>;
};
export function spriteEventCursor(state: GameState): SpriteEventCursor {
  return {
    game: state.gameId,
    count: state.events.length,
    summons: new Set(),
    exits: new Set(),
    surprises: new Set(),
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
  cues?: ChampionMotionCue[],
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
  let eventIndex = start;
  const emit = (event: SpriteEvent, extra: Partial<ChampionMotionCue> = {}) => {
    reactions.push(event);
    const kinds: Partial<Record<SpriteEvent, ChampionMotionKind>> = {
      ATTACK: "SPELL",
      HIT: "HIT",
      HEAVY_HIT: "HEAVY_HIT",
      HEAL: "HEAL",
      SUMMON: "SUMMON",
      ALLY_RETIRED: "SURPRISED",
      AWAKEN: "AWAKEN",
      EMOTE: "EMOTE",
    };
    cues?.push({
      id: `${state.gameId}:${eventIndex}:${event}`,
      kind: kinds[event] ?? "EMOTE",
      event,
      ...extra,
    });
  };
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
    if (total > (cursor.healing[playerId] ?? 0))
      emit("HEAL", {
        id: `${state.gameId}:heal:${player.presentationHealing?.sequence}`,
      });
    cursor.healing[playerId] = total;
  }
  let revisit = state.events.length;
  for (let i = start; i < state.events.length; i++) {
    eventIndex = i;
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
      const sourcePlayerId = e.sourceContext?.sourcePlayerId ?? e.playerId;
      const sourceId =
        e.source?.type === "CARD" ? e.source.cardInstanceId : e.cardInstanceId;
      const sourceCard = [
        ...previous.players.flatMap((p) => p.board),
        ...state.players.flatMap((p) => p.board),
      ].find((c) => c?.instanceId === sourceId);
      emit(Number(e.amount) >= 5 ? "HEAVY_HIT" : "HIT", {
        damage: e.amount,
        selfDamage: sourcePlayerId === playerId,
        sourcePlayerId,
        sourceSlot:
          e.sourceSnapshot?.boardSlot ?? sourceCard?.boardSlot ?? undefined,
        basicAttack:
          e.reason === "BASIC_ATTACK" || Boolean(e.sourceContext?.combatRole),
      });
    }
    if (e.playerId !== playerId) continue;
    if (e.type === "TURN_STARTED")
      cues?.push({
        id: `${state.gameId}:${i}:turn`,
        kind: "TURN",
        event: "IDLE",
      });
    if (
      e.type === "CHAMPION_EMOTE" &&
      SPRITE_EMOTES.includes(e.reason as (typeof SPRITE_EMOTES)[number])
    )
      emit("EMOTE", { emote: e.reason });
    if (
      e.type === "CHAMPION_ABILITY_USED" ||
      (e.type === "CARD_PLAYED" && e.cardType === "TECHNIQUE")
    ) {
      const nextCast = state.events.findIndex(
        (x, j) =>
          j > i &&
          (x.type === "CARD_PLAYED" || x.type === "CHAMPION_ABILITY_USED"),
      );
      const targets = state.events
        .slice(i + 1, nextCast < 0 ? undefined : nextCast)
        .filter(
          (x) =>
            x.type === "DAMAGE_DEALT" &&
            (x.sourceContext?.sourcePlayerId ?? x.playerId) === playerId &&
            Number(x.amount) > 0,
        )
        .flatMap<NonNullable<ChampionMotionCue["target"]>>((x) => {
          if (x.target?.type === "PLAYER")
            return [{ playerId: x.target.playerId }];
          if (x.target?.type !== "CARD") return [];
          const id = x.target.cardInstanceId;
          for (const p of [...state.players, ...previous.players]) {
            const c = p.board.find((c) => c?.instanceId === id);
            if (c) return [{ playerId: p.id, slot: c.boardSlot ?? undefined }];
          }
          return [];
        });
      const unique = [
        ...new Map(
          targets.map((t) => [`${t.playerId}:${t.slot ?? "champion"}`, t]),
        ).values(),
      ];
      const definition = state.cardPool?.find(
        (d) => d.id === e.cardDefinitionId,
      );
      const declared =
        e.type === "CHAMPION_ABILITY_USED"
          ? player.champion?.ability.effects
          : definition?.abilities;
      emit("ATTACK", {
        kind: e.type === "CHAMPION_ABILITY_USED" ? "ABILITY" : "SPELL",
        target:
          unique.length === 1 && explicitSingleDamageTarget(declared)
            ? unique[0]
            : undefined,
        support: unique.length === 0,
      });
    }
    if (e.type === "ATTACK_DECLARED") {
      const sourceId =
        e.source?.type === "CARD" ? e.source.cardInstanceId : e.cardInstanceId;
      const type =
        e.sourceSnapshot?.cardType ??
        cards.find((c) => c.instanceId === sourceId)?.cardType;
      if (type === "WRESTLER")
        emit("ATTACK", { kind: "WRESTLER_ATTACK", support: true });
    }
    if (e.type === "CHAMPION_QUEST_COMPLETED") emit("AWAKEN");
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
        const definition = state.cardPool?.find(
          (d) => d.id === (e.cardDefinitionId ?? card?.definitionId),
        );
        emit("SUMMON", {
          id: `${state.gameId}:summon:${key}`,
          kind:
            definition?.rarity === "LEGENDARY" ? "LEGENDARY_SUMMON" : "SUMMON",
          targetSlot: e.boardSlot ?? card?.boardSlot ?? undefined,
        });
      } else if (cues) {
        const definition = state.cardPool?.find(
          (d) => d.id === (e.cardDefinitionId ?? card?.definitionId),
        );
        const existing = cues.find(
          (c) => c.id === `${state.gameId}:summon:${key}`,
        );
        if (existing && definition?.rarity === "LEGENDARY") {
          existing.kind = "LEGENDARY_SUMMON";
          existing.targetSlot = e.boardSlot ?? card?.boardSlot ?? undefined;
        }
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
        const resolution =
          e.presentationResolutionId ??
          e.sourceContext?.causationId ??
          e.sourceContext?.rootSourceEventId;
        if (
          (!resolution || !cursor.surprises.has(resolution)) &&
          !reactions.includes("ALLY_RETIRED")
        )
          emit("ALLY_RETIRED");
        if (resolution) cursor.surprises.add(resolution);
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
