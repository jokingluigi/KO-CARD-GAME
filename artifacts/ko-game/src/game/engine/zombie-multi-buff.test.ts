import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createInitialGameState,
  generateCardInstance,
  executeAction,
  applyEffect,
  cardRecordToDefinition,
  championRecordToDefinition,
  type GameState,
  type CardDefinition,
  type CardEffect,
} from "../index";
import {
  resolveCardRetiredListeners,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";
const defs = JSON.parse(
  readFileSync("docs/qa/snapshots/20261030-admin/cards.json", "utf8"),
).map(cardRecordToDefinition);
const heroes = JSON.parse(
  readFileSync("docs/qa/snapshots/20261030-admin/champions.json", "utf8"),
).map(championRecordToDefinition);
const zombie: CardDefinition = defs.find(
  (d: CardDefinition) => d.name === "좀비",
)!;
const hero = heroes.find((h: any) => h.name === "챔피언 라 칼라베라")!;
const unit: CardDefinition = {
  id: "zombie-multi-victim",
  name: "검증 선수",
  cardType: "WRESTLER",
  cost: 1,
  attack: 1,
  health: 5,
  rulesText: "",
  isToken: false,
  isChampionToken: false,
  keywords: [],
  abilities: [],
};
function setup(count = 3, owner = 0) {
  const s = createInitialGameState([hero.id, hero.id], [...defs, unit], heroes);
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = s.players[owner].id;
  s.events = [];
  s.randomSeed = 513;
  for (const p of s.players) {
    p.board = [null, null, null, null];
    p.hand = [];
    p.currentGold = 100;
    p.champion!.quest = null;
    p.deck = Array.from({ length: 6 }, (_, i) =>
      generateCardInstance(unit, { instanceId: p.id + "-deck-" + i }),
    );
  }
  for (let i = 0; i < count; i++)
    s.players[owner].board[i as 0 | 1 | 2 | 3] = {
      ...generateCardInstance(zombie, { instanceId: "z-" + i }),
      boardSlot: i as 0 | 1 | 2 | 3,
    };
  s.players[1 - owner].board[0] = {
    ...generateCardInstance(zombie, { instanceId: "enemy-z" }),
    boardSlot: 0,
  };
  return s;
}
function cast(s: GameState, owner = 0) {
  const r = executeAction(s, {
    type: "USE_CHAMPION_ABILITY",
    playerId: s.players[owner].id,
  });
  assert.ok(r.success, r.message);
  return r.state;
}
function retire(s: GameState, owner = 0) {
  const p = s.players[owner],
    victim = {
      ...generateCardInstance(unit, {
        instanceId: "victim-" + s.events.length,
      }),
      boardSlot: 3 as const,
    };
  s = {
    ...s,
    players: s.players.map((c) =>
      c.id !== p.id
        ? c
        : {
            ...c,
            board: c.board.map((x, i) =>
              i === 3 ? victim : x,
            ) as typeof c.board,
          },
    ),
  };
  return applyEffect(s, p.id, victim, {
    type: "STRUCTURED",
    action: "RETIRE",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
}
const stats = (s: GameState, owner = 0) =>
  s.players[owner].board
    .filter((c) => c?.definitionId === zombie.id)
    .map((c) => [c!.currentAttack, c!.currentHealth, c!.maxHealth]);
for (const owner of [0, 1])
  for (const upgraded of [false, true])
    for (const count of [2, 3, 4])
      test(`${count} zombies all receive Calavera ${upgraded ? "awakened 2/2" : "normal 1/1"} absorption, owner ${owner}`, () => {
        const s = setup(count, owner);
        s.players[owner].champion!.questCompleted = upgraded;
        const prior = JSON.stringify(s),
          n = cast(s, owner),
          bonus = upgraded ? 2 : 1;
        assert.equal(JSON.stringify(s), prior);
        assert.deepEqual(
          stats(n, owner),
          Array.from({ length: count }, () => [
            1 + bonus,
            1 + bonus,
            1 + bonus,
          ]),
        );
        assert.deepEqual(stats(n, 1 - owner), [[1, 1, 1]]);
        assert.equal(n.players[owner].board.filter(Boolean).length, count);
        assert.equal(
          n.events.filter((e) => e.type === "ENTER_FIELD").length,
          0,
        );
      });
test("external zombie summon buffs preserve individual wounds/stats and are not blocked by silence", () => {
  const s = setup(3);
  s.players[0].board[0] = {
    ...s.players[0].board[0]!,
    currentAttack: 4,
    currentHealth: 2,
    maxHealth: 6,
    isSilenced: true,
  };
  s.players[0].board[1]!.isAbilityDisabled = true;
  const n = cast(s);
  assert.deepEqual(stats(n), [
    [5, 3, 7],
    [2, 2, 2],
    [2, 2, 2],
  ]);
});
test("retirement grows every eligible zombie at once with independent per-card two-use caps", () => {
  let s = setup(3);
  s = retire(s);
  assert.deepEqual(stats(s), Array(3).fill([2, 2, 2]));
  s = retire(s);
  s = retire(s);
  assert.deepEqual(stats(s), Array(3).fill([3, 3, 3]));
  assert.deepEqual(s.zombieGrowthThisTurn?.counts, {
    "z-0": 2,
    "z-1": 2,
    "z-2": 2,
  });
  assert.deepEqual(stats(s, 1), [[1, 1, 1]]);
});
test("one exhausted zombie never consumes the other zombies growth allowance; summon buff ignores that cap", () => {
  let s = setup(3);
  s.zombieGrowthThisTurn = { turn: s.turn, counts: { "z-0": 2, "z-1": 1 } };
  s = retire(s);
  assert.deepEqual(stats(s), [
    [1, 1, 1],
    [2, 2, 2],
    [2, 2, 2],
  ]);
  s = cast(s);
  assert.deepEqual(stats(s), [
    [2, 2, 2],
    [3, 3, 3],
    [3, 3, 3],
  ]);
});
test("silenced/disabled zombies skip only their own retirement reaction, without blocking other zombies", () => {
  let s = setup(3);
  s.players[0].board[0]!.isSilenced = true;
  s.players[0].board[1]!.isAbilityDisabled = true;
  s = retire(s);
  assert.deepEqual(stats(s), [
    [1, 1, 1],
    [1, 1, 1],
    [2, 2, 2],
  ]);
  s.players[0].board[0]!.isSilenced = false;
  s.players[0].board[1]!.isAbilityDisabled = false;
  s = retire(s);
  assert.deepEqual(stats(s), [
    [2, 2, 2],
    [2, 2, 2],
    [3, 3, 3],
  ]);
});
test("serialized duplicate retirement callbacks do not grow any zombie twice", () => {
  let s = retire(setup(3));
  const victim = s.players[0].graveyard.at(-1)!;
  s = JSON.parse(JSON.stringify(s));
  const n = resolveCardRetiredListeners(s, s.players[0].id, victim);
  assert.deepEqual(stats(n), Array(3).fill([2, 2, 2]));
});
test("newly hand-played zombie receives its own allowance; playing from hand does not absorb", () => {
  let s = setup(2);
  s = retire(retire(s));
  s.players[0].hand = [generateCardInstance(zombie, { instanceId: "fresh" })];
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: s.players[0].id,
    cardInstanceId: "fresh",
    boardSlot: 2,
  });
  assert.ok(r.success, r.message);
  s = retire(r.state);
  assert.deepEqual(stats(s), [
    [3, 3, 3],
    [3, 3, 3],
    [2, 2, 2],
  ]);
});
test("multi-summon absorption buffs all existing zombies for each incoming zombie and follow-up targets stay unique", () => {
  const s = setup(3);
  const source = {
    ...generateCardInstance(unit, { instanceId: "summoner" }),
    abilities: [
      {
        trigger: "ENTER_FIELD" as const,
        effects: [
          {
            type: "STRUCTURED",
            action: "SUMMON",
            values: { definitionRef: { id: zombie.id }, count: 2 },
          } as CardEffect,
          {
            type: "STRUCTURED",
            action: "BUFF",
            target: {
              zone: "BOARD",
              owner: "SELF",
              selection: "SAME_TARGET",
              count: 4,
            },
            values: { attack: 5 },
          } as CardEffect,
        ],
      },
    ],
  };
  const n = resolveTriggeredAbilities(
    s,
    s.players[0].id,
    source,
    "ENTER_FIELD",
  );
  assert.deepEqual(stats(n), Array(3).fill([8, 3, 3]));
  assert.equal(n.players[0].board.filter(Boolean).length, 3);
});
test("effect summon from hand consumes one incoming zombie and buffs all existing recipients", () => {
  const s = setup(3),
    incoming = {
      ...generateCardInstance(zombie, { instanceId: "hand-z" }),
      currentAttack: 4,
      currentHealth: 3,
      maxHealth: 3,
    };
  s.players[0].hand = [incoming];
  const source = generateCardInstance(unit, { instanceId: "hand-summoner" });
  const n = applyEffect(s, s.players[0].id, source, {
    type: "STRUCTURED",
    action: "SUMMON_FROM_HAND",
    target: { zone: "HAND", owner: "SELF", selection: "RANDOM", count: 1 },
  });
  assert.deepEqual(stats(n), Array(3).fill([5, 4, 4]));
  assert.equal(n.players[0].hand.length, 0);
  assert.equal(n.players[0].board.filter(Boolean).length, 3);
});
test("without a field zombie the ability still summons one new zombie; generation to hand never buffs the board", () => {
  let s = setup(0);
  s = cast(s);
  assert.deepEqual(stats(s), [[1, 1, 1]]);
  assert.equal(s.events.filter((e) => e.type === "ENTER_FIELD").length, 1);
  const source = generateCardInstance(unit, { instanceId: "generator" });
  s = applyEffect(s, s.players[0].id, source, {
    type: "STRUCTURED",
    action: "GENERATE",
    values: { definitionRef: { id: zombie.id }, count: 1, destination: "HAND" },
  });
  assert.deepEqual(stats(s), [[1, 1, 1]]);
  assert.equal(s.players[0].hand.length, 1);
});
test("enemy retire and allied destruction/vanish/return do not count as allied retirement growth", () => {
  for (const action of ["DESTROY", "VANISH", "RETURN_TO_HAND"] as const) {
    const s = setup(3),
      victim = {
        ...generateCardInstance(unit, { instanceId: "other" }),
        boardSlot: 3 as const,
      };
    s.players[0].board[3] = victim;
    const n = applyEffect(s, s.players[0].id, victim, {
      type: "STRUCTURED",
      action,
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
    });
    assert.deepEqual(stats(n), Array(3).fill([1, 1, 1]));
  }
  const s = setup(3);
  const n = applyEffect(s, s.players[1].id, s.players[1].board[0]!, {
    type: "STRUCTURED",
    action: "RETIRE",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.deepEqual(stats(n), Array(3).fill([1, 1, 1]));
});

function endActionTurn(s: GameState) {
  const r = executeAction(s, { type: "END_TURN", playerId: s.activePlayerId! });
  assert.ok(r.success, r.message);
  return r.state;
}
for (const owner of [0, 1])
  test(`displayed turn shares two growth uses across own/opponent actions for owner ${owner}`, () => {
    let s = setup(3, owner);
    s = retire(s, owner);
    assert.deepEqual(stats(s, owner), Array(3).fill([2, 2, 2]));
    s = endActionTurn(s);
    s = JSON.parse(JSON.stringify(s));
    s = retire(s, owner);
    assert.deepEqual(stats(s, owner), Array(3).fill([3, 3, 3]));
    s = retire(retire(s, owner), owner);
    assert.deepEqual(stats(s, owner), Array(3).fill([3, 3, 3]));
    assert.equal(s.zombieGrowthThisTurn?.matchTurn, 2);
    s = endActionTurn(s);
    s = retire(s, owner);
    assert.deepEqual(stats(s, owner), Array(3).fill([4, 4, 4]));
    assert.equal(s.zombieGrowthThisTurn?.matchTurn, 3);
  });
test("spending both uses in the first action turn leaves none in the second, then refreshes exactly twice next displayed turn", () => {
  let s = retire(retire(setup(3)));
  s = endActionTurn(s);
  s = retire(retire(retire(s)));
  assert.deepEqual(stats(s), Array(3).fill([3, 3, 3]));
  s = endActionTurn(s);
  s = retire(retire(retire(s)));
  assert.deepEqual(stats(s), Array(3).fill([5, 5, 5]));
  s = endActionTurn(s);
  s = retire(s);
  assert.deepEqual(stats(s), Array(3).fill([5, 5, 5]));
});
test("legacy action-turn counter survives the half-turn transition without granting extra uses", () => {
  let s = setup(3);
  s.zombieGrowthThisTurn = { turn: 3, counts: { "z-0": 2, "z-1": 1 } };
  s = endActionTurn(s);
  s = retire(s);
  assert.deepEqual(stats(s), [
    [1, 1, 1],
    [2, 2, 2],
    [2, 2, 2],
  ]);
  assert.equal(s.zombieGrowthThisTurn?.matchTurn, 2);
  s = endActionTurn(s);
  s = retire(s);
  assert.deepEqual(stats(s), [
    [2, 2, 2],
    [3, 3, 3],
    [3, 3, 3],
  ]);
});
test("both players have independent counters inside the same displayed turn", () => {
  let s = setup(2);
  s = retire(retire(s, 0), 0);
  s = endActionTurn(s);
  s = retire(retire(retire(s, 1), 1), 1);
  assert.deepEqual(stats(s, 0), [
    [3, 3, 3],
    [3, 3, 3],
  ]);
  assert.deepEqual(stats(s, 1), [[3, 3, 3]]);
  s = retire(s, 0);
  assert.deepEqual(stats(s, 0), [
    [3, 3, 3],
    [3, 3, 3],
  ]);
});
test("champion summon absorption after a half-turn switch still buffs all capped zombies without refreshing retirement uses", () => {
  let s = setup(3);
  s = retire(retire(s));
  s = endActionTurn(s);
  s.players[1].championAbilityUsedThisTurn = false;
  const source = generateCardInstance(unit, {
    instanceId: "external-summoner",
  });
  s = applyEffect(s, s.players[0].id, source, {
    type: "STRUCTURED",
    action: "SUMMON",
    values: { definitionRef: { id: zombie.id }, count: 1 },
  });
  assert.deepEqual(stats(s), Array(3).fill([4, 4, 4]));
  s = retire(s);
  assert.deepEqual(stats(s), Array(3).fill([4, 4, 4]));
  assert.deepEqual(s.zombieGrowthThisTurn?.counts, {
    "z-0": 2,
    "z-1": 2,
    "z-2": 2,
  });
});

test("display wording and granted text cannot disable the zombie retirement cap", () => {
  for (const mode of [
    "old-description",
    "punctuation-change",
    "granted-text",
  ] as const) {
    let s = setup(3);
    if (mode === "granted-text")
      s.players[0].board[0]!.grantedText = {
        donorDefinitionId: zombie.id,
        keywords: [],
        abilities: [],
        rulesText: zombie.rulesText + " 추가 문구",
      };
    else
      s.cardPool = s.cardPool?.map((d) =>
        d.id === zombie.id
          ? {
              ...d,
              rulesText:
                mode === "old-description"
                  ? d.rulesText.replace(/\(한턴.*$/u, "")
                  : d.rulesText + "!",
            }
          : d,
      );
    s = retire(retire(retire(s)));
    s = endActionTurn(s);
    s = retire(s);
    assert.deepEqual(stats(s), Array(3).fill([3, 3, 3]), mode);
  }
});
