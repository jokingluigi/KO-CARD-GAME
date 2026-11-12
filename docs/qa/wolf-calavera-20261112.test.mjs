import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  cardRecordToDefinition,
  championRecordToDefinition,
  createInitialGameState,
  generateCardInstance,
  executeAction,
} from "../../lib/game-engine/src/index.ts";
import { normalizePandoraTargeting } from "../../artifacts/ko-game/src/game/champions/pandora-targeting.ts";
import { processChampionQuestEvents } from "../../artifacts/ko-game/src/game/champions/quests.ts";
const cards = JSON.parse(
  readFileSync(
    "docs/qa/20261112-multiplayer-upgrade/wolf-sovereign-fixture.json",
  ),
).map(cardRecordToDefinition);
for (const name of ["소버린", "레이븐"])
  test(
    "wolf absorbs pre-retirement ATK/HP despite " +
      name +
      " nested retirement effect, after serialized turn-start choice",
    () => {
      const wolf = cards.find((c) => c.name === "늑대인간 판도라"),
        victim = cards.find((c) => c.name === name);
      let s = createInitialGameState(undefined, cards);
      s.status = "IN_PROGRESS";
      s.turn = 3;
      s.activePlayerId = "player-2";
      for (const p of s.players) {
        p.hand = [];
        p.deck = Array.from({ length: 4 }, (_, i) =>
          generateCardInstance(victim, { instanceId: p.id + i }),
        );
        p.board = [null, null, null, null];
        p.champion.quest = null;
      }
      s.players[0].board[0] = {
        ...generateCardInstance(wolf, { instanceId: "wolf" }),
        boardSlot: 0,
      };
      s.players[0].board[1] = {
        ...generateCardInstance(victim, { instanceId: "victim" }),
        currentAttack: 7,
        currentHealth: 3,
        maxHealth: 6,
        boardSlot: 1,
      };
      let r = executeAction(s, { type: "END_TURN", playerId: "player-2" });
      assert.ok(r.success);
      s = r.state;
      assert.ok(s.targetingState.validTargetIds.includes("victim"));
      assert.ok(!s.targetingState.validTargetIds.includes("wolf"));
      const before = s.players[0].board[0];
      r = executeAction(JSON.parse(JSON.stringify(s)), {
        type: "SELECT_EFFECT_TARGET",
        playerId: "player-1",
        targetId: "victim",
      });
      assert.ok(r.success);
      s = r.state;
      const after = s.players[0].board[0];
      assert.equal(after.currentAttack, before.currentAttack + 7);
      assert.equal(after.maxHealth, before.maxHealth + 3);
      assert.equal(after.currentHealth, before.currentHealth + 3);
      assert.equal(after.dodgeCharges, before.dodgeCharges + 1);
      assert.equal(s.targetingState, undefined);
      if (name === "소버린") {
        assert.equal(s.players[0].board[1].currentAttack, 5);
        assert.equal(s.players[0].board[1].maxHealth, 4);
      } else
        assert.ok(s.players[0].deck.some((c) => c.instanceId === "victim"));
    },
  );
test("Calavera graveyard Undead requirement and text both eight; seven is incomplete; old unfinished restored, completed preserved", () => {
  const raw = JSON.parse(
    readFileSync("docs/qa/snapshots/20261111-admin/champions.json"),
  ).find((c) => c.id === "5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c");
  const champion = championRecordToDefinition({
    ...raw,
    questText:
      "자신의 무덤에 '언데드' 태그를 가진 카드가 10장 이상 있어야합니다.",
  });
  assert.equal(champion.quest.condition.required, 8);
  assert.match(champion.quest.description, /8장/);
  const body = { ...cards[0], id: "undead", tags: ["언데드"], abilities: [] };
  let s = createInitialGameState(
    [champion.id, champion.id],
    [body],
    [champion],
  );
  s.status = "IN_PROGRESS";
  s.players[0].champion.quest = {
    ...s.players[0].champion.quest,
    finisher: undefined,
    finisherChoices: undefined,
    reward: { type: "GAIN_GOLD", amount: 0 },
  };
  s.players[0].graveyard = Array.from({ length: 7 }, (_, i) =>
    generateCardInstance(body, { instanceId: "g" + i }),
  );
  s = processChampionQuestEvents(s, s);
  assert.equal(s.players[0].champion.questCompleted, false);
  const before = s;
  s = {
    ...s,
    players: s.players.map((p, i) =>
      i
        ? p
        : {
            ...p,
            graveyard: [
              ...p.graveyard,
              generateCardInstance(body, { instanceId: "g8" }),
            ],
          },
    ),
  };
  s = processChampionQuestEvents(before, s);
  assert.equal(s.players[0].champion.questCompleted, true);
  const old = structuredClone(before);
  old.players[0].champion.quest.condition.required = 10;
  old.players[0].champion.quest.requiredProgress = 10;
  assert.equal(
    normalizePandoraTargeting(old).players[0].champion.quest.condition.required,
    8,
  );
  old.players[0].champion.questCompleted = true;
  assert.equal(
    normalizePandoraTargeting(old).players[0].champion.quest.condition.required,
    10,
  );
});
