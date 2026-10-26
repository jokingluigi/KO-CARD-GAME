import assert from "node:assert/strict";
import { test } from "node:test";
import { koChampionLines } from "./champion-ko-lines";
import type { GameState } from "../game/types/game-state";
function state(): GameState {
  return {
    status: "FINISHED",
    winnerId: "B",
    loserId: "A",
    players: [
      {
        id: "A",
        health: 0,
        champion: {
          id: "hero-a",
          name: "아군",
          questCompleted: false,
          presentationLines: {
            BEFORE_QUEST: { VICTORY: "A 승리", DEFEAT: "A 패배" },
          },
        },
      },
      {
        id: "B",
        health: 4,
        champion: {
          id: "hero-b",
          name: "상대",
          questCompleted: true,
          presentationLines: {
            BEFORE_QUEST: { VICTORY: "B 승리", DEFEAT: "B 패배" },
            AFTER_QUEST: { VICTORY: "B 각성 승리" },
            MATCHUPS: { "hero-a": { AFTER_QUEST: { VICTORY: "B 전용 승리" } } },
          },
        },
      },
    ],
  } as GameState;
}
test("KO lines follow actual winner/loser IDs, quest state and existing matchup override", () => {
  const s = state();
  assert.deepEqual(koChampionLines(s), [
    { playerId: "B", speaker: "상대", text: "B 전용 승리", outcome: "VICTORY" },
    { playerId: "A", speaker: "아군", text: "A 패배", outcome: "DEFEAT" },
  ]);
  s.players.reverse();
  assert.equal(koChampionLines(s)[0]!.playerId, "B");
  s.players[0]!.champion!.presentationLines!.MATCHUPS = undefined;
  assert.equal(koChampionLines(s)[0]!.text, "B 각성 승리");
});
test("no invented KO dialogue for missing lines, nonlethal surrender, unresolved or invalid results", () => {
  const s = state();
  s.players[0]!.health = 1;
  assert.deepEqual(koChampionLines(s), []);
  s.players[0]!.health = 0;
  s.status = "IN_PROGRESS";
  assert.deepEqual(koChampionLines(s), []);
  s.status = "FINISHED";
  s.winnerId = s.loserId;
  assert.deepEqual(koChampionLines(s), []);
  s.winnerId = "B";
  s.players.forEach((p) => {
    p.champion!.presentationLines = undefined;
  });
  assert.deepEqual(koChampionLines(s), []);
});
