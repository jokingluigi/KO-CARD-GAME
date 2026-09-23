import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeGeneratedEffectDraft } from "./admin-effect-ai";
import type { CardReferenceCandidate } from "./structured-effects";

const context = { sourceType: "CARD" as const, cardType: "WRESTLER" as const };
const catalog: CardReferenceCandidate[] = [];

function ready(raw: unknown) {
  const result = canonicalizeGeneratedEffectDraft(raw, context, catalog);
  assert.equal(result.status, "READY");
  if (result.status !== "READY") throw new Error("fixture did not compile");
  return result;
}

test("D regression fixture keeps adjacent summon and SAME_TARGET taunt semantics", () => {
  const result = ready({
    status: "READY",
    effects: [
      {
        trigger: "ENTER_FIELD",
        action: "SUMMON",
        target: {
          zone: "BOARD",
          owner: "SELF",
          cardType: "WRESTLER",
          selection: "ADJACENT_EMPTY_SLOTS",
          count: 2,
          randomScope: "STANDARD",
        },
      },
      {
        trigger: "ENTER_FIELD",
        action: "ADD_KEYWORD",
        target: {
          zone: "BOARD",
          owner: "SELF",
          cardType: "WRESTLER",
          selection: "SAME_TARGET",
          count: 2,
        },
        values: { keyword: "TAUNT" },
      },
    ],
    keywords: [],
  });
  assert.equal(result.effectId, "STRUCTURED_EFFECTS_V1");
  assert.deepEqual(result.mechanicPlan.actions, ["SUMMON", "ADD_KEYWORD"]);
  assert.ok(result.mechanicPlan.resultReferences.includes("PREVIOUS_RESULT"));
});

test("F regression fixture keeps next-owner-turn revive and follow-up attack buff", () => {
  const result = ready({
    status: "READY",
    effects: [{
      trigger: "LEAVE_FIELD",
      action: "REGISTER_DELAYED",
      values: {
        delayed: {
          kind: "OWNER_NEXT_TURN_START",
          effect: {
            action: "REVIVE",
            target: {
              zone: "GRAVEYARD",
              owner: "SELF",
              cardType: "WRESTLER",
              selection: "RANDOM",
              count: 1,
              randomScope: "STANDARD",
            },
          },
          followUpEffects: [{
            action: "BUFF",
            target: { zone: "BOARD", owner: "SELF", selection: "SAME_TARGET", count: 1 },
            values: { attack: 2, health: 0 },
          }],
        },
      },
    }],
    keywords: [],
  });
  assert.equal(result.effectId, "STRUCTURED_EFFECTS_V1");
  assert.deepEqual(result.mechanicPlan.actions, ["REGISTER_DELAYED"]);
  assert.ok(result.mechanicPlan.memory.includes("DELAYED_EFFECT"));
  assert.ok(result.mechanicPlan.schedule.includes("OWNER_NEXT_TURN_START"));
});

test("H regression fixture keeps one-use first-damage prevention", () => {
  const result = ready({
    status: "READY",
    effects: [{
      trigger: "BEFORE_DAMAGE",
      action: "PREVENT_DAMAGE",
      values: { prevention: { uses: 1 } },
    }],
    keywords: [],
  });
  assert.equal(result.effectId, "STRUCTURED_EFFECTS_V1");
  assert.deepEqual(result.mechanicPlan.actions, ["PREVENT_DAMAGE"]);
  assert.ok(result.mechanicPlan.memory.includes("PREVENTION"));
});

test("A/B/G/J regression fixtures remain valid without new provider calls", () => {
  const fixtures = [
    {
      status: "READY",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "DAMAGE",
        target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
        values: { amount: 2 },
      }],
      keywords: [],
    },
    {
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "LEAVE_FIELD",
        steps: [
          {
            type: "SELECT",
            id: "zombies",
            target: {
              zone: "GRAVEYARD",
              owner: "SELF",
              cardType: "WRESTLER",
              filter: { tagsAny: ["ZOMBIE"] },
              selection: "ALL",
              count: 20,
            },
          },
          { type: "AGGREGATE", id: "zombieCount", selectionId: "zombies", operation: "COUNT" },
          {
            type: "EFFECT",
            effect: {
              action: "HEAL",
              target: { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 },
              values: { amountExpression: { kind: "RESULT_VALUE", resultId: "zombieCount" } },
            },
          },
        ],
      }],
      keywords: [],
    },
    {
      status: "READY",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "QUEUE_EFFECT",
        values: {
          queuedTrigger: "NEXT_ALLY_WRESTLER_PLAYED",
          queuedEffect: {
            action: "BUFF",
            target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
            values: { attack: 2, health: 2 },
          },
        },
      }],
      keywords: [],
    },
    {
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "LEAVE_FIELD",
        steps: [
          {
            type: "HISTORY",
            id: "retiredCount",
            query: { scope: "CURRENT_TURN", eventType: "CARD_RETIRED", cardType: "WRESTLER", operation: "COUNT" },
          },
          {
            type: "EFFECT",
            effect: {
              action: "DAMAGE",
              target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
              values: { amountExpression: { kind: "RESULT_VALUE", resultId: "retiredCount" } },
            },
          },
        ],
      }],
      keywords: [],
    },
  ];

  for (const fixture of fixtures) {
    const result = ready(fixture);
    assert.equal(result.status, "READY");
  }
});