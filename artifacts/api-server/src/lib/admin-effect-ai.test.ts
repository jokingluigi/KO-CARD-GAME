import assert from "node:assert/strict";
import test from "node:test";

import { EffectAiError, generateEffectDraft, validateGeneratedEffectDraft } from "./admin-effect-ai";

const catalog = [
  { id: "card-1", name: "불꽃", cardType: "WRESTLER" as const, isToken: false, isChampionToken: false },
  { id: "card-2", name: "불꽃", cardType: "WRESTLER" as const, isToken: false, isChampionToken: false },
  { id: "token-1", name: "작은 토큰", cardType: "WRESTLER" as const, isToken: true, isChampionToken: false },
];

test("AI 고정 카드 참조는 catalog ID로 canonicalize한다", () => {
  const result = validateGeneratedEffectDraft({
    status: "READY",
    effects: [{
      trigger: "ENTER_FIELD",
      action: "SUMMON",
      values: { definitionRef: { name: "작은 토큰" } },
    }],
    keywords: [],
  }, { sourceType: "CARD", cardType: "WRESTLER" }, catalog);

  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.deepEqual(result.effects[0]?.values?.definitionRef, { id: "token-1" });
  }
});

test("AI가 모호한 카드 이름을 고르면 추측하지 않고 거부한다", () => {
  assert.throws(
    () => validateGeneratedEffectDraft({
      status: "READY",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "SUMMON",
        values: { definitionRef: { name: "불꽃" } },
      }],
      keywords: [],
    }, { sourceType: "CARD", cardType: "WRESTLER" }, catalog),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT" &&
      error.message.includes("모호합니다"),
  );
});

test("Registry에 없는 필드는 AI 초안에 남길 수 없다", () => {
  assert.throws(
    () => validateGeneratedEffectDraft({
      status: "READY",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "DAMAGE",
        target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
        values: { amount: 2 },
        executeSql: "drop table cards",
      }],
      keywords: [],
    }, { sourceType: "CARD", cardType: "WRESTLER" }, catalog),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT",
  );
});

test("AI는 모호한 효과를 clarification 상태로 반환할 수 있다", () => {
  const result = validateGeneratedEffectDraft({
    status: "NEEDS_CLARIFICATION",
    questions: ["피해량은 얼마인가요?"],
  }, { sourceType: "CARD", cardType: "WRESTLER" }, catalog);

  assert.deepEqual(result, {
    status: "NEEDS_CLARIFICATION",
    questions: ["피해량은 얼마인가요?"],
  });
});

test("인접 무작위 선수 소환과 직전 결과 도발 부여 초안은 READY로 검증된다", () => {
  const result = validateGeneratedEffectDraft({
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
  }, { sourceType: "CARD", cardType: "WRESTLER" }, []);

  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.equal(result.effects[0]?.target?.selection, "ADJACENT_EMPTY_SLOTS");
    assert.equal(result.effects[1]?.target?.selection, "SAME_TARGET");
    assert.equal(result.effects[1]?.values?.keyword, "TAUNT");
  }
});

test("SCRIPT_V1은 선택 결과를 집계해 조건부 기존 효과로 변환할 수 있다", () => {
  const result = validateGeneratedEffectDraft({
    status: "READY",
    effectId: "SCRIPT_V1",
    scripts: [{
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [
        {
          type: "SELECT",
          id: "allies",
          target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 20 },
        },
        { type: "AGGREGATE", id: "allyCount", selectionId: "allies", operation: "COUNT" },
        {
          type: "IF",
          condition: {
            left: { kind: "RESULT_VALUE", resultId: "allyCount" },
            compare: "GTE",
            right: { kind: "CONSTANT", value: 2 },
          },
          then: [{
            type: "EFFECT",
            effect: {
              action: "DAMAGE",
              target: { resultId: "allies", owner: "SELF", zone: "BOARD" },
              values: { amountExpression: { kind: "RESULT_VALUE", resultId: "allyCount" } },
            },
          }],
        },
      ],
    }],
    keywords: [],
  }, { sourceType: "CARD", cardType: "WRESTLER" }, []);

  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.equal(result.effectId, "SCRIPT_V1");
    assert.ok("scripts" in result.effectConfig);
    assert.equal(result.effectConfig.scripts.length, 1);
  }
});

test("SCRIPT_V1 rejects executable or unknown fields before save", () => {
  assert.throws(
    () => validateGeneratedEffectDraft({
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "ENTER_FIELD",
        steps: [{
          type: "EFFECT",
          effect: { action: "DRAW", values: { amount: 1, executeSql: "drop table cards" } },
        }],
      }],
      keywords: [],
    }, { sourceType: "CARD", cardType: "WRESTLER" }, []),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT",
  );
});

test("provider stub에서도 exact 문장이 READY draft와 새 capability prompt로 변환된다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalIntegratedKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  const exactText = "등장: 이 카드 양옆의 빈 슬롯에 각각 무작위 선수 카드 1장을 소환하고, 그렇게 소환된 선수들에게 도발을 부여한다.";
  let requestBody: Record<string, unknown> | undefined;
  let providerCalls = 0;

  process.env.OPENAI_API_KEY = "test-provider-key";
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = "https://provider.test/v1";
  globalThis.fetch = async (input, init) => {
    providerCalls += 1;
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
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
          }),
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await generateEffectDraft(exactText, { sourceType: "CARD", cardType: "WRESTLER" }, []);
    assert.equal(result.status, "READY");
    assert.equal(result.effects[0]?.target?.selection, "ADJACENT_EMPTY_SLOTS");
    assert.equal(result.effects[1]?.target?.selection, "SAME_TARGET");
    assert.equal(result.effects[1]?.values?.keyword, "TAUNT");
    assert.equal(providerCalls, 1);
    const systemPrompt = String((requestBody?.messages as Array<{ role: string; content: string }>)[0]?.content);
    const userMessage = String((requestBody?.messages as Array<{ role: string; content: string }>)[1]?.content);
    assert.match(systemPrompt, /ADJACENT_EMPTY_SLOTS/);
    assert.match(systemPrompt, /SAME_TARGET/);
    assert.match(userMessage, new RegExp(exactText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalIntegratedKey === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = originalIntegratedKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
  }
});