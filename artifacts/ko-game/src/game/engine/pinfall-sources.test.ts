import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialGameState } from "./create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import { championRecordToDefinition } from "../champions/published-champions";
import { executeAction } from "../actions/engine-actions";
import {
  applyEffect,
  resolvePendingEffects,
  resolveStateBasedDeaths,
} from "../effects/effect-engine";
import { effectCanPinfall } from "./pinfall";
import { processChampionQuestEvents } from "../champions/quests";
import type { GameState } from "../types/game-state";
import type { CardAbility, CardEffect } from "../effects/types";
import type { CardDefinition, CardInstance } from "../cards/types";
import type { EventAttribution } from "../events/types";
const record = JSON.parse(
  readFileSync("docs/qa/snapshots/20261111-admin/champions.json", "utf8"),
).find((r: any) => r.id === "bcffab96-f61f-497e-b60b-de5a869837d3");
const pandora = championRecordToDefinition(record);
const base: CardDefinition = {
  id: "pinfall-unit",
  name: "판정 검증 선수",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 2,
  health: 8,
  keywords: [],
  abilities: [],
  rulesText: "",
};
const pin: CardAbility = {
  trigger: "EXACT_ZERO_DAMAGE",
  effects: [
    {
      type: "STRUCTURED",
      action: "BUFF",
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      values: { attack: 3, health: 0 },
    },
  ],
};
function setup() {
  const s = createInitialGameState([pandora.id, pandora.id], [base], [pandora]);
  Object.assign(s, {
    status: "IN_PROGRESS",
    turn: 5,
    activePlayerId: "player-1",
    events: [],
    openingMulligan: undefined,
    cardPool: [base],
  });
  for (const p of s.players)
    Object.assign(p, {
      hand: [],
      deck: [],
      board: [null, null, null, null],
      graveyard: [],
      removedFromGame: [],
      currentGold: 6,
      health: 15,
      maxHealth: 25,
    });
  s.players[1].champion!.quest = null;
  return s;
}
function put(
  s: GameState,
  owner = 0,
  slot = 0,
  overrides: Partial<CardInstance> = {},
) {
  const c = {
    ...generateCardInstance(base, { instanceId: `pin-${owner}-${slot}` }),
    boardSlot: slot as 0 | 1 | 2 | 3,
    enteredThisTurn: false,
    enteredOnTurn: 0,
    ...overrides,
  };
  s.players[owner].board[slot] = c;
  return c;
}
function damage(
  s: GameState,
  source: CardInstance,
  target: CardInstance,
  amount: number,
  values: Record<string, unknown> = {},
  context?: EventAttribution,
) {
  return processChampionQuestEvents(
    s,
    settle(
      applyEffect(
        s,
        "player-1",
        source,
        {
          type: "STRUCTURED",
          action: "DAMAGE",
          target: {
            zone: "BOARD",
            owner: "ALL",
            selection: "SAME_TARGET",
            count: 1,
          },
          values: { amount, resolvedAutomaticTarget: true, ...values },
        },
        [target.instanceId],
        context ? { sourceContext: context } : undefined,
      ),
    ),
  );
}
function flags(s: GameState) {
  return s.events
    .filter((e) => e.type === "CARD_RETIRED")
    .map((e) => Boolean(e.exactZero));
}
function settle(s: GameState) {
  for (let i = 0; i < 30 && s.targetingState?.active; i++) {
    const p = s.targetingState;
    const r = executeAction(s, {
      type: "SELECT_EFFECT_TARGET",
      playerId: p.playerId,
      targetId: p.validTargetIds[0],
    });
    assert.ok(r.success, r.message);
    s = r.state;
  }
  return s;
}
function progress(s: GameState) {
  return s.players[0].champion?.questConditionCounts?.root ?? 0;
}
function chooseAbility(s: GameState, ids: string[]) {
  let r = executeAction(s, {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  });
  assert.ok(r.success, r.message);
  s = r.state;
  for (const targetId of ids) {
    r = executeAction(s, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-1",
      targetId,
    });
    assert.ok(r.success, r.message);
    s = r.state;
  }
  r = executeAction(s, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "effect:confirm",
  });
  assert.ok(r.success, r.message);
  return r.state;
}
for (const cardType of ["WRESTLER", "TECHNIQUE"] as const)
  test(`ordinary ${cardType} exact effect kill does not count as pinfall`, () => {
    const s = setup(),
      source = put(s, 0, 0, { cardType }),
      target = put(s, 1, 0, { currentHealth: 2 });
    const n = damage(s, source, target, 2);
    assert.deepEqual(flags(n), [false]);
    assert.equal(progress(n), 0);
    assert.equal(n.players[1].board[0], null);
  });
for (const [amount, hp, expected] of [
  [0, 2, false],
  [1, 2, false],
  [2, 2, true],
  [3, 2, false],
] as const)
  test(`pinfall card effect ${amount} damage vs ${hp} health`, () => {
    const s = setup(),
      source = put(s, 0, 0, { abilities: [pin] }),
      target = put(s, 1, 0, { currentHealth: hp });
    const n = settle(damage(s, source, target, amount));
    assert.equal(flags(n).some(Boolean), expected);
    assert.equal(n.players[0].board[0]?.currentAttack, expected ? 5 : 2);
    assert.equal(progress(n), expected ? 1 : 0);
  });
test("post-mitigation actual health damage decides exactness", () => {
  const s = setup(),
    source = put(s, 0, 0, { abilities: [pin] }),
    target = put(s, 1, 0, { currentHealth: 2, armor: 1 });
  target.keywords = ["ARMOR"];
  source.currentAttack = 3;
  target.currentAttack = 0;
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: source.instanceId,
    target: {
      type: "WRESTLER",
      playerId: "player-2",
      cardInstanceId: target.instanceId,
    },
  });
  assert.ok(r.success, r.message);
  assert.deepEqual(flags(r.state), [true]);
  assert.equal(progress(r.state), 1);
});
test("physical attack by a vanilla wrestler qualifies even without its own pinfall ability", () => {
  const s = setup(),
    source = put(s),
    target = put(s, 1, 0, { currentHealth: 2, currentAttack: 0 });
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: source.instanceId,
    target: {
      type: "WRESTLER",
      playerId: "player-2",
      cardInstanceId: target.instanceId,
    },
  });
  assert.ok(r.success, r.message);
  assert.deepEqual(flags(r.state), [true]);
  assert.equal(progress(r.state), 1);
});
test("attack-triggered ordinary effect cannot borrow ATTACK provenance", () => {
  const s = setup(),
    source = put(s),
    target = put(s, 1, 0, { currentHealth: 2 });
  const n = damage(
    s,
    source,
    target,
    2,
    {},
    {
      sourcePlayerId: "player-1",
      sourceActionType: "ATTACK",
      combatRole: "ATTACKER",
    },
  );
  assert.deepEqual(flags(n), [false]);
  assert.equal(progress(n), 0);
});
test("Pandora ability exact retirements heal and only enemy retirements advance preparation", () => {
  const s = setup(),
    ally = put(s, 0, 0, { currentHealth: 1 }),
    enemy = put(s, 1, 0, { currentHealth: 1 });
  const n = chooseAbility(s, [ally.instanceId, enemy.instanceId]);
  assert.deepEqual(flags(n), [true, true]);
  assert.equal(n.players[0].health, 19);
  assert.equal(progress(n), 1);
});
test("another champion ability cannot qualify even with the same damage operation", () => {
  const s = setup();
  s.players[0].champion!.id = "other-champion";
  const enemy = put(s, 1, 0, { currentHealth: 1 });
  const n = chooseAbility(s, [enemy.instanceId]);
  assert.deepEqual(flags(n), [false]);
  assert.equal(n.players[0].health, 15);
  assert.equal(progress(n), 0);
});
test("ordinary reacting card cannot inherit Pandora eligibility from its parent chain", () => {
  const s = setup(),
    reactor = put(s, 0, 0, {
      abilities: [
        {
          trigger: "SELF_DAMAGED",
          effects: [
            {
              type: "STRUCTURED",
              action: "DAMAGE",
              target: {
                zone: "BOARD",
                owner: "ENEMY",
                selection: "ALL",
                count: 4,
              },
              values: { amount: 2 },
            },
          ],
        },
      ],
    }),
    enemy = put(s, 1, 0, { currentHealth: 2 });
  const n = chooseAbility(s, [reactor.instanceId]);
  assert.equal(n.players[1].board[0], null);
  assert.deepEqual(flags(n), [false]);
  assert.equal(progress(n), 0);
  assert.equal(n.players[0].health, 15);
});
test("nested lethal SELF_DAMAGED resolution preserves the exact source eligibility once", () => {
  const s = setup(),
    source = put(s, 0, 0, { abilities: [pin] }),
    target = put(s, 1, 0, {
      currentHealth: 2,
      abilities: [
        {
          trigger: "SELF_DAMAGED",
          effects: [
            {
              type: "STRUCTURED",
              action: "BUFF",
              target: {
                zone: "BOARD",
                owner: "SELF",
                selection: "SELF",
                count: 1,
              },
              values: { attack: 1, health: 0 },
            },
          ],
        },
      ],
    });
  const n = settle(damage(s, source, target, 2));
  assert.deepEqual(flags(n), [true]);
  assert.equal(n.players[0].board[0]?.currentAttack, 5);
  assert.equal(progress(n), 1);
});
test("silenced and disabled pinfall cards cannot qualify ordinary effect damage", () => {
  for (const overrides of [{ isSilenced: true }, { isAbilityDisabled: true }]) {
    const s = setup(),
      source = put(s, 0, 0, { abilities: [pin], ...overrides }),
      target = put(s, 1, 0, { currentHealth: 2 });
    const n = damage(s, source, target, 2);
    assert.deepEqual(flags(n), [false]);
    assert.equal(progress(n), 0);
  }
});
test("active granted pinfall text qualifies and survives source cleanup", () => {
  const s = setup(),
    source = put(s, 0, 0, {
      isSilenced: true,
      grantedText: {
        donorDefinitionId: "pinfall-donor",
        rulesText: "핀폴",
        keywords: [],
        abilities: [pin],
      },
    }),
    target = put(s, 1, 0, { currentHealth: 2 });
  const n = settle(damage(s, source, target, 2));
  assert.deepEqual(flags(n), [true]);
  assert.equal(progress(n), 1);
});
test("exact damage replaced by destruction does not count", () => {
  const s = setup(),
    source = put(s, 0, 0, { abilities: [pin] }),
    target = put(s, 1, 0, { currentHealth: 2 });
  const n = damage(s, source, target, 2, { destroyOnLethal: true });
  assert.deepEqual(flags(n), []);
  assert.equal(progress(n), 0);
  assert.ok(n.events.some((e) => e.type === "CARD_DESTROYED"));
});
test("health reduction without damage does not count", () => {
  const s = setup(),
    target = put(s, 1, 0, { currentHealth: 0 });
  s.events = [
    {
      type: "STAT_CHANGED",
      target: { type: "CARD", cardInstanceId: target.instanceId },
      stat: "maxHealth",
      before: 2,
      after: 0,
    },
  ];
  const n = resolveStateBasedDeaths(s);
  assert.deepEqual(flags(n), [false]);
  assert.equal(progress(n), 0);
});
test("inherited champion context needs the actual ability source, not just its champion id", () => {
  const s = setup(),
    source = put(s),
    context = {
      sourcePlayerId: "player-1",
      sourceActionType: "USE_CHAMPION_ABILITY",
      sourceChampionDefinitionId: pandora.id,
      sourceChampionInstanceId: "real-champion-proxy",
    };
  assert.equal(effectCanPinfall(source, context), false);
  assert.equal(
    effectCanPinfall({ ...source, instanceId: "real-champion-proxy" }, context),
    true,
  );
});

test("eligibility is captured before the damaged target silences its source", () => {
  const s = setup(),
    source = put(s, 0, 0, { abilities: [pin] }),
    target = put(s, 1, 0, {
      currentHealth: 2,
      abilities: [
        {
          trigger: "SELF_DAMAGED",
          effects: [
            {
              type: "STRUCTURED",
              action: "SILENCE",
              target: {
                zone: "BOARD",
                owner: "ENEMY",
                selection: "ALL",
                count: 4,
              },
            },
          ],
        },
      ],
    });
  const n = damage(s, source, target, 2);
  assert.deepEqual(flags(n), [true]);
  assert.equal(progress(n), 1);
  assert.equal(n.players[0].board[0]?.isSilenced, true);
  assert.equal(n.players[0].board[0]?.currentAttack, 2);
});

test("an unmarked effect source remains ineligible even if it gains pinfall during a later reaction", () => {
  const s = setup(),
    source = put(s),
    target = put(s, 1, 0, { currentHealth: 0 });
  s.events = [
    {
      type: "DAMAGE_DEALT",
      source: { type: "CARD", cardInstanceId: source.instanceId },
      target: { type: "CARD", cardInstanceId: target.instanceId },
      reason: "CARD_EFFECT",
      amount: 2,
      before: 2,
      after: 0,
      pinfallEligible: false,
    },
  ];
  source.abilities = [pin];
  const n = resolveStateBasedDeaths(
    JSON.parse(JSON.stringify(s)),
    undefined,
    0,
    "player-1",
  );
  assert.deepEqual(flags(n), [false]);
});

test("Pandora does not heal for a pinfall caused by a reacting card during her ability", () => {
  const s = setup();
  const target = put(s, 1, 0, {
    currentHealth: 2,
    abilities: [
      { trigger: "EXACT_ZERO_DAMAGE", effects: [] },
      {
        trigger: "SELF_DAMAGED",
        oncePerTurn: true,
        effects: [
          {
            type: "STRUCTURED",
            action: "DAMAGE",
            target: {
              zone: "BOARD",
              owner: "SELF",
              selection: "SELF",
              count: 1,
            },
            values: { amount: 1 },
          },
        ],
      },
    ],
  });
  const n = chooseAbility(s, [target.instanceId]);
  const retire = n.events.find((e) => e.type === "CARD_RETIRED");
  assert.ok(
    retire?.exactZero,
    "the reacting pinfall card made its own exact kill",
  );
  assert.deepEqual(retire.source, {
    type: "CARD",
    cardInstanceId: target.instanceId,
  });
  assert.equal(
    n.players[0].health,
    15,
    "Pandora's own hit was 2→1, so the child card's 1→0 cannot heal her",
  );
});

test("other cards' physical and effect pinfalls do not give Pandora her ability heal", () => {
  for (const physical of [true, false]) {
    const s = setup(),
      source = put(s, 0, 0, { abilities: [pin] }),
      target = put(s, 1, 0, { currentHealth: 2, currentAttack: 0 });
    const n = physical
      ? executeAction(s, {
          type: "ATTACK",
          playerId: "player-1",
          attackerInstanceId: source.instanceId,
          target: {
            type: "WRESTLER",
            playerId: "player-2",
            cardInstanceId: target.instanceId,
          },
        }).state
      : damage(s, source, target, 2);
    assert.deepEqual(flags(n), [true]);
    assert.equal(progress(n), 1);
    assert.equal(n.players[0].health, 15);
  }
});
