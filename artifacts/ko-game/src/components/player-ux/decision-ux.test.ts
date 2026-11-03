import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../game/engine/create-initial-game-state";
import { basicAttackForecast } from "./attack-forecast-policy";
import { handGestureIntent } from "./gesture-intent";
import {
  historyGroups,
  observedChampionHealing,
  historyGroupSummary,
  eventTitle,
  visibleHistoryCard,
} from "../action-history-utils";
import { healthAttentionPlans } from "./attention-policy";
function fixture() {
  const s = createInitialGameState();
  s.status = "IN_PROGRESS";
  s.players[0].board[0] = {
    ...s.players[0].deck[0],
    currentAttack: 5,
    currentHealth: 4,
    keywords: [],
    isSilenced: false,
  };
  s.players[1].board[0] = {
    ...s.players[1].deck[0],
    currentAttack: 3,
    currentHealth: 4,
    keywords: [],
    isSilenced: false,
  };
  s.events = [];
  return s;
}
test("public basic forecast: damage, retaliation and lethal; no actions/RNG/state writes", () => {
  const s = fixture(),
    a = s.players[0].board[0]!,
    b = s.players[1].board[0]!,
    before = JSON.stringify(s),
    x = basicAttackForecast(s, a.instanceId, b.instanceId)!;
  assert.equal(x.damage, 5);
  assert.equal(x.counter, 3);
  assert.equal(x.targetFalls, true);
  assert.equal(x.selfHealth, 1);
  assert.equal(JSON.stringify(s), before);
  const hidden = structuredClone(s);
  hidden.players[1].hand = [];
  hidden.players[1].deck = [];
  hidden.randomSeed = 123;
  assert.deepEqual(basicAttackForecast(hidden, a.instanceId, b.instanceId), x);
});
test("forecast respects armor, active entry defense and dodge without consuming them", () => {
  const s = fixture(),
    a = s.players[0].board[0]!,
    b = s.players[1].board[0]!;
  b.keywords = ["ARMOR"];
  b.armor = 3;
  assert.equal(basicAttackForecast(s, a.instanceId, b.instanceId)?.damage, 2);
  b.keywords = ["DEFENSE"];
  b.entryDefenseActive = true;
  assert.equal(basicAttackForecast(s, a.instanceId, b.instanceId)?.damage, 0);
  b.keywords = ["DODGE"];
  b.dodgeAvailable = true;
  assert.equal(basicAttackForecast(s, a.instanceId, b.instanceId)?.damage, 0);
  assert.equal(b.dodgeAvailable, true);
  assert.equal(basicAttackForecast(s, "missing", b.instanceId), null);
});
test("touch intent separates horizontal browse, drag and jitter", () => {
  assert.equal(handGestureIntent(4, 4, true), "WAIT");
  assert.equal(handGestureIntent(40, -5, true), "SCROLL");
  assert.equal(handGestureIntent(9, -40, true), "DRAG");
  assert.equal(handGestureIntent(20, -24, true), "DRAG");
  assert.equal(handGestureIntent(40, 0, false), "DRAG");
});
test("history groups one action and its explicit nested roots, separates later actions and turns", () => {
  const s = fixture();
  s.events = [
    {
      type: "CARD_PLAYED",
      cardType: "TECHNIQUE",
      playerId: s.players[0].id,
      presentationResolutionId: "a",
    },
    {
      type: "DAMAGE_DEALT",
      amount: 3,
      sourceContext: {
        sourcePlayerId: s.players[0].id,
        sourceActionType: "PLAY_TECHNIQUE",
        rootSourceEventId: "nested",
      },
    },
    { type: "ENTER_FIELD", presentationResolutionId: "a" },
    { type: "ATTACK_DECLARED" },
    {
      type: "DAMAGE_DEALT",
      amount: 2,
      sourceContext: {
        sourcePlayerId: s.players[0].id,
        sourceActionType: "ATTACK",
        rootSourceEventId: "combat",
      },
    },
    { type: "TURN_ENDED" },
  ];
  const g = historyGroups(s);
  assert.equal(g.length, 3);
  assert.equal(g[1].events.length, 2);
  assert.equal(g[2].events.length, 3);
  assert.match(historyGroupSummary(g[2]), /피해 합계 3/);
  assert.match(historyGroupSummary(g[2]), /소환 1/);
  assert.equal(historyGroups(s, 1).length, 1);
});
test("history never reveals enemy hidden hand/deck details through stat events or thumbnails", () => {
  const s = fixture(),
    secret = s.players[1].hand[0] ?? s.players[1].deck[1];
  s.players[1].hand = [secret];
  assert.equal(visibleHistoryCard(s, secret.instanceId), null);
  assert.match(
    eventTitle(s, {
      type: "STAT_CHANGED",
      stat: "cost",
      delta: -1,
      target: { type: "CARD", cardInstanceId: secret.instanceId },
    }),
    /알 수 없는 카드/,
  );
  s.events = [{ type: "CARD_REVEALED", cardInstanceId: secret.instanceId }];
  assert.equal(
    visibleHistoryCard(s, secret.instanceId)?.instanceId,
    secret.instanceId,
  );
});
test("health emphasis only follows new confirmed damage/healing, no reconnect replay", () => {
  const a = fixture(),
    b = structuredClone(a);
  b.events = [
    {
      type: "DAMAGE_DEALT",
      amount: 0,
      target: { type: "PLAYER", playerId: b.players[0].id },
    },
  ];
  assert.deepEqual(healthAttentionPlans(a, b), []);
  b.events[0].amount = 2;
  assert.deepEqual(healthAttentionPlans(a, b), [b.players[0].id]);
  assert.deepEqual(healthAttentionPlans(b, b), []);
  b.events = [];
  b.players[1].presentationHealing = { sequence: 1, total: 2 };
  assert.deepEqual(healthAttentionPlans(a, b), [b.players[1].id]);
  b.gameId = "new";
  assert.deepEqual(healthAttentionPlans(a, b), []);
});

test("confirmed healing logs use actual totals, link only one proven action and never infer max HP buffs", () => {
  const a = fixture(),
    b = structuredClone(a);
  b.players[0].health += 3;
  b.players[0].maxHealth += 3;
  assert.deepEqual(observedChampionHealing(a, b), []);
  b.players[0].presentationHealing = { sequence: 1, total: 2 };
  b.events = [{ type: "CHAMPION_ABILITY_USED", playerId: b.players[0].id }];
  assert.deepEqual(observedChampionHealing(a, b), [
    {
      id: `${b.players[0].id}:1`,
      playerId: b.players[0].id,
      amount: 2,
      applications: 1,
      actionIndex: 0,
    },
  ]);
  assert.deepEqual(observedChampionHealing(b, b), []);
  b.events.push({ type: "CARD_PLAYED" });
  assert.equal(observedChampionHealing(a, b)[0].actionIndex, null);
});

test('forecast includes current public damage limits and explains an allied pre-attack combo without running it',()=>{
 const s=fixture(),a=s.players[0].board[0]!,b=s.players[1].board[0]!;
 b.abilities=[{trigger:'BEFORE_DAMAGE',incomingDamageLimitPerTurn:2,effects:[]}];
 s.events=[{type:'TURN_STARTED',playerId:s.players[0].id},{type:'DAMAGE_DEALT',amount:1,target:{type:'CARD',cardInstanceId:b.instanceId}}];
 const combo={...a,instanceId:'combo-helper',abilities:[{trigger:'OTHER_ALLY_ATTACK' as const,effects:[]}]};s.players[0].board[1]=combo;
 const before=JSON.stringify(s),x=basicAttackForecast(s,a.instanceId,b.instanceId)!;assert.equal(x.damage,1);assert.ok(x.warnings.some(w=>w.includes('콤보')));assert.equal(JSON.stringify(s),before);
});
test('forecast includes a visible damage aura and does not promise damage to a protected champion',()=>{
 const s=fixture(),a=s.players[0].board[0]!,b=s.players[1].board[0]!;
 s.players[0].board[1]={...a,instanceId:'damage-aura',abilities:[{trigger:'ENTER_FIELD',effects:[{type:'STRUCTURED',action:'ADD_DAMAGE_MODIFIER',values:{damageSource:'ALL',amount:2}}]}]};
 assert.equal(basicAttackForecast(s,a.instanceId,b.instanceId)?.damage,7);
 b.isChampionToken=true;assert.equal(basicAttackForecast(s,a.instanceId,s.players[1].id)?.damage,0);assert.match(basicAttackForecast(s,a.instanceId,s.players[1].id)?.blockedReason??'',/보호/);
});
