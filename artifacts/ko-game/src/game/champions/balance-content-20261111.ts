import type { PublishedChampionRecord } from "./published-champions";
import type { ChampionQuestCondition } from "../../../../../lib/game-engine/src/champion-quest-conditions";
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/gu, "");
export function reviewedNovember11Champion(
  record: PublishedChampionRecord,
): PublishedChampionRecord {
  let r = { ...record };
  const is = (text: string) => clean(record.questText) === clean(text);
  const condition = (value: ChampionQuestCondition) => {
    r = {
      ...r,
      questCondition: {
        ...r.questCondition,
        event: "STATE_CONDITION",
        condition: value,
        required: 1,
      },
      questProgressRequired: 1,
    };
  };
  const effects = (entries: unknown[]) => {
    r = { ...r, abilityEffects: { effects: entries as any[] } };
  };
  switch (record.id) {
    case "5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c":
      if (
        is("자신의 무덤에 '언데드' 태그를 가진 카드가 10장 이상 있어야합니다.")
      )
        condition({
          type: "ZONE_COUNT",
          zone: "GRAVEYARD",
          owner: "SELF",
          tag: "언데드",
          required: 10,
        });
      break;
    case "f7b087d8-3148-43d5-a634-a81d15c81721":
      if (is("이 게임에서 카드가 총 10회 파괴됩니다."))
        condition({
          type: "EVENT",
          event: "CARD_DESTROYED",
          owner: "ALL",
          required: 10,
        });
      if (
        is("이 게임에서 카드가 총 10회 파괴됩니다.") &&
        clean(record.abilityText) ===
          clean(
            "선수 카드에게 1 데미지를 줍니다. 이 데미지로 선수 카드가 리타이어 할 시 리타이어가 아니라 파괴시킵니다.",
          )
      )
        effects([
          {
            action: "DAMAGE",
            target: {
              zone: "BOARD",
              owner: "ALL",
              cardType: "WRESTLER",
              selection: "PLAYER_CHOICE",
              count: 1,
            },
            values: { amount: 1, destroyOnLethal: true },
          },
        ]);
      break;
    case "bcffab96-f61f-497e-b60b-de5a869837d3":
      if (is("상대 선수 카드를 핀폴로 5회 리타이어시키기"))
        condition({
          type: "EVENT",
          event: "CARD_RETIRED",
          owner: "ENEMY",
          sourceOwner: "SELF",
          cardType: "WRESTLER",
          exactZero: true,
          required: 5,
        });
      if ([
        "자신이 선택한 모든 선수에게 1 데미지를 줍니다. 핀폴로 처치했다면 체력을 2 회복합니다.",
        "자신이 선택한 선수 카드에게 1 데미지를 줍니다. 핀폴로 처치했다면 체력을 2 회복합니다.",
      ].some(text => clean(record.abilityText) === clean(text))) {
        r = {...r, abilityText: "자신이 선택한 선수 카드에게 1 데미지를 줍니다. 핀폴로 처치했다면 체력을 2 회복합니다."};
        effects([
          {
            action: "BUFF",
            target: {
              zone: "BOARD",
              owner: "ALL",
              cardType: "WRESTLER",
              selection: "PLAYER_CHOICE",
              count: 1,
            },
            values: { balance: { operation: "PANDORA_DAMAGE", amount: 1 } },
          },
        ]);
      }
      break;
    case "0db142af-750e-4929-a464-5daf1bc75452":
      if (
        is(
          "이번 게임에서 내 카드 또는 내 챔피언 효과로 내 챔피언이 피해를 총 10회 받으세요.",
        )
      )
        condition({
          type: "EVENT",
          event: "DAMAGE_DEALT",
          owner: "SELF",
          targetOwner: "SELF",
          sourceOwner: "SELF",
          targetKind: "PLAYER",
          sourceActionTypes: ["CARD_EFFECT", "USE_CHAMPION_ABILITY"],
          positiveOnly: true,
          required: 10,
        });
      break;
    case "0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f":
      if (is("이번 게임에서 고유 능력을 5번 발동하세요."))
        r = {
          ...r,
          questCondition: {
            ...r.questCondition,
            event: "CHAMPION_ABILITY_USED",
            required: 5,
          },
          questProgressRequired: 5,
        };
      break;
    case "c52da37b-5e7a-4223-bcf3-73824c677534":
      if (is("자신의 챔피언의 체력이 5 이하가 된다."))
        condition({
          type: "ALL",
          conditions: [
            { type: "HEALTH", owner: "SELF", op: "GTE", value: 1 },
            { type: "HEALTH", owner: "SELF", op: "LTE", value: 5 },
          ],
        });
      break;
    case "champion-minion-a": {
      const q = r.questCondition as Record<string, unknown> | null;
      const choices = Array.isArray(q?.finisherChoices)
        ? (q.finisherChoices as Array<Record<string, unknown>>)
        : [];
      r = {
        ...r,
        questCondition: {
          ...r.questCondition,
          finisherChoices: choices.map((o) =>
            clean(String(o.description)) === clean("카드 총 12회 생성")
              ? {
                  ...o,
                  condition: {
                    type: "EVENT",
                    event: "CARD_GENERATED",
                    owner: "SELF",
                    required: 12,
                  },
                }
              : clean(String(o.description)) ===
                  clean("챔피언 등급의 카드를 1장 생성하기")
                ? {
                    ...o,
                    condition: {
                      type: "EVENT",
                      event: "CARD_GENERATED",
                      owner: "SELF",
                      rarity: "CHAMPION",
                      required: 1,
                    },
                  }
                : clean(String(o.description)) ===
                    clean("레전더리 혹은 챔피언 등급 카드를 3장 이상 필드에 내기")
                  ? {
                      ...o,
                      condition: {
                        type: "EVENT",
                        event: "CARD_PLAYED",
                        owner: "SELF",
                        cardType: "WRESTLER",
                        rarities: ["LEGENDARY", "CHAMPION"],
                        required: 3,
                      },
                    }
                  : o,
          ),
        },
      };
      break;
    }
    case "07c65d00-5efb-435d-a4fa-172b9bfcfd20":
      if (is("아군 선수 카드의 '회피'가 총 8번 발동합니다."))
        condition({
          type: "EVENT",
          event: "DAMAGE_DEALT",
          owner: "SELF",
          targetOwner: "SELF",
          targetKind: "CARD",
          reason: "DODGE",
          required: 8,
        });
      if (
        clean(record.abilityText) ===
        clean(
          "챔피언에게 2데미지를 주고 필드에 있는 아군 선수 카드에게 '회피'를 부여합니다.(이 효과는 각 선수 카드마다 1회만 사용 가능합니다.)\n업그레이드:챔피언의 체력을 3 회복시킵니다.",
        )
      )
        effects([
          {
            action: "DAMAGE",
            target: {
              zone: "PLAYER",
              owner: "SELF",
              selection: "SELF",
              count: 1,
            },
            values: { amount: 2 },
          },
          {
            action: "BUFF",
            values: { balance: { operation: "GRANT_DODGE_ONCE" } },
          },
          {
            action: "PROGRAM",
            values: {
              programEffects: [
                {
                  action: "HEAL",
                  target: {
                    zone: "PLAYER",
                    owner: "SELF",
                    selection: "SELF",
                    count: 1,
                  },
                  values: { amount: 3 },
                },
              ],
            },
          },
        ]);
      break;
    case "88d106cf-ee5a-4a22-ab0a-47b33589fcac":
      if (is("고유 능력으로 상대 선수 카드 3번 리타이어"))
        condition({
          type: "EVENT",
          event: "CARD_RETIRED",
          owner: "ENEMY",
          sourceOwner: "SELF",
          sourceActionTypes: ["USE_CHAMPION_ABILITY"],
          cardType: "WRESTLER",
          required: 3,
        });
      if (
        clean(record.abilityText) ===
        clean(
          "선택한 상대 선수 카드에게 3 데미지를 줍니다. 이 효과로 상대 선수 카드가 리타이어했다면 아군 필드에 '로마니 마피아 따까리'를 소환합니다.",
        )
      )
        effects([
          {
            action: "BUFF",
            target: {
              zone: "BOARD",
              owner: "ENEMY",
              cardType: "WRESTLER",
              selection: "PLAYER_CHOICE",
              count: 1,
            },
            values: {
              balance: {
                operation: "DAMAGE_GENERATE_ON_RETIRE",
                amount: 3,
                summonName: "로마니 마피아 신입",
              },
            },
          },
        ]);
      break;
  }
  return r;
}
