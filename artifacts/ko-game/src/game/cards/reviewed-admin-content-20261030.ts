import type { CardAbility } from "../effects/types";
import type { PublishedCardRecord } from "./published-cards";
const clean = (text: string) => text.replace(/\s+/gu, "");
const board = { zone: "BOARD" as const, cardType: "WRESTLER" as const };
/** Exact saved administrator revisions only. Future authored text is never silently replaced. */
export function reviewedOctober30Abilities(
  card: PublishedCardRecord,
): CardAbility[] | null {
  const is = (id: string, text: string) =>
    card.id === id && clean(card.text) === clean(text);
  if (
    is(
      "epic-spell-annihilation",
      "현재 공격력이 2 이하인 모든 선수를 침묵시킵니다.",
    )
  )
    return [
      {
        trigger: "ENTER_FIELD",
        effects: [
          {
            type: "STRUCTURED",
            action: "SILENCE",
            target: {
              ...board,
              owner: "ALL",
              selection: "ALL",
              count: 8,
              filter: { attack: { compare: "LTE", value: 2 } },
            },
          },
        ],
      },
    ];
  if (
    is(
      "879430fd-88e0-4b2d-b697-2a8ee6e95a4c",
      "등장:상대 필드에 있는 선수 카드들에게 총 2데미지를 무작위로 줍니다.",
    )
  )
    return [
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
                  type: "REPEAT",
                  count: { kind: "CONSTANT", value: 2 },
                  steps: [
                    {
                      type: "EFFECT",
                      effect: {
                        action: "DAMAGE",
                        target: {
                          ...board,
                          owner: "ENEMY",
                          selection: "RANDOM",
                          count: 1,
                        },
                        values: { amount: 1 },
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ];
  if (
    is(
      "06445529-c159-4066-854f-31ad97529246",
      "아군 카드가 리타이어 할때마다 필드에 있는 다른 아군 선수 카드 중 무작위로 한장에게 +1/+1 부여",
    )
  )
    return [
      {
        trigger: "SELF_ENTERED",
        effects: [
          {
            type: "STRUCTURED",
            action: "REGISTER_LISTENER",
            values: {
              listener: {
                trigger: "CARD_RETIRED",
                owner: "SELF",
                requiresActiveSource: true,
                effect: {
                  action: "BUFF",
                  target: {
                    ...board,
                    owner: "SELF",
                    selection: "RANDOM",
                    count: 1,
                    filter: { excludeSource: true },
                  },
                  values: { attack: 1, health: 1 },
                },
              },
            },
          },
        ],
      },
    ];
  if (
    is(
      "0710e9b3-a8ef-4f09-9e63-c0b872c18068",
      "이 카드가 필드에 있을때 선수 카드가 소환되거나 등장하면 그 카드에게 1 데미지를 줍니다.",
    )
  )
    return (["SELF", "ENEMY"] as const).map((eventOwner) => ({
      trigger: "CARD_ENTERED",
      eventOwner,
      effects: [
        {
          type: "STRUCTURED",
          action: "DAMAGE",
          target: {
            ...board,
            owner: "ALL",
            selection: "SAME_TARGET",
            count: 1,
          },
          values: { amount: 1 },
        },
      ],
    }));
  if (
    is(
      "bcf2ac9b-1afd-41a3-a653-5f9af1e033bf",
      "등장:자신의 필드에 있는 '언데드' 태그가 있는 카드 중 한장에게 +2/+2를 부여하고, 그 후 자신에게 그 카드의 공격력만큼 공격력을 증가 시킵니다.",
    )
  )
    return [
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
                  type: "SELECT",
                  id: "undead",
                  target: {
                    ...board,
                    owner: "SELF",
                    selection: "PLAYER_CHOICE",
                    allowSource: true,
                    count: 1,
                    filter: { tagsAny: ["언데드"] },
                  },
                },
                {
                  type: "EFFECT",
                  effect: {
                    action: "BUFF",
                    target: { ...board, owner: "SELF", resultId: "undead" },
                    values: { attack: 2, health: 2 },
                  },
                },
                {
                  type: "AGGREGATE",
                  id: "buffedAttack",
                  selectionId: "undead",
                  operation: "SUM",
                  stat: "ATTACK",
                },
                {
                  type: "EFFECT",
                  effect: {
                    action: "BUFF",
                    target: {
                      ...board,
                      owner: "SELF",
                      selection: "SELF",
                      count: 1,
                    },
                    values: {
                      attackExpression: {
                        kind: "RESULT_VALUE",
                        resultId: "buffedAttack",
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
  return null;
}
