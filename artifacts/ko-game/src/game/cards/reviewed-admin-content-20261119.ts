import type { PublishedCardRecord } from "./published-cards";
import type {
  CardAbility,
  CardEffect,
  StructuredTarget,
} from "../effects/types";
const reviewedTexts: Record<string, string> = {
  "bba1d3a2-57e8-4ca7-8a68-391589cd3ae5":
    "등장:아군 선수를 하나 선택해서 +2/+2를 부여하고 '어둠의 사자'로 임명합니다! '어둠의 사자'는 다음과 같은 효과를 갖고 있습니다!\n어둠의 사자:이 카드는 상대 선수 카드를 공격하거나 받을때 해당 상대 선수 카드의 공격력을 절반으로 내리고, 내린 만큼의 공격력을 얻습니다.",
  "028acb4e-71f6-4910-8c52-c51ac6c19552":
    "선택한 상대 선수 카드에게 3데미지를 줍니다.\n핀폴:상대 챔피언에게 1 데미지를 줍니다.",
  "0b90ff19-2719-428d-9269-2f03e5d0be64":
    "등장:덱에서 가장 희귀도가 높은 카드를 한장 드로우합니다.(챔피언 등급 제외)",
  "34016ea5-8a1e-431a-8e47-9c6c7bf8e572":
    "등장:필드에 있는 아군 선수 카드 한장에게 +1/+1을 부여하고 '지식의 사자'로 임명합니다! 해당 카드에게 다음 효과를 부여합니다.\n지식의 사자:이 카드가 공격을 할때마다 덱에서 카드 한장을 드로우를 합니다. 이 카드는 덱에서 카드를 드로우하거나 손패에 새로운 카드를 생성 할때마다 +1/+1을 얻습니다.",
  "e5a60a4a-b683-45f6-a6fe-4e5739d93edd":
    "이 카드가 덱에서 드로우 되거나 손패에 생성되어 손패에 들어오는 순간, 모두에게 이 카드를 공개합니다. 그 후 필드에 있는 '수배'가 걸려있는 모든 선수 카드를 파괴하고 그 수만큼 한장당 이 카드의 공격력을 2 증가시킵니다. 그리고 상대 필드에 이 카드를 소환합니다.\n상대 필드가 가득 차 있다면 비용이 가장 낮은 상대 선수 카드 1장을 파괴한 뒤 이 카드를 소환합니다.",
  "682ab32b-cea6-4fd4-9bab-6396ec270588":
    "턴 종료:다음턴에 추가로 받는 골드가 있다면 에픽 등급 이상의 무작위 선수 카드 한장을 +1/+1을 부여하고 '수배'를 건 채로 손패에 추가합니다.(챔피언 등급 제외)",
  "5db68144-fc58-448d-805f-b061af932783":
    "퇴장:상대 필드의 모든 선수 카드에게 '수배'를 걸고, 상대 덱에 '스타 킬러'를 섞어 넣습니다.",
  "0c41841a-94a2-47e8-875f-7db653828728":
    "등장:선택한 상대 선수 카드에게 '수배'를 걸고, '드래곤 브레스'를 손패에 추가합니다. 이 카드가 필드에 있을때, '수배'가 걸린 상대 선수 카드가 리타이어 될 때마다 이 카드의 등장 효과를 반복합니다.",
  "3fef0a3f-93c9-477c-a958-2f26af360104":
    "등장:필드에 있는 아군 선수를 하나 선택해서 +2/+2를 부여하고 '파괴의 사자'로 임명합니다! 그 카드에게 다음과 같은 효과를 부여합니다.\n파괴의 사자:이 카드가 상대 선수 카드를 리타이어시킬때 리타이어시키지 않고 파괴시킵니다. 이 카드가 있을때 필드에서 선수 카드가 파괴 될때마다 이 카드는 +1/+1을 얻습니다.",
};
const latestTexts: Record<string, string> = {
  "e5a60a4a-b683-45f6-a6fe-4e5739d93edd":
    "이 카드가 덱에서 드로우 되거나 손패에 생성되어 손패에 들어오는 순간, 모두에게 이 카드를 공개합니다. 그 후 양 플레이어의 손패와 필드에 있는 '수배'가 걸려있는 모든 선수 카드를 파괴하고 그 수만큼 한장당 이 카드의 공격력을 1 증가시킵니다. 그리고 상대 필드에 이 카드를 소환합니다.\n상대 필드가 가득 차 있다면 비용이 가장 낮은 상대 선수 카드 1장을 파괴한 뒤 이 카드를 소환합니다.",
  "5db68144-fc58-448d-805f-b061af932783":
    "퇴장:상대 필드의 모든 선수 카드에게 '수배'를 걸고, 상대 덱 맨 위에 '스타 킬러'를 올려 놓습니다.",
  "0c41841a-94a2-47e8-875f-7db653828728":
    "등장:선택한 상대 선수 카드에게 '수배'를 걸고, '드래곤 브레스'를 손패에 추가합니다. 이 카드가 필드에 있을때, '수배'가 걸린 상대 선수 카드가 리타이어 될 때마다 필드에 있는 상대 선수 카드 중 무작위로 한장에게 '수배'를 걸고, '드래곤 브레스'를 손패에 추가합니다.",
};
const clean = (s: string) => s.replace(/\s/gu, "");
const field = (
  owner: StructuredTarget["owner"] = "SELF",
  selection: StructuredTarget["selection"] = "PLAYER_CHOICE",
  filter?: StructuredTarget["filter"],
): StructuredTarget => ({
  zone: "BOARD",
  owner,
  cardType: "WRESTLER",
  selection,
  count: selection === "ALL" ? 8 : 1,
  ...(filter ? { filter } : {}),
});
const fx = (
  action: Extract<CardEffect, { type: "STRUCTURED" }>["action"],
  target?: StructuredTarget,
  values?: Extract<CardEffect, { type: "STRUCTURED" }>["values"],
): CardEffect => ({ type: "STRUCTURED", action, target, values });
const op = (
  operation: import("../engine/balance-effects").BalanceOperation,
  target?: StructuredTarget,
  config: Record<string, unknown> = {},
): CardEffect => fx("BUFF", target, { balance: { operation, ...config } });
const ab = (
  trigger: CardAbility["trigger"],
  effects: CardEffect[],
  extra: Record<string, unknown> = {},
): CardAbility => ({ trigger, effects, ...extra }) as CardAbility;
export function reviewedNovember19Abilities(
  card: PublishedCardRecord,
): CardAbility[] | null {
  if (
    card.effectId ||
    !reviewedTexts[card.id] ||
    ![reviewedTexts[card.id], latestTexts[card.id]].some(
      (text) => text && clean(text) === clean(card.text),
    )
  )
    return null;
  const latest =
    latestTexts[card.id] !== undefined &&
    clean(latestTexts[card.id]) === clean(card.text);
  switch (card.id) {
    case "bba1d3a2-57e8-4ca7-8a68-391589cd3ae5":
      return [
        ab("ENTER_FIELD", [
          op("GRANT_MESSENGER", field(), {
            kind: "DARK",
            attack: 2,
            health: 2,
          }),
        ]),
      ];
    case "3fef0a3f-93c9-477c-a958-2f26af360104":
      return [
        ab("ENTER_FIELD", [
          op("GRANT_MESSENGER", field(), {
            kind: "DESTRUCTION",
            attack: 2,
            health: 2,
          }),
        ]),
      ];
    case "34016ea5-8a1e-431a-8e47-9c6c7bf8e572":
      return [
        ab("ENTER_FIELD", [
          op("GRANT_MESSENGER", field(), {
            kind: "KNOWLEDGE",
            attack: 1,
            health: 1,
          }),
        ]),
      ];
    case "028acb4e-71f6-4910-8c52-c51ac6c19552":
      return [
        ab("ACTIVE", [fx("DAMAGE", field("ENEMY"), { amount: 3 })]),
        ab("EXACT_ZERO_DAMAGE", [
          fx(
            "DAMAGE",
            { zone: "PLAYER", owner: "ENEMY", selection: "ALL", count: 1 },
            { amount: 1 },
          ),
        ]),
      ];
    case "0b90ff19-2719-428d-9269-2f03e5d0be64":
      return [ab("ENTER_FIELD", [op("DRAW_HIGHEST_RARITY")])];
    case "0c41841a-94a2-47e8-875f-7db653828728":
      return [
        ab("ENTER_FIELD", [
          fx("ADD_KEYWORD", field("ENEMY"), { keyword: "WANTED" }),
          fx("GENERATE", undefined, {
            definitionRef: { name: "드래곤 브레스" },
            resolveByName: true,
            count: 1,
          }),
        ]),
        ab(
          "CARD_RETIRED",
          latest
            ? [
                fx("ADD_KEYWORD", field("ENEMY", "RANDOM"), {
                  keyword: "WANTED",
                }),
                fx("GENERATE", undefined, {
                  definitionRef: { name: "드래곤 브레스" },
                  resolveByName: true,
                  count: 1,
                }),
              ]
            : [
                op("REPEAT_ENTRY", undefined, {
                  requiredRemovedKeyword: "WANTED",
                }),
              ],
          {
            eventOwner: "ENEMY",
            sourceZones: ["BOARD"],
            ...(latest
              ? {
                  condition: {
                    type: "REMOVED_TARGET_KEYWORD",
                    keyword: "WANTED",
                  },
                }
              : {}),
          },
        ),
      ];
    case "682ab32b-cea6-4fd4-9bab-6396ec270588":
      return [
        ab("TURN_END", [
          op("GENERATE_RANDOM_MATCH", undefined, {
            requireNextTurnBonus: true,
            standardOnly: true,
            cardType: "WRESTLER",
            rarities: ["EPIC", "LEGENDARY"],
            attack: 1,
            health: 1,
            keyword: "WANTED",
          }),
        ]),
      ];
    case "5db68144-fc58-448d-805f-b061af932783":
      return [
        ab("LEAVE_FIELD", [
          fx("ADD_KEYWORD", field("ENEMY", "ALL"), { keyword: "WANTED" }),
          op(
            latest ? "PLACE_ENEMY_CARD_ON_TOP" : "SHUFFLE_ENEMY_CARD",
            undefined,
            { name: "스타 킬러" },
          ),
        ]),
      ];
    case "e5a60a4a-b683-45f6-a6fe-4e5739d93edd":
      return [
        ab(
          "CARD_DRAWN",
          [
            op(
              "STAR_KILLER_ARRIVAL",
              undefined,
              latest ? { includeHand: true, attackPerDestroyed: 1 } : {},
            ),
          ],
          {
            sourceZones: ["HAND"],
          },
        ),
        ab(
          "HAND_WRESTLER_ADDED",
          [
            op(
              "STAR_KILLER_ARRIVAL",
              undefined,
              latest ? { includeHand: true, attackPerDestroyed: 1 } : {},
            ),
          ],
          {
            sourceZones: ["HAND"],
          },
        ),
      ];
  }
  return null;
}
