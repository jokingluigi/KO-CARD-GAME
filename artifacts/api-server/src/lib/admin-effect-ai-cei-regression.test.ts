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

test("C regression fixture compiles highest-cost opponent hand selection", () => {
  const result = ready({
    status: "READY",
    effectId: "SCRIPT_V1",
    scripts: [{
      version: "SCRIPT_V1",
      trigger: "SELF_ATTACK",
      steps: [
        {
          type: "SELECT",
          id: "highest",
          target: {
            zone: "HAND",
            owner: "ENEMY",
            selection: "ALL",
            count: 1,
            sort: { stat: "COST", direction: "DESC" },
            take: 1,
          },
        },
        {
          type: "EFFECT",
          effect: {
            action: "INCREASE_COST",
            target: { resultId: "highest", zone: "HAND", owner: "ENEMY", selection: "ALL", count: 1 },
            values: { amount: 2 },
          },
        },
      ],
    }],
    keywords: [],
  });
  assert.equal(result.effectId, "SCRIPT_V1");
  assert.deepEqual(result.mechanicPlan.triggers, ["SELF_ATTACK"]);
  assert.deepEqual(result.mechanicPlan.actions, ["INCREASE_COST"]);
  assert.ok(result.mechanicPlan.resultReferences.includes("TARGET(highest)"));
});

test("E regression fixture compiles a bounded random graveyard revive", () => {
  const result = ready({
    status: "READY",
    effectId: "SCRIPT_V1",
    scripts: [{
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "revived",
          target: {
            zone: "GRAVEYARD",
            owner: "SELF",
            cardType: "WRESTLER",
            filter: { maxCost: 3 },
            selection: "RANDOM",
            count: 1,
            randomScope: "STANDARD",
          },
        },
        {
          type: "EFFECT",
          effect: {
            action: "REVIVE",
            target: { resultId: "revived", zone: "GRAVEYARD", owner: "SELF", cardType: "WRESTLER" },
          },
        },
      ],
    }],
    keywords: [],
  });
  assert.equal(result.effectId, "SCRIPT_V1");
  assert.deepEqual(result.mechanicPlan.triggers, ["ENTER_FIELD"]);
  assert.deepEqual(result.mechanicPlan.actions, ["REVIVE"]);
  assert.ok(result.mechanicPlan.selections.some((selection) => selection.includes("RANDOM")));
});

test("I regression fixture compiles zombie count condition and self buff", () => {
  const result = ready({
    status: "READY",
    effectId: "SCRIPT_V1",
    scripts: [{
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "zombies",
          target: {
            zone: "BOARD",
            owner: "SELF",
            cardType: "WRESTLER",
            filter: { tagsAny: ["ZOMBIE"] },
            selection: "ALL",
            count: 20,
          },
        },
        { type: "AGGREGATE", id: "zombieCount", selectionId: "zombies", operation: "COUNT" },
        {
          type: "IF",
          condition: {
            left: { kind: "RESULT_VALUE", resultId: "zombieCount" },
            compare: "GTE",
            right: { kind: "CONSTANT", value: 3 },
          },
          then: [{
            type: "EFFECT",
            effect: {
              action: "BUFF",
              target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
              values: { attack: 3, health: 3 },
            },
          }],
        },
      ],
    }],
    keywords: [],
  });
  assert.equal(result.effectId, "SCRIPT_V1");
  assert.deepEqual(result.mechanicPlan.triggers, ["ENTER_FIELD"]);
  assert.deepEqual(result.mechanicPlan.actions, ["BUFF"]);
  assert.ok(result.mechanicPlan.conditions.some((condition) => condition.includes("GTE")));
});