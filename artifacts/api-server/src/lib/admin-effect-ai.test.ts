import assert from "node:assert/strict";
import test from "node:test";

import { EffectAiError, buildMechanicPlan, generateEffectDraft, validateGeneratedEffectDraft } from "./admin-effect-ai";
import { generateCard } from "../../../ko-game/src/game/cards/generation";
import { createInitialGameState } from "../../../ko-game/src/game/engine/create-initial-game-state";
import { enterField } from "../../../ko-game/src/game/engine/enter-field";

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

test("AI 효과 제작기는 독립 타격을 여러 번 실행하는 새 조합 규칙을 저장한다", () => {
  const makeDraft = (count: unknown, effect: unknown = {
    action: "DAMAGE",
    target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
    values: { amount: 1 },
  }) => ({
    status: "READY", effectId: "SCRIPT_V1", keywords: [],
    scripts: [{ version: "SCRIPT_V1", trigger: "ENTER_FIELD", steps: [
      { type: "REPEAT", count, steps: [{ type: "EFFECT", effect }] },
    ] }],
  });
  const context = { sourceType: "CARD" as const, cardType: "WRESTLER" as const };
  const validated = validateGeneratedEffectDraft(makeDraft({ kind: "CONSTANT", value: 3 }), context, []);
  assert.equal(validated.status, "READY");
  assert.equal(validated.effectId, "SCRIPT_V1");
  assert.ok(validated.status === "READY" && validated.mechanicPlan.actions.includes("DAMAGE"));
  assert.throws(() => validateGeneratedEffectDraft(makeDraft({ kind: "CONSTANT", value: 100 }), context, []),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT");
  assert.throws(() => validateGeneratedEffectDraft(makeDraft({ kind: "CONSTANT", value: 3 }, {
    action: "DAMAGE", target: { zone: "BOARD", owner: "ENEMY", selection: "PLAYER_CHOICE", count: 1 }, values: { amount: 1 },
  }), context, []), (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT");
});

test("AI 효과 제작기는 동적 수치의 곱셈은 받되 임의 코드와 깊은 계산은 거부한다", () => {
  const count = (value: unknown) => ({ status: "READY", effectId: "SCRIPT_V1", scripts: [{
    version: "SCRIPT_V1", trigger: "ENTER_FIELD", steps: [
      { type: "SELECT", id: "allies", target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 20 } },
      { type: "AGGREGATE", id: "count", selectionId: "allies", operation: "COUNT" },
      { type: "EFFECT", effect: {
        action: "DAMAGE", target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
        values: { amountExpression: value },
      } },
    ],
  }], keywords: [] });
  const context = { sourceType: "CARD" as const, cardType: "WRESTLER" as const };
  const timesTwo = { kind: "MULTIPLY", left: { kind: "RESULT_VALUE", resultId: "count" }, right: { kind: "CONSTANT", value: 2 } };
  assert.equal(validateGeneratedEffectDraft(count(timesTwo), context, []).status, "READY");
  assert.throws(() => validateGeneratedEffectDraft(count({
    kind: "MULTIPLY", left: { kind: "RESULT_VALUE", resultId: "missing" }, right: { kind: "CONSTANT", value: 2 },
  }), context, []), (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT");
  assert.throws(() => validateGeneratedEffectDraft(count({ ...timesTwo, code: "alert(1)" }), context, []),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT");
  let tooDeep: unknown = { kind: "CONSTANT", value: 1 };
  for (let i = 0; i < 6; i += 1) tooDeep = { kind: "ADD", left: tooDeep, right: { kind: "CONSTANT", value: 1 } };
  assert.throws(() => validateGeneratedEffectDraft(count(tooDeep), context, []),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT");
});

test("거친 자연어를 AI가 반복 규칙으로 컴파일하면 그 초안이 즉시 경기 엔진에서 실행된다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = "test-provider-key";
  process.env.OPENAI_BASE_URL = "https://provider.test/v1";
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    status: "READY", effectId: "SCRIPT_V1", keywords: [], scripts: [{
      version: "SCRIPT_V1", trigger: "ENTER_FIELD", steps: [
        { type: "REPEAT", count: { kind: "CONSTANT", value: 3 }, steps: [{ type: "EFFECT", effect: {
          action: "DAMAGE", target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 }, values: { amount: 1 },
        } }] },
      ],
    }], analysis: { normalizedMeaning: "등장 시 적 챔피언에게 1 피해를 세 번 준다.", confidence: 0.95, ambiguities: [] },
  }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const draft = await generateEffectDraft("등장: 적 챔피언한테 1뎀 세번 각각", { sourceType: "CARD", cardType: "WRESTLER" }, []);
    assert.equal(draft.status, "READY");
    assert.equal(draft.effectId, "SCRIPT_V1");
    const script = draft.scripts[0]!;
    const source = generateCard({
      id: "live-compiled-effect", name: "live-compiled-effect", cardType: "WRESTLER", cost: 1, attack: 1, health: 2,
      rulesText: "", isToken: false, isChampionToken: false, keywords: [],
      abilities: [{ trigger: "ENTER_FIELD", effects: [{ type: "SCRIPT", script }] }],
    }, { instanceId: "compiled-source", playerId: "player-1", source: { type: "PLAYER", playerId: "player-1" }, reason: "TEST" }).card;
    const state = createInitialGameState();
    const after = enterField(state, "player-1", source, 0);
    assert.equal(after.players[1]!.health, state.players[1]!.health - 3);
    assert.equal(after.events.filter((event) => event.type === "DAMAGE_DEALT").length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
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
  const diagnostics: Array<Record<string, unknown>> = [];

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
            effectId: "STRUCTURED_EFFECTS_V1",
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
            analysis: {
              normalizedMeaning: "On entry, summon two adjacent wrestlers and grant taunt.",
              confidence: 0.98,
              trigger: "ENTER_FIELD",
              target: "two adjacent allied wrestler slots",
              action: "summon and grant taunt",
              triggerIntent: ["ENTER_FIELD"],
              ambiguities: [],
            },
          }),
        },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await generateEffectDraft(
      exactText,
      { sourceType: "CARD", cardType: "WRESTLER" },
      [],
      { requestId: "safe-test-request-id", onDiagnostic: (entry) => diagnostics.push(entry) },
    );
    assert.equal(result.status, "READY");
    assert.equal(result.effects[0]?.target?.selection, "ADJACENT_EMPTY_SLOTS");
    assert.equal(result.effects[1]?.target?.selection, "SAME_TARGET");
    assert.equal(result.effects[1]?.values?.keyword, "TAUNT");
    assert.equal(result.interpretation?.trigger, "ENTER_FIELD");
    assert.deepEqual(result.effectConfig, { effects: result.effects });
    assert.equal(JSON.stringify(result.effectConfig).includes("interpretation"), false);
    assert.equal(providerCalls, 1);
    assert.equal(diagnostics[0]?.requestId, "safe-test-request-id");
    assert.deepEqual(diagnostics[0]?.topLevelKeys, ["analysis", "effectId", "effects", "keywords", "status"]);
    assert.equal(JSON.stringify(diagnostics).includes(exactText), false);
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

test("SCRIPT_V1 provider metadata is accepted but excluded from the executable config", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = "test-provider-key";
  process.env.OPENAI_BASE_URL = "https://provider.test/v1";
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      status: "READY",
      effectId: "SCRIPT_V1",
      scripts: [{
        version: "SCRIPT_V1",
        trigger: "ENTER_FIELD",
        steps: [{
          type: "EFFECT",
          effect: {
            action: "DAMAGE",
            target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
            values: { amount: 2 },
          },
        }],
      }],
      keywords: [],
      analysis: {
        trigger: "ENTER_FIELD",
        target: "enemy champion",
        action: "deal two damage",
        normalizedMeaning: "Deal two damage to the enemy champion.",
        confidence: 0.9,
        ambiguities: [],
      },
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
      assert.equal(result.effectId, "SCRIPT_V1");
      assert.equal(result.interpretation?.action, "deal two damage");
      assert.deepEqual(result.effectConfig, { scripts: result.scripts });
      assert.equal(JSON.stringify(result.effectConfig).includes("analysis"), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
  }
});

test("metadata and executable schemas remain independently strict", () => {
  const context = { sourceType: "CARD" as const, cardType: "WRESTLER" as const };
  const validEffect = {
    trigger: "ENTER_FIELD",
    action: "DAMAGE",
    target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
    values: { amount: 2 },
  };
  assert.throws(
    () => validateGeneratedEffectDraft({
      status: "READY",
      effects: [validEffect],
      keywords: [],
      analysis: { trigger: "ENTER_FIELD", undocumentedSummary: "not allowed" },
    }, context, []),
    (error: unknown) => error instanceof EffectAiError && error.code === "MALFORMED_RESPONSE",
  );
  assert.throws(
    () => validateGeneratedEffectDraft({
      status: "READY",
      effects: [{ ...validEffect, analysis: { trigger: "ENTER_FIELD" } }],
      keywords: [],
      analysis: { trigger: "ENTER_FIELD" },
    }, context, []),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT",
  );
  assert.throws(
    () => validateGeneratedEffectDraft({
      status: "READY",
      effects: [validEffect],
      keywords: [],
      analysis: { trigger: { execute: "not a summary" } },
    }, context, []),
    (error: unknown) => error instanceof EffectAiError && error.code === "MALFORMED_RESPONSE",
  );
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
