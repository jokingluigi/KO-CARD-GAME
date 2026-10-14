import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import { generateCardInstance } from "../cards/generation";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { executeAction } from "../actions/engine-actions";
import {
  applyEffect,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";
import type { CardDefinition } from "../cards/types";
import type { GameState } from "../types/game-state";
const records: PublishedCardRecord[] = JSON.parse(
  readFileSync(
    new URL(
      `../../../../../${process.env.KO_QA_ADMIN_SNAPSHOT_DIR ?? 'docs/qa/snapshots/20261013-admin'}/cards.json`,
      import.meta.url,
    ),
    "utf8",
  ),
);
const definitions = records.map(cardRecordToDefinition);
const unit: CardDefinition = {
  id: "special-target",
  name: "Passive target",
  cardType: "WRESTLER",
  cost: 1,
  attack: 2,
  health: 10,
  rulesText: "",
  tags: ["디 어쏘리티"],
  keywords: [],
  abilities: [],
  isToken: false,
  isChampionToken: false,
};
function setup(name: string) {
  const d = definitions.find((d) => d.name === name)!;
  assert.ok(d);
  const s = createInitialGameState(undefined, [...definitions, unit]);
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  s.turn = 3;
  s.randomSeed = 400123;
  for (const p of s.players) {
    p.hand = [];
    p.deck = [generateCardInstance(unit, { instanceId: p.id + "-draw" })];
    p.board = [null, null, null, null];
    p.currentGold = 20;
    p.health = 20;
    p.maxHealth = 25;
    p.champion.quest = null;
  }
  s.players[0].board[0] = {
    ...generateCardInstance(d, { instanceId: "source" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  s.players[1].board[0] = {
    ...generateCardInstance(unit, { instanceId: "enemy" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  return s;
}
function settle(s: GameState, preferred?: string) {
  for (let n = 0; s.targetingState?.active; n++) {
    assert.ok(n < 30);
    const f = s.targetingState;
    const id =
      preferred && f.validTargetIds.includes(preferred)
        ? preferred
        : f.validTargetIds.find((id) => !f.selectedTargetIds.includes(id));
    assert.ok(id);
    const r = executeAction(JSON.parse(JSON.stringify(s)), {
      type:
        f.phase === "PRE_COMMIT"
          ? "CONFIRM_PRECOMMIT_TARGET"
          : "SELECT_EFFECT_TARGET",
      playerId: f.playerId,
      targetId: id,
    });
    assert.ok(r.success, r.success ? "" : r.errorCode);
    s = r.state;
  }
  return s;
}
function fire(
  s: GameState,
  trigger: Parameters<typeof resolveTriggeredAbilities>[3],
  preferred?: string,
) {
  return settle(
    resolveTriggeredAbilities(s, "player-1", s.players[0].board[0]!, trigger),
    preferred,
  );
}
function damage(s: GameState, amount: number) {
  return applyEffect(
    s,
    "player-2",
    s.players[1].board[0]!,
    {
      type: "STRUCTURED",
      action: "DAMAGE",
      target: {
        zone: "BOARD",
        owner: "ENEMY",
        selection: "PLAYER_CHOICE",
        count: 1,
      },
      values: { amount },
    },
    ["source"],
  );
}

for (const name of [
  "강화 근섬유",
  "경량 캐논",
  "경량 코어",
  "연쇄 반응기",
  "예비 동력원",
  "재생 조직",
  "흡혈 기관",
])
  test(
    "current stored part " +
      name +
      " fuses through PLAY_WRESTLER, leaves field and executes its linked effect once",
    () => {
      const s = setup(name),
        part = s.players[0].board[0]!;
      s.players[0].board[0] = {
        ...generateCardInstance(unit, { instanceId: "host" }),
        boardSlot: 0,
        enteredThisTurn: false,
      };
      s.players[0].hand = [
        part,
        generateCardInstance(unit, { instanceId: "remaining-hand" }),
      ];
      const r = executeAction(s, {
        type: "PLAY_WRESTLER",
        playerId: "player-1",
        cardInstanceId: "source",
        boardSlot: 1,
      });
      assert.ok(r.success);
      const n = settle(r.state, "host");
      const host = n.players[0].board[0]!;
      assert.equal(
        n.players[0].board.some((c) => c?.instanceId === "source"),
        false,
      );
      assert.equal(
        n.players[0].hand.some((c) => c.instanceId === "source"),
        false,
      );
      assert.equal(host.currentAttack, unit.attack + part.currentAttack);
      assert.equal(host.maxHealth, unit.health + part.currentHealth);
      if (name === "경량 캐논")
        assert.equal(n.players[1].board[0]!.currentHealth, 8);
      if (name === "경량 코어")
        assert.equal(
          n.players[0].hand.find((c) => c.instanceId === "remaining-hand")!
            .currentCost,
          0,
        );
      if (name === "연쇄 반응기")
        assert.ok(
          n.players[0].hand.some((c) => c.instanceId === "player-1-draw"),
        );
      if (name === "예비 동력원")
        assert.equal(n.players[0].nextTurnGoldBonus, 1);
      if (name === "재생 조직") assert.ok(host.keywords.includes("REGEN"));
      if (name === "흡혈 기관") assert.ok(host.keywords.includes("LIFESTEAL"));
    },
  );
test("current wolf Pandora absorbs the chosen allied current ATK and HP on turn start and gains one Dodge", () => {
  const s = setup("늑대인간 판도라"),
    source = s.players[0].board[0]!;
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "ally" }),
    boardSlot: 1,
    currentAttack: 4,
    currentHealth: 6,
  };
  const n = fire(s, "TURN_START", "ally");
  assert.equal(n.players[0].board[1], null);
  assert.equal(n.players[0].board[0]!.currentAttack, source.currentAttack + 4);
  assert.equal(n.players[0].board[0]!.currentHealth, source.currentHealth + 6);
  assert.equal(n.players[0].board[0]!.dodgeCharges, source.dodgeCharges + 1);
  assert.ok(n.players[0].graveyard.some((c) => c.instanceId === "ally"));
});
test("current Leon buffs the top deck wrestler by its current ATK at owner turn end", () => {
  const s = setup("리온"),
    atk = s.players[0].board[0]!.currentAttack;
  const n = fire(s, "TURN_END");
  assert.equal(n.players[0].deck[0].currentAttack, unit.attack + atk);
  assert.equal(n.players[1].deck[0].currentAttack, unit.attack);
});
test("current awakened Leon derives ATK from actual allied retire and destroy history, not opponent events", () => {
  const s = setup("리온(각성)");
  for (const [index, mode] of ["RETIRE", "DESTROY"].entries()) {
    s.players[0].board[1] = {
      ...generateCardInstance(unit, { instanceId: "fallen-" + index }),
      boardSlot: 1,
    };
    Object.assign(
      s,
      applyEffect(
        s,
        "player-1",
        s.players[0].board[0]!,
        {
          type: "STRUCTURED",
          action: mode as "RETIRE" | "DESTROY",
          target: {
            zone: "BOARD",
            owner: "SELF",
            selection: "PLAYER_CHOICE",
            count: 1,
          },
        },
        ["fallen-" + index],
      ),
    );
  }
  const n = fire(s, "SELF_ENTERED");
  assert.equal(n.players[0].board[0]!.currentAttack, 2);
});
test("current WarThunder creates one actual random wrestler in hand with its original cost and stats", () => {
  const n = fire(setup("워썬더"), "ENTER_FIELD");
  assert.equal(n.players[0].hand.length, 1);
  const c = n.players[0].hand[0],
    d = definitions.find((d) => d.id === c.definitionId)!;
  assert.ok(d);
  assert.equal(c.cardType, "WRESTLER");
  assert.deepEqual(
    [c.currentCost, c.currentAttack, c.currentHealth],
    [d.cost, d.attack, d.health],
  );
});
test("current Arcana Joker destroys deck top and replaces it with one non-champion-token card reduced by one, minimum one", () => {
  const s = setup("아르카나 조커");
  const n = fire(s, "ENTER_FIELD");
  assert.equal(n.players[0].deck.length, 1);
  assert.equal(n.players[0].deck[0].instanceId === "player-1-draw", false);
  const c = n.players[0].deck[0],
    d = definitions.find((d) => d.id === c.definitionId)!;
  assert.ok(d);
  assert.equal(d.isChampionToken, false);
  assert.deepEqual(
    [c.currentCost, c.currentAttack, c.currentHealth],
    [
      Math.max(1, d.cost - 1),
      Math.max(1, d.attack - 1),
      Math.max(1, d.health - 1),
    ],
  );
  assert.equal(n.players[0].graveyard.length, 0);
});
test("current Baldan destroys the selected actual grave card and summons a normal 1/1 Zombie", () => {
  const s = setup("발단");
  s.players[0].graveyard = [
    generateCardInstance(unit, { instanceId: "grave" }),
  ];
  const n = fire(s, "ENTER_FIELD", "grave");
  assert.equal(n.players[0].graveyard.length, 0);
  const zombie = n.players[0].board.find(
    (c) => c?.definitionId === records.find((r) => r.name === "좀비")!.id,
  )!;
  assert.ok(zombie);
  assert.deepEqual([zombie.currentAttack, zombie.currentHealth], [1, 1]);
  assert.equal(
    [
      ...n.players[0].hand,
      ...n.players[0].deck,
      ...n.players[0].graveyard,
      ...n.players[0].board.filter(Boolean),
    ].some((c) => c?.instanceId === "grave"),
    false,
  );
});
for (const name of ["위마리", "하늘을 떨구는 자"])
  test(
    "current " +
      name +
      " responds to a real allied attack and applies its specified combo stats",
    () => {
      const s = setup(name),
        source = s.players[0].board[0]!;
      s.players[0].board[1] = {
        ...generateCardInstance(unit, { instanceId: "attacker" }),
        boardSlot: 1,
        enteredThisTurn: false,
      };
      const r = executeAction(s, {
        type: "ATTACK",
        playerId: "player-1",
        attackerInstanceId: "attacker",
        target: {
          type: "WRESTLER",
          playerId: "player-2",
          cardInstanceId: "enemy",
        },
      });
      assert.ok(r.success);
      const n = r.state;
      if (name === "위마리") {
        assert.equal(n.players[0].board[1]!.currentHealth, 9);
        assert.equal(n.players[0].health, 21);
      } else {
        assert.equal(n.players[0].board[1]!.currentAttack, 3);
        assert.equal(
          n.players[0].board[0]!.currentAttack,
          source.currentAttack + 1,
        );
      }
    },
  );
test("current awakened Wimary heals allies and champion two at owner turn end and its exit summons the stored awakened Leon", () => {
  let s = setup("위마리(각성)");
  s.players[0].board[0]!.currentHealth = 1;
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "ally" }),
    boardSlot: 1,
    currentHealth: 2,
  };
  s = fire(s, "TURN_END");
  assert.equal(s.players[0].board[0]!.currentHealth, 3);
  assert.equal(s.players[0].board[1]!.currentHealth, 4);
  assert.equal(s.players[0].health, 22);
  s = applyEffect(s, "player-1", s.players[0].board[0]!, {
    type: "STRUCTURED",
    action: "RETIRE",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.ok(
    s.players[0].board.some(
      (c) =>
        c?.definitionId === records.find((r) => r.name === "리온(각성)")!.id,
    ),
  );
});
for (const name of ["도적", "에델바이스(본모습)", "험악한 도적"])
  test(
    "current " +
      name +
      " has no printed special effect, retains stored stats and executes its native keywords",
    () => {
      const d = definitions.find((d) => d.name === name)!;
      const raw = records.find((r) => r.name === name)!;
      assert.equal(raw.text, "");
      assert.deepEqual(
        [d.cost, d.attack, d.health],
        [raw.cost, raw.attack, raw.health],
      );
      assert.equal(d.abilities.length, 0);
      assert.deepEqual(d.keywords, raw.keywords);
    },
  );
test("current Rune Luna fuses every field machine, adds the resulting maximum HP to ATK, then attacks the champion past Taunt", () => {
  const s = setup("룬스달라이트 군주 루나");
  const ally = {
      ...unit,
      id: "own-machine",
      tags: ["기계"],
      attack: 2,
      health: 5,
    },
    enemy = {
      ...unit,
      id: "enemy-machine",
      tags: ["기계"],
      attack: 3,
      health: 4,
    };
  s.cardPool!.push(ally, enemy);
  s.players[0].board[1] = {
    ...generateCardInstance(ally, { instanceId: "own-machine" }),
    boardSlot: 1,
    keywords: ["IMMUNE"],
  };
  s.players[1].board[1] = {
    ...generateCardInstance(enemy, { instanceId: "enemy-machine" }),
    boardSlot: 1,
    keywords: ["IMMUNE"],
  };
  s.players[1].board[0]!.keywords = ["TAUNT"];
  const n = fire(s, "COUNTDOWN");
  const c = n.players[0].board[0]!;
  assert.equal(n.players[0].board[1], null);
  assert.equal(n.players[1].board[1], null);
  assert.equal(c.maxHealth, 19);
  assert.equal(c.currentAttack, 24, "fused ATK 5 plus resulting maximum HP 19");
  assert.equal(c.keywords.includes("CANNOT_ATTACK"), false);
  assert.equal(
    c.keywords.includes("RUSH"),
    false,
    "latest text does not grant Rush",
  );
  assert.equal(n.players[0].graveyard.length, 0);
  assert.equal(n.players[1].graveyard.length, 0);
  const r = executeAction(n, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: "source",
    target: { type: "PLAYER", playerId: "player-2" },
  });
  assert.ok(r.success, r.success ? "" : r.errorCode);
  assert.equal(r.state.status, "FINISHED");
});
test("current Diamond Luna gains an additional +2/+2 on actual fusion, then its active transforms into the stored cannon", () => {
  const s = setup("다이아몬드 군주 루나"),
    base = s.players[0].board[0]!;
  const part = definitions.find((d) => d.name === "강화 근섬유")!;
  s.players[0].hand = [generateCardInstance(part, { instanceId: "part" })];
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "part",
    boardSlot: 1,
  });
  assert.ok(r.success);
  let n = settle(r.state, "source");
  assert.equal(n.players[0].board[0]!.currentAttack, base.currentAttack + 3);
  assert.equal(n.players[0].board[0]!.maxHealth, base.maxHealth + 3);
  const active = executeAction(n, {
    type: "USE_ACTIVE",
    playerId: "player-1",
    cardInstanceId: "source",
  });
  assert.ok(active.success);
  n = settle(active.state);
  assert.equal(
    n.players[0].board[0]!.definitionId,
    definitions.find((d) => d.name === "다이아몬드 군주 루나(캐논)")!.id,
  );
});
test("current cannon records three actual damage hits, countdown deals five to enemy wrestlers and active adds recorded hits to the damaged form ATK", () => {
  let s = setup("다이아몬드 군주 루나(캐논)");
  s.activePlayerId = "player-2";
  for (let i = 0; i < 3; i++) {
    s.players[1].board[i] = {
      ...generateCardInstance(unit, { instanceId: "attacker-" + i }),
      boardSlot: i as 0 | 1 | 2 | 3,
      currentAttack: 3,
      enteredThisTurn: false,
    };
    const r = executeAction(s, {
      type: "ATTACK",
      playerId: "player-2",
      attackerInstanceId: "attacker-" + i,
      target: {
        type: "WRESTLER",
        playerId: "player-1",
        cardInstanceId: "source",
      },
    });
    assert.ok(r.success);
    s = r.state;
  }
  s.activePlayerId = "player-1";
  const blast = fire(JSON.parse(JSON.stringify(s)), "COUNTDOWN");
  for (const c of blast.players[1].board.filter(Boolean))
    assert.equal(c!.currentHealth, 5);
  const r = executeAction(s, {
    type: "USE_ACTIVE",
    playerId: "player-1",
    cardInstanceId: "source",
  });
  assert.ok(r.success);
  const n = settle(r.state);
  const d = definitions.find((d) => d.name === "다이아몬드 군주 루나(반파)")!;
  assert.equal(n.players[0].board[0]!.definitionId, d.id);
  assert.equal(n.players[0].board[0]!.currentAttack, d.attack + 3);
});
test("current damaged Diamond Luna retires itself, damages every other wrestler by captured ATK and spills both-side excess to the enemy champion", () => {
  const s = setup("다이아몬드 군주 루나(반파)");
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "ally" }),
    boardSlot: 1,
    currentHealth: 2,
  };
  s.players[1].board[0]!.currentHealth = 1;
  const r = executeAction(s, {
    type: "USE_ACTIVE",
    playerId: "player-1",
    cardInstanceId: "source",
  });
  assert.ok(r.success);
  const n = settle(r.state);
  assert.equal(n.players[0].board[0], null);
  assert.equal(n.players[0].board[1], null);
  assert.equal(n.players[1].board[0], null);
  assert.ok(n.players[0].graveyard.some((c) => c.instanceId === "source"));
  assert.equal(n.players[1].health, 17);
});
test("current awakened Sky deals its extra two to the actual attacker and retires into the stored awakened Wimary", () => {
  let s = setup("하늘을 떨구는 자(각성)");
  s.activePlayerId = "player-2";
  s.players[1].board[0]!.currentAttack = 3;
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: "enemy",
    target: {
      type: "WRESTLER",
      playerId: "player-1",
      cardInstanceId: "source",
    },
  });
  assert.ok(r.success);
  assert.equal(r.state.players[1].board[0]!.currentHealth, 7);
  s = applyEffect(r.state, "player-1", r.state.players[0].board[0]!, {
    type: "STRUCTURED",
    action: "RETIRE",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.ok(
    s.players[0].board.some(
      (c) =>
        c?.definitionId === records.find((r) => r.name === "위마리(각성)")!.id,
    ),
  );
});
for (const [name, tag, regen] of [
  ["매드 사이언티스트 퍼플레인", "실험체", true],
  ["팬텀워커", "스트리트", false],
] as const)
  test(
    "current " + name + " buffs only matching allied hand and board cards",
    () => {
      const s = setup(name);
      const matching: CardDefinition = {
          ...unit,
          id: "matching-" + tag,
          tags: [tag],
        },
        other: CardDefinition = {
          ...unit,
          id: "not-matching",
          tags: ["other"],
        };
      s.cardPool!.push(matching, other);
      s.players[0].hand = [
        generateCardInstance(matching, { instanceId: "hand-match" }),
        generateCardInstance(other, { instanceId: "hand-other" }),
      ];
      s.players[0].board[1] = {
        ...generateCardInstance(matching, { instanceId: "ally-match" }),
        boardSlot: 1,
      };
      s.players[1].board[1] = {
        ...generateCardInstance(matching, { instanceId: "enemy-match" }),
        boardSlot: 1,
      };
      const n = fire(s, "ENTER_FIELD");
      for (const c of [n.players[0].hand[0], n.players[0].board[1]!]) {
        assert.deepEqual([c.currentAttack, c.maxHealth], [3, 11]);
        assert.equal(c.keywords.includes("REGEN"), regen);
      }
      assert.deepEqual(
        [n.players[0].hand[1].currentAttack, n.players[0].hand[1].maxHealth],
        [2, 10],
      );
      assert.deepEqual(
        [
          n.players[1].board[1]!.currentAttack,
          n.players[1].board[1]!.maxHealth,
        ],
        [2, 10],
      );
    },
  );
for (const name of ["독세아", "아포스틸", "퀘스쳔"])
  test(
    "current " +
      name +
      " applies its anywhere aura to qualifying allied hand/board/deck and excludes the opposing side",
    () => {
      const s = setup(name);
      const matching: CardDefinition = {
          ...unit,
          id: "anywhere-match",
          tags: ["실험체"],
          cost: 1,
        },
        other: CardDefinition = {
          ...unit,
          id: "anywhere-other",
          tags: ["other"],
          cost: 3,
        };
      s.cardPool!.push(matching, other);
      s.players[0].board[1] = {
        ...generateCardInstance(matching, {
          instanceId: "match-board",
          isGenerated: true,
        }),
        boardSlot: 1,
      };
      s.players[0].board[2] = {
        ...generateCardInstance(other, {
          instanceId: "other-board",
          isGenerated: false,
        }),
        boardSlot: 2,
      };
      s.players[0].hand = [
        generateCardInstance(matching, {
          instanceId: "match-hand",
          isGenerated: true,
        }),
      ];
      s.players[0].deck = [
        generateCardInstance(matching, {
          instanceId: "match-deck",
          isGenerated: true,
        }),
      ];
      s.players[1].board[1] = {
        ...generateCardInstance(matching, {
          instanceId: "enemy-match",
          isGenerated: true,
        }),
        boardSlot: 1,
      };
      const n = fire(s, "ENTER_FIELD");
      for (const c of [
        n.players[0].board[1]!,
        n.players[0].hand[0],
        n.players[0].deck[0],
      ])
        assert.deepEqual(
          [c.currentAttack, c.maxHealth],
          [name === "아포스틸" ? 2 : 3, 11],
        );
      assert.deepEqual(
        [
          n.players[0].board[2]!.currentAttack,
          n.players[0].board[2]!.maxHealth,
        ],
        [2, 10],
      );
      assert.deepEqual(
        [
          n.players[1].board[1]!.currentAttack,
          n.players[1].board[1]!.maxHealth,
        ],
        [2, 10],
      );
    },
  );
