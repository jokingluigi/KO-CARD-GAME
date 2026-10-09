import type { GameState } from "../types/game-state";
import type { GameEvent } from "../events/types";
import type { CardInstance } from "../cards/types";
import { generateCardInstance } from "../cards/generation";
import { getActiveCardKeywords } from "../cards/granted-text";
import {
  applyEffect,
  getValidTargets,
  resolveStateBasedDeaths,
} from "../effects/effect-engine";
import { createDeterministicRandom } from "../random/random";
import type {
  TowerConfiguredEffect,
  TowerEffectCondition,
} from "../../../../../lib/game-engine/src/tower/effects";
export interface TowerEffectRule {
  ownerId: string;
  sourceType: "TOWER_RELIC" | "TOWER_BOSS";
  sourceId: string;
  effect: TowerConfiguredEffect;
  order: number;
}
export interface TowerConfiguredRuntime {
  cursor: number;
  turnCursor?: number;
  processing?: boolean;
  started?: boolean;
  uses: Record<
    string,
    { turn: number; turnCount: number; battleCount: number }
  >;
  runUses: Record<string, number>;
  runModifiers: Record<
    string,
    { attack: number; health: number; cost: number }
  >;
  errors: string[];
}
function eventCard(s: GameState, e: GameEvent): CardInstance | undefined {
  const id =
    e.cardInstanceId ??
    (e.source?.type === "CARD" ? e.source.cardInstanceId : undefined);
  return (
    s.players
      .flatMap((p) => [
        ...p.board,
        ...p.hand,
        ...p.deck,
        ...p.graveyard,
        ...p.removedFromGame,
      ])
      .find((c) => c?.instanceId === id) ?? undefined
  );
}
function compare(n: number, c: { compare: string; value: number }) {
  return c.compare === "EQ"
    ? n === c.value
    : c.compare === "GTE"
      ? n >= c.value
      : n <= c.value;
}
export function towerEffectConditionMatches(
  c: TowerEffectCondition | undefined,
  s: GameState,
  e: GameEvent,
  ownerId: string,
): boolean {
  if (!c) return true;
  if (c.type === "ALL" || c.type === "ANY")
    return c.type === "ALL"
      ? c.conditions.every((x) => towerEffectConditionMatches(x, s, e, ownerId))
      : c.conditions.some((x) => towerEffectConditionMatches(x, s, e, ownerId));
  const card = eventCard(s, e),
    owner = s.players.find((p) => p.id === ownerId);
  if (!owner) return false;
  if (c.type === "RELIC")
    return (
      s.tower?.inventoryRelicIds?.includes(c.id) ??
      s.tower?.relics.some((r) => r.id === c.id) ??
      false
    );
  if (c.type === "CARD_TAG")
    return [
      ...(s.cardPool?.find((d) => d.id === card?.definitionId)?.tags ??
        card?.tags ??
        []),
      ...(card?.grantedTags ?? []),
    ].includes(c.id);
  if (c.type === "CARD_KEYWORD")
    return Boolean(card && getActiveCardKeywords(card).includes(c.id as any));
  if (c.type !== "NUMBER") return false;
  const value =
    c.field === "TURN"
      ? s.turn
      : c.field === "CHAMPION_HP"
        ? owner.health
        : c.field === "GOLD"
          ? owner.currentGold
          : c.field === "FIELD_COUNT"
            ? owner.board.filter(Boolean).length
            : c.field === "CARD_ATK"
              ? card?.currentAttack
              : c.field === "CARD_HP"
                ? card?.currentHealth
                : c.field === "CARD_COST"
                  ? card?.currentCost
                  : s.events.filter(
                      (x) => x.playerId === ownerId && x.type === c.event,
                    ).length;
  return value !== undefined && compare(value, c);
}
function virtualSource(s: GameState, rule: TowerEffectRule): CardInstance {
  return generateCardInstance(
    {
      id: "tower-rule:" + rule.sourceId,
      name: rule.effect.name,
      cardType: "WRESTLER",
      cost: 0,
      attack: 0,
      health: 1,
      rulesText: "",
      keywords: [],
      abilities: [],
      isToken: true,
      isChampionToken: false,
    },
    { instanceId: "tower-rule:" + rule.sourceId + ":" + rule.effect.id },
  );
}
function signature(s: GameState): string {
  return JSON.stringify([
    s.players,
    s.preventedDamageTargetIds,
    s.preventedRetireTargetIds,
    s.status,
  ]);
}
export function resolveConfiguredTowerEffects(
  before: GameState,
  after: GameState,
): GameState {
  if (
    !after.tower?.configuredRules?.length ||
    after.tower.configuredRuntime?.processing
  )
    return after;
  let next = {
    ...after,
    tower: {
      ...after.tower,
      configuredRuntime: {
        cursor: before.events.length,
        uses: {},
        runUses: {},
        runModifiers: {},
        errors: [],
        ...after.tower.configuredRuntime,
        processing: true,
        turnCursor: after.tower.configuredRuntime?.turnCursor ?? before.turn,
      },
    },
  } as GameState;
  const rules = [...next.tower!.configuredRules!].sort(
    (a, b) => a.effect.priority - b.effect.priority || a.order - b.order,
  );
  const events: GameEvent[] = [];
  if (!next.tower!.configuredRuntime!.started) {
    events.push({ type: "TURN_STARTED", reason: "BATTLE_START" });
    next.tower!.configuredRuntime!.started = true;
  }
  let budget = 2048;
  while (
    (events.length ||
      next.tower!.configuredRuntime!.cursor < next.events.length) &&
    budget-- > 0
  ) {
    const runtime = next.tower!.configuredRuntime!;
    const index = runtime.cursor;
    const event = events.shift() ?? next.events[index]!;
    if (event.reason !== "BATTLE_START")
      next = {
        ...next,
        tower: {
          ...next.tower!,
          configuredRuntime: { ...runtime, cursor: index + 1 },
        },
      };
    if (event.type === "TURN_STARTED" && event.reason !== "BATTLE_START")
      next.tower!.configuredRuntime!.turnCursor =
        (next.tower!.configuredRuntime!.turnCursor ?? before.turn) + 1;
    const eventTurn =
      event.reason === "BATTLE_START"
        ? after.turn
        : (next.tower!.configuredRuntime!.turnCursor ?? next.turn);
    if (
      ["TOWER_RELIC", "TOWER_BOSS"].includes(
        event.sourceContext?.sourceActionType ?? "",
      )
    )
      continue;
    for (const rule of rules) {
      const effect = rule.effect;
      if (
        !effect.enabled ||
        (event.reason === "BATTLE_START"
          ? effect.event !== "BATTLE_START"
          : effect.event !== event.type)
      )
        continue;
      if (
        event.playerId &&
        effect.eventOwner !== "ANY" &&
        (event.playerId === rule.ownerId) !== (effect.eventOwner === "SELF")
      )
        continue;
      const rt = next.tower!.configuredRuntime!,
        key = rule.sourceType + ":" + rule.sourceId + ":" + effect.id,
        use = rt.uses[key] ?? { turn: eventTurn, turnCount: 0, battleCount: 0 };
      const consumed =
        effect.limit.scope === "RUN"
          ? (rt.runUses[key] ?? 0)
          : effect.limit.scope === "BATTLE"
            ? use.battleCount
            : use.turn === eventTurn
              ? use.turnCount
              : 0;
      if (effect.limit.scope !== "UNLIMITED" && consumed >= effect.limit.count)
        continue;
      try {
        if (
          !towerEffectConditionMatches(
            effect.condition,
            { ...next, turn: eventTurn },
            event,
            rule.ownerId,
          )
        )
          continue;
        const source = eventCard(next, event) ?? virtualSource(next, rule);
        let payload = {
          type: "STRUCTURED" as const,
          action: effect.action,
          target: effect.target,
          values: effect.values,
        };
        let ids = effect.target
          ? getValidTargets(next, rule.ownerId, source, payload)
          : undefined;
        if (effect.target && !ids?.length) continue;
        if (ids && effect.target?.selection === "RANDOM") {
          const random = createDeterministicRandom(
            (next.randomSeed ?? 0) + ":tower:" + index + ":" + key,
          );
          ids = [...ids]
            .map((id) => ({ id, n: random() }))
            .sort((a, b) => a.n - b.n)
            .slice(0, effect.target.count ?? 1)
            .map((x) => x.id);
        } else if (ids && effect.target?.selection === "TOP")
          ids = ids.slice(0, effect.target.count ?? 1);
        if (effect.duration === "RUN" && ids)
          ids = ids.filter((id) =>
            next.players
              .find((p) => p.id === rule.ownerId)
              ?.board.concat(
                next.players.find((p) => p.id === rule.ownerId)!.hand as any,
                next.players.find((p) => p.id === rule.ownerId)!.deck as any,
              )
              .some(
                (c) => c?.instanceId === id && c.towerDeckIndex !== undefined,
              ),
          );
        if (effect.target && !ids?.length) continue;
        if (ids && effect.target)
          payload = {
            ...payload,
            target: {
              ...effect.target,
              selection: "PLAYER_CHOICE",
              count: ids.length,
            },
            values: { ...effect.values, resolvedAutomaticTarget: true },
          };
        const baseline = signature(next),
          start = next.events.length,
          prior = next;
        if (ids && rule.sourceType === "TOWER_RELIC") {
          for (const id of ids) {
            const c = next.players
              .flatMap((p) => [...p.board, ...p.hand, ...p.deck])
              .find((c) => c?.instanceId === id);
            let values = { ...payload.values };
            let action = payload.action;
            if (c) {
              if (effect.action === "BUFF" && Number(values.health) < 0)
                values.health = Math.max(
                  Number(values.health),
                  1 - c.currentHealth,
                );
              if (
                ["MODIFY_STAT", "MODIFY_MAX_HEALTH"].includes(effect.action) &&
                (effect.action === "MODIFY_MAX_HEALTH" ||
                  values.stat === "HEALTH") &&
                Number(values.amount) < 0
              )
                values.amount = Math.max(
                  Number(values.amount),
                  1 - c.currentHealth,
                );
              if (effect.action === "SET_STATS")
                values.health = Math.max(1, Number(values.health));
              if (effect.action === "SET_STAT" && values.stat === "HEALTH")
                values.amount = Math.max(1, Number(values.amount));
            }
            if (c && action === "SWAP_STATS") {
              action = "SET_STATS";
              values = {
                ...values,
                attack: c.currentHealth,
                health: Math.max(1, c.currentAttack),
              };
            }
            next = applyEffect(
              next,
              rule.ownerId,
              source,
              { ...payload, action, values },
              [id],
              {
                sourceContext: {
                  sourcePlayerId: rule.ownerId,
                  sourceActionType: rule.sourceType,
                  sourceEffectId: rule.sourceId,
                  rootSourceEventId: String(index),
                },
              },
            );
          }
        } else
          next = applyEffect(next, rule.ownerId, source, payload, ids, {
            sourceContext: {
              sourcePlayerId: rule.ownerId,
              sourceActionType: rule.sourceType,
              sourceEffectId: rule.sourceId,
              rootSourceEventId: String(index),
            },
          });
        if (signature(next) === baseline) continue;
        next = resolveStateBasedDeaths(next);
        const usage = {
          turn: eventTurn,
          turnCount: (use.turn === eventTurn ? use.turnCount : 0) + 1,
          battleCount: use.battleCount + 1,
        };
        const updated = next.tower!.configuredRuntime!;
        const modifiers = { ...updated.runModifiers };
        if (effect.duration === "RUN")
          for (const id of ids ?? []) {
            const old = prior.players
              .find((p) => p.id === rule.ownerId)
              ?.board.concat(
                prior.players.find((p) => p.id === rule.ownerId)!.hand as any,
                prior.players.find((p) => p.id === rule.ownerId)!.deck as any,
              )
              .find((c) => c?.instanceId === id);
            const fresh = next.players
              .flatMap((p) => [...p.board, ...p.hand, ...p.deck])
              .find((c) => c?.instanceId === id);
            if (old?.towerDeckIndex !== undefined && fresh) {
              const key = String(old.towerDeckIndex),
                m = modifiers[key] ?? { attack: 0, health: 0, cost: 0 };
              const delta = {
                attack: fresh.currentAttack - old.currentAttack,
                health: fresh.maxHealth - old.maxHealth,
                cost: fresh.currentCost - old.currentCost,
              };
              const rebase = (c: CardInstance | null) =>
                c?.instanceId === id
                  ? {
                      ...c,
                      baseAttack:
                        (c.baseAttack ?? old.currentAttack) + delta.attack,
                      baseHealth: Math.max(
                        1,
                        (c.baseHealth ?? old.maxHealth) + delta.health,
                      ),
                      baseCost: Math.max(
                        0,
                        (c.baseCost ?? old.currentCost) + delta.cost,
                      ),
                    }
                  : c;
              next = {
                ...next,
                players: next.players.map((p) =>
                  p.id !== rule.ownerId
                    ? p
                    : {
                        ...p,
                        board: p.board.map(rebase) as typeof p.board,
                        hand: p.hand.map((c) => rebase(c)!),
                        deck: p.deck.map((c) => rebase(c)!),
                      },
                ),
              };
              modifiers[key] = {
                attack: m.attack + fresh.currentAttack - old.currentAttack,
                health: m.health + fresh.maxHealth - old.maxHealth,
                cost: m.cost + fresh.currentCost - old.currentCost,
              };
            }
          }
        next = {
          ...next,
          tower: {
            ...next.tower!,
            configuredRuntime: {
              ...updated,
              uses: { ...updated.uses, [key]: usage },
              runUses: {
                ...updated.runUses,
                [key]: (updated.runUses[key] ?? 0) + 1,
              },
              runModifiers: modifiers,
            },
          },
          events: next.events.map((e, i) =>
            i < start
              ? e
              : {
                  ...e,
                  sourceContext: {
                    ...e.sourceContext,
                    sourcePlayerId: rule.ownerId,
                    sourceActionType: rule.sourceType,
                    sourceEffectId: rule.sourceId,
                    rootSourceEventId: String(index),
                  },
                },
          ),
        };
      } catch (error) {
        console.warn("[tower-effect]", rule.sourceId, effect.id, error);
        next = {
          ...next,
          tower: {
            ...next.tower!,
            configuredRuntime: {
              ...next.tower!.configuredRuntime!,
              errors: [
                ...next.tower!.configuredRuntime!.errors,
                error instanceof Error ? error.message : "effect error",
              ].slice(-20),
            },
          },
        };
      }
    }
  }
  if (budget <= 0)
    console.warn("[tower-effect] event execution budget exceeded", next.gameId);
  return {
    ...next,
    tower: {
      ...next.tower!,
      configuredRuntime: {
        ...next.tower!.configuredRuntime!,
        processing: false,
      },
    },
  };
}
