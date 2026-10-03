import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatchRecap } from "./match-recap";
import { createInitialGameState } from "../../../artifacts/ko-game/src/game/engine/create-initial-game-state";
import { generateCardInstance } from "../../../artifacts/ko-game/src/game/cards/generation";
import type { CardDefinition } from "../../../artifacts/ko-game/src/game/cards/types";
import type { GameEvent } from "../../../artifacts/ko-game/src/game/events/types";
const a: CardDefinition = {
    id: "a",
    name: "A 선수",
    cost: 1,
    attack: 2,
    health: 3,
    rulesText: "",
    cardType: "WRESTLER",
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [],
    imageUrl: "/a.png",
  },
  b = { ...a, id: "b", name: "B 선수", imageUrl: "/b.png" },
  tech = { ...a, id: "tech", name: "기술", cardType: "TECHNIQUE" as const };
const enter = (id: string, owner = "player-1"): GameEvent => ({
  type: "ENTER_FIELD",
  playerId: owner,
  cardInstanceId: id,
  cardType: "WRESTLER",
});
const hit = (id: string, amount: number, target = "player-2"): GameEvent => ({
  type: "DAMAGE_DEALT",
  playerId: "player-1",
  source: { type: "CARD", cardInstanceId: id },
  target: { type: "PLAYER", playerId: target },
  amount,
});
function fixture() {
  const s = createInitialGameState(undefined, [a, b, tech]);
  s.status = "FINISHED";
  s.winnerId = "player-1";
  s.loserId = "player-2";
  s.turn = 4;
  s.players[1].health = 0;
  s.players[0].board = [
    generateCardInstance(a, { instanceId: "a1" }),
    generateCardInstance(b, { instanceId: "b1" }),
    null,
    null,
  ];
  return s;
}
test("damage and enemy kills produce deterministic MVP, deduplicate deaths and show at most three highlights", () => {
  const s = fixture();
  s.events = [
    { type: "TURN_STARTED" },
    enter("a1"),
    enter("b1"),
    hit("a1", 8),
    hit("b1", 4),
    {
      type: "CARD_RETIRED",
      playerId: "player-2",
      cardInstanceId: "victim",
      source: { type: "CARD", cardInstanceId: "b1" },
    },
    {
      type: "CARD_RETIRED",
      playerId: "player-2",
      cardInstanceId: "victim",
      source: { type: "CARD", cardInstanceId: "b1" },
    },
    { type: "CHAMPION_QUEST_COMPLETED", playerId: "player-1" },
    hit("a1", 1),
  ];
  const recap = buildMatchRecap(s);
  assert.equal(recap.mvp?.instanceId, "a1");
  assert.equal(recap.mvp?.score, 9);
  assert.equal(recap.playerMvps[0].kills, 0);
  assert.equal(recap.highlights.length, 3);
  assert.equal(recap.highlights[0].kind, "FINISHER");
  assert.ok(recap.highlights.some((h) => h.kind === "QUEST"));
  assert.ok(recap.highlights.some((h) => h.kind === "BIG_HIT"));
  assert.equal(new Set(recap.highlights.map((h) => h.eventIndex)).size, 3);
  assert.deepEqual(recap, buildMatchRecap(structuredClone(s)));
});
test("self damage, blocked hits, hidden hand effects and techniques cannot win wrestler MVP", () => {
  const s = fixture();
  const secret = generateCardInstance(
    { ...a, id: "secret", name: "비공개" },
    { instanceId: "secret" },
  );
  s.players[0].hand.push(secret);
  s.players[0].graveyard.push(
    generateCardInstance(tech, { instanceId: "tech1" }),
  );
  s.events = [
    enter("a1"),
    {
      type: "CARD_PLAYED",
      playerId: "player-1",
      cardInstanceId: "tech1",
      cardType: "TECHNIQUE",
    },
    hit("a1", 99, "player-1"),
    hit("a1", 0),
    hit("tech1", 20),
    hit("secret", 99),
    hit("a1", 2),
  ];
  const recap = buildMatchRecap(s, [
    a,
    b,
    tech,
    { ...a, id: "secret", name: "비공개" },
  ]);
  assert.equal(recap.mvp?.instanceId, "a1");
  assert.equal(recap.mvp?.damage, 2);
  assert.ok(!JSON.stringify(recap).includes("비공개"));
});
test("surrender and fatigue endings do not invent a finishing blow or MVP from system damage", () => {
  const s = fixture();
  s.players[1].health = 10;
  s.events = [
    enter("a1"),
    hit("a1", 5),
    { type: "SURRENDER", playerId: "player-2" },
  ];
  let r = buildMatchRecap(s);
  assert.equal(r.highlights[0].kind, "SURRENDER");
  assert.ok(!r.highlights.some((h) => h.kind === "FINISHER"));
  s.players[1].health = 0;
  s.events = [
    {
      type: "DAMAGE_DEALT",
      playerId: "player-2",
      source: { type: "SYSTEM" },
      target: { type: "PLAYER", playerId: "player-2" },
      reason: "FATIGUE",
      amount: 9,
    },
  ];
  r = buildMatchRecap(s);
  assert.equal(r.mvp, null);
  assert.equal(r.highlights[0].kind, "FATIGUE");
});
test("retaliation belongs to its source owner and same-instance revival may earn another kill", () => {
  const s = fixture();
  s.players[1].graveyard.push(generateCardInstance(b, { instanceId: "enemy" }));
  s.events = [
    enter("enemy", "player-2"),
    {
      ...hit("enemy", 7, "player-1"),
      playerId: "player-1",
      sourceSnapshot: {
        playerId: "player-2",
        cardInstanceId: "enemy",
        cardType: "WRESTLER",
        boardSlot: 0,
      },
    },
    {
      type: "CARD_RETIRED",
      playerId: "player-1",
      cardInstanceId: "a1",
      source: { type: "CARD", cardInstanceId: "enemy" },
    },
    enter("a1"),
    {
      type: "CARD_RETIRED",
      playerId: "player-1",
      cardInstanceId: "a1",
      source: { type: "CARD", cardInstanceId: "enemy" },
    },
  ];
  const r = buildMatchRecap(s);
  assert.equal(r.mvp?.playerId, "player-2");
  assert.equal(r.mvp?.damage, 7);
  assert.equal(r.mvp?.kills, 2);
  assert.equal(r.mvp?.score, 17);
});
test("basic combat death can use immediately preceding lethal damage; older non-lethal damage earns no kill", () => {
  const s = fixture();
  s.events = [
    enter("a1"),
    {
      type: "DAMAGE_DEALT",
      source: { type: "CARD", cardInstanceId: "a1" },
      target: { type: "CARD", cardInstanceId: "victim" },
      sourceSnapshot: {
        playerId: "player-1",
        cardInstanceId: "a1",
        cardType: "WRESTLER",
        boardSlot: 0,
      },
      targetSnapshot: {
        playerId: "player-2",
        cardInstanceId: "victim",
        cardType: "WRESTLER",
        boardSlot: 0,
      },
      amount: 4,
    },
    {
      type: "CARD_RETIRED",
      playerId: "player-2",
      cardInstanceId: "victim",
      source: { type: "SYSTEM" },
      targetSnapshot: {
        playerId: "player-2",
        cardInstanceId: "victim",
        cardType: "WRESTLER",
        boardSlot: 0,
        currentHealth: 0,
      },
    },
  ];
  assert.equal(buildMatchRecap(s).mvp?.kills, 1);
  s.events.at(-1)!.targetSnapshot!.currentHealth = 2;
  assert.equal(buildMatchRecap(s).mvp?.kills, 0);
});
test("no contribution and in-progress matches have no MVP; viewer order cannot change selected MVP", () => {
  const s = fixture();
  s.events = [];
  assert.equal(buildMatchRecap(s).mvp, null);
  s.status = "IN_PROGRESS";
  s.events = [enter("a1"), hit("a1", 3)];
  assert.deepEqual(buildMatchRecap(s), {
    mvp: null,
    playerMvps: [],
    highlights: [],
  });
  s.status = "FINISHED";
  const r = buildMatchRecap(s);
  s.players.reverse();
  assert.deepEqual(buildMatchRecap(s).mvp, r.mvp);
});
test("previously played cards returned to a hidden zone never disclose transformed hidden metadata", () => {
  const s = fixture();
  const card = s.players[0].board[0]!;
  s.players[0].board[0] = null;
  s.players[0].hand.push({ ...card, definitionId: "secret" });
  s.events = [enter("a1"), hit("a1", 10)];
  const r = buildMatchRecap(s, [
    a,
    b,
    { ...a, id: "secret", name: "SECRET", imageUrl: "/secret.png" },
  ]);
  assert.equal(r.mvp?.damage, 10);
  assert.equal(r.mvp?.definitionId, "");
  assert.equal(r.mvp?.imageUrl, null);
  assert.ok(!JSON.stringify(r).includes("SECRET"));
  assert.ok(!JSON.stringify(r).includes("/secret"));
});
