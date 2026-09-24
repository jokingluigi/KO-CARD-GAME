import assert from "node:assert/strict";
import test from "node:test";
import {
  EffectAiError,
  generateEffectDraft,
  validateGeneratedEffectDraft,
  type EffectAiContext,
} from "./admin-effect-ai";
import type { CardReferenceCandidate } from "./structured-effects";

const catalog: CardReferenceCandidate[] = [
  { id: "wolf-id", name: "Big Bad Wolf", cardType: "WRESTLER", isToken: false, isChampionToken: false },
  { id: "dragon-id", name: "Silver Dragon", cardType: "WRESTLER", isToken: false, isChampionToken: false },
];

const savedCardContext: EffectAiContext = {
  sourceType: "CARD",
  sourceId: "trusted-card-id",
  sourceName: "Trusted Current Card",
  cardType: "WRESTLER",
  availableTags: ["UNDEAD", "WATER"],
};

async function withProviderStub<T>(
  providerDraft: Record<string, unknown>,
  run: (capture: { calls: number; requestBody?: Record<string, unknown> }) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalIntegratedKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const originalBaseUrl = process.env.OPENAI_BASE_URL;
  const capture: { calls: number; requestBody?: Record<string, unknown> } = { calls: 0 };

  process.env.OPENAI_API_KEY = "compiler-v2-test-provider-key";
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = "https://provider.test/v1";
  globalThis.fetch = async (_input, init) => {
    capture.calls += 1;
    capture.requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(providerDraft) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    return await run(capture);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalIntegratedKey === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = originalIntegratedKey;
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBaseUrl;
  }
}

test("Generate sends one request with relevant catalog context and server-derived audit", async () => {
  const providerDraft = {
    status: "READY",
    effectId: "STRUCTURED_EFFECTS_V1",
    effects: [{
      trigger: "ENTER_FIELD",
      action: "SUMMON",
      values: { definitionRef: { name: "Big Bad Wolf" }, count: 1 },
    }],
    keywords: [],
  };

  await withProviderStub(providerDraft, async (capture) => {
    const result = await generateEffectDraft(
      "등장: 'Big Bad Wolf'를 소환합니다.",
      savedCardContext,
      catalog,
    );

    assert.equal(capture.calls, 1);
    assert.equal(result.status, "READY");
    if (result.status !== "READY") return;
    assert.deepEqual(result.effects[0]?.values?.definitionRef, { id: "wolf-id" });
    assert.deepEqual(result.semanticPlan?.actionIntent, ["SUMMON"]);
    assert.deepEqual(result.semanticPlan?.referenceIntent, ["CARD:wolf-id"]);

    const messages = capture.requestBody?.messages as Array<{ content?: string }> | undefined;
    const prompt = messages?.map((message) => message.content ?? "").join("\n") ?? "";
    assert.match(prompt, /Big Bad Wolf/u);
    assert.doesNotMatch(prompt, /Silver Dragon/u);
    assert.doesNotMatch(prompt, /trusted-card-id/u);
    assert.match(prompt, /Trusted Current Card/u);
    assert.doesNotMatch(prompt, /UNDEAD|WATER/u);
  });
});

test("dynamic stat references are independently validated and described to the provider", async () => {
  const target = { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 };
  const draft = {
    status: "READY",
    effectId: "STRUCTURED_EFFECTS_V1",
    effects: [{
      trigger: "ENTER_FIELD",
      action: "BUFF",
      target,
      values: { attackReference: "HAND_COUNT" },
    }],
    keywords: [],
  };

  const validated = validateGeneratedEffectDraft(draft, savedCardContext, catalog);
  assert.equal(validated.status, "READY");
  if (validated.status === "READY") {
    assert.deepEqual(validated.effects[0]?.values, { attackReference: "HAND_COUNT" });
  }
  assert.throws(
    () => validateGeneratedEffectDraft({
      ...draft,
      effects: [{
        ...draft.effects[0],
        values: { amountReference: "HAND_COUNT", attackReference: "HAND_COUNT" },
      }],
    }, savedCardContext, catalog),
    (error: unknown) => error instanceof EffectAiError &&
      error.code === "INVALID_DRAFT" && /서로 독립된 BUFF 채널/u.test(error.message),
  );

  await withProviderStub(draft, async (capture) => {
    const result = await generateEffectDraft(
      "등장:현재 내 손패에 있는 카드의 수만큼 공격을 +1씩 증가시킵니다.",
      savedCardContext,
      catalog,
    );
    assert.equal(capture.calls, 1);
    assert.equal(result.status, "READY");
    if (result.status === "READY") {
      assert.deepEqual(result.effects[0]?.values, { attackReference: "HAND_COUNT" });
    }

    const messages = capture.requestBody?.messages as Array<{ content?: string }> | undefined;
    const prompt = messages?.map((message) => message.content ?? "").join("\n") ?? "";
    assert.match(prompt, /attackReference는 공격력만/u);
    assert.match(prompt, /healthReference는 체력/u);
    assert.match(prompt, /NEEDS_CLARIFICATION/u);
  });
});

test("20 locally ambiguous intents cannot become READY and each Generate sends exactly one request", async () => {
  const providerDraft = {
    status: "READY",
    effectId: "STRUCTURED_EFFECTS_V1",
    effects: [{
      trigger: "ENTER_FIELD",
      action: "DAMAGE",
      target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
      values: { amount: 2 },
    }],
    keywords: [],
  };
  const ambiguousInputs = [
    "상대 하나 처리",
    "적 선수 하나 처리해",
    "카드 하나 없애",
    "상대 선수 하나 제거",
    "피 올려",
    "체력 좀 높여",
    "공격력 강화",
    "피해를 줘",
    "걔 좀 세게",
    "그 카드 약하게",
    "한놈 가져와",
    "2 올려",
    "손으로 보내",
    "등장하면 강해짐",
    "퇴장하면 적당히 버프",
    "상대 선수 하나",
    "좀비 하나 줘",
    "카드를 어디론가 보내",
    "그 카드에게 뭔가 해",
    "적당히 처리해",
  ];

  await withProviderStub(providerDraft, async (capture) => {
    for (const input of ambiguousInputs) {
      const result = await generateEffectDraft(input, savedCardContext, catalog);
      assert.equal(result.status, "NEEDS_CLARIFICATION", `must not become READY: ${input}`);
    }
    assert.equal(capture.calls, ambiguousInputs.length);
  });
});

test("SCRIPT_V1 tag filters must use the trusted available-tag vocabulary", () => {
  const raw = {
    status: "READY",
    effectId: "SCRIPT_V1",
    scripts: [{
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [{
        type: "EFFECT",
        effect: {
          action: "DAMAGE",
          target: {
            zone: "BOARD",
            owner: "ENEMY",
            selection: "ALL",
            filter: { tagsAny: ["DRAGON"] },
          },
          values: { amount: 1 },
        },
      }],
    }],
    keywords: [],
  };

  assert.throws(
    () => validateGeneratedEffectDraft(raw, { ...savedCardContext, availableTags: ["ZOMBIE"] }, catalog),
    (error: unknown) => error instanceof EffectAiError &&
      error.code === "INVALID_DRAFT" && /DRAGON/u.test(error.message),
  );
});

test("SCRIPT_V1 definition references resolve to IDs and reject ambiguous or mismatched references", () => {
  const makeDraft = (definitionRef: Record<string, string>) => ({
    status: "READY",
    effectId: "SCRIPT_V1",
    scripts: [{
      version: "SCRIPT_V1",
      trigger: "ENTER_FIELD",
      steps: [{
        type: "EFFECT",
        effect: { action: "SUMMON", values: { definitionRef, count: 1 } },
      }],
    }],
    keywords: [],
  });
  const resolved = validateGeneratedEffectDraft(makeDraft({ name: "Big Bad Wolf" }), savedCardContext, catalog);

  assert.equal(resolved.status, "READY");
  if (resolved.status === "READY") {
    const steps = resolved.scripts[0]?.steps ?? [];
    assert.deepEqual(
      (steps[0] as { type: string; effect?: { values?: Record<string, unknown> } }).effect?.values?.definitionRef,
      { id: "wolf-id" },
    );
  }

  assert.throws(
    () => validateGeneratedEffectDraft(
      makeDraft({ name: "Big Bad Wolf" }),
      savedCardContext,
      [...catalog, { ...catalog[0]!, id: "wolf-copy-id" }],
    ),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT" && /모호/u.test(error.message),
  );
  assert.throws(
    () => validateGeneratedEffectDraft(
      makeDraft({ id: "wolf-id", name: "Silver Dragon" }),
      savedCardContext,
      catalog,
    ),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT" && /서로 다른/u.test(error.message),
  );
});

test("structured tag filters also reject tags missing from the trusted catalog", () => {
  const raw = {
    status: "READY",
    effectId: "STRUCTURED_EFFECTS_V1",
    effects: [{
      trigger: "ENTER_FIELD",
      action: "BUFF",
      target: {
        zone: "BOARD",
        owner: "SELF",
        cardType: "WRESTLER",
        selection: "ALL",
        count: 20,
        filter: { tagsAll: ["DRAGON"] },
      },
      values: { attack: 1, health: 1 },
    }],
    keywords: [],
  };

  assert.throws(
    () => validateGeneratedEffectDraft(raw, { ...savedCardContext, availableTags: ["ZOMBIE"] }, catalog),
    (error: unknown) => error instanceof EffectAiError &&
      error.code === "INVALID_DRAFT" && /DRAGON/u.test(error.message),
  );
});