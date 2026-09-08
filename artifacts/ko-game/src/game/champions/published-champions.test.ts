import assert from "node:assert/strict";
import test from "node:test";
import { championRecordToDefinition } from "./published-champions";

test("DB 챔피언을 직렬화 가능한 매치 스냅샷 정의로 변환한다", () => {
  const definition = championRecordToDefinition({
    id: "champion-a", name: "챔피언 A", description: "설명", imageAssetId: null,
    imageUrl: null, maxHealth: 20, abilityName: "지원", abilityCost: 2,
    abilityText: "강화", abilityEffects: { effects: [{
      action: "BUFF", target: { zone: "HAND", owner: "SELF", selection: "RANDOM", count: 1 },
      values: { attack: 1, health: 1 },
    }] }, hasQuest: true, questName: "생성", questText: "선수 카드를 7회 생성합니다.",
    questCondition: { event: "CARD_GENERATED", required: 7 }, questProgressRequired: 7,
    questRewardText: "능력을 강화합니다.",
    questRewardEffects: { effects: [{ action: "UPGRADE_CHAMPION_ABILITY" }] },
    upgradedAbilityName: "강화 지원", upgradedAbilityCost: 1,
    upgradedAbilityText: "더 강화", upgradedAbilityEffects: { effects: [{ action: "DRAW", values: { amount: 1 } }] },
    championTokenDefinitionId: null, status: "PUBLISHED", version: 3,
  });
  assert.equal(definition.maxHealth, 20);
  assert.equal(definition.version, 3);
  assert.equal(definition.ability.effects[0]?.type, "STRUCTURED");
  assert.equal(definition.quest?.trackedEvent, "CARD_GENERATED");
  assert.deepEqual(definition.quest?.reward, { type: "UPGRADE_ABILITY" });
  assert.equal(definition.upgradedAbility?.name, "강화 지원");
  assert.equal(definition.upgradedAbility?.cost, 1);
});

test("직접 전개는 연결된 명시적 Champion Token ID만 사용한다", () => {
  const definition = championRecordToDefinition({
    id: "champion-b", name: "B", description: "", imageAssetId: null, imageUrl: null,
    maxHealth: 20, abilityName: "출전", abilityCost: 2, abilityText: "직접 전개",
    abilityEffects: { effects: [{ action: "DIRECT_DEPLOY_CHAMPION_TOKEN" }] },
    hasQuest: false, questName: null, questText: null, questCondition: null,
    questProgressRequired: null, questRewardText: null, questRewardEffects: null,
    upgradedAbilityName: null, upgradedAbilityCost: null, upgradedAbilityText: null,
    upgradedAbilityEffects: null, championTokenDefinitionId: "explicit-token",
    status: "PUBLISHED", version: 1,
  });
  assert.deepEqual(definition.ability.effects, [{
    type: "DIRECT_DEPLOY_CHAMPION_TOKEN", cardDefinitionId: "explicit-token",
  }]);
});