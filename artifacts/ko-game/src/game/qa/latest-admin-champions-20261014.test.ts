// Latest administrator records, excluding the intentionally deleted prototype champion.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  championRecordToDefinition,
  type PublishedChampionRecord,
} from "../champions/published-champions";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../cards/published-cards";
import { completeMinionACatalog } from "../champions/minion-a";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import { executeAction } from "../actions/engine-actions";
import { applyEffect } from "../effects/effect-engine";
import { processChampionQuestEvents } from "../champions/quests";
import type { GameState } from "../types/game-state";
import type { GameAction } from "../actions/types";
import type { CardDefinition } from "../cards/types";
const directory = new URL(
  `../../../../../${process.env.KO_QA_ADMIN_SNAPSHOT_DIR ?? 'docs/qa/snapshots/20261014-admin'}/`,
  import.meta.url,
);
const records: PublishedChampionRecord[] = JSON.parse(
  readFileSync(new URL("champions.json", directory), "utf8"),
);
const cards: PublishedCardRecord[] = JSON.parse(
  readFileSync(new URL("cards.json", directory), "utf8"),
);
const champions = records.map(championRecordToDefinition),
  definitions = cards.map(cardRecordToDefinition);
const unit: CardDefinition = {
  id: "audit-unit",
  name: "Audit unit",
  cardType: "WRESTLER",
  cost: 1,
  attack: 0,
  health: 10,
  rulesText: "",
  keywords: [],
  abilities: [],
  isToken: false,
  isChampionToken: false,
};
function setup(name: string) {
  const champion = champions.find((c) => c.name === name)!;
  assert.ok(champion);
  const state = createInitialGameState(
    [champion.id, "champion-tower-vanilla"],
    [...definitions, unit],
    champions,
  );
  state.status = "IN_PROGRESS";
  state.turn = 13;
  state.activePlayerId = "player-1";
  state.minionACardPool = completeMinionACatalog(cards);
  state.events = [];
  for (const [index, p] of state.players.entries()) {
    p.board = [null, null, null, null];
    p.hand = [
      generateCardInstance(unit, { instanceId: `p${index}-hand-a` }),
      generateCardInstance(unit, { instanceId: `p${index}-hand-b` }),
    ];
    p.deck = Array.from({ length: 25 }, (_, n) =>
      generateCardInstance(unit, { instanceId: `p${index}-deck-${n}` }),
    );
    p.graveyard = [];
    p.currentGold = 6;
    p.personalTurn = 6;
  }
  return state;
}
function settle(state: GameState, preferred?: string) {
  for (let n = 0; n < 100 && state.targetingState?.active; n++) {
    const frame = state.targetingState;
    const id =
      preferred && frame.validTargetIds.includes(preferred)
        ? preferred
        : frame.validTargetIds[0];
    assert.ok(id, "target frame must have a legal option");
    const result = executeAction(JSON.parse(JSON.stringify(state)), {
      type:
        frame.phase === "PRE_COMMIT"
          ? "CONFIRM_PRECOMMIT_TARGET"
          : "SELECT_EFFECT_TARGET",
      playerId: frame.playerId,
      targetId: id,
    });
    assert.ok(
      result.success,
      result.success ? "" : result.errorCode + ": " + result.message,
    );
    state = result.state;
  }
  assert.equal(
    state.targetingState?.active ?? false,
    false,
    "target sequence finishes",
  );
  return state;
}
function run(state: GameState, action: GameAction, preferred?: string) {
  const result = executeAction(state, action);
  assert.ok(
    result.success,
    result.success ? "" : result.errorCode + ": " + result.message,
  );
  return settle(result.state, preferred);
}
function cast(state: GameState, preferred?: string) {
  return run(
    state,
    { type: "USE_CHAMPION_ABILITY", playerId: "player-1" },
    preferred,
  );
}
function round(state: GameState) {
  state = run(state, { type: "END_TURN", playerId: "player-1" });
  return run(state, { type: "END_TURN", playerId: "player-2" });
}
function victim(state: GameState, id: string, owner = 1, health = 1) {
  state.players[owner].board[3] = {
    ...generateCardInstance(unit, { instanceId: id }),
    boardSlot: 3,
    currentHealth: health,
    enteredThisTurn: false,
  };
}
function clearGenerated(state: GameState) {
  const before = state;
  return processChampionQuestEvents(
    before,
    applyEffect(state, "player-1", state.players[0].hand[0], {
      type: "STRUCTURED",
      action: "DESTROY",
      target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 4 },
    }),
  );
}

for (const record of records)
  test(`current admin champion ${record.id}: fields, basic cost, availability and actual ability action`, () => {
    const def = championRecordToDefinition(record);
    assert.equal(def.maxHealth, record.maxHealth);
    assert.equal(def.ability.cost, record.abilityCost);
    if (record.hasQuest)
      assert.equal(def.quest?.requiredProgress, record.questProgressRequired);
    if (!record.abilityText.trim()) return;
    let state = setup(record.name);
    victim(state, "enemy", 1, 10);
    victim(state, "ally", 0, 10);
    const before = state.players[0].currentGold;
    state = cast(
      state,
      record.name === "챔피언 퍼플레인" ? "player-1" : "enemy",
    );
    assert.equal(state.players[0].currentGold, before - record.abilityCost);
    assert.ok(state.events.some((e) => e.type === "CHAMPION_ABILITY_USED"));
    assert.equal(
      executeAction(state, {
        type: "USE_CHAMPION_ABILITY",
        playerId: "player-1",
      }).success,
      false,
      "once-per-turn guard",
    );
    state.players[0].currentGold = 0;
    state.players[0].championAbilityUsedThisTurn = false;
    if (record.abilityCost > 0)
      assert.equal(
        executeAction(state, {
          type: "USE_CHAMPION_ABILITY",
          playerId: "player-1",
        }).success,
        false,
        "unaffordable ability is rejected",
      );
  });

test("current Pandora counts seven actual ability retirements, upgrades once, summons linked token, and selects one upgraded target", () => {
  let state = setup("챔피언 판도라");
  assert.equal(state.players[0].maxHealth, 20);
  for (let n = 1; n <= 7; n++) {
    victim(state, "victim-" + n);
    state = cast(state, "victim-" + n);
    assert.equal(state.players[0].champion?.questProgress, n);
    assert.equal(state.players[0].champion?.questCompleted, n === 7);
    if (n < 7) state = round(state);
  }
  assert.equal(
    state.events.filter(
      (e) => e.type === "CHAMPION_QUEST_COMPLETED" && e.playerId === "player-1",
    ).length,
    1,
  );
  assert.ok(
    state.players[0].board.some(
      (c) => c?.definitionId === "eaefcf6c-575d-4482-aaad-98b54561b49a",
    ),
  );
  state = round(state);
  const hp = state.players[1].health;
  state = cast(state, "player-2");
  assert.equal(state.players[1].health, hp - 2);
  assert.equal(
    state.events.filter(
      (e) => e.type === "CHAMPION_QUEST_COMPLETED" && e.playerId === "player-1",
    ).length,
    1,
  );
});
test("current Pi Star Seven progresses on seven actual uses and its upgraded ability buffs two different hand wrestlers", () => {
  let state = setup("챔피언 피 스타 세븐");
  for (let n = 1; n <= 7; n++) {
    state = cast(state);
    assert.equal(state.players[0].champion?.questProgress, n);
    assert.equal(state.players[0].champion?.questCompleted, n === 7);
    if (n < 7) state = round(state);
  }
  state = round(state);
  const before = new Map(
    state.players[0].hand.map((c) => [c.instanceId, c.currentAttack]),
  );
  state = cast(state);
  const grown = state.players[0].hand.filter(
    (c) => c.currentAttack !== before.get(c.instanceId),
  );
  assert.equal(grown.length, 2);
  for (const c of grown)
    assert.equal(c.currentAttack, before.get(c.instanceId)! + 1);
});
test("current Purple Rain counts eight actual self-effect damage events and doubles damage, draw discount and ally buff after upgrade", () => {
  let state = setup("챔피언 퍼플레인");
  for (let n = 1; n <= 8; n++) {
    const hp = state.players[0].health;
    state = cast(state, "player-1");
    assert.equal(state.players[0].health, hp - 1);
    assert.equal(state.players[0].champion?.questProgress, n);
    assert.equal(state.players[0].champion?.questCompleted, n === 8);
    if (n < 8) state = round(state);
  }
  state = round(state);
  victim(state, "ally", 0, 10);
  const atk = state.players[0].board[3]!.currentAttack;
  state = cast(state, "ally");
  assert.equal(state.players[0].board[3]?.currentHealth, 8);
  assert.equal(state.players[0].board[3]?.currentAttack, atk + 2);
});
test("current Jaeger summons eight real mercenaries, upgrades once, then summons the stored elite mercenary", () => {
  let state = setup("챔피언 예거");
  for (let n = 1; n <= 8; n++) {
    state = cast(state);
    assert.equal(state.players[0].champion?.questProgress, n);
    assert.equal(state.players[0].champion?.questCompleted, n === 8);
    if (n < 8) {
      state = clearGenerated(state);
      state = round(state);
    }
  }
  state = clearGenerated(state);
  state = round(state);
  state = cast(state);
  assert.ok(
    state.players[0].board.some(
      (c) => c?.definitionId === "f3b46674-c658-4e03-b5b4-ced71547768e",
    ),
  );
});
test("current Calavera requires ten allied retirements, ignores destroy, and summons a 2/2 zombie after upgrade", () => {
  let state = setup("챔피언 라 칼라베라");
  state = cast(state);
  const before = state;
  victim(state, "destroyed", 0);
  state = processChampionQuestEvents(
    before,
    applyEffect(
      state,
      "player-1",
      state.players[0].hand[0],
      {
        type: "STRUCTURED",
        action: "DESTROY",
        target: {
          zone: "BOARD",
          owner: "SELF",
          selection: "PLAYER_CHOICE",
          count: 1,
        },
      },
      ["destroyed"],
    ),
  );
  assert.equal(state.players[0].champion?.questProgress, 0);
  for (let n = 1; n <= 10; n++) {
    victim(state, "ally-" + n, 0);
    const before = state;
    state = processChampionQuestEvents(
      before,
      applyEffect(
        state,
        "player-1",
        state.players[0].hand[0],
        {
          type: "STRUCTURED",
          action: "DAMAGE",
          target: {
            zone: "BOARD",
            owner: "SELF",
            selection: "PLAYER_CHOICE",
            count: 1,
          },
          values: { amount: 1 },
        },
        ["ally-" + n],
      ),
    );
    assert.equal(state.players[0].champion?.questProgress, n);
    assert.equal(state.players[0].champion?.questCompleted, n === 10);
  }
  state = clearGenerated(state);
  state = round(state);
  state = cast(state);
  const zombie = state.players[0].board.find((c) => c?.isToken);
  assert.equal(zombie?.currentAttack, 2);
  assert.equal(zombie?.currentHealth, 2);
});
test("current Luna generates actual part tokens, progresses through ten legal fusion actions, and summons the linked form", () => {
  let state = setup("챔피언 루나");
  state.players[0].board[0] = {
    ...generateCardInstance(unit, { instanceId: "host" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  for (let n = 1; n <= 10; n++) {
    const existing = new Set(state.players[0].hand.map((c) => c.instanceId));
    state = cast(state);
    const part = state.players[0].hand.find(
      (c) => !existing.has(c.instanceId),
    )!;
    assert.ok(part?.tags?.includes("파츠"));
    assert.ok(part.keywords.includes("FUSION"));
    state = run(
      state,
      {
        type: "PLAY_WRESTLER",
        playerId: "player-1",
        cardInstanceId: part.instanceId,
        boardSlot: 1,
      },
      "host",
    );
    assert.equal(state.players[0].champion?.questProgress, n);
    assert.equal(state.players[0].champion?.questCompleted, n === 10);
    if (n < 10) state = round(state);
  }
  assert.ok(
    state.players[0].board.some(
      (c) => c?.definitionId === "b2fab583-5a3e-4c62-92b1-13ddb3a2f5c0",
    ),
  );
});

test("current Yeoul accumulates exactly thirty actually spent gold, then its upgraded ability also summons the stored bodyguard", () => {
  let state = setup("챔피언 여울");
  for (let n = 1; n <= 15; n++) {
    state = cast(state);
    assert.equal(state.players[0].nextTurnGoldBonus, 1);
    assert.equal(state.players[0].champion?.questProgress, n * 2);
    assert.equal(state.players[0].champion?.questCompleted, n === 15);
    if (n < 15) state = round(state);
  }
  state = round(state);
  state = cast(state);
  assert.ok(
    state.players[0].board.some(
      (c) => c?.definitionId === "acdbe25d-f066-4c91-ae22-f612749ee20f",
    ),
  );
});
for (const name of ["챔피언 크루세이더즈"])
  test(
    "current " +
      name +
      " reaches five HP through actual combat and summons the configured awakening tank",
    () => {
      let state = setup(name);
      const damage = state.players[0].health - 5;
      state.players[1].board[0] = {
        ...generateCardInstance(
          { ...unit, attack: damage },
          { instanceId: "attacker" },
        ),
        boardSlot: 0,
        enteredThisTurn: false,
      };
      state.activePlayerId = "player-2";
      state = run(state, {
        type: "ATTACK",
        playerId: "player-2",
        attackerInstanceId: "attacker",
        target: { type: "PLAYER", playerId: "player-1" },
      });
      assert.equal(state.players[0].health, 5);
      assert.equal(state.players[0].champion?.questCompleted, true);
      assert.ok(
        state.players[0].board.some(
          (c) => c?.definitionId === "crisis-awakening-tank",
        ),
      );
      assert.equal(
        state.events.filter(
          (e) =>
            e.type === "CHAMPION_QUEST_COMPLETED" && e.playerId === "player-1",
        ).length,
        1,
      );
    },
  );
test("current Minion A actually generates from the full stored catalog, discounts exactly one, and preserves deterministic serialization", () => {
  const state = setup("챔피언 미니언 A");
  const old = new Set(state.players[0].hand.map((c) => c.instanceId));
  const a = cast(state);
  const b = cast(JSON.parse(JSON.stringify(state)));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const generated = a.players[0].hand.find((c) => !old.has(c.instanceId))!;
  const original = definitions.find((d) => d.id === generated.definitionId)!;
  assert.ok(original);
  assert.equal(generated.currentCost, Math.max(0, original.cost - 1));
  assert.equal(a.players[0].champion?.quest, null);
});

// Deleted AWAKEN_CHAMPION is covered only by the historical snapshot.
