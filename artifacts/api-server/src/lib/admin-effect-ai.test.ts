import assert from "node:assert/strict";
import test from "node:test";

import { EffectAiError, buildMechanicPlan, generateEffectDraft, validateGeneratedEffectDraft } from "./admin-effect-ai";

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

test("strict action/target/value fixtures are rejected with a concrete path", () => {
  const context = { sourceType: "CARD" as const, cardType: "WRESTLER" as const };
  const target = { zone: "BOARD", owner: "SELF", selection: "ALL", count: 20 };
  const fixtures = [
    { name: "target.filters", effect: { trigger: "ENTER_FIELD", action: "BUFF", target: { ...target, filters: {} }, values: { attack: 1, health: 1 } } },
    { name: "target.tagFilters", effect: { trigger: "ENTER_FIELD", action: "BUFF", target: { ...target, tagFilters: {} }, values: { attack: 1, health: 1 } } },
    { name: "target.filter.tag", effect: { trigger: "ENTER_FIELD", action: "BUFF", target: { ...target, filter: { tag: "x" } }, values: { attack: 1, health: 1 } } },
    { name: "target.race", effect: { trigger: "ENTER_FIELD", action: "BUFF", target: { ...target, race: "x" }, values: { attack: 1, health: 1 } } },
    { name: "ADD_GOLD + target", effect: { trigger: "ENTER_FIELD", action: "ADD_GOLD", target, values: { amount: 1 } } },
    { name: "DRAW + tag filter", effect: { trigger: "ENTER_FIELD", action: "DRAW", target: { ...target, filter: { tagsAny: ["x"] } }, values: { amount: 1 } } },
    { name: "BUFF without target", effect: { trigger: "ENTER_FIELD", action: "BUFF", values: { attack: 1, health: 1 } } },
    { name: "DAMAGE without amount", effect: { trigger: "ENTER_FIELD", action: "DAMAGE", target } },
    { name: "ADD_KEYWORD without keyword", effect: { trigger: "ENTER_FIELD", action: "ADD_KEYWORD", target } },
    { name: "DESTROY with stat values", effect: { trigger: "ENTER_FIELD", action: "DESTROY", target, values: { attack: 1 } } },
    { name: "STEAL bad owner/zone", effect: { trigger: "ENTER_FIELD", action: "STEAL", target: { ...target, zone: "BOARD" } } },
  ];
  for (const fixture of fixtures) {
    assert.throws(
      () => validateGeneratedEffectDraft({ status: "READY", effects: [fixture.effect], keywords: [] }, context, []),
      (error: unknown) => error instanceof EffectAiError && error.message.includes("effects[0]"),
      fixture.name,
    );
  }
});

test("all strict SCRIPT_V1 rejection fixtures stay out of READY", () => {
  const context = { sourceType: "CARD" as const, cardType: "WRESTLER" as const };
  const validScript = [{
    version: "SCRIPT_V1",
    trigger: "SELF_ATTACK",
    steps: [
      {
        type: "SELECT",
        id: "selectedCard",
        target: { zone: "BOARD", owner: "ENEMY", selection: "PLAYER_CHOICE", count: 1 },
      },
      { type: "EFFECT", effect: { action: "STEAL", target: { resultId: "selectedCard" } } },
    ],
  }];
  const draft = (scripts: unknown[], extra: Record<string, unknown> = {}) => ({
    status: "READY",
    effectId: "SCRIPT_V1",
    scripts,
    keywords: [],
    ...extra,
  });
  const fixtures = [
    { name: "script without version", scripts: [{ ...validScript[0], version: undefined }] },
    { name: "script bad version", scripts: [{ ...validScript[0], version: "SCRIPT_V2" }] },
    { name: "unknown step", scripts: [{ ...validScript[0], steps: [{ type: "RUN" }] }] },
    { name: "duplicate step id", scripts: [{ ...validScript[0], steps: [{ type: "SELECT", id: "same", target: { zone: "BOARD", owner: "ENEMY", selection: "ALL", count: 1 } }, { type: "SELECT", id: "same", target: { zone: "BOARD", owner: "ENEMY", selection: "ALL", count: 1 } }] }] },
    { name: "bad resultId", scripts: [{ ...validScript[0], steps: [{ type: "EFFECT", effect: { action: "STEAL", target: { resultId: "missing" } } }] }] },
    { name: "unknown action", scripts: [{ ...validScript[0], steps: [{ type: "EFFECT", effect: { action: "HACK" } }] }] },
    { name: "arbitrary code", scripts: [{ ...validScript[0], steps: [{ type: "EFFECT", effect: { action: "DRAW", values: { amount: 1, code: "return state" } } }] }] },
    { name: "source spoof", scripts: validScript, extra: { sourceId: "spoofed" } },
    { name: "forward result reference", scripts: [{ ...validScript[0], steps: [{ type: "EFFECT", effect: { action: "STEAL", target: { resultId: "later" } } }, { type: "SELECT", id: "later", target: { zone: "BOARD", owner: "ENEMY", selection: "ALL", count: 1 } }] }] },
    { name: "malformed nested script", scripts: [{ ...validScript[0], steps: [{ type: "IF", condition: { left: { kind: "CONSTANT", value: 1 }, compare: "EQ", right: { kind: "CONSTANT", value: 1 } }, then: {} }] }] },
  ];
  for (const fixture of fixtures) {
    assert.throws(
      () => validateGeneratedEffectDraft(draft(fixture.scripts, fixture.extra), context, []),
      EffectAiError,
      fixture.name,
    );
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

test("검증된 실행 AST에서 trigger, selection, memory, action plan을 서버가 재구성한다", () => {
  const result = buildMechanicPlan("STRUCTURED_EFFECTS_V1", [{
    trigger: "ENTER_FIELD",
    action: "QUEUE_EFFECT",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
    values: {
      queuedTrigger: "NEXT_ALLY_WRESTLER_PLAYED",
      queuedEffect: {
        action: "BUFF",
        target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
        values: { attack: 2, health: 2 },
      },
    },
  }], []);

  assert.deepEqual(result.triggers, ["ENTER_FIELD"]);
  assert.deepEqual(result.actions, ["QUEUE_EFFECT"]);
  assert.deepEqual(result.memory, ["REGISTER NEXT_ALLY_WRESTLER_PLAYED"]);
  assert.deepEqual(result.schedule, ["NEXT_MATCHING_EVENT"]);
  assert.equal(result.execution, "STRUCTURED_EFFECTS_V1");
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

test("provider가 clarification을 반환해도 공유 analyzer가 명확한 문장을 실행 효과로 컴파일한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = "test-provider-key";
  process.env.OPENAI_BASE_URL = "https://provider.test/v1";
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      status: "NEEDS_CLARIFICATION",
      questions: ["대상을 지정해 주세요."],
    }) } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    const result = await generateEffectDraft(
      "등장: 적 챔피언에게 2 피해를 줍니다.",
      { sourceType: "CARD", cardType: "WRESTLER" },
      [],
    );
    assert.equal(result.status, "READY");
    if (result.status === "READY") {
      assert.equal(result.effects[0]?.action, "DAMAGE");
      assert.equal(result.effects[0]?.values?.amount, 2);
      assert.deepEqual(result.mechanicPlan.triggers, ["ENTER_FIELD"]);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
  }
});