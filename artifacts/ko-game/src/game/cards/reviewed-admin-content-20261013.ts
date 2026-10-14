import type { CardAbility, StructuredTarget } from "../effects/types";
import type { PublishedCardRecord } from "./published-cards";

const self: StructuredTarget = {
  zone: "BOARD",
  owner: "SELF",
  selection: "SELF",
  count: 1,
};
const enemy: StructuredTarget = {
  zone: "BOARD",
  owner: "ENEMY",
  cardType: "WRESTLER",
  selection: "PLAYER_CHOICE",
  count: 1,
};
const normalize = (text: string) => text.replace(/\s+/gu, "");

/** Explicit ID + reviewed revision bindings, not a runtime language parser.
 * Authored DSL takes precedence. A different future text never inherits these rules.
 * Zombie Dehun's unspecified creation area was clarified by the user as the field.
 */
export function reviewedAdminContentAbilities(
  card: PublishedCardRecord,
): CardAbility[] | null {
  if (card.effectId) return null;
  const text = normalize(card.text);
  switch (card.id) {
    case "7653f417-ea62-4924-8605-3d88a435d728":
      if (
        text !==
        normalize(
          "등장:상대 필드에 있는 3 코스트 이하의 선수 카드 중 한장을 무작위로 침묵시킨다.",
        )
      )
        return null;
      return [
        {
          trigger: "ENTER_FIELD",
          effects: [
            {
              type: "STRUCTURED",
              action: "SILENCE",
              target: {
                ...enemy,
                selection: "RANDOM",
                randomScope: "FULL",
                filter: { cost: { compare: "LTE", value: 3 } },
              },
            },
          ],
        },
      ];
    case "2e2d2c9d-1586-49cc-9b06-b3d8174c961f":
      if (
        text !==
        normalize(
          "액티브:선택한 아군 선수 카드의 체력만큼 자신의 공격력을 증가시킨다.",
        )
      )
        return null;
      return [
        {
          trigger: "ACTIVE",
          effects: [
            {
              type: "SCRIPT",
              script: {
                version: "SCRIPT_V1",
                trigger: "ACTIVE",
                steps: [
                  {
                    type: "SELECT",
                    id: "ally",
                    target: { ...enemy, owner: "SELF" },
                  },
                  {
                    type: "AGGREGATE",
                    id: "health",
                    selectionId: "ally",
                    operation: "SUM",
                    stat: "HEALTH",
                  },
                  {
                    type: "EFFECT",
                    effect: {
                      action: "BUFF",
                      target: self,
                      values: {
                        attackExpression: {
                          kind: "RESULT_VALUE",
                          resultId: "health",
                        },
                        health: 0,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ];
    case "393dbf7c-7f61-418a-ba1a-4726500ab0aa":
      if (
        text !==
        normalize(
          "등장: 선택한 적 선수에게 1 피해를 줍니다.\n핀폴:이 카드에게 +2/+2를 부여합니다",
        )
      )
        return null;
      return [
        {
          trigger: "ENTER_FIELD",
          effects: [
            {
              type: "STRUCTURED",
              action: "DAMAGE",
              target: enemy,
              values: { amount: 1 },
            },
          ],
        },
        {
          trigger: "EXACT_ZERO_DAMAGE",
          effects: [
            {
              type: "STRUCTURED",
              action: "BUFF",
              target: self,
              values: { attack: 2, health: 2 },
            },
          ],
        },
      ];
    case "8a0b8b65-5d67-4f23-894e-6103219e41c8":
      if (
        text !==
        normalize(
          "이 카드가 상대 선수 카드를 리타이어시킬때마다 '좀비'를 생성합니다.",
        )
      )
        return null;
      return [
        {
          trigger: "SOURCE_RETIRED_TARGET",
          effects: [
            {
              type: "STRUCTURED",
              action: "SUMMON",
              values: {
                count: 1,
                definitionRef: { id: "66143efe-2eec-450a-8570-9a4c4d92330e" },
              },
            },
          ],
        },
      ];
    case "b2fab583-5a3e-4c62-92b1-13ddb3a2f5c0":
      if (
        text !==
        normalize(
          "카운트다운(3):'공격불가' 키워드를 제거하고, 필드에 있는 모든 '기계' 카드들을 전부 이 카드에 합체시킵니다! 그런 다음 이 카드의 공격력을 이 카드의 현재 최대 체력의 수치만큼 증가시킵니다. 이 카드는 '도발'을 무시하고 상대 챔피언을 공격 할 수 있습니다!",
        )
      )
        return null;
      return [
        {
          trigger: "COUNTDOWN",
          effects: [
            {
              type: "STRUCTURED",
              action: "REMOVE_KEYWORD",
              target: self,
              values: { keyword: "CANNOT_ATTACK" },
            },
            {
              type: "STRUCTURED",
              action: "FUSION",
              target: {
                zone: "BOARD",
                owner: "ALL",
                cardType: "WRESTLER",
                selection: "ALL",
                count: 20,
                filter: { tagsAny: ["기계"], excludeSource: true },
              },
              values: { fusionIntoSource: true },
            },
            {
              type: "STRUCTURED",
              action: "BUFF",
              target: self,
              values: { attackReference: "SOURCE_MAX_HEALTH", health: 0 },
            },
            {
              type: "STRUCTURED",
              action: "BUFF",
              target: self,
              values: { ignoreTauntToChampion: true },
            },
          ],
        },
      ];
    default:
      return null;
  }
}
