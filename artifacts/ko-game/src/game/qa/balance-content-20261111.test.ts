import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardRecordToDefinition } from "../cards/published-cards";
import { championRecordToDefinition } from "../champions/published-champions";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import { executeAction, getLegalActions } from "../actions/engine-actions";
import {
  applyEffect,
  resolveTriggeredAbilities,
  resolvePendingEffects,
} from "../effects/effect-engine";
import { processChampionQuestEvents } from "../champions/quests";
import {
  evaluateChampionQuestCondition,
  validChampionQuestCondition,
} from "../../../../../lib/game-engine/src/champion-quest-conditions";
import { currentChampionAbility } from "../champions/types";
import { MAX_HAND_SIZE } from "../rules/constants";
import type { GameState } from "../types/game-state";
import type { CardEffect } from "../effects/types";
const records = JSON.parse(
  readFileSync("docs/qa/snapshots/20261111-admin/cards.json", "utf8"),
);
const championRecords = JSON.parse(
  readFileSync("docs/qa/snapshots/20261111-admin/champions.json", "utf8"),
);
const definitions = records.map(cardRecordToDefinition);
const byName = (name: string) => definitions.find((d: any) => d.name === name)!;
const body = {
  id: "balance-test-body",
  name: "검증 선수",
  cardType: "WRESTLER" as const,
  cost: 1,
  attack: 2,
  health: 8,
  isToken: false,
  isChampionToken: false,
  keywords: [],
  rulesText: "",
  abilities: [],
  tags: ["히어로", "마피아", "언데드", "구슬마스터"],
};
function setup(): GameState {
  const s = createInitialGameState();
  s.gameId = "balance1111";
  s.status = "IN_PROGRESS";
  s.turn = 5;
  s.activePlayerId = "player-1";
  s.events = [];
  s.openingMulligan = undefined;
  s.cardPool = [...definitions, body];
  s.minionACardPool = [...definitions, body];
  s.targetingState = undefined;
  for (const p of s.players) {
    p.currentGold = 6;
    p.health = 15;
    p.maxHealth = 25;
    p.hand = [];
    p.graveyard = [];
    p.deck = [];
    p.board = [null, null, null, null];
    p.champion!.quest = null;
    p.champion!.health = 15;
    p.champion!.maxHealth = 25;
  }
  return s;
}
function put(
  s: GameState,
  name: string,
  slot = 0,
  owner = 0,
  overrides: Record<string, unknown> = {},
) {
  const d = name === "body" ? body : byName(name);
  assert.ok(d, "Missing " + name);
  const c = {
    ...generateCardInstance(d, { instanceId: `${owner}:${name}:${slot}` }),
    boardSlot: slot as 0 | 1 | 2 | 3,
    enteredThisTurn: false,
    enteredOnTurn: -5,
    ...overrides,
  };
  s.players[owner].board[slot] = c;
  return c;
}
function finish(s: GameState): GameState {
  for (let i = 0; i < 100 && s.targetingState?.active; i++) {
    const p = s.targetingState;
    const id =
      p.maxTargets > p.minTargets && p.selectedTargetIds.length >= p.minTargets
        ? "effect:confirm"
        : p.validTargetIds.find((id) => !p.selectedTargetIds.includes(id));
    if (!id) {
      const n = resolvePendingEffects(s);
      assert.notEqual(n, s, "Empty impossible selector " + p.sourceInstanceId);
      s = n;
      continue;
    }
    const r = executeAction(s, {
      type: "SELECT_EFFECT_TARGET",
      playerId: p.playerId,
      targetId: id,
    });
    assert.ok(r.success, r.message);
    s = r.state;
  }
  assert.equal(s.targetingState, undefined, "Unfinished targeting");
  return s;
}
function play(s: GameState, name: string, slot = 1) {
  const d = byName(name);
  s.players[0].hand.push(
    generateCardInstance(d, { instanceId: "played:" + d.id }),
  );
  const r = executeAction(
    s,
    d.cardType === "WRESTLER"
      ? {
          type: "PLAY_WRESTLER",
          playerId: "player-1",
          cardInstanceId: "played:" + d.id,
          boardSlot: slot as 0 | 1 | 2 | 3,
        }
      : {
          type: "PLAY_TECHNIQUE",
          playerId: "player-1",
          cardInstanceId: "played:" + d.id,
        },
  );
  assert.ok(r.success, r.message + " " + name);
  return finish(r.state);
}
const oldRecords = JSON.parse(
  readFileSync("docs/qa/snapshots/20261030-admin/cards.json", "utf8"),
);
const oldById = new Map(oldRecords.map((r: any) => [r.id, r]));
const changed = records.filter((r: any) => {
  const before: any = oldById.get(r.id);
  return !before || r.text !== before.text;
});
for (const record of changed) {
  test("latest card actual hand play: " + record.name, () => {
    const s = setup();
    put(s, "body", 0);
    put(s, "body", 0, 1);
    put(s, "body", 1, 1);
    s.players[0].hand = [generateCardInstance(body, { instanceId: "held" })];
    s.players[0].deck = Array.from({ length: 8 }, (_, i) =>
      generateCardInstance(body, { instanceId: "deck-" + i }),
    );
    s.players[0].graveyard = [
      generateCardInstance(body, { instanceId: "grave" }),
    ];
    const n = play(s, record.name);
    assert.ok(n.players.every((p) => p.currentGold >= 0));
    assert.ok(n.players.every((p) => p.hand.length <= MAX_HAND_SIZE));
    assert.equal(
      new Set(
        n.players.flatMap((p) =>
          [...p.board, ...p.hand, ...p.deck, ...p.graveyard]
            .filter(Boolean)
            .map((c) => c!.instanceId),
        ),
      ).size,
      n.players.flatMap((p) =>
        [...p.board, ...p.hand, ...p.deck, ...p.graveyard].filter(Boolean),
      ).length,
      "duplicate card instance",
    );
  });
}
test("platinum spends only remaining gold, increases attack by two per gold and never health", () => {
  const s = setup();
  const n = play(s, "플래티넘 구슬마스터");
  const c = n.players[0].board[1]!;
  assert.equal(c.currentAttack, 11);
  assert.equal(c.maxHealth, 5);
  assert.equal(n.players[0].currentGold, 0);
});
test("bull damage cap is per hit and applies to effects without inventing armor", () => {
  let s = setup();
  const c = put(s, "황소할배");
  const enemy = put(s, "body", 0, 1);
  s = applyEffect(
    s,
    "player-2",
    enemy,
    {
      type: "STRUCTURED",
      action: "DAMAGE",
      target: {
        zone: "BOARD",
        owner: "ENEMY",
        selection: "SAME_TARGET",
        count: 1,
      },
      values: { amount: 20 },
    },
    [c.instanceId],
  );
  assert.equal(s.players[0].board[0]?.currentHealth, 2);
  s = applyEffect(
    s,
    "player-2",
    enemy,
    {
      type: "STRUCTURED",
      action: "DAMAGE",
      target: {
        zone: "BOARD",
        owner: "ENEMY",
        selection: "SAME_TARGET",
        count: 1,
      },
      values: { amount: 1 },
    },
    [c.instanceId],
  );
  assert.equal(s.players[0].board[0]?.currentHealth, 1);
});
test("unlimited-deck origin adds attack only for every two wrestlers in graveyard", () => {
  const s = setup();
  s.players[0].graveyard = Array.from({ length: 5 }, (_, i) =>
    generateCardInstance(body, { instanceId: "grave-" + i }),
  );
  const n = play(s, "디 오리진");
  assert.equal(n.players[0].board[1]?.currentAttack, 4);
  assert.equal(n.players[0].board[1]?.maxHealth, 6);
});
for (const name of [
  "나토마토",
  "블랙마카롱",
  "챔피언 라 칼라베라",
  "챔피언 마왕 벨모르트",
  "챔피언 미니언 A",
  "챔피언 판도라",
  "챔피언 퍼플레인",
  "챔피언 피 스타 세븐",
])
  test("latest champion preparation is executable: " + name, () => {
    const r = championRecords.find((r: any) => r.name === name);
    const c = championRecordToDefinition(r);
    assert.ok(c.quest, "missing quest");
    if (c.quest.condition)
      assert.ok(validChampionQuestCondition(c.quest.condition));
    if (c.quest.finisherChoices)
      for (const option of c.quest.finisherChoices)
        assert.ok(validChampionQuestCondition(option.condition));
    assert.ok(c.ability.effects.length, "missing ability");
  });
function effect(
  s: GameState,
  source: any,
  action: any,
  targetId: string,
  values: any = {},
  playerId = "player-1",
) {
  return finish(
    applyEffect(
      s,
      playerId,
      source,
      {
        type: "STRUCTURED",
        action,
        target: {
          zone: "BOARD",
          owner: "ALL",
          selection: "SAME_TARGET",
          count: 1,
        },
        values,
      },
      [targetId],
    ),
  );
}
function champion(s: GameState, name: string) {
  const d = championRecordToDefinition(
    championRecords.find((r: any) => r.name === name),
  );
  s.players[0].champion = {
    ...s.players[0].champion!,
    ...d,
    health: s.players[0].health,
    maxHealth: s.players[0].maxHealth,
    questProgress: 0,
    questCompleted: false,
  };
  return s.players[0].champion!;
}
function attack(s: GameState, id: string, targetId: string) {
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: id,
    target: {
      type: "WRESTLER",
      playerId: "player-2",
      cardInstanceId: targetId,
    },
  });
  assert.ok(r.success, r.message);
  return finish(r.state);
}
for (const [health, amount, expected] of [
  [2, 2, true],
  [2, 3, false],
  [2, 0, false],
  [4, 4, true],
  [4, 5, false],
])
  test(`pinfall actual health ${health} minus applied damage ${amount} => ${expected}`, () => {
    let s = setup();
    const source = put(s, "body", 0, 0, {
      abilities: [
        {
          trigger: "EXACT_ZERO_DAMAGE",
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
              values: { attack: 3 },
            },
          ],
        },
      ],
    });
    const target = put(s, "body", 0, 1, {
      currentHealth: health,
      maxHealth: health,
    });
    s = effect(s, source, "DAMAGE", target.instanceId, { amount });
    assert.equal(s.players[0].board[0]!.currentAttack, expected ? 5 : 2);
    const retired = s.events.find(
      (e) =>
        e.type === "CARD_RETIRED" && e.cardInstanceId === target.instanceId,
    );
    assert.equal(Boolean(retired?.exactZero), expected);
  });
test("exact basic attack retires first and activates pinfall once", () => {
  let s = setup();
  const a = put(s, "body", 0, 0, {
    currentAttack: 2,
    abilities: [
      {
        trigger: "EXACT_ZERO_DAMAGE",
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
            values: { attack: 3 },
          },
        ],
      },
    ],
  });
  const b = put(s, "body", 0, 1, { currentHealth: 2, currentAttack: 0 });
  s = attack(s, a.instanceId, b.instanceId);
  assert.equal(s.players[0].board[0]?.currentAttack, 5);
  assert.equal(s.players[1].board[0], null);
});
test("destroy-on-lethal does not activate pinfall or a pinfall preparation", () => {
  let s = setup();
  const a = put(s, "body", 0, 0, {
    abilities: [
      {
        trigger: "EXACT_ZERO_DAMAGE",
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
            values: { attack: 3 },
          },
        ],
      },
    ],
  });
  const b = put(s, "body", 0, 1, { currentHealth: 2 });
  s = effect(s, a, "DAMAGE", b.instanceId, {
    amount: 2,
    destroyOnLethal: true,
  });
  assert.equal(s.players[0].board[0]?.currentAttack, 2);
  assert.ok(s.events.some((e) => e.type === "CARD_DESTROYED"));
  assert.ok(!s.events.some((e) => e.type === "CARD_RETIRED"));
});
test("Pandora selects multiple wrestlers, waits for confirmation, heals exact retirements only and counts enemy pinfalls", () => {
  let s = setup();
  champion(s, "챔피언 판도라");
  const ally = put(s, "body", 0, 0, { currentHealth: 1 }),
    enemy = put(s, "body", 0, 1, { currentHealth: 1 }),
    survivor = put(s, "body", 1, 1, { currentHealth: 2 });
  let r = executeAction(s, {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  });
  assert.ok(r.success);
  s = r.state;
  for (const id of [ally.instanceId, enemy.instanceId, survivor.instanceId]) {
    r = executeAction(s, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-1",
      targetId: id,
    });
    assert.ok(r.success);
    s = r.state;
  }
  assert.equal(s.players[0].health, 15);
  assert.equal(s.players[1].board[0]?.currentHealth, 1);
  r = executeAction(JSON.parse(JSON.stringify(s)), {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "effect:confirm",
  });
  assert.ok(r.success);
  s = finish(r.state);
  assert.equal(s.players[0].health, 19);
  assert.equal(s.players[1].board[1]?.currentHealth, 1);
  assert.equal(s.players[0].champion?.questConditionCounts?.root, 1);
  assert.equal(s.players[0].champion?.questCompleted, false);
});
test("Calavera uses the current graveyard undead count rather than old accumulated retirements", () => {
  const s = setup();
  champion(s, "챔피언 라 칼라베라");
  s.players[0].graveyard = Array.from({ length: 9 }, (_, i) =>
    generateCardInstance(body, { instanceId: "u-" + i }),
  );
  let n = processChampionQuestEvents(s, s);
  assert.equal(n.players[0].champion?.questCompleted, false);
  const before = n;
  n = {
    ...n,
    players: n.players.map((p, i) =>
      i
        ? p
        : {
            ...p,
            graveyard: [
              ...p.graveyard,
              generateCardInstance(body, { instanceId: "u-10" }),
            ],
          },
    ),
  };
  n = processChampionQuestEvents(before, n);
  assert.equal(n.players[0].champion?.questCompleted, true);
  assert.equal(
    n.players[0].hand.at(-1)?.definitionId,
    byName("궁극의 언데드").id,
  );
});
test("Minion A finisher choices count generation rather than card play and champion rarity generates the alternative", () => {
  const s = setup();
  champion(s, "챔피언 미니언 A");
  let n = processChampionQuestEvents(s, {
    ...s,
    events: Array.from({ length: 5 }, (_, i) => ({
      type: "CARD_PLAYED" as const,
      playerId: "player-1",
      cardInstanceId: "play-" + i,
      cardType: "WRESTLER" as const,
    })),
  });
  assert.equal(n.players[0].champion?.questCompleted, false);
  const old = n;
  n = processChampionQuestEvents(old, {
    ...n,
    events: [
      ...n.events,
      {
        type: "CARD_GENERATED",
        playerId: "player-1",
        cardDefinitionId: byName("세븐 스타 래리어트").id,
        cardInstanceId: "champ-gen",
        cardType: "TECHNIQUE",
      },
    ],
  });
  assert.equal(n.players[0].champion?.questCompleted, true);
  assert.equal(n.players[0].champion?.selectedFinisherId, "option-2");
  assert.equal(n.players[0].hand.at(-1)?.definitionId, byName("흉내내기").id);
});
test("P Star uses five successful abilities instead of stale seven", () => {
  const s = setup();
  champion(s, "챔피언 피 스타 세븐");
  let n = processChampionQuestEvents(s, {
    ...s,
    events: Array.from({ length: 4 }, (_, i) => ({
      type: "CHAMPION_ABILITY_USED" as const,
      playerId: "player-1",
      championId: s.players[0].champion!.id,
      sourceContext: {
        sourcePlayerId: "player-1",
        sourceChampionDefinitionId: s.players[0].champion!.id,
        sourceActionType: "USE_CHAMPION_ABILITY" as const,
        rootSourceEventId: "ability-" + i,
      },
    })),
  });
  assert.equal(n.players[0].champion?.questCompleted, false);
  const before = n;
  n = processChampionQuestEvents(before, {
    ...n,
    events: [
      ...n.events,
      {
        type: "CHAMPION_ABILITY_USED",
        playerId: "player-1",
        championId: s.players[0].champion!.id,
        sourceContext: {
          sourcePlayerId: "player-1",
          sourceChampionDefinitionId: s.players[0].champion!.id,
          sourceActionType: "USE_CHAMPION_ABILITY",
          rootSourceEventId: "ability-5",
        },
      },
    ],
  });
  assert.equal(n.players[0].champion?.questCompleted, true);
});
test("Natomato dodge is granted only once per wrestler while new wrestlers can receive it", () => {
  let s = setup();
  champion(s, "나토마토");
  const a = put(s, "body");
  let r = executeAction(s, {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  });
  assert.ok(r.success);
  s = finish(r.state);
  assert.equal(s.players[0].board[0]?.dodgeCharges, 1);
  const enemy = put(s, "body", 0, 1);
  s = effect(s, enemy, "DAMAGE", a.instanceId, { amount: 1 }, "player-2");
  assert.equal(s.players[0].board[0]?.dodgeCharges, 0);
  s.players[0].championAbilityUsedThisTurn = false;
  s.players[0].currentGold = 6;
  const fresh = put(s, "body", 1);
  r = executeAction(s, { type: "USE_CHAMPION_ABILITY", playerId: "player-1" });
  assert.ok(r.success);
  s = finish(r.state);
  assert.equal(s.players[0].board[0]?.dodgeCharges, 0);
  assert.equal(s.players[0].board[1]?.dodgeCharges, 1);
});
test("Nebra grants +2/+2 and attack drain, rather than losing either clause", () => {
  let s = setup();
  const a = put(s, "body"),
    b = put(s, "body", 0, 1, {
      currentAttack: 8,
      currentHealth: 20,
      maxHealth: 20,
    });
  s = play(s, "네브라, 어둠의 천사");
  assert.equal(s.players[0].board[0]?.currentAttack, 4);
  assert.equal(s.players[0].board[0]?.maxHealth, 10);
  s = attack(s, a.instanceId, b.instanceId);
  assert.equal(s.players[0].board[0]?.currentAttack, 8);
  assert.equal(s.players[1].board[0]?.currentAttack, 4);
});
test("Sovereign revives with a cumulative -2/-2 and stops at zero maximum health", () => {
  let s = setup();
  let a = put(s, "소버린");
  const enemy = put(s, "body", 0, 1);
  for (const expected of [
    [2, 4],
    [0, 2],
  ]) {
    s = effect(s, enemy, "DAMAGE", a.instanceId, { amount: 20 }, "player-2");
    a = s.players[0].board[0]!;
    assert.ok(a);
    assert.equal(a.currentAttack, expected[0]);
    assert.equal(a.maxHealth, expected[1]);
    assert.equal(a.currentHealth, expected[1]);
  }
  s = effect(s, enemy, "DAMAGE", a.instanceId, { amount: 20 }, "player-2");
  assert.equal(s.players[0].board[0], null);
});
test("Omega grows on allied retirement and separately grows and creates a zombie on enemy kills", () => {
  let s = setup();
  const a = put(s, "오메가 좀비"),
    ally = put(s, "body", 1),
    enemy = put(s, "body", 0, 1, { currentHealth: 1, currentAttack: 0 });
  s = effect(s, a, "RETIRE", ally.instanceId);
  assert.equal(s.players[0].board[0]?.currentAttack, 5);
  s = attack(s, a.instanceId, enemy.instanceId);
  assert.equal(s.players[0].board[0]?.currentAttack, 6);
  assert.ok(
    s.players[0].board.some((c) => c?.definitionId === byName("좀비").id),
  );
});
test("Cat buffs generated mafia in hand and summoned mafia once per entry", () => {
  let s = setup();
  const cat = put(s, "고양이");
  s = finish(
    applyEffect(s, "player-1", cat, {
      type: "STRUCTURED",
      action: "GENERATE",
      values: { definitionRef: { id: body.id }, count: 1 },
    }),
  );
  assert.equal(s.players[0].hand[0].currentAttack, 3);
  assert.equal(s.players[0].hand[0].maxHealth, 9);
  s = finish(
    applyEffect(s, "player-1", cat, {
      type: "STRUCTURED",
      action: "SUMMON",
      values: { definitionRef: { id: body.id }, count: 1 },
    }),
  );
  assert.equal(s.players[0].board[1]?.currentAttack, 3);
  assert.equal(s.players[0].board[1]?.maxHealth, 9);
});
test("Mafia joker is damage-invulnerable only with another mafia ally and buffs the attacking ally before combat", () => {
  let s = setup();
  const joker = put(s, "조킹루이지(로마니 마피아)"),
    ally = put(s, "body", 1),
    enemy = put(s, "body", 0, 1, {
      currentHealth: 20,
      maxHealth: 20,
      currentAttack: 0,
    });
  s = effect(
    s,
    enemy,
    "DAMAGE",
    joker.instanceId,
    { amount: 20, resolvedAutomaticTarget: true },
    "player-2",
  );
  assert.equal(s.players[0].board[0]?.currentHealth, 1);
  s = attack(s, ally.instanceId, enemy.instanceId);
  assert.equal(s.players[0].board[1]?.currentAttack, 3);
  assert.equal(s.players[1].board[0]?.currentHealth, 17);
  s = effect(s, enemy, "RETIRE", ally.instanceId, {}, "player-2");
  s = effect(
    s,
    enemy,
    "DAMAGE",
    joker.instanceId,
    { amount: 20, resolvedAutomaticTarget: true },
    "player-2",
  );
  assert.equal(s.players[0].board[0], null);
});
test("Esperansa waives the upgrade payment but still executes the upgrade once", () => {
  const s = setup();
  put(s, "나토마토(에스페란사)");
  s.players[0].currentGold = 1;
  const n = play(s, "신입 사이드킥");
  assert.equal(n.players[0].currentGold, 0);
  assert.equal(n.players[0].board[1]?.currentAttack, 2);
  assert.equal(n.players[0].board[1]?.maxHealth, 2);
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    1,
  );
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED")[0].amount,
    0,
  );
});
test("Rosie returns every existing hand card preserving stats then fills exactly to the existing hand cap", () => {
  const s = setup();
  s.players[0].hand = Array.from({ length: 4 }, (_, i) => ({
    ...generateCardInstance(body, { instanceId: "original-" + i }),
    currentAttack: 5,
    maxHealth: 12,
    currentHealth: 3,
    currentCost: 0,
  }));
  const n = play(s, "로지 양");
  assert.equal(n.players[0].hand.length, MAX_HAND_SIZE);
  for (let i = 0; i < 4; i++) {
    const c = n.players[0].deck.find((c) => c.instanceId === "original-" + i);
    assert.ok(c);
    assert.equal(c.currentAttack, 5);
    assert.equal(c.currentCost, 0);
    assert.equal(c.maxHealth, 12);
  }
  assert.equal(n.targetingState, undefined);
});
test("Mimic persists three distinct candidates, excludes itself, cannot cancel and grants only the selected finisher", () => {
  let s = setup();
  const d = byName("흉내내기");
  s.players[0].hand = [generateCardInstance(d, { instanceId: "mimic" })];
  const r = executeAction(s, {
    type: "PLAY_TECHNIQUE",
    playerId: "player-1",
    cardInstanceId: "mimic",
  });
  assert.ok(r.success);
  s = r.state;
  assert.equal(s.targetingState?.catalogChoice?.definitionIds.length, 3);
  assert.equal(new Set(s.targetingState?.catalogChoice?.definitionIds).size, 3);
  assert.ok(!s.targetingState?.catalogChoice?.definitionIds.includes(d.id));
  assert.equal(
    executeAction(s, { type: "CANCEL_EFFECT_TARGET", playerId: "player-1" })
      .success,
    false,
  );
  const id = s.targetingState!.validTargetIds[1];
  const done = executeAction(JSON.parse(JSON.stringify(s)), {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: id,
  });
  assert.ok(done.success);
  assert.equal(done.state.players[0].hand.length, 1);
  assert.equal(done.state.players[0].hand[0].definitionId, id.slice(8));
  assert.equal(done.state.targetingState, undefined);
});
test("Scarlet distributes exactly five attack points and paid upgrade distributes exactly five damage", () => {
  let s = setup();
  put(s, "body");
  const e = put(s, "body", 0, 1, { currentHealth: 20, maxHealth: 20 });
  s = play(s, "스칼렛 파우더");
  assert.equal(
    s.players[0].board
      .filter(Boolean)
      .reduce((n, c) => n + c!.currentAttack, 0),
    9,
  );
  assert.equal(s.players[1].board[0]?.currentHealth, 15);
  assert.equal(s.players[0].currentGold, 1);
  assert.equal(
    s.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    1,
  );
});
test("Rainbow Rider summons an actual deck instance, runs its entry, upgrades that instance and returns at a lower cost", () => {
  let s = setup();
  s.players[0].deck = [
    generateCardInstance(
      {
        ...body,
        abilities: [
          {
            trigger: "ENTER_FIELD",
            effects: [
              { type: "STRUCTURED", action: "ADD_GOLD", values: { amount: 1 } },
            ],
          },
        ],
      },
      { instanceId: "deck-hero" },
    ),
  ];
  s = play(s, "레인보우 라이더");
  const created = s.players[0].board.find((c) => c?.instanceId === "deck-hero");
  assert.ok(created);
  assert.equal(created.currentAttack, 3);
  assert.equal(created.maxHealth, 9);
  assert.equal(s.players[0].deck.length, 0);
  assert.equal(s.players[0].currentGold, 1);
  const rider = s.players[0].board[1]!;
  s = finish(resolveTriggeredAbilities(s, "player-1", rider, "TURN_START"));
  const returned = s.players[0].deck.find(
    (c) => c.definitionId === byName("레인보우 라이더").id,
  );
  assert.ok(returned);
  assert.equal(returned.currentCost, 4);
});
test("Rainbow Rider does not pay an upgrade when no eligible deck summon exists", () => {
  const s = setup();
  const n = play(s, "레인보우 라이더");
  assert.equal(n.players[0].currentGold, 1);
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    0,
  );
});
test("bodyguard finisher preserves ability uses, adds a persistent bonus and summons after later ability use", () => {
  let s = setup();
  champion(s, "챔피언 여울");
  s = play(s, "보디가드 호출");
  assert.equal(s.players[0].champion?.finisherGoldBonus, 1);
  assert.equal(s.players[0].board.filter(Boolean).length, 1);
  let r = executeAction(JSON.parse(JSON.stringify(s)), {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  });
  assert.ok(r.success, r.message);
  s = finish(r.state);
  assert.equal(s.players[0].board.filter(Boolean).length, 2);
  assert.equal(s.players[0].nextTurnGoldBonus, 1);
  assert.equal(s.players[0].championAbilityUsedThisTurn, true);
});
test("elite finisher fills only empty slots and upgrades mercenary ability without resetting usage", () => {
  let s = setup();
  champion(s, "챔피언 예거");
  put(s, "body");
  s.players[0].championAbilityUsedThisTurn = true;
  s = play(s, "엘리트 호출");
  assert.equal(
    s.players[0].board.filter(
      (c) => c?.definitionId === byName("엘리트 용병").id,
    ).length,
    3,
  );
  assert.equal(s.events.filter((e) => e.type === "CARD_GENERATED").length, 3);
  assert.equal(s.players[0].championAbilityUsedThisTurn, true);
  assert.equal(
    currentChampionAbility(s.players[0].champion)?.effects[0].type,
    "STRUCTURED",
  );
  s.players[0].championAbilityUsedThisTurn = false;
  s.players[0].currentGold = 6;
  s = effect(
    s,
    s.players[0].board[1]!,
    "DESTROY",
    s.players[0].board[1]!.instanceId,
    { resolvedAutomaticTarget: true },
  );
  const r = executeAction(s, {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  });
  assert.ok(r.success, r.message);
  s = finish(r.state);
  assert.equal(
    s.players[0].board.filter(
      (c) => c?.definitionId === byName("엘리트 용병").id,
    ).length,
    3,
  );
  assert.equal(
    s.players[0].board.filter((c) => c?.definitionId === byName("용병").id)
      .length,
    0,
  );
});
test("last surfer retires and heals the current health, then Purple Rain can affect enemy champion and hand cost", () => {
  let s = setup();
  champion(s, "챔피언 퍼플레인");
  put(s, "body", 0, 0, { currentHealth: 3 });
  s.players[1].hand = [
    generateCardInstance(body, { instanceId: "enemy-hand" }),
  ];
  s = play(s, "라스트 서퍼");
  assert.equal(s.players[0].health, 18);
  const ability = currentChampionAbility(s.players[0].champion)!;
  assert.ok(
    ability.effects.some(
      (e) => e.type === "STRUCTURED" && e.target?.owner === "ALL",
    ),
  );
  s.players[0].currentGold = 6;
  let r = executeAction(JSON.parse(JSON.stringify(s)), {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  });
  assert.ok(r.success, r.message);
  r = executeAction(r.state, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "player-2",
  });
  assert.ok(r.success, r.message);
  s = finish(r.state);
  assert.equal(s.players[1].health, 14);
  assert.equal(s.players[1].hand[0].currentCost, 2);
});
test("Purple Rain preparation excludes allied wrestler damage and opponent/combat damage", () => {
  const s = setup();
  champion(s, "챔피언 퍼플레인");
  const a = put(s, "body");
  let n = processChampionQuestEvents(s, {
    ...s,
    events: [
      {
        type: "DAMAGE_DEALT",
        playerId: "player-1",
        amount: 1,
        target: { type: "CARD", cardInstanceId: a.instanceId },
        sourceContext: {
          sourcePlayerId: "player-1",
          sourceActionType: "CARD_EFFECT",
        },
      },
    ],
  });
  assert.equal(n.players[0].champion?.questConditionCounts?.root, 0);
  const old = n;
  n = processChampionQuestEvents(old, {
    ...n,
    events: [
      ...n.events,
      {
        type: "DAMAGE_DEALT",
        playerId: "player-1",
        amount: 1,
        target: { type: "PLAYER", playerId: "player-1" },
        sourceContext: {
          sourcePlayerId: "player-1",
          sourceActionType: "USE_CHAMPION_ABILITY",
        },
      },
    ],
  });
  assert.equal(n.players[0].champion?.questConditionCounts?.root, 1);
});
test("concussion punch only grants the free epic on real retirement and persists subsequent ability generation", () => {
  let s = setup();
  champion(s, "블랙마카롱");
  put(s, "body", 0, 1, { currentHealth: 5 });
  s.cardPool!.push({
    ...body,
    id: "test-mafia-epic",
    name: "검증 마피아 에픽",
    rarity: "EPIC",
    tags: ["마피아"],
  });
  s = play(s, "뇌진탕 펀치");
  assert.ok(
    s.players[0].hand.some(
      (c) =>
        s.cardPool?.some(
          (d) =>
            d.id === c.definitionId &&
            d.rarity === "EPIC" &&
            d.tags?.includes("마피아"),
        ) && c.currentCost === 0,
    ),
  );
  assert.equal(s.players[0].champion?.abilityAfterEffects?.length, 1);
  put(s, "body", 0, 1, { currentHealth: 3 });
  s.players[0].currentGold = 6;
  const r = executeAction(JSON.parse(JSON.stringify(s)), {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  });
  assert.ok(r.success, r.message);
  s = finish(r.state);
  assert.ok(
    s.players[0].board.some(
      (c) => c?.definitionId === byName("로마니 마피아 신입").id,
    ),
  );
  assert.ok(s.players[0].hand.length >= 2);
});
test("frenzy destroys one target and summons Pandora with half of the target current stats added to base", () => {
  let s = setup();
  put(s, "body", 0, 1, { currentAttack: 7, currentHealth: 5, maxHealth: 9 });
  s = play(s, "대폭주");
  const p = s.players[0].board.find(
    (c) => c?.definitionId === byName("판도라(폭주)").id,
  );
  assert.ok(p);
  assert.equal(p.currentAttack, 7);
  assert.equal(p.maxHealth, 8);
});
test("last hope directly summons the new tank and ordinary retirement continues healer and dealer stages", () => {
  let s = setup();
  s = play(s, "마지막 희망");
  let token = s.players[0].board.find(
    (c) => c?.definitionId === "crisis-awakening-tank",
  );
  assert.ok(token);
  const enemy = put(s, "body", 0, 1);
  s = effect(
    s,
    enemy,
    "RETIRE",
    token.instanceId,
    { resolvedAutomaticTarget: true },
    "player-2",
  );
  token = s.players[0].board.find(
    (c) => c?.definitionId === "crisis-awakening-healer",
  );
  assert.ok(token);
  s = effect(
    s,
    enemy,
    "RETIRE",
    token.instanceId,
    { resolvedAutomaticTarget: true },
    "player-2",
  );
  token = s.players[0].board.find(
    (c) => c?.definitionId === "crisis-awakening-dealer",
  );
  assert.ok(token);
  assert.equal(token.currentAttack, 1);
});
test("Rainbow Master counts distinct other definitions only and grants threshold keywords", () => {
  const s = setup();
  put(s, "body");
  s.players[0].graveyard = [
    generateCardInstance(body, { instanceId: "same-kind" }),
    generateCardInstance(
      { ...body, id: "different-kind" },
      { instanceId: "other-kind" },
    ),
  ];
  const n = play(s, "무지개 구슬마스터");
  const card = n.players[0].board[1]!;
  assert.equal(card.currentAttack, 5);
  assert.equal(card.maxHealth, 5);
  assert.ok(card.keywords.includes("SURPRISE"));
  assert.ok(card.keywords.includes("DEFENSE"));
  assert.ok(!card.keywords.includes("ARMOR"));
});
test("Tomatina paid upgrade damages the other enemies and champion once, never hits the original target twice", () => {
  let s = setup();
  put(s, "body");
  put(s, "body", 0, 1, { currentHealth: 10, maxHealth: 10 });
  put(s, "body", 1, 1, { currentHealth: 10, maxHealth: 10 });
  s = play(s, "라 토마티나");
  assert.equal(s.players[1].board[0]?.currentHealth, 7);
  assert.equal(s.players[1].board[1]?.currentHealth, 7);
  assert.equal(s.players[1].health, 12);
  assert.equal(s.players[0].board[0]?.dodgeCharges, 1);
  assert.equal(s.players[0].currentGold, 2);
});
test("zero-card or opponent generation does not complete the champion-rarity Minion A option", () => {
  const s = setup();
  champion(s, "챔피언 미니언 A");
  const n = processChampionQuestEvents(s, {
    ...s,
    events: [
      {
        type: "CARD_DRAWN",
        playerId: "player-1",
        cardDefinitionId: byName("흉내내기").id,
      },
      {
        type: "CARD_GENERATED",
        playerId: "player-2",
        cardDefinitionId: byName("흉내내기").id,
      },
    ],
  });
  assert.equal(n.players[0].champion?.questCompleted, false);
});
test("sorcerer destruction preparation counts both players and excludes retirement", () => {
  const s = setup();
  champion(s, "챔피언 마왕 벨모르트");
  const n = processChampionQuestEvents(s, {
    ...s,
    events: [
      ...Array.from({ length: 5 }, (_, i) => ({
        type: "CARD_DESTROYED" as const,
        playerId: "player-1",
        cardInstanceId: "destroy-own-" + i,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        type: "CARD_DESTROYED" as const,
        playerId: "player-2",
        cardInstanceId: "destroy-other-" + i,
      })),
      { type: "CARD_RETIRED", playerId: "player-2", cardInstanceId: "retired" },
    ],
  });
  assert.equal(n.players[0].champion?.questCompleted, false);
  assert.equal(n.players[0].champion?.questConditionCounts?.root, 9);
});

test("a fusion material killed by an entry listener remains retired; its successful play cannot roll back into hand", () => {
  let s = setup();
  put(s, "body");
  put(s, "헬뻑", 0, 1);
  const part = {
    ...body,
    id: "qa-fragile-fusion",
    health: 1,
    keywords: ["FUSION"] as any,
  };
  s.cardPool!.push(part);
  s.players[0].hand = [
    generateCardInstance(part, { instanceId: "fragile-part" }),
  ];
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "fragile-part",
    boardSlot: 1,
  });
  assert.ok(r.success, r.message);
  assert.ok(
    !r.state.players[0].hand.some((c) => c.instanceId === "fragile-part"),
  );
  assert.ok(
    r.state.players[0].graveyard.some((c) => c.instanceId === "fragile-part"),
  );
  assert.equal(r.state.targetingState, undefined);
});

test("every one of the 195 administrator records preserves its authored stats, text, tags and publication status", () => {
  assert.equal(records.length, 195);
  assert.equal(championRecords.length, 12);
  for (const record of records) {
    const d = cardRecordToDefinition(record);
    assert.equal(d.name, record.name);
    assert.equal(d.cost, record.cost, record.name + " cost");
    assert.equal(d.attack, record.attack, record.name + " attack");
    assert.equal(d.health, record.health, record.name + " health");
    assert.equal(d.rulesText, record.text);
    assert.equal(d.status, record.status);
    for (const tag of record.tags ?? [])
      assert.ok(d.tags?.includes(tag), record.name + ":" + tag);
  }
});
for (const record of championRecords)
  test("latest champion actual ability: " + record.name, () => {
    const s = setup();
    const definition = championRecordToDefinition(record);
    s.players[0].champion = {
      ...definition,
      health: 15,
      questProgress: 0,
      questCompleted: false,
    };
    put(s, "body");
    put(s, "body", 0, 1);
    s.players[0].hand = [
      generateCardInstance(body, { instanceId: "ability-hand" }),
    ];
    s.players[0].deck = [
      generateCardInstance(body, { instanceId: "ability-deck" }),
    ];
    const r = executeAction(s, {
      type: "USE_CHAMPION_ABILITY",
      playerId: "player-1",
    });
    assert.ok(r.success, r.message);
    const n = finish(r.state);
    assert.ok(n.players[0].currentGold >= 0);
    assert.equal(n.players[0].championAbilityUsedThisTurn, true);
  });

test('Project P spell stuns and silences existing wrestlers and summons exactly the rampage wrestler; champion tokens retain silence immunity',()=>{
 let s=setup();put(s,'body');put(s,'body',0,1);s=play(s,'프로젝트 P');assert.ok(s.players[0].board[0]?.isSilenced);assert.ok(s.players[1].board[0]?.isSilenced);assert.ok(s.players[0].board[0]?.isStunned);assert.ok(s.players[1].board[0]?.isStunned);
 const token=s.players[0].board.find(c=>c?.definitionId===byName('프로젝트 P(폭주)').id);assert.ok(token);assert.equal(token.isSilenced,false);
});
