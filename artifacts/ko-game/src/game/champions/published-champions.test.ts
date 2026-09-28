import assert from "node:assert/strict";
import test from "node:test";
import { championRecordToDefinition } from "./published-champions";
import { championVoiceLine } from './types';

test('상대 챔피언별 승리 대사는 퀘스트 전후를 구분하고 미설정 상대는 기본 대사로 돌아간다', () => {
  const lines = {
    BEFORE_QUEST: { VICTORY: '기본 승리' },
    AFTER_QUEST: { VICTORY: '기본 각성 승리' },
    MATCHUPS: { rival: {
      BEFORE_QUEST: { VICTORY: '라이벌 상대 승리' },
      AFTER_QUEST: { VICTORY: '각성 후 라이벌 상대 승리' },
    } },
  };
  assert.equal(championVoiceLine(lines, false, 'VICTORY', 'rival'), '라이벌 상대 승리');
  assert.equal(championVoiceLine(lines, true, 'VICTORY', 'rival'), '각성 후 라이벌 상대 승리');
  assert.equal(championVoiceLine(lines, true, 'VICTORY', 'another'), '기본 각성 승리');
});

test('필드 소환 능력은 손패 생성 설정을 필드 소환으로 정규화한다', () => {
  const definition = championRecordToDefinition({
    id: 'calavera', name: '챔피언 라 칼라베라', description: '', imageAssetId: null, imageUrl: null,
    maxHealth: 25, abilityName: '좀비 생성', abilityCost: 2,
    abilityText: "1/1 '좀비'를 필드에 생성합니다.",
    abilityEffects: { effects: [{ action: 'GENERATE', values: { destination: 'HAND', definitionRef: { name: '좀비' } } }] },
    hasQuest: false, questName: null, questText: null, questCondition: null, questProgressRequired: null,
    questRewardText: null, questRewardEffects: null, upgradedAbilityName: null, upgradedAbilityCost: null,
    upgradedAbilityText: null, upgradedAbilityEffects: null, championTokenDefinitionId: null,
    status: 'DRAFT', version: 1,
  });
  assert.equal(definition.ability.effects[0]?.type === 'STRUCTURED' && definition.ability.effects[0].action, 'SUMMON');
});

test('판도라 퀘스트는 다른 카드의 리타이어를 고유 능력 킬로 세지 않는다', () => {
  const definition = championRecordToDefinition({
    id: 'pandora', name: '챔피언 판도라', description: '', imageAssetId: null, imageUrl: null,
    maxHealth: 25, abilityName: '불안한 일격', abilityCost: 2, abilityText: '', abilityEffects: { effects: [] },
    hasQuest: true, questName: '폭주의 조짐',
    questText: '자신의 고유 능력으로 선수 카드를 5번 리타이어 시킵니다.',
    questCondition: { event: 'CARD_RETIRED', required: 5 }, questProgressRequired: 5,
    questRewardText: '', questRewardEffects: null, upgradedAbilityName: null, upgradedAbilityCost: null,
    upgradedAbilityText: null, upgradedAbilityEffects: null, championTokenDefinitionId: null,
    status: 'PUBLISHED', version: 1,
  });
  assert.equal(definition.quest?.sourceActionType, 'USE_CHAMPION_ABILITY');
  assert.equal(definition.quest?.cardType, 'WRESTLER');
  assert.equal(definition.quest?.trackedEvent, 'CARD_RETIRED');
});

test("DB 챔피언을 직렬화 가능한 매치 스냅샷 정의로 변환한다", () => {
  const definition = championRecordToDefinition({
    id: "champion-a", name: "챔피언 A", description: "설명", imageAssetId: null,
     imageUrl: null, imageDisplayMode: "CUSTOM", imageScale: 1.35, imagePositionX: 62.5, imagePositionY: 38,
     maxHealth: 20, abilityName: "지원", abilityCost: 2,
    abilityText: "강화", abilityEffects: { effects: [{
      action: "BUFF", target: { zone: "HAND", owner: "SELF", selection: "RANDOM", count: 1 },
      values: { attack: 1, health: 1 },
    }] }, hasQuest: true, questName: "생성", questText: "선수 카드를 7회 생성합니다.",
    questCondition: { event: "CARD_GENERATED", cardType: "WRESTLER", progress: 1, required: 7 }, questProgressRequired: 7,
    questRewardText: "능력을 강화합니다.",
    questRewardEffects: { effects: [{ action: "UPGRADE_CHAMPION_ABILITY" }] },
    upgradedAbilityName: "강화 지원", upgradedAbilityCost: 1,
    upgradedAbilityText: "더 강화", upgradedAbilityEffects: { effects: [{ action: "DRAW", values: { amount: 1 } }] },
    championTokenDefinitionId: null, status: "PUBLISHED", version: 3,
  });
  assert.equal(definition.maxHealth, 20);
  assert.equal(definition.imageDisplayMode, "CUSTOM");
  assert.equal(definition.imageScale, 1.35);
  assert.equal(definition.imagePositionX, 62.5);
  assert.equal(definition.imagePositionY, 38);
  assert.equal(definition.version, 3);
  assert.equal(definition.ability.effects[0]?.type, "STRUCTURED");
  assert.equal(definition.quest?.trackedEvent, "CARD_GENERATED");
  assert.equal(definition.quest?.rewardText, "능력을 강화합니다.");
  assert.equal(definition.quest?.cardType, "WRESTLER");
  assert.equal(definition.quest?.progressPerEvent, 1);
  assert.deepEqual(definition.quest?.reward, { type: "UPGRADE_ABILITY", effects: [] });
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

test("Quest 보상도 연결된 Champion Token ID를 직접 전개 보상으로 보존한다", () => {
  const definition = championRecordToDefinition({
    id: "champion-quest-token", name: "토큰 퀘스트", description: "", imageAssetId: null, imageUrl: null,
    maxHealth: 20, abilityName: "능력", abilityCost: 1, abilityText: "",
    abilityEffects: { effects: [] }, hasQuest: true, questName: "전개", questText: "완료",
    questCondition: { event: "CARD_PLAYED", required: 1 }, questProgressRequired: 1,
    questRewardText: "Champion Token을 직접 전개합니다.",
    questRewardEffects: { effects: [{ action: "DIRECT_DEPLOY_CHAMPION_TOKEN" }] },
    upgradedAbilityName: null, upgradedAbilityCost: null, upgradedAbilityText: null,
    upgradedAbilityEffects: null, championTokenDefinitionId: "linked-token",
    status: "PUBLISHED", version: 1,
  });

  assert.deepEqual(definition.quest?.reward, {
    type: "DIRECT_DEPLOY_CHAMPION_TOKEN",
    cardDefinitionId: "linked-token",
  });
});

test("구조화된 Champion Token 보상은 현재 챔피언 연결을 사용하는 전개 effect로 변환한다", () => {
  const definition = championRecordToDefinition({
    id: "pandora-fixture", name: "판도라 fixture", description: "", imageAssetId: null, imageUrl: null,
    maxHealth: 20, abilityName: "불안한 일격", abilityCost: 2, abilityText: "",
    abilityEffects: {
      effects: [{
        action: "DAMAGE",
        target: {
          zone: "BOARD",
          owner: "ALL",
          cardType: "WRESTLER",
          selection: "PLAYER_CHOICE",
          count: 1,
        },
        values: { amount: 1 },
      }],
    },
    hasQuest: true, questName: "폭주의 조짐", questText: "선수 카드를 리타이어 시킵니다.",
    questCondition: {
      event: "WRESTLER_RETIRED",
      cardType: "WRESTLER",
      sourceActionType: "USE_CHAMPION_ABILITY",
      required: 1,
    },
    questProgressRequired: 1,
    questRewardText: "능력을 강화하고 연결된 토큰을 전개합니다.",
    questRewardEffects: { effects: [{ action: "DEPLOY_CHAMPION_TOKEN" }] },
    upgradedAbilityName: "파멸의 일격", upgradedAbilityCost: 1,
    upgradedAbilityText: "강화", upgradedAbilityEffects: { effects: [] },
    championTokenDefinitionId: "pandora-token",
    status: "PUBLISHED", version: 1,
  });

  assert.deepEqual(definition.ability.effects[0], {
    type: "STRUCTURED",
    action: "DAMAGE",
    target: {
      zone: "BOARD",
      owner: "ALL",
      cardType: "WRESTLER",
      selection: "PLAYER_CHOICE",
      count: 1,
    },
    values: { amount: 1 },
  });
  assert.deepEqual(definition.quest?.reward, {
    type: "STRUCTURED",
    effects: [{
      type: "STRUCTURED",
      action: "DEPLOY_CHAMPION_TOKEN",
      target: undefined,
      values: undefined,
    }],
  });
});
