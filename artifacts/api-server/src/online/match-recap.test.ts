import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMatchRecap,
  createInitialGameState,
  generateCardInstance,
  type CardDefinition,
} from "@workspace/game-engine";
process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const { snapshotMessage, endedMessageForViewer } = await import("./service");
const { pool } = await import("@workspace/db");
const { after } = await import("node:test");
after(() => pool.end());
const c: CardDefinition = {
  id: "mvp",
  name: "경기 MVP",
  cardType: "WRESTLER",
  cost: 1,
  attack: 4,
  health: 5,
  rulesText: "",
  isToken: false,
  isChampionToken: false,
  keywords: [],
  abilities: [],
};
test("both online seats and terminal snapshots receive the same server-calculated recap without hidden cards", () => {
  const state = createInitialGameState(undefined, [c]);
  state.players[0].id = "PLAYER_ONE";
  state.players[1].id = "PLAYER_TWO";
  state.status = "FINISHED";
  state.winnerId = "PLAYER_ONE";
  state.loserId = "PLAYER_TWO";
  state.players[1].health = 0;
  state.players[0].board[0] = generateCardInstance(c, { instanceId: "shown" });
  state.players[1].hand.push(
    generateCardInstance(
      { ...c, id: "secret", name: "SECRET" },
      { instanceId: "secret" },
    ),
  );
  state.events = [
    {
      type: "ENTER_FIELD",
      playerId: "PLAYER_ONE",
      cardInstanceId: "shown",
      cardType: "WRESTLER",
    },
    {
      type: "DAMAGE_DEALT",
      playerId: "PLAYER_ONE",
      source: { type: "CARD", cardInstanceId: "shown" },
      target: { type: "PLAYER", playerId: "PLAYER_TWO" },
      amount: 30,
    },
  ];
  const runtime: any = {
    matchId: "recap-room",
    state,
    version: 3,
    turnStartedAt: null,
    turnDeadlineAt: null,
    gameplayStartsAt: null,
    snapshot: {
      player1UserId: "one",
      player2UserId: "two",
      publicPlayers: [],
      introFirstSpeaker: null,
    },
    connectionStates: { PLAYER_ONE: "CONNECTED", PLAYER_TWO: "CONNECTED" },
    requestIds: new Map(),
  };
  const one = snapshotMessage(runtime, "one"),
    two = snapshotMessage(runtime, "two");
  assert.ok("recap" in one && "recap" in two);
  assert.deepEqual(one.recap, buildMatchRecap(state));
  assert.deepEqual(one.recap, two.recap);
  assert.equal(one.recap?.mvp?.name, c.name);
  assert.ok(!JSON.stringify(two.recap).includes("SECRET"));
  const ended = endedMessageForViewer(
    {
      ok: true,
      runtime,
      requestId: "result",
      version: 3,
      eventStart: 0,
      duplicate: false,
    },
    "two",
  );
  assert.ok("recap" in ended);
  assert.deepEqual(ended.recap, two.recap);
  assert.throws(() => snapshotMessage(runtime, "outsider"));
});
