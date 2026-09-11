import assert from "node:assert/strict";
import test from "node:test";
import {
  createChampionFullPrompt,
  dedupeUnsupportedMechanics,
  type ChampionFullPromptData,
} from "./champion-full-prompt";
import { effectLibrary } from "./structured-effects";

function analysis(
  outcome: "supported" | "mechanism_required" | "analysis_failure",
  summary: string,
  unsupportedSegments: string[] = [],
) {
  return {
    status: outcome === "supported" ? "success" as const : "failure" as const,
    outcome,
    effects: [],
    keywords: [],
    unsupportedSegments,
    summaries: [summary],
    ...(outcome === "analysis_failure" ? { reason: "분석기가 이해하지 못했습니다." } : {}),
  };
}

function promptData(overrides: Partial<ChampionFullPromptData> = {}): ChampionFullPromptData {
  const library = effectLibrary();
  return {
    champion: {
      name: "테스트 챔피언",
      hasQuest: false,
      abilityText: "카드 1장을 드로우합니다.",
      abilityEffects: { effects: [] },
    },
    sections: [{
      key: "CHAMPION_ABILITY",
      label: "기본 Champion Ability",
      status: "SUPPORTED",
      sourceText: "카드 1장을 드로우합니다.",
      analysis: analysis("supported", "카드 1장 드로우"),
    }],
    unsupportedParts: [],
    library: {
      actions: library.actions.map((entry) => ({ ...entry })),
      triggers: library.triggers.map((entry) => ({ ...entry })),
      conditions: (library.conditions ?? []).map((entry) => ({ ...entry })),
      targetResolvers: library.targetResolvers.map((entry) => ({ ...entry })),
      valueResolvers: library.valueResolvers.map((entry) => ({ ...entry })),
    },
    ...overrides,
  };
}

test("no-quest Champion prompt does not invent quest fields", () => {
  const prompt = createChampionFullPrompt(promptData());
  assert.ok(prompt.includes('"hasQuest": false'));
  assert.ok(prompt.includes("기본 Champion Ability"));
  assert.ok(!prompt.includes("### Quest Condition"));
  assert.ok(!prompt.includes("### Quest Reward"));
});

test("quest Champion prompt includes condition and reward independently", () => {
  const data = promptData({
    champion: { hasQuest: true, questText: "카드를 3장 냅니다." },
    sections: [
      {
        key: "QUEST_CONDITION",
        label: "Quest Condition",
        status: "SUPPORTED",
        sourceText: "카드를 3장 냅니다.",
        analysis: { ...analysis("supported", "CARD_PLAYED 3") , condition: { event: "CARD_PLAYED", required: 3 } },
      },
      {
        key: "QUEST_REWARD",
        label: "Quest Reward",
        status: "SUPPORTED",
        sourceText: "Champion을 강화합니다.",
        analysis: analysis("supported", "강화"),
      },
    ],
  });
  const prompt = createChampionFullPrompt(data);
  assert.ok(prompt.includes("### Quest Condition"));
  assert.ok(prompt.includes("### Quest Reward"));
  assert.ok(prompt.includes('"required": 3'));
});

test("linked Champion Token data is included without duplicating it into Champion data", () => {
  const prompt = createChampionFullPrompt(promptData({
    champion: { hasQuest: false, championTokenDefinitionId: "token-1" },
    token: {
      id: "token-1",
      name: "연결 토큰",
      cardType: "WRESTLER",
      cost: 0,
      attack: 4,
      health: 6,
      text: "등장: 1 피해를 줍니다.",
      keywords: [],
      effectId: "STRUCTURED_EFFECTS_V1",
      effectConfig: { effects: [{ action: "DAMAGE", amount: 1 }] },
      isToken: true,
      isChampionToken: true,
      status: "PUBLISHED",
    },
  }));
  assert.ok(prompt.includes("연결 토큰"));
  assert.ok(prompt.includes("token-1"));
  assert.ok(prompt.includes("Card Admin의 CardDefinition이 source of truth"));
  assert.ok(prompt.includes("복제하거나 별도로 저장하지 마세요"));
});

test("unsupported mechanics are deduplicated before prompt rendering", () => {
  assert.deepEqual(
    dedupeUnsupportedMechanics(["시간 정지", "시간 정지", "", "  시간 정지  ", "스냅샷 복원"]),
    ["시간 정지", "스냅샷 복원"],
  );
  const prompt = createChampionFullPrompt(promptData({
    unsupportedParts: ["시간 정지", "스냅샷 복원"],
    sections: [{
      key: "CHAMPION_ABILITY",
      label: "기본 Champion Ability",
      status: "NEW_MECHANIC_REQUIRED",
      sourceText: "시간을 멈춥니다.",
      analysis: analysis("mechanism_required", "지원되지 않음", ["시간 정지"]),
    }],
  }));
  assert.equal((prompt.match(/- 시간 정지/g) ?? []).length, 2);
  assert.ok(prompt.includes("같은 unsupported mechanic은 여러 영역에서 반복 구현하지 말고"));
});

test("analysis failure still produces a generic full prompt", () => {
  const prompt = createChampionFullPrompt(promptData({
    sections: [{
      key: "UPGRADED_CHAMPION_ABILITY",
      label: "강화 Champion Ability",
      status: "ANALYSIS_FAILED",
      sourceText: "아직 분석되지 않은 효과입니다.",
      analysis: analysis("analysis_failure", "분석 실패"),
    }],
  }));
  assert.ok(prompt.includes("ANALYSIS_FAILED"));
  assert.ok(prompt.includes("아직 분석되지 않은 효과입니다."));
  assert.ok(prompt.includes("분석 실패 처리"));
  assert.ok(prompt.includes("특정 Champion 이름이나 ID로 분기하지 마세요"));
});

test("a fresh analysis can replace the previous section result deterministically", () => {
  const before = createChampionFullPrompt(promptData({
    sections: [{
      key: "CHAMPION_ABILITY",
      label: "기본 Champion Ability",
      status: "NEW_MECHANIC_REQUIRED",
      sourceText: "새 효과",
      analysis: analysis("mechanism_required", "구 버전 분석"),
    }],
    unsupportedParts: ["구 메커니즘"],
  }));
  const after = createChampionFullPrompt(promptData({
    sections: [{
      key: "CHAMPION_ABILITY",
      label: "기본 Champion Ability",
      status: "SUPPORTED",
      sourceText: "새 효과",
      analysis: analysis("supported", "최신 Registry 분석"),
    }],
  }));
  assert.notEqual(before, after);
  assert.ok(after.includes("최신 Registry 분석"));
  assert.ok(!after.includes("구 메커니즘"));
});