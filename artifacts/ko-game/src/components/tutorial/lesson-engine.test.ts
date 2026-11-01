import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  tutorialCatalog,
  createTutorialLesson,
  tutorialGoal,
  tutorialActionAllowed,
  lessonUnavailable,
  LESSONS,
} from "./lesson-engine";
import { cardRecordToDefinition } from "../../game/cards/published-cards";
import { championRecordToDefinition } from "../../game/champions/published-champions";
import { executeAction } from "../../game/actions/engine-actions";
import type { GameState } from "../../game";
import type { GameAction } from "../../game/actions/types";
const raw = JSON.parse(
  readFileSync(
    new URL("../../../qa/art-direction-data.json", import.meta.url),
    "utf8",
  ),
);
if (process.env.KO_TUTORIAL_LIVE_FIXTURES === "1") {
  raw.cards = JSON.parse(readFileSync("/tmp/tutorial-live-cards.json", "utf8"));
  raw.champions = JSON.parse(
    readFileSync("/tmp/tutorial-live-champions.json", "utf8"),
  );
}
const cards = raw.cards.cards.map(cardRecordToDefinition),
  champions = raw.champions.champions.map(championRecordToDefinition);
const catalog = tutorialCatalog(cards, champions);
function act(s: GameState, a: GameAction) {
  const r = executeAction(s, a);
  assert.equal(r.success, true, r.success ? "" : r.message);
  return r.state;
}
const self = "player-1",
  enemy = "player-2";
test("all six lessons use real published definitions without mutating the catalog", () => {
  const before = JSON.stringify(catalog);
  for (const l of LESSONS) {
    assert.equal(lessonUnavailable(catalog, l.id), null, l.id);
    const s = createTutorialLesson(catalog, l.id, "lesson:" + l.id);
    assert.equal(s.cardPool?.length, cards.length);
    assert.equal(s.players[0].champion?.id, catalog.champion!.id);
    assert.equal(tutorialGoal(l.id, s, catalog, false).complete, false);
  }
  assert.equal(JSON.stringify(catalog), before);
});
test("basics requires real mulligan, summon, turn passing and lethal champion attack", () => {
  let s = createTutorialLesson(catalog, "basics", "basics");
  assert.equal(tutorialGoal("basics", s, catalog, false).key, "mulligan");
  s = act(s, {
    type: "MULLIGAN",
    playerId: self,
    cardInstanceIds: [s.players[0].hand[0].instanceId],
  });
  assert.equal(s.players[0].hand.length, 3);
  assert.equal(tutorialGoal("basics", s, catalog, false).key, "summon");
  const id = s.players[0].hand[0].instanceId;
  s = act(s, {
    type: "PLAY_WRESTLER",
    playerId: self,
    cardInstanceId: id,
    boardSlot: 0,
  });
  assert.equal(s.players[0].currentGold, 0);
  assert.equal(tutorialGoal("basics", s, catalog, false).key, "turn");
  const premature = executeAction(s, {
    type: "ATTACK",
    playerId: self,
    attackerInstanceId: id,
    target: { type: "PLAYER", playerId: enemy },
  });
  assert.equal(premature.success, false);
  s = act(s, { type: "END_TURN", playerId: self });
  s = act(s, { type: "END_TURN", playerId: enemy });
  assert.equal(tutorialGoal("basics", s, catalog, false).key, "finish");
  s = act(s, {
    type: "ATTACK",
    playerId: self,
    attackerInstanceId: id,
    target: { type: "PLAYER", playerId: enemy },
  });
  assert.equal(s.status, "FINISHED");
  assert.equal(s.winnerId, self);
  assert.equal(tutorialGoal("basics", s, catalog, false).complete, true);
});
test("combat lesson uses actual combat damage and counterattack", () => {
  let s = createTutorialLesson(catalog, "combat", "combat");
  const before = s.players.map((p) => p.board[0]!.currentHealth);
  const atk = s.players[0].board[0]!.currentAttack;
  s = act(s, {
    type: "ATTACK",
    playerId: self,
    attackerInstanceId: s.players[0].board[0]!.instanceId,
    target: {
      type: "WRESTLER",
      playerId: enemy,
      cardInstanceId: s.players[1].board[0]!.instanceId,
    },
  });
  assert.equal(s.players[0].board[0]!.currentHealth, before[0] - atk);
  assert.equal(s.players[1].board[0]!.currentHealth, before[1] - atk);
  assert.equal(tutorialGoal("combat", s, catalog, false).key, "combatturn");
  s = act(s, { type: "END_TURN", playerId: self });
  s = act(s, { type: "END_TURN", playerId: enemy });
  assert.equal(tutorialGoal("combat", s, catalog, false).key, "combatretire");
  s = act(s, {
    type: "ATTACK",
    playerId: self,
    attackerInstanceId: s.players[0].board[0]!.instanceId,
    target: {
      type: "WRESTLER",
      playerId: enemy,
      cardInstanceId: s.players[1].board[0]!.instanceId,
    },
  });
  assert.equal(s.players[0].board[0], null);
  assert.equal(s.players[1].board[0], null);
  assert.equal(tutorialGoal("combat", s, catalog, false).complete, true);
});
test("spell selection cancellation preserves gold and hand; only actual committed spell completes", () => {
  let s = createTutorialLesson(catalog, "spell", "spell");
  const original = structuredClone(s),
    id = s.players[0].hand[0].instanceId,
    target = s.players[1].board[0]!.instanceId;
  const begin: GameAction = {
    type: "BEGIN_TARGETED_ACTION",
    playerId: self,
    action: { type: "PLAY_TECHNIQUE", cardInstanceId: id },
  };
  s = act(s, begin);
  assert.equal(s.targetingState?.phase, "PRE_COMMIT");
  assert.equal(tutorialGoal("spell", s, catalog, false).complete, false);
  assert.equal(
    tutorialActionAllowed(
      "spell",
      tutorialGoal("spell", s, catalog, false),
      { type: "CONFIRM_PRECOMMIT_TARGET", playerId: self, targetId: target },
      false,
    ),
    false,
  );
  s = act(s, { type: "CANCEL_EFFECT_TARGET", playerId: self });
  assert.equal(s.players[0].currentGold, original.players[0].currentGold);
  assert.deepEqual(s.players[0].hand, original.players[0].hand);
  s = act(s, begin);
  s = act(s, {
    type: "CONFIRM_PRECOMMIT_TARGET",
    playerId: self,
    targetId: target,
  });
  assert.equal(s.players[1].board[0]!.isStunned, true);
  assert.equal(s.players[0].hand.length, 0);
  assert.equal(s.players[0].currentGold, 6 - catalog.spell!.cost);
  assert.equal(tutorialGoal("spell", s, catalog, true).complete, true);
});
test("active completes on real use and stays unavailable after a new turn", () => {
  let s = createTutorialLesson(catalog, "active", "active");
  const id = s.players[0].board[0]!.instanceId;
  s = act(s, { type: "USE_ACTIVE", playerId: self, cardInstanceId: id });
  assert.equal(tutorialGoal("active", s, catalog, false).complete, true);
  assert.equal(
    executeAction(s, { type: "USE_ACTIVE", playerId: self, cardInstanceId: id })
      .success,
    false,
  );
  s = act(s, { type: "END_TURN", playerId: self });
  s = act(s, { type: "END_TURN", playerId: enemy });
  assert.equal(
    executeAction(s, { type: "USE_ACTIVE", playerId: self, cardInstanceId: id })
      .success,
    false,
  );
});
test("champion lesson completes quest by actual ability cost and upgrades through existing rules", () => {
  let s = createTutorialLesson(catalog, "champion", "champion");
  const champion = s.players[0].champion!;
  assert.equal(
    champion.questProgress,
    champion.quest!.requiredProgress - catalog.champion!.abilityCost,
  );
  s = act(s, { type: "USE_CHAMPION_ABILITY", playerId: self });
  assert.equal(s.players[0].currentGold, 6 - catalog.champion!.abilityCost);
  assert.equal(s.players[0].champion!.questCompleted, true);
  assert.equal(
    s.players[0].champion!.upgradedAbility!.id,
    catalog.champion!.upgradedAbility!.id,
  );
  assert.equal(tutorialGoal("champion", s, catalog, false).complete, true);
  s = act(s, { type: "END_TURN", playerId: self });
  s = act(s, { type: "END_TURN", playerId: enemy });
  s = act(s, { type: "USE_CHAMPION_ABILITY", playerId: self });
  assert.ok(
    s.players[0].board.some(Boolean),
    "upgraded ability summons the real bodyguard",
  );
});
test("wrong actions, replayed completion, and unsupported catalogs do not silently advance", () => {
  const s = createTutorialLesson(catalog, "basics", "guard"),
    goal = tutorialGoal("basics", s, catalog, false);
  assert.equal(
    tutorialActionAllowed(
      "basics",
      goal,
      { type: "END_TURN", playerId: self },
      false,
    ),
    false,
  );
  assert.equal(
    tutorialActionAllowed(
      "basics",
      { ...goal, complete: true },
      { type: "MULLIGAN", playerId: self, cardInstanceIds: [] },
      false,
    ),
    false,
  );
  const empty = tutorialCatalog([], []);
  assert.ok(lessonUnavailable(empty, "basics"));
  assert.throws(() => createTutorialLesson(empty, "basics", "missing"));
  const missing = tutorialCatalog(
    cards.filter((c) => c.id !== catalog.spell!.id),
    champions,
  );
  assert.ok(lessonUnavailable(missing, "spell"));
  assert.equal(lessonUnavailable(missing, "basics"), null);
});

test("rush lesson can summon and attack a champion in the same turn through real rules", () => {
  let s = createTutorialLesson(catalog, "rush", "rush");
  const card = s.players[0].hand[0];
  s = act(s, {
    type: "PLAY_WRESTLER",
    playerId: self,
    cardInstanceId: card.instanceId,
    boardSlot: 0,
  });
  assert.equal(s.players[0].board[0]!.enteredThisTurn, true);
  assert.equal(tutorialGoal("rush", s, catalog, false).key, "rushattack");
  s = act(s, {
    type: "ATTACK",
    playerId: self,
    attackerInstanceId: card.instanceId,
    target: { type: "PLAYER", playerId: enemy },
  });
  assert.equal(tutorialGoal("rush", s, catalog, false).complete, true);
});
