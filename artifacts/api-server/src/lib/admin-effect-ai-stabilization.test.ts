import assert from "node:assert/strict";
import test from "node:test";

import {
  EffectAiError,
  canonicalizeGeneratedEffectDraft,
  generateEffectDraft,
  type EffectAiContext,
} from "./admin-effect-ai";

const context: EffectAiContext = {
  sourceType: "CARD",
  sourceId: "card-a",
  cardType: "WRESTLER",
};

const catalog = [
  { id: "card-a", name: "현재 카드", cardType: "WRESTLER" as const, isToken: false, isChampionToken: false },
];

const structuredTarget = {
  zone: "BOARD" as const,
  owner: "ENEMY" as const,
  selection: "ALL" as const,
  count: 20,
};

const fixtures: Array<{ name: string; raw: unknown; execution: "STRUCTURED_EFFECTS_V1" | "SCRIPT_V1" }> = [
  {
    name: "A simple BUFF",
    execution: "STRUCTURED_EFFECTS_V1",
    raw: {
      status: "READY",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "BUFF",
        target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
        values: { attack: 2, health: 2 },
      }],
      keywords: [],
    },
  },
  {
    name: "B selection and DAMAGE",
    execution: "SCRIPT_V1",
    raw: {
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "ENTER_FIELD",
        steps: [
          { type: "SELECT", id: "targets", target: structuredTarget },
          { type: "EFFECT", effect: { action: "DAMAGE", target: { resultId: "targets", zone: "BOARD", owner: "ENEMY", selection: "ALL", count: 20 }, values: { amount: 2 } } },
        ],
      }],
      keywords: [],
    },
  },
  {
    name: "C conditional IF ELSE",
    execution: "SCRIPT_V1",
    raw: {
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "ENTER_FIELD",
        steps: [{
          type: "IF",
          condition: {
            left: { kind: "CONSTANT", value: 1 },
            compare: "EQ",
            right: { kind: "CONSTANT", value: 1 },
          },
          then: [{ type: "EFFECT", effect: { action: "BUFF", target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 }, values: { attack: 1, health: 1 } } }],
          else: [{ type: "EFFECT", effect: { action: "HEAL", target: { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 }, values: { amount: 1 } } }],
        }],
      }],
      keywords: [],
    },
  },
  {
    name: "D PLAYER_CHOICE",
    execution: "SCRIPT_V1",
    raw: {
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "ACTIVE",
        steps: [{
          type: "EFFECT",
          effect: {
            action: "STUN",
            target: { zone: "BOARD", owner: "ENEMY", selection: "PLAYER_CHOICE", count: 1 },
          },
        }],
      }],
      keywords: [],
    },
  },
  {
    name: "E result reference",
    execution: "SCRIPT_V1",
    raw: {
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "ENTER_FIELD",
        steps: [
          { type: "SELECT", id: "revived", target: { zone: "GRAVEYARD", owner: "SELF", selection: "RANDOM", count: 1, randomScope: "STANDARD" } },
          { type: "EFFECT", effect: { action: "REVIVE", target: { resultId: "revived", zone: "GRAVEYARD", owner: "SELF", selection: "ALL", count: 1 } } },
        ],
      }],
      keywords: [],
    },
  },
  {
    name: "F event-history aggregate",
    execution: "SCRIPT_V1",
    raw: {
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "ENTER_FIELD",
        steps: [
          { type: "HISTORY", id: "damageTaken", query: { scope: "CURRENT_TURN", eventType: "DAMAGE_DEALT", owner: "SELF", operation: "COUNT" } },
          { type: "EFFECT", effect: { action: "DAMAGE", target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 }, values: { amountExpression: { kind: "RESULT_VALUE", resultId: "damageTaken" } } } },
        ],
      }],
      keywords: [],
    },
  },
  {
    name: "G delayed effect",
    execution: "STRUCTURED_EFFECTS_V1",
    raw: {
      status: "READY",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "REGISTER_DELAYED",
        values: {
          delayed: {
            kind: "N_MATCHING_EVENTS",
            count: 1,
            eventTrigger: "CARD_RETIRED",
            effect: { action: "BUFF", target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 }, values: { attack: 2, health: 2 } },
          },
        },
      }],
      keywords: [],
    },
  },
  {
    name: "H listener",
    execution: "STRUCTURED_EFFECTS_V1",
    raw: {
      status: "READY",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "REGISTER_LISTENER",
        values: {
          listener: {
            trigger: "CARD_PLAYED",
            owner: "SELF",
            cardType: "WRESTLER",
            uses: 1,
            effect: { action: "DAMAGE", target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 }, values: { amount: 1 } },
          },
        },
      }],
      keywords: [],
    },
  },
  {
    name: "I REVIVE",
    execution: "SCRIPT_V1",
    raw: {
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "LEAVE_FIELD",
        steps: [{
          type: "EFFECT",
          effect: { action: "REVIVE", target: { zone: "GRAVEYARD", owner: "SELF", selection: "RANDOM", count: 1, randomScope: "STANDARD" } },
        }],
      }],
      keywords: [],
    },
  },
  {
    name: "J prevention and replacement",
    execution: "STRUCTURED_EFFECTS_V1",
    raw: {
      status: "READY",
      effects: [{
        trigger: "BEFORE_RETIRE",
        action: "PREVENT_RETIRE",
        values: { prevention: { uses: 1, setHealth: 1 } },
      }],
      keywords: [],
    },
  },
];

test("A-J fixtures use one schema through validation, canonicalization, plan, and runtime payload", () => {
  for (const fixture of fixtures) {
    const result = canonicalizeGeneratedEffectDraft(fixture.raw, context, catalog);
    assert.equal(result.status, "READY", fixture.name);
    if (result.status !== "READY") continue;
    assert.equal(result.effectId, fixture.execution, fixture.name);
    assert.deepEqual(result.sourceContext, context, fixture.name);
    assert.ok(!JSON.stringify(result.effectConfig).includes("sourceId"), fixture.name);
    assert.equal(result.mechanicPlan.execution, fixture.execution, fixture.name);
  }
});

test("sourceId spoofing is rejected and cannot redirect the trusted source", () => {
  assert.throws(
    () => canonicalizeGeneratedEffectDraft({
      status: "READY",
      sourceId: "card-b",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "BUFF",
        target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
        values: { attack: 1, health: 1 },
      }],
      keywords: [],
    }, context, catalog),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT" &&
      error.message.includes("sourceId"),
  );
});

test("sourceId may be omitted because the server context is canonical", () => {
  const result = canonicalizeGeneratedEffectDraft({
    status: "READY",
    effects: [{
      trigger: "ENTER_FIELD",
      action: "DAMAGE",
      target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
      values: { amount: 2 },
    }],
    keywords: [],
  }, context, catalog);
  assert.equal(result.status, "READY");
  if (result.status === "READY") assert.deepEqual(result.sourceContext, context);
});

test("malformed EFFECT wrappers fail instead of being guessed", () => {
  assert.throws(
    () => canonicalizeGeneratedEffectDraft({
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "ENTER_FIELD",
        steps: [{ type: "EFFECT", action: "DAMAGE", target: structuredTarget }],
      }],
      keywords: [],
    }, context, catalog),
    (error: unknown) => error instanceof EffectAiError,
  );
});

test("one Generate request makes one provider call and does not retry invalid output", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  let calls = 0;
  process.env.OPENAI_API_KEY = "test-provider-key";
  process.env.OPENAI_BASE_URL = "https://provider.test/v1";
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ status: "READY", effects: [{ action: "DAMAGE" }], keywords: [] }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await assert.rejects(
      generateEffectDraft("등장: 잘못된 구조", context, catalog),
      (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT",
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
  }
});