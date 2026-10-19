import type { CardAbility } from "../effects/types";
import type { PublishedCardRecord } from "./published-cards";

// Authenticated administrator snapshot: explicit ID and exact wording, no natural-language runtime interpretation.
const bindings: Record<string, { text: string; abilities: CardAbility[] }> = {
  "4e28e957-1148-44c3-8f8b-b6fe8f40e3a9": {
    text: "등장:이 카드를 제외한 '디 어쏘리티' 태그가 있는 무작위 카드 1장을 내 손패에 생성하고, 그 카드에게 '흡혈'을 부여합니다. 내 손패에 있는 '디 어쏘리티' 태그가 있는 카드 1장마다 이 카드에게 +1/+1을 부여합니다.",
    abilities: [
      {
        trigger: "ENTER_FIELD",
        effects: [
          {
            type: "SCRIPT",
            script: {
              version: "SCRIPT_V1",
              trigger: "ENTER_FIELD",
              steps: [
                {
                  type: "EFFECT",
                  effect: {
                    action: "GENERATE",
                    target: {
                      zone: "HAND",
                      owner: "SELF",
                      selection: "RANDOM",
                      randomScope: "STANDARD",
                      count: 1,
                      filter: {
                        tagsAny: ["디 어쏘리티"],
                        excludeSource: true,
                      },
                    },
                    values: {
                      count: 1,
                      destination: "HAND",
                      generatedKeywords: ["LIFESTEAL"],
                    },
                  },
                },
                {
                  type: "SELECT",
                  id: "tagged",
                  target: {
                    zones: ["HAND"],
                    owner: "SELF",
                    selection: "ALL",
                    count: 100,
                    filter: {
                      tagsAny: ["디 어쏘리티"],
                    },
                  },
                },
                {
                  type: "AGGREGATE",
                  id: "taggedCount",
                  selectionId: "tagged",
                  operation: "COUNT",
                },
                {
                  type: "EFFECT",
                  effect: {
                    action: "BUFF",
                    target: {
                      zone: "BOARD",
                      owner: "SELF",
                      selection: "SELF",
                      count: 1,
                    },
                    values: {
                      attackExpression: {
                        kind: "RESULT_VALUE",
                        resultId: "taggedCount",
                      },
                      healthExpression: {
                        kind: "RESULT_VALUE",
                        resultId: "taggedCount",
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  },
  "latest-wrestler-4": {
    text: "등장:손패에 '만찬'을 한장 추가합니다. 만약에 필드에 '디 어쏘리티'가 있었다면 비용을 1 깍습니다.",
    abilities: [
      {
        trigger: "ENTER_FIELD",
        effects: [
          {
            type: "STRUCTURED",
            action: "GENERATE",
            values: {
              definitionRef: {
                id: "epic-spell-feast",
              },
              destination: "HAND",
              count: 1,
              generatedModifiers: {
                cost: 0,
              },
            },
          },
        ],
        condition: {
          type: "BOARD_HAS_TAG",
          tag: "디 어쏘리티",
          present: false,
        },
      },
      {
        trigger: "ENTER_FIELD",
        effects: [
          {
            type: "STRUCTURED",
            action: "GENERATE",
            values: {
              definitionRef: {
                id: "epic-spell-feast",
              },
              destination: "HAND",
              count: 1,
              generatedModifiers: {
                cost: -1,
              },
            },
          },
        ],
        condition: {
          type: "BOARD_HAS_TAG",
          tag: "디 어쏘리티",
          present: true,
        },
      },
    ],
  },
  "df532c95-0e4d-4b17-8200-a86e6a682341": {
    text: "등장: 자신의 양 옆에 '디 어쏘리티' 카드들 중에서 무작위로 소환하고 자신을 제외한 생성한 그 선수 카드들에게 '도발'을 부여합니다. 이 카드가 필드에 있을때 '디 어쏘리티' 카드가 소환되거나 등장할때 그 카드에게 +1/+1을 부여합니다.",
    abilities: [
      {
        trigger: "ENTER_FIELD",
        effects: [
          {
            type: "STRUCTURED",
            action: "SUMMON",
            target: {
              zone: "BOARD",
              count: 2,
              owner: "SELF",
              cardType: "WRESTLER",
              selection: "ADJACENT_EMPTY_SLOTS",
              randomScope: "STANDARD",
              filter: {
                tagsAny: ["디 어쏘리티"],
              },
            },
          },
          {
            type: "STRUCTURED",
            action: "ADD_KEYWORD",
            target: {
              zone: "BOARD",
              count: 2,
              owner: "SELF",
              cardType: "WRESTLER",
              selection: "SAME_TARGET",
            },
            values: {
              keyword: "TAUNT",
              resolvedAutomaticTarget: true,
            },
          },
        ],
      },
      {
        trigger: "CARD_ENTERED",
        eventOwner: "SELF",
        effects: [
          {
            type: "STRUCTURED",
            action: "BUFF",
            target: {
              zone: "BOARD",
              owner: "SELF",
              cardType: "WRESTLER",
              selection: "SAME_TARGET",
              count: 1,
              filter: {
                tagsAny: ["디 어쏘리티"],
              },
            },
            values: {
              attack: 1,
              health: 1,
              resolvedAutomaticTarget: true,
            },
          },
        ],
      },
    ],
  },
  "epic-spell-feast": {
    text: "모든 아군 선수와 아군 챔피언의 현재 및 최대 HP를 2 증가시킵니다.",
    abilities: [
      {
        trigger: "ACTIVE",
        effects: [
          {
            type: "STRUCTURED",
            action: "BUFF",
            target: {
              zone: "BOARD",
              owner: "SELF",
              selection: "ALL",
              cardType: "WRESTLER",
              count: 4,
            },
            values: {
              health: 2,
            },
          },
          {
            type: "STRUCTURED",
            action: "BUFF",
            target: {
              zone: "PLAYER",
              owner: "SELF",
              selection: "SELF",
              count: 1,
            },
            values: {
              health: 2,
            },
          },
        ],
      },
    ],
  },
};

export function reviewedOctober19Abilities(
  card: PublishedCardRecord,
): CardAbility[] | null {
  const entry = bindings[card.id];
  return entry &&
    !card.effectId &&
    entry.text.replace(/\s+/gu, "") === card.text.replace(/\s+/gu, "")
    ? structuredClone(entry.abilities)
    : null;
}
