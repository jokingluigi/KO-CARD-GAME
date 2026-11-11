import { canEnterTowerField } from "../tower/relics";
import { MAX_HAND_SIZE } from "../rules/constants";
import type { GameState } from "../types/game-state";
import type { CardInstance, CardDefinition } from "../cards/types";
import type {
  CardEffect,
  CardAbility,
  StructuredTarget,
} from "../effects/types";
import { getActiveCardAbilities } from "../cards/granted-text";
import { generateCard } from "../cards/generation";
import { createDeterministicRandom } from "../random/random";
import { currentChampionAbility } from "../champions/types";
export type BalanceOperation =
  | "BUFF_TOP_WRESTLER_ATTACK"
  | "CONDITIONAL_FIELD_BUFF"
  | "COUNT_TAG_BUFF"
  | "ABSORB_REMOVED_STATS"
  | "DISTRIBUTE_RANDOM"
  | "REPEAT_ENTRY"
  | "SUMMON_RANDOM_ADJACENT"
  | "DRAIN_HEALTH_TO_ONE"
  | "SUMMON_FROM_DECK"
  | "BUFF_LAST_SUMMON"
  | "REFILL_RANDOM_HAND"
  | "DISTINCT_TAG_GROWTH"
  | "REVIVE_WITH_PENALTY"
  | "BUFF_FOR_REMOVED_TAG"
  | "GRANT_MESSENGER"
  | "DESTROY_SUMMON_HALF"
  | "RETIRE_HEAL_UPGRADE"
  | "PERSISTENT_CHAMPION_FOLLOWUP"
  | "ELITE_CHAMPION_ABILITY"
  | "DAMAGE_GENERATE_ON_RETIRE"
  | "GENERATE_RANDOM_MATCH"
  | "DAMAGE_REMAINING_ENEMIES"
  | "DISCOVER_CATALOG"
  | "PANDORA_DAMAGE"
  | "GRANT_DODGE_ONCE"
  | "FILL_BOARD";
export type BalanceEffectConfig = {
  operation: BalanceOperation;
  [key: string]: unknown;
};
type Context = NonNullable<GameState["targetingState"]>["triggerContext"];
type Runner = (
  state: GameState,
  source: CardInstance,
  effect: CardEffect,
  ids?: string[],
  context?: Context,
) => GameState;
type Enter = (
  state: GameState,
  playerId: string,
  card: CardInstance,
  slot: 0 | 1 | 2 | 3,
  cause: "SUMMON" | "REVIVE",
) => GameState;
type Trigger = (
  state: GameState,
  card: CardInstance,
  trigger: CardAbility["trigger"],
) => GameState;
const self: StructuredTarget = {
  zone: "BOARD",
  owner: "SELF",
  selection: "SELF",
  count: 1,
};
const field = (
  owner: StructuredTarget["owner"] = "SELF",
  selection: StructuredTarget["selection"] = "ALL",
): StructuredTarget => ({
  zone: "BOARD",
  owner,
  cardType: "WRESTLER",
  selection,
  count: selection === "ALL" ? 8 : 1,
});
const fx = (
  action: Extract<CardEffect, { type: "STRUCTURED" }>["action"],
  target?: StructuredTarget,
  values?: Extract<CardEffect, { type: "STRUCTURED" }>["values"],
): Extract<CardEffect, { type: "STRUCTURED" }> => ({
  type: "STRUCTURED",
  action,
  target,
  values:
    values?.definitionRef?.name && ["SUMMON", "GENERATE"].includes(action)
      ? { ...values, resolveByName: true }
      : values,
});
const passive = (state: GameState, playerId: string) =>
  state.players
    .find((p) => p.id === playerId)
    ?.board.filter((c): c is CardInstance =>
      Boolean(c && c.currentHealth > 0 && !c.isAbilityDisabled),
    ) ?? [];
export function upgradeGoldCost(state: GameState, playerId: string): number {
  return passive(state, playerId).some((c) =>
    getActiveCardAbilities(c).some(
      (a) => "waiveUpgradeCost" in a && a.waiveUpgradeCost,
    ),
  )
    ? 0
    : 1;
}
export function fieldInvulnerable(
  state: GameState,
  card: CardInstance,
): boolean {
  return getActiveCardAbilities(card).some(
    (a) =>
      "invulnerableWhileOtherAllyTag" in a &&
      a.invulnerableWhileOtherAllyTag &&
      state.players.some(
        (p) =>
          p.board.some((c) => c?.instanceId === card.instanceId) &&
          p.board.some(
            (c) =>
              c &&
              c.instanceId !== card.instanceId &&
              c.tags?.includes(a.invulnerableWhileOtherAllyTag!),
          ),
      ),
  );
}
function randomIndex(
  state: GameState,
  source: CardInstance,
  limit: number,
  salt: string,
) {
  return Math.floor(
    createDeterministicRandom(
      `${state.randomSeed ?? 0}:${source.instanceId}:${state.events.length}:${salt}`,
    )() * limit,
  );
}
function catalog(state: GameState) {
  return [
    ...new Map(
      [...(state.cardPool ?? []), ...(state.minionACardPool ?? [])].map((c) => [
        c.id,
        c,
      ]),
    ).values(),
  ].filter((c) => c.status !== "DISABLED");
}
function pool(state: GameState, source: CardInstance, c: BalanceEffectConfig) {
  return catalog(state).filter(
    (d) =>
      (!d.questExclusive || source.isChampionToken) &&
      (!c.tag || d.tags?.includes(String(c.tag))) &&
      (!c.cardType || d.cardType === c.cardType) &&
      (!c.rarity || d.rarity === c.rarity) &&
      (!c.excludeChampionRarity || d.rarity !== "CHAMPION") &&
      (!Array.isArray(c.rarities) || c.rarities.includes(d.rarity)) &&
      (!c.excludeSource || d.id !== source.definitionId),
  );
}
/** Data-driven extensions reuse the ordinary damage/target/zone/entry interpreter. */
export function applyBalanceEffect(
  state: GameState,
  playerId: string,
  source: CardInstance,
  effect: Extract<CardEffect, { type: "STRUCTURED" }>,
  ids: string[] | undefined,
  context: Context,
  run: Runner,
  enter: Enter,
  trigger: Trigger,
): GameState | null {
  const c = effect.values?.balance;
  if (!c) return null;
  const owner = state.players.find((p) => p.id === playerId);
  if (!owner) return state;
  const num = (key: string, fallback = 0) =>
    typeof c[key] === "number" ? (c[key] as number) : fallback;
  const apply = (
    s: GameState,
    e: CardEffect,
    chosen?: string[],
    actor = source,
  ) => run(s, actor, e, chosen, context);
  const buff = (s: GameState, attack: number, health = 0) =>
    apply(s, fx("BUFF", self, { attack, health }));
  const found = state.players
    .flatMap((p) =>
      p.board
        .filter((x): x is CardInstance => Boolean(x))
        .map((card) => ({ player: p, card })),
    )
    .find((e) => e.card.instanceId === ids?.[0]);
  const chosen = (
    s: GameState,
    action: Extract<CardEffect, { type: "STRUCTURED" }>["action"],
    values: Extract<CardEffect, { type: "STRUCTURED" }>["values"],
    targetId = ids?.[0],
  ) =>
    targetId
      ? apply(
          s,
          fx(
            action,
            { zone: "BOARD", owner: "ALL", selection: "SAME_TARGET", count: 1 },
            values,
          ),
          [targetId],
        )
      : s;
  switch (c.operation) {
    case "BUFF_TOP_WRESTLER_ATTACK": {
      const top = owner.deck.find((d) => d.cardType === "WRESTLER");
      return top
        ? apply(
            state,
            fx(
              "BUFF",
              {
                zone: "DECK",
                owner: "SELF",
                selection: "SAME_TARGET",
                count: 1,
              },
              { attack: source.currentAttack },
            ),
            [top.instanceId],
          )
        : state;
    }
    case "CONDITIONAL_FIELD_BUFF": {
      const others = owner.board.filter((d): d is CardInstance =>
        Boolean(d && d.instanceId !== source.instanceId),
      );
      const special = others.some((d) =>
        (
          state.cardPool?.find((x) => x.id === d.definitionId)?.name ?? ""
        ).includes(String(c.nameIncludes)),
      );
      if (!special && !others.some((d) => d.tags?.includes(String(c.tag))))
        return state;
      let n = buff(
        state,
        special ? num("alternateAttack") : num("attack"),
        num("health"),
      );
      return special && c.keyword
        ? apply(n, fx("ADD_KEYWORD", self, { keyword: c.keyword as any }))
        : n;
    }
    case "COUNT_TAG_BUFF": {
      const cards = (Array.isArray(c.zones) ? c.zones : ["BOARD"])
        .flatMap((z) =>
          z === "HAND"
            ? owner.hand
            : z === "GRAVEYARD"
              ? owner.graveyard
              : owner.board,
        )
        .filter((d) => d && d.tags?.includes(String(c.tag)));
      return buff(
        state,
        cards.length * num("attack"),
        cards.length * num("health"),
      );
    }
    case "BUFF_FOR_REMOVED_TAG":
      return context?.removedTarget?.tags?.includes(String(c.tag))
        ? buff(state, num("attack"), num("health"))
        : state;
    case "ABSORB_REMOVED_STATS": {
      const victim = context?.removedTarget;
      return victim
        ? buff(
            state,
            Math.floor(victim.currentAttack * num("fraction", 0.5)),
            Math.floor(victim.maxHealth * num("fraction", 0.5)),
          )
        : state;
    }
    case "REPEAT_ENTRY":
      return trigger(state, source, "ENTER_FIELD");
    case "DISTRIBUTE_RANDOM": {
      let n = state;
      for (let i = 0; i < num("amount"); i++) {
        const p = n.players.find((p) =>
          c.owner === "ENEMY" ? p.id !== playerId : p.id === playerId,
        );
        const candidates =
          p?.board.filter((d): d is CardInstance =>
            Boolean(d && d.currentHealth > 0),
          ) ?? [];
        if (!candidates.length) break;
        const card =
          candidates[
            randomIndex(n, source, candidates.length, `distribute:${i}`)
          ];
        n = apply(
          n,
          fx(
            c.stat === "DAMAGE" ? "DAMAGE" : "BUFF",
            {
              zone: "BOARD",
              owner: c.owner === "ENEMY" ? "ENEMY" : "SELF",
              selection: "SAME_TARGET",
              count: 1,
            },
            c.stat === "DAMAGE"
              ? { amount: 1, resolvedAutomaticTarget: true }
              : { attack: 1, resolvedAutomaticTarget: true },
          ),
          [card.instanceId],
        );
      }
      return n;
    }
    case "DRAIN_HEALTH_TO_ONE": {
      if (!found) return state;
      const difference = Math.max(0, found.card.currentHealth - 1);
      return buff(
        chosen(state, "SET_STAT", {
          stat: "HEALTH",
          amount: 1,
          currentHealthOnly: true,
        }),
        difference,
      );
    }
    case "SUMMON_FROM_DECK": {
      const slot = owner.board.findIndex((x) => !x);
      const candidates = owner.deck.filter(
        (d) => d.cardType === "WRESTLER" && d.tags?.includes(String(c.tag)),
      );
      if (
        slot < 0 ||
        !candidates.length ||
        !canEnterTowerField(state, playerId)
      )
        return state;
      const card =
        candidates[
          randomIndex(state, source, candidates.length, "deck-summon")
        ];
      const n = {
        ...state,
        players: state.players.map((p) =>
          p.id !== playerId
            ? p
            : {
                ...p,
                deck: p.deck.filter((d) => d.instanceId !== card.instanceId),
              },
        ),
      };
      const entered = enter(n, playerId, card, slot as 0 | 1 | 2 | 3, "SUMMON");
      const live = entered.players
        .find((p) => p.id === playerId)
        ?.board.find((d) => d?.instanceId === card.instanceId);
      return live ? trigger(entered, live, "ENTER_FIELD") : entered;
    }
    case "BUFF_LAST_SUMMON": {
      const id = lastSourceSummon(state, source);
      return id
        ? chosen(
            state,
            "BUFF",
            { attack: num("attack"), health: num("health") },
            id,
          )
        : state;
    }
    case "REFILL_RANDOM_HAND": {
      let n = apply(
        state,
        fx(
          "MOVE_TO_DECK",
          { zone: "HAND", owner: "SELF", selection: "ALL", count: 20 },
          { preserveStats: true },
        ),
      );
      for (
        let i = 0;
        i < MAX_HAND_SIZE &&
        (n.players.find((p) => p.id === playerId)?.hand.length ?? 0) <
          MAX_HAND_SIZE;
      ) {
        const candidates = pool(n, source, {
          operation: "GENERATE_RANDOM_MATCH",
        });
        if (!candidates.length) break;
        const d =
          candidates[randomIndex(n, source, candidates.length, `refill:${i}`)];
        n = apply(
          n,
          fx("GENERATE", undefined, {
            definitionRef: { id: d.id },
            generatedModifiers: { cost: -num("costReduction") },
            count: 1,
          }),
        );
        i++;
      }
      return n;
    }
    case "DISTINCT_TAG_GROWTH": {
      const distinct = new Set(
        [...owner.board, ...owner.graveyard]
          .filter((d): d is CardInstance =>
            Boolean(
              d &&
              d.definitionId !== source.definitionId &&
              d.tags?.includes(String(c.tag)),
            ),
          )
          .map((d) => d.definitionId),
      );
      let n = buff(state, distinct.size * 2, distinct.size * 2);
      for (const [at, keyword] of [
        [1, "SURPRISE"],
        [2, "DEFENSE"],
        [3, "ARMOR"],
        [4, "DODGE"],
        [5, "IMMUNE"],
      ] as const)
        if (distinct.size >= at)
          n = apply(
            n,
            fx(
              keyword === "ARMOR" ? "BUFF" : "ADD_KEYWORD",
              self,
              keyword === "ARMOR" ? { armorGain: 1 } : { keyword },
            ),
          );
      return n;
    }
    case "REVIVE_WITH_PENALTY": {
      const slot = owner.board.findIndex((d) => !d),
        card = owner.graveyard.find((d) => d.instanceId === source.instanceId);
      if (
        !card ||
        slot < 0 ||
        !canEnterTowerField(state, playerId) ||
        source.maxHealth + num("health") <= 0
      )
        return state;
      const revived = {
        ...card,
        currentAttack: Math.max(0, source.currentAttack + num("attack")),
        maxHealth: source.maxHealth + num("health"),
        currentHealth: source.maxHealth + num("health"),
      };
      return enter(
        {
          ...state,
          players: state.players.map((p) =>
            p.id !== playerId
              ? p
              : {
                  ...p,
                  graveyard: p.graveyard.filter(
                    (d) => d.instanceId !== card.instanceId,
                  ),
                },
          ),
        },
        playerId,
        revived,
        slot as 0 | 1 | 2 | 3,
        "REVIVE",
      );
    }
    case "GRANT_MESSENGER": {
      if (!found) return state;
      const n = chosen(state, "BUFF", {
        attack: num("attack"),
        health: num("health"),
      });
      const grant: CardDefinition = {
        id: "granted-messenger:" + String(c.kind),
        name: c.kind === "DARK" ? "어둠의 사자" : "파괴의 전령",
        cardType: "WRESTLER",
        isToken: true,
        isChampionToken: false,
        cost: 0,
        attack: 0,
        health: 1,
        keywords: [],
        rulesText: "",
        abilities:
          c.kind === "DARK"
            ? [
                {
                  trigger: "BEFORE_ATTACK",
                  effects: [
                    fx("MODIFY_STAT", field("ENEMY", "SAME_TARGET"), {
                      drainAttackFraction: 0.5,
                      stat: "ATTACK",
                    }),
                  ],
                },
                {
                  trigger: "BEFORE_DAMAGE",
                  effects: [
                    fx("MODIFY_STAT", field("ENEMY", "LAST_ATTACKER"), {
                      drainAttackFraction: 0.5,
                      stat: "ATTACK",
                    }),
                  ],
                },
              ]
            : [
                {
                  trigger: "ANY_BEFORE_RETIRE",
                  effects: [],
                  retirementReplacementScope: "SOURCE_CAUSED_ENEMY",
                },
                {
                  trigger: "CARD_DESTROYED",
                  effects: [fx("BUFF", self, { attack: 1, health: 1 })],
                },
              ],
      };
      return chosen(n, "GRANT_RANDOM_CARD_TEXT", { definition: grant });
    }
    case "DESTROY_SUMMON_HALF": {
      if (!found) return state;
      const n = chosen(state, "DESTROY", {});
      if (
        !n.events
          .slice(state.events.length)
          .some(
            (e) =>
              e.type === "CARD_DESTROYED" &&
              e.cardInstanceId === found.card.instanceId,
          )
      )
        return n;
      return apply(
        n,
        fx("SUMMON", undefined, {
          definitionRef: { name: String(c.name) },
          generatedModifiers: {
            attack: Math.floor(found.card.currentAttack / 2),
            health: Math.floor(found.card.currentHealth / 2),
          },
          count: 1,
        }),
      );
    }
    case "RETIRE_HEAL_UPGRADE": {
      if (!found) return state;
      let n = chosen(state, "RETIRE", {});
      if (
        n.events
          .slice(state.events.length)
          .some(
            (e) =>
              e.type === "CARD_RETIRED" &&
              e.cardInstanceId === found.card.instanceId,
          )
      )
        n = apply(
          n,
          fx(
            "HEAL",
            { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 },
            { amount: Math.max(0, found.card.currentHealth) },
          ),
        );
      if (owner.champion?.id === "0db142af-750e-4929-a464-5daf1bc75452") {
        const base = currentChampionAbility(owner.champion)!;
        n = {
          ...n,
          players: n.players.map((p) =>
            p.id !== playerId
              ? p
              : {
                  ...p,
                  champion: {
                    ...p.champion!,
                    abilityOverride: {
                      ...base,
                      id: base.id + ":enemy-targets",
                      description:
                        base.description +
                        "\n상대 챔피언: 상대 손패의 무작위 카드 비용 +1 (최대 6). 상대 선수: 공격력 -1.",
                      effects: [
                        fx(
                          "DAMAGE",
                          {
                            zone: "CHARACTER",
                            owner: "ALL",
                            selection: "PLAYER_CHOICE",
                            count: 1,
                          },
                          {
                            amount: 1,
                            purpleRainFollowup: true,
                            purpleRainEnemyTargets: true,
                          },
                        ),
                      ],
                    },
                  },
                },
          ),
        };
      }
      return n;
    }
    case "PERSISTENT_CHAMPION_FOLLOWUP":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id !== playerId || !p.champion
            ? p
            : {
                ...p,
                champion: {
                  ...p.champion,
                  finisherGoldBonus:
                    (p.champion.finisherGoldBonus ?? 0) + num("gold"),
                  abilityAfterEffects: [
                    ...(p.champion.abilityAfterEffects ?? []),
                    ...(c.effect
                      ? [
                          {
                            type: "STRUCTURED",
                            ...(c.effect as object),
                            values: {
                              ...((c.effect as any).values ?? {}),
                              ...((c.effect as any).values?.definitionRef?.name
                                ? { resolveByName: true }
                                : {}),
                            },
                          } as CardEffect,
                        ]
                      : []),
                  ],
                },
              },
        ),
      };
    case "FILL_BOARD": {
      const count = owner.board.filter((d) => !d).length;
      return count
        ? apply(
            state,
            fx("SUMMON", undefined, {
              definitionRef: { name: String(c.name) },
              count,
            }),
          )
        : state;
    }
    case "ELITE_CHAMPION_ABILITY": {
      const base = currentChampionAbility(owner.champion);
      if (!base || !owner.champion) return state;
      const elite = fx("SUMMON", undefined, {
        definitionRef: { name: "엘리트 용병" },
        count: 1,
      });
      const namedSummon = (
        e: import("../champions/types").ChampionEffect,
        name: string,
      ) =>
        e.type === "STRUCTURED" &&
        e.action === "SUMMON" &&
        (e.values?.definitionRef?.name === name ||
          e.values?.definitionRef?.id ===
            catalog(state).find((d) => d.name === name)?.id);
      const summonsMercenary = base.effects.some((e) => namedSummon(e, "용병"));
      const alreadyElite = base.effects.some((e) =>
        namedSummon(e, "엘리트 용병"),
      );
      return {
        ...state,
        players: state.players.map((p) =>
          p.id !== playerId
            ? p
            : {
                ...p,
                champion: {
                  ...p.champion!,
                  abilityOverride: {
                    ...base,
                    id: base.id + ":elite",
                    description: summonsMercenary
                      ? base.description.replaceAll("용병", "엘리트 용병")
                      : alreadyElite
                        ? base.description
                        : base.description + "\n엘리트 용병을 1장 소환합니다.",
                    effects: summonsMercenary
                      ? base.effects.map((e) =>
                          namedSummon(e, "용병") ? elite : e,
                        )
                      : alreadyElite
                        ? base.effects
                        : [...base.effects, elite],
                  },
                },
              },
        ),
      };
    }
    case "DAMAGE_GENERATE_ON_RETIRE": {
      if (!found) return state;
      const n = chosen(state, "DAMAGE", { amount: num("amount") });
      if (
        !n.events
          .slice(state.events.length)
          .some(
            (e) =>
              e.type === "CARD_RETIRED" &&
              e.cardInstanceId === found.card.instanceId,
          )
      )
        return n;
      if (c.summonName)
        return apply(
          n,
          fx("SUMMON", undefined, {
            definitionRef: { name: String(c.summonName) },
            count: 1,
          }),
        );
      return applyBalanceEffect(
        n,
        playerId,
        source,
        fx("BUFF", undefined, {
          balance: { ...c, operation: "GENERATE_RANDOM_MATCH" },
        }) as Extract<CardEffect, { type: "STRUCTURED" }>,
        undefined,
        context,
        run,
        enter,
        trigger,
      )!;
    }
    case "GENERATE_RANDOM_MATCH": {
      const candidates = pool(state, source, c);
      if (!candidates.length) return state;
      const d =
        candidates[
          randomIndex(state, source, candidates.length, "generate-match")
        ];
      return apply(
        state,
        fx("GENERATE", undefined, {
          definitionRef: { id: d.id },
          count: 1,
          generatedModifiers: {
            cost: c.cost === 0 ? -d.cost : -num("costReduction"),
          },
        }),
      );
    }
    case "DAMAGE_REMAINING_ENEMIES": {
      const start = state.events.reduce(
        (last, e, i) =>
          e.type === "CARD_PLAYED" && e.cardInstanceId === source.instanceId
            ? i
            : last,
        -1,
      );
      const hit = state.events
        .slice(start + 1)
        .find(
          (e) =>
            e.type === "DAMAGE_DEALT" &&
            e.source?.type === "CARD" &&
            e.source.cardInstanceId === source.instanceId &&
            e.target?.type === "CARD",
        );
      const previous =
        hit?.target?.type === "CARD" ? [hit.target.cardInstanceId] : [];
      let n = state;
      for (const p of state.players.filter((p) => p.id !== playerId))
        for (const card of p.board)
          if (card && !previous.includes(card.instanceId))
            n = chosen(n, "DAMAGE", { amount: num("amount") }, card.instanceId);
      return apply(
        n,
        fx(
          "DAMAGE",
          { zone: "PLAYER", owner: "ENEMY", selection: "ALL", count: 1 },
          { amount: num("amount") },
        ),
      );
    }
    case "SUMMON_RANDOM_ADJACENT": {
      if (source.boardSlot === null) return state;
      let n = state;
      for (const slot of [source.boardSlot - 1, source.boardSlot + 1]) {
        if (
          slot < 0 ||
          slot > 3 ||
          n.players.find((p) => p.id === playerId)?.board[slot]
        )
          continue;
        const candidates = pool(n, source, {
          ...c,
          excludeSource: true,
          cardType: "WRESTLER",
        });
        if (!candidates.length) break;
        const d =
          candidates[
            randomIndex(n, source, candidates.length, `adjacent:${slot}`)
          ];
        const generated = generateCard(d, {
          instanceId: `${source.instanceId}:adjacent:${state.events.length}:${slot}`,
          playerId,
          source: { type: "CARD", cardInstanceId: source.instanceId },
          reason: "SUMMON",
          isGenerated: true,
        });
        n = enter(
          { ...n, events: [...n.events, generated.event] },
          playerId,
          generated.card,
          slot as 0 | 1 | 2 | 3,
          "SUMMON",
        );
        n = chosen(
          n,
          "ADD_KEYWORD",
          { keyword: c.keyword as any },
          generated.card.instanceId,
        );
      }
      return n;
    }
    case "DISCOVER_CATALOG": {
      let candidates = pool(state, source, c);
      const chosen: CardDefinition[] = [];
      while (candidates.length && chosen.length < num("count", 3)) {
        const index = randomIndex(
          state,
          source,
          candidates.length,
          "discover:" + chosen.length,
        );
        chosen.push(candidates[index]);
        candidates = candidates.filter((d) => d.id !== candidates[index].id);
      }
      if (!chosen.length) return state;
      const pending = state.targetingState;
      return {
        ...state,
        targetingState: {
          active: true,
          playerId,
          sourceInstanceId: source.instanceId,
          sourceCard: source,
          effects: [],
          effectIndex: 0,
          selectedTargetIds: [],
          lastTargetIds: [],
          validTargetIds: chosen.map((d) => "catalog:" + d.id),
          minTargets: 1,
          maxTargets: 1,
          mandatory: true,
          cancelable: false,
          catalogChoice: { definitionIds: chosen.map((d) => d.id) },
          continuation: pending,
        },
      };
    }
    case "PANDORA_DAMAGE": {
      let n = state;
      for (const id of ids ?? []) {
        const victim = n.players
          .flatMap((p) => p.board)
          .find((d) => d?.instanceId === id);
        if (!victim) continue;
        const start = n.events.length;
        n = chosen(n, "DAMAGE", { amount: num("amount", 1) }, id);
        if (
          n.events
            .slice(start)
            .some(
              (e) =>
                e.type === "CARD_RETIRED" &&
                e.cardInstanceId === id &&
                e.exactZero,
            )
        )
          n = apply(
            n,
            fx(
              "HEAL",
              { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 },
              { amount: 2 },
            ),
          );
      }
      return n;
    }
    case "GRANT_DODGE_ONCE": {
      let n = state;
      const eligible = owner.board.filter((d): d is CardInstance =>
        Boolean(d && !d.championDodgeGranted),
      );
      for (const card of eligible) {
        n = chosen(n, "ADD_KEYWORD", { keyword: "DODGE" }, card.instanceId);
        n = {
          ...n,
          players: n.players.map((p) =>
            p.id !== playerId
              ? p
              : {
                  ...p,
                  board: p.board.map((d) =>
                    d?.instanceId === card.instanceId
                      ? { ...d, championDodgeGranted: true }
                      : d,
                  ) as typeof p.board,
                },
          ),
        };
      }
      return n;
    }
  }
}
/** Raw post-mitigation health is retained on damage events; retirement must actually happen. */
export function exactZeroDamage(state: GameState, card: CardInstance): boolean {
  if (card.currentHealth !== 0) return false;
  const last = [...state.events]
    .reverse()
    .find(
      (e) =>
        e.target?.type === "CARD" &&
        e.target.cardInstanceId === card.instanceId &&
        (e.type === "DAMAGE_DEALT" || e.type === "STAT_CHANGED"),
    );
  return Boolean(
    last?.type === "DAMAGE_DEALT" &&
    Number(last.amount) > 0 &&
    last.after === 0 &&
    Number(last.before) > 0,
  );
}
/** Creation in hand/deck is separate from field entry; a generated summon is buffed by entry only. */
export function applyGeneratedTagAuras(
  state: GameState,
  eventStart: number,
  run: Runner,
): GameState {
  let next = state;
  for (let i = eventStart; i < state.events.length; i++) {
    const event = state.events[i];
    if (
      event.type !== "CARD_GENERATED" ||
      !event.playerId ||
      !event.cardInstanceId
    )
      continue;
    if (
      state.events
        .slice(i + 1)
        .some(
          (e) =>
            e.type === "ENTER_FIELD" &&
            e.cardInstanceId === event.cardInstanceId,
        )
    )
      continue;
    const owner = next.players.find((p) => p.id === event.playerId);
    if (!owner) continue;
    for (const source of passive(next, owner.id))
      for (const ability of getActiveCardAbilities(source)) {
        if (
          !("generatedCardTagBuff" in ability) ||
          !ability.generatedCardTagBuff
        )
          continue;
        const grant = ability.generatedCardTagBuff,
          key = `generated-tag:${i}:${event.cardInstanceId}:${source.instanceId}`;
        if (next.consumedNewCardEventKeys?.includes(key)) continue;
        const card =
          [...owner.hand, ...owner.deck].find(
            (d) => d.instanceId === event.cardInstanceId,
          ) ??
          next.targetingState?.handAddition?.cards.find(
            (c) => c.card.instanceId === event.cardInstanceId,
          )?.card;
        if (!card?.tags?.includes(grant.tag)) continue;
        next = {
          ...next,
          consumedNewCardEventKeys: [
            ...(next.consumedNewCardEventKeys ?? []),
            key,
          ],
        };
        const zone = owner.hand.some((d) => d.instanceId === card.instanceId)
          ? "HAND"
          : owner.deck.some((d) => d.instanceId === card.instanceId)
            ? "DECK"
            : undefined;
        if (zone)
          next = run(
            next,
            source,
            fx(
              "BUFF",
              { zone, owner: "SELF", selection: "SAME_TARGET", count: 1 },
              {
                attack: grant.attack,
                health: grant.health,
                resolvedAutomaticTarget: true,
              },
            ),
            [card.instanceId],
          );
        else if (next.targetingState?.handAddition) {
          const p = next.targetingState;
          next = {
            ...next,
            targetingState: {
              ...p,
              handAddition: {
                ...p.handAddition!,
                cards: p.handAddition!.cards.map((a) =>
                  a.card.instanceId !== card.instanceId
                    ? a
                    : {
                        ...a,
                        card: {
                          ...a.card,
                          currentAttack: a.card.currentAttack + grant.attack,
                          currentHealth: a.card.currentHealth + grant.health,
                          maxHealth: a.card.maxHealth + grant.health,
                        },
                      },
                ),
              },
            },
          };
        }
      }
  }
  return next;
}
/** Internal reviewed operations remain closed; authoring still uses the normal registry validator. */
export function lastSourceSummon(
  state: GameState,
  source: CardInstance,
): string | undefined {
  const start = state.events.reduce(
    (last, e, i) =>
      e.type === "ENTER_FIELD" && e.cardInstanceId === source.instanceId
        ? i
        : last,
    -1,
  );
  const event = state.events
    .slice(start + 1)
    .reverse()
    .find(
      (e) =>
        e.type === "ENTER_FIELD" &&
        e.cardInstanceId !== source.instanceId &&
        e.source?.type === "CARD" &&
        e.source.cardInstanceId === source.instanceId,
    );
  return event?.cardInstanceId &&
    state.players.some((p) =>
      p.board.some((c) => c?.instanceId === event.cardInstanceId),
    )
    ? event.cardInstanceId
    : undefined;
}
export function reviewedUpgradeValues(values: unknown): boolean {
  if (!values || typeof values !== "object") return false;
  const v = values as Record<string, unknown>;
  if (
    !Array.isArray(v.programEffects) ||
    !v.programEffects.length ||
    v.programEffects.length > 20 ||
    (v.programCost !== undefined &&
      (!Number.isInteger(v.programCost) || Number(v.programCost) < 0))
  )
    return false;
  return v.programEffects.every(
    (child) =>
      child?.action === "BUFF" &&
      child.values?.balance &&
      [
        "DISTRIBUTE_RANDOM",
        "BUFF_LAST_SUMMON",
        "DAMAGE_REMAINING_ENEMIES",
      ].includes(child.values.balance.operation),
  );
}
export function balanceUpgradeEligible(
  state: GameState,
  playerId: string,
  source: CardInstance,
  config: BalanceEffectConfig,
): boolean {
  if (config.operation === "DAMAGE_REMAINING_ENEMIES")
    return state.players.some((p) => p.id !== playerId && p.health > 0);
  if (config.operation === "BUFF_LAST_SUMMON")
    return Boolean(lastSourceSummon(state, source));
  if (config.operation === "DISTRIBUTE_RANDOM")
    return state.players.some(
      (p) =>
        (config.owner === "ENEMY" ? p.id !== playerId : p.id === playerId) &&
        p.board.some((c) => c && c.currentHealth > 0),
    );
  return false;
}
