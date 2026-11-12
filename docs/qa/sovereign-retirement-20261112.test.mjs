import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cardRecordToDefinition,
  createInitialGameState,
  generateCardInstance,
  executeAction,
} from "../../lib/game-engine/src/index.ts";
import { applyEffect } from "../../artifacts/ko-game/src/game/effects/effect-engine.ts";
const record = JSON.parse(
  readFileSync(
    "docs/qa/20261112-multiplayer-upgrade/wolf-sovereign-fixture.json",
  ),
).find((c) => c.name === "소버린");
const sov = cardRecordToDefinition(record),
  foe = {
    ...sov,
    id: "sovereign-foe",
    name: "검증 상대",
    attack: 20,
    health: 100,
    abilities: [],
    keywords: [],
  };
function setup() {
  const s = createInitialGameState(undefined, [sov, foe]);
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-2";
  s.turn = 5;
  for (const p of s.players) {
    p.board = [null, null, null, null];
    p.champion.quest = null;
    p.hand = [];
    p.deck = [];
  }
  s.players[0].board[0] = {
    ...generateCardInstance(sov, { instanceId: "sov" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  s.players[1].board[0] = {
    ...generateCardInstance(foe, { instanceId: "foe" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  return s;
}
for (const cause of ["combat", "effect", "retire"])
  test(
    "current Sovereign cumulative max-HP penalty on " +
      cause +
      "; snapshot round-trip; no revival at zero max HP",
    () => {
      let s = setup();
      for (const expected of [4, 2, 0]) {
        if (cause === "combat") {
          s.players[1].board[0] = {
            ...s.players[1].board[0],
            attacksUsedThisTurn: 0,
          };
          const r = executeAction(JSON.parse(JSON.stringify(s)), {
            type: "ATTACK",
            playerId: "player-2",
            attackerInstanceId: "foe",
            target: {
              type: "WRESTLER",
              playerId: "player-1",
              cardInstanceId: "sov",
            },
          });
          assert.ok(r.success);
          s = r.state;
        } else {
          s = applyEffect(
            JSON.parse(JSON.stringify(s)),
            "player-2",
            s.players[1].board[0],
            {
              type: "STRUCTURED",
              action: cause === "effect" ? "DAMAGE" : "RETIRE",
              target: {
                zone: "BOARD",
                owner: "ENEMY",
                selection: "SAME_TARGET",
                count: 1,
              },
              values: { amount: 20 },
            },
            ["sov"],
          );
        }
        const card = s.players[0].board[0];
        if (expected) {
          assert.ok(card);
          assert.equal(card.maxHealth, expected);
          assert.equal(card.currentHealth, expected);
        } else assert.equal(card, null);
      }
    },
  );
for (const tags of [[], ["악마"]])
  test(
    "simultaneous " +
      (tags.length ? "Demon" : "ordinary") +
      " kill applies both revival penalty and its printed kill reward",
    () => {
      let s = setup();
      s.activePlayerId = "player-1";
      s.players[1].board[0] = {
        ...s.players[1].board[0],
        currentAttack: 6,
        currentHealth: 4,
        maxHealth: 4,
        tags,
      };
      const r = executeAction(s, {
        type: "ATTACK",
        playerId: "player-1",
        attackerInstanceId: "sov",
        target: {
          type: "WRESTLER",
          playerId: "player-2",
          cardInstanceId: "foe",
        },
      });
      assert.ok(r.success);
      const card = r.state.players[0].board[0];
      assert.equal(card.maxHealth, 6 - 2 + 1 + (tags.length ? 1 : 0));
      assert.equal(card.currentAttack, 4 - 2 + 1 + (tags.length ? 1 : 0));
      assert.equal(r.state.players[1].board[0], null);
    },
  );
for (const mutualDemon of [false, true])
  test(
    "buffed eight max HP " +
      (mutualDemon
        ? "is eight after Demon kill reward offsets revival -2"
        : "becomes six without a kill reward"),
    () => {
      let s = setup();
      s = applyEffect(s, "player-1", s.players[0].board[0], {
        type: "STRUCTURED",
        action: "BUFF",
        target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
        values: { health: 2 },
      });
      assert.equal(s.players[0].board[0].maxHealth, 8);
      if (mutualDemon) {
        s.activePlayerId = "player-1";
        s.players[1].board[0] = {
          ...s.players[1].board[0],
          currentAttack: 8,
          currentHealth: 4,
          maxHealth: 4,
          tags: ["악마"],
        };
      }
      const r = executeAction(
        JSON.parse(JSON.stringify(s)),
        mutualDemon
          ? {
              type: "ATTACK",
              playerId: "player-1",
              attackerInstanceId: "sov",
              target: {
                type: "WRESTLER",
                playerId: "player-2",
                cardInstanceId: "foe",
              },
            }
          : {
              type: "ATTACK",
              playerId: "player-2",
              attackerInstanceId: "foe",
              target: {
                type: "WRESTLER",
                playerId: "player-1",
                cardInstanceId: "sov",
              },
            },
      );
      assert.ok(r.success);
      assert.equal(r.state.players[0].board[0].maxHealth, mutualDemon ? 8 : 6);
    },
  );
