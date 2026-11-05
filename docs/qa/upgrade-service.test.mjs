import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { createInitialGameState } from "../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";
let f, service;
const ids = [];
const ally = {
  id: "upgrade-ally",
  name: "검증 좀비",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 2,
  health: 3,
  rulesText: "",
  keywords: [],
  abilities: [],
};
const group = {
  trigger: "ENTER_FIELD",
  action: "PROGRAM",
  values: {
    programCost: 2,
    programEffects: [
      {
        action: "BUFF",
        target: {
          zone: "BOARD",
          owner: "SELF",
          selection: "PLAYER_CHOICE",
          count: 1,
          filter: { definitionRef: { id: ally.id }, excludeSource: true },
        },
        values: { attack: 2, health: 2 },
      },
    ],
  },
};
const unit = {
  ...ally,
  id: "upgrade-source",
  name: "업그레이드 검증 선수",
  cost: 2,
  keywords: ["PROGRAM"],
  rulesText:
    "등장 — 업그레이드(2): 다른 아군 검증 좀비에게 +2/+2를 부여합니다.",
  abilities: [
    { trigger: "ENTER_FIELD", effects: [{ type: "STRUCTURED", ...group }] },
  ],
};
before(async () => {
  f = await startTutorialFixture();
  service = await import("../../artifacts/api-server/src/online/service.ts");
  await f.db
    .insert(f.schema.usersTable)
    .values({
      id: "upgrade-opponent",
      email: "upgrade@example.invalid",
      nickname: "상대",
      passwordHash: "unusable",
      role: "USER",
    });
  await f.db.insert(f.schema.decksTable).values([
    { id: "upgrade-one", userId: "tutorial-user", name: "검증" },
    { id: "upgrade-two", userId: "upgrade-opponent", name: "검증" },
  ]);
});
after(async () => {
  for (const id of ids) service.cleanupMatchRuntime(id);
  await f.close();
});
async function fixture(gold = 4) {
  const id = "upgrade-" + ids.length;
  ids.push(id);
  const s = createInitialGameState();
  s.gameId = id;
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = "PLAYER_ONE";
  s.cardPool = [unit, ally];
  s.players = s.players.map((p, i) => ({
    ...p,
    id: i ? "PLAYER_TWO" : "PLAYER_ONE",
    currentGold: gold,
    deck: [],
    hand: [],
    board: [null, null, null, null],
    champion: { ...p.champion, quest: null, championTokenDefinitionId: null },
  }));
  s.players[0].hand = [generateCardInstance(unit, { instanceId: "source" })];
  s.players[0].board[0] = {
    ...generateCardInstance(ally, { instanceId: "ally" }),
    boardSlot: 0,
  };
  await f.db.insert(f.schema.onlineMatchesTable).values({
    id,
    status: "ACTIVE",
    player1UserId: "tutorial-user",
    player2UserId: "upgrade-opponent",
    player1DeckId: "upgrade-one",
    player2DeckId: "upgrade-two",
    serializedGameState: s,
    serializedSnapshot: {
      player1UserId: "tutorial-user",
      player2UserId: "upgrade-opponent",
      player1DeckId: "upgrade-one",
      player2DeckId: "upgrade-two",
      cardDefinitions: s.cardPool,
      championDefinitions: [],
      publicPlayers: [
        { userId: "tutorial-user", nickname: "검증" },
        { userId: "upgrade-opponent", nickname: "상대" },
      ],
      introFirstSpeaker: null,
    },
  });
  return service.getRuntime(id);
}
const act = (r, id, payload, user = "tutorial-user", version = r.version) =>
  service.applyMatchAction(r.matchId, user, id, version, payload);
test("isolated admin API saves and reloads upgrade; invalid cost rejected", async () => {
  const base = {
    name: "격리 업그레이드",
    cardType: "WRESTLER",
    rarity: "NORMAL",
    cost: 2,
    attack: 2,
    health: 3,
    text: unit.rulesText,
    keywords: ["PROGRAM"],
    tags: [],
    isToken: false,
    isChampionToken: false,
    effectId: "STRUCTURED_EFFECTS_V1",
    effectConfig: { effects: [group] },
  };
  const save = (body) =>
    fetch(f.origin + "/api/admin/cards", {
      method: "POST",
      headers: { Cookie: f.cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const response = await save(base);
  assert.equal(response.status, 201, await response.clone().text());
  const data = await response.json();
  assert.equal(data.card.effectConfig.effects[0].values.programCost, 2);
  const saved = await f.db.select().from(f.schema.cardsTable);
  assert.ok(
    saved.some(
      (c) =>
        c.id === data.card.id && c.effectConfig.effects[0].action === "PROGRAM",
    ),
  );
  const bad = structuredClone(base);
  bad.effectConfig.effects[0].values.programCost = -1;
  assert.equal((await save(bad)).status, 400);
});
test("PvP commits before choice, syncs public gold, blocks cancellation and opponent choice, persists reconnect, dedupes requests", async () => {
  let r = await fixture();
  let result = await act(r, "play", {
    type: "PLAY_WRESTLER",
    cardInstanceId: "source",
    boardSlot: 1,
  });
  assert.ok(result.ok, result.message);
  assert.equal(r.state.players[0].currentGold, 0);
  assert.equal(r.state.targetingState.programPaid, true);
  const own = service.snapshotMessage(r, "tutorial-user"),
    other = service.snapshotMessage(r, "upgrade-opponent");
  assert.equal(own.state.targetingState.programPaid, true);
  assert.equal(other.state.players[0].currentGold, 0);
  assert.equal(other.state.targetingState, undefined);
  assert.equal(other.state.waitingForProgramPlayerId, "PLAYER_ONE");
  assert.equal(
    (await act(r, "cancel", { type: "CANCEL_EFFECT_TARGET" })).ok,
    false,
  );
  assert.equal(
    (
      await act(
        r,
        "wrong",
        { type: "SELECT_EFFECT_TARGET", targetId: "ally" },
        "upgrade-opponent",
      )
    ).ok,
    false,
  );
  const id = r.matchId;
  service.cleanupMatchRuntime(id);
  r = await service.getRuntime(id);
  assert.ok(r.state.targetingState.programPaid);
  assert.equal(r.state.players[0].currentGold, 0);
  r.turnDeadlineAt = Date.now() - 1;
  const version = r.version;
  result = await act(r, "choose", {
    type: "SELECT_EFFECT_TARGET",
    targetId: "ally",
  });
  assert.ok(result.ok, result.message);
  assert.equal(r.state.players[0].board[0].currentAttack, 4);
  assert.equal(r.state.players[0].currentGold, 0);
  assert.equal(r.state.targetingState, undefined);
  assert.equal(
    r.state.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    1,
  );
  const duplicate = await act(
    r,
    "choose",
    { type: "SELECT_EFFECT_TARGET", targetId: "ally" },
    "tutorial-user",
    version,
  );
  assert.ok(duplicate.ok && duplicate.duplicate);
  assert.equal(r.state.players[0].board[0].currentAttack, 4);
  assert.equal(
    service.snapshotMessage(r, "upgrade-opponent").state
      .waitingForProgramPlayerId,
    undefined,
  );
});
test("PvP insufficient gold still commits base summon without pending selection", async () => {
  const r = await fixture(3);
  const result = await act(r, "base-only", {
    type: "PLAY_WRESTLER",
    cardInstanceId: "source",
    boardSlot: 1,
  });
  assert.ok(result.ok, result.message);
  assert.equal(r.state.players[0].currentGold, 1);
  assert.ok(r.state.players[0].board[1]);
  assert.equal(r.state.targetingState, undefined);
});
