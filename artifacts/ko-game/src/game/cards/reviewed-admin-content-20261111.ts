import type {
  CardAbility,
  CardEffect,
  StructuredTarget,
} from "../effects/types";
import type { PublishedCardRecord } from "./published-cards";
const self: StructuredTarget = {
  zone: "BOARD",
  owner: "SELF",
  selection: "SELF",
  count: 1,
};
const field = (
  owner: StructuredTarget["owner"] = "SELF",
  selection: StructuredTarget["selection"] = "ALL",
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
): CardEffect => ({
  type: "STRUCTURED",
  action,
  target,
  values:
    values?.definitionRef?.name && ["SUMMON", "GENERATE"].includes(action)
      ? { ...values, resolveByName: true }
      : values,
});
const ab = (
  trigger: CardAbility["trigger"],
  effects: CardEffect[],
  extra: Record<string, unknown> = {},
): CardAbility => ({ trigger, effects, ...extra }) as CardAbility;
const enter = (...effects: CardEffect[]) => ab("ENTER_FIELD", effects);
const summon = (name: string, count = 1) =>
  fx("SUMMON", undefined, { definitionRef: { name }, count });
const op = (
  operation: NonNullable<
    NonNullable<
      Extract<CardEffect, { type: "STRUCTURED" }>["values"]
    >["balance"]
  >["operation"],
  target?: StructuredTarget,
  config: Record<string, unknown> = {},
): CardEffect => fx("BUFF", target, { balance: { operation, ...config } });
const upgrade = (...effects: CardEffect[]): CardEffect =>
  fx("PROGRAM", undefined, {
    programEffects: effects.map((e) => {
      if (e.type !== "STRUCTURED")
        throw Error("Upgrade requires structured effects");
      return { action: e.action, target: e.target, values: e.values } as any;
    }),
  });
const reviewedTexts: Record<string, string> = {
  "6754edbb-3139-46cb-9d7c-51c5c5591679":
    "필드에 있는 모든 선수 카드를 '기절'과 '침묵'을 걸고, '프로젝트 P'를 소환합니다.",
  "0406315b-73fc-482f-8e34-cf53863a3ebe":
    "등장 & 턴 종료:자신을 제외한 모든 선수 카드를 침묵시킵니다.",
  "56223c21-1970-49b4-bfd1-faa08680b587":
    "이 카드가 아군 필드에 있을때 필드에 '마피아' 태그가 있는 카드들이 생성 혹은 소환될때 그 카드들에게 +1/+1을 부여합니다.",
  "2f47b929-7035-4bb9-abea-0af6a6f9c72d": "'오메가 좀비'를 소환한다.",
  "862936b1-9a54-494e-88d1-b0ffbde83528":
    "이 카드가 필드에 있다면 아군의 업그레이드 효과가 발동할때 비용이 들지 않습니다.\n이 카드가 '빌런' 태그를 가진 카드를 리타이어 시키면 필드에 있는 모든 '히어로' 태그를 가진 카드에게 공격력을 1 부여합니다.",
  "bba1d3a2-57e8-4ca7-8a68-391589cd3ae5":
    "등장:아군 선수를 하나 선택해서 +2/+2를 부여하고 '어둠의 사자'로 지정합니다! '어둠의 사자'는 다음과 같은 효과를 갖고 있습니다!\n'어둠의 사자':이 카드는 상대 선수 카드를 공격하거나 받을때 해당 상대 선수 카드의 공격력을 절반으로 내리고, 내린 만큼의 공격력을 얻습니다.",
  "0672077d-06f0-426c-a925-135862f3f22d":
    "선택한 상대 선수 카드에게 5 데미지를 줍니다 이로 리타이어하는데 성공하면 '마피아' 태그가 있는 에픽 등급 카드를 비용 0으로 손패에 추가합니다. 그리고 앞으로 고유 능력 사용할때마다 자신의 손패에 '마피아' 태그를 가진 비용을 1 감소시킨 노멀 혹은 에픽 등급 선수 카드를 1장 손에 생성합니다.",
  "c7862e59-7691-4f5d-a518-81175f956fab":
    "상대 선수 카드 1장을 파괴합니다. 그리고 '판도라(폭주)'를 소환해서 파괴한 카드의 공격력과 체력의 반 만큼 부여합니다.",
  "8be831d2-6e56-4f77-985e-3860d6eaa2d3":
    "등장:자신의 무덤에 있는 선수 카드 2장당 1 씩 공격력이 증가합니다.",
  "9cccd7c5-e603-4cf0-8b30-22ccf8c0bdf0":
    "등장:상대 선수 카드의 체력을 1로 깍고 그만큼 자신의 공격력을 증가시킵니다.\n업그레이드:자신에게 '연격'을 부여합니다.",
  "4b69fb92-c8f9-40f6-9df1-f3309d0bf91f":
    "선택한 상대 선수 카드에게 3 데미지를 주고, 필드에 있는 모든 아군 선수 카드들에게 '회피'를 부여합니다.\n업그레이드:나머지 상대 선수 카드와 상대 챔피언에게도 3 데미지를 줍니다.",
  "d71f5f92-c6ab-42ef-8e90-ea9f533d29a0":
    "선택한 선수 카드를 리타이어 시키고 그 카드의 체력만큼 챔피언을 회복시킵니다.\n챔피언이 퍼플레인이라면, 이제 고유 능력을 상대에게 쓸 수 있습니다.\n대상이 상대 챔피언일 경우:상대 손패에 있는 카드 중 무작위로 한장의 비용이 1 증가합니다.(최대 6)\n대상이 상대 선수 카드일 경우:공격력을 1 감소시킵니다.",
  "da7ebda6-269a-4dbb-a84b-2e283564e470":
    "등장:덱에서 '히어로' 태그를 가진 카드 중 무작위로 한장을 자신의 필드에 소환합니다.(해당 카드가 등장 효과를 지니고 있다면 그 효과를 발동 시킵니다.)\n업그레이드:이 카드의 효과로 소환된 카드에게 +1/+1을 부여합니다.\n턴 시작:비용이 1 감소한채로 자신의 덱으로 돌아갑니다.",
  "5f0d293a-b714-4a40-8398-624d06eea30b": "",
  "c651644e-de3b-4e28-b925-a4c9f9bcd29c":
    "등장:현재 손패에 있는 카드들을 전부 덱으로 보내고, 자신의 손패를 완전히 무작위 카드들로 채우고, 그 카드들의 비용을 전부 1 감소 시킵니다.",
  "59c74665-af78-4d9d-b29b-d7ba9a792ac0":
    "등장:아군 필드에 '마피아' 태그를 가진 선수 카드가 있다면 +1/+1을 받고, 만약  이름에 '조킹루이지'가 들어간 선수 카드가 있다면 대신 +3/+1을 받고 '도발'을 얻습니다.",
  "8aeb73b2-f4be-44ad-837e-4ac66641ab62":
    "이 카드가 상대 선수 카드를 리타이어시키면 공격력이 1 증가합니다.\n턴 종료:내 덱 맨 위에 있는 선수 카드에게 이 카드의 공격력만큼 공격력을 증가시킵니다.",
  "crisis-awakening-dealer":
    "이 카드가 필드에 소환되면 이 카드에게 이번 게임에서 리타이어하거나 파괴 된 아군 선수의 수의 반만큼 공격력을 증가시킵니다.\n이 카드는 상대 필드에 선수 카드가 없을때만 상대 챔피언을 공격 할 수 있습니다.",
  "57a19ccf-d63d-422a-b30a-07739c28a952": "하늘을 떨구는 자(각성)을 소환한다.",
  "06356c51-b4ab-4b36-af7d-7c5e2f1b416b": "",
  "9e20a336-0428-4d4e-9b56-a25d3957b690":
    "등장:필드와 무덤에 있는 '구슬마스터' 태그가 있는 다른 종류의 선수 카드당 그 수만큼 이 선수에게 +2/+2를 부여하고, 다음 효과를 얻는다.\n1개 — 기습\n2개 — 방어\n3개 — 아머(1)\n4개 — 회피(1)\n5개 이상 — 면역",
  "9eef642f-bcf2-4b79-bd88-7bde31d10b93":
    "턴 종료:아군 필드에 '마피아'태그를 가진 카드가 있다면 체력이 1 증가합니다.",
  "783685cc-6d45-4a96-a39d-3d02a899f49e":
    "필드에 '여울의 보디가드'를 소환하고, 앞으로 매턴마다 추가로 1골드를 더 받습니다. 추가로, 고유 능력을 쓸때마다 '여울의 보디가드'를 소환합니다.",
  "358ac04a-d921-4e77-b5ad-a2c516408e82":
    "등장:필드와 손패에 있는 '마피아' 태그가 있는 선수 카드 수만큼 공격력이 증가합니다. \n이 카드가 상대 선수 카드를 리타이어 시킬때마다 이 카드와 필드에 있는 '마피아' 태그를 가진 선수 카드들의 공격력이 1 증가합니다.",
  "f1c322d1-eff0-4ac2-bf62-8f3858849686":
    "등장:이 카드에게 +1/+1을 부여합니다.\n업그레이드:추가로 +1/+1을 부여합니다.\n이 카드가 '빌런' 태그를 가진 카드를 리타이어 시키면 등장 효과를 한번 더 발동 시킵니다.(턴당 1회  발동)",
  "522876df-ce6c-417c-9b51-451932de9437":
    "선택한 상대 선수 카드에게 3데미지를 주고 내 손패에 있는 모든 카드에게 +1/+1을 부여합니다.",
  "152011c5-5d5d-4c8c-946d-eaf69c2d6442":
    "이 카드가 리타이어 되면 공격력과 최대 체력을 2씩 깍고 부활합니다. 이 카드가 상대 선수 카드를 리타이어 시키면 +1/+1을 얻으며, 만약 그 카드가 '악마' 태그가 있다면 +1/+1을 추가로 얻습니다.",
  "a40e2092-f479-46f2-8619-2d8a030583d6":
    "등장:필드에 있는 아군 선수 카드들에게 총 5 만큼 공격력을 무작위로 나눠서 증가시킵니다.\n업그레이드:필드에 있는 상대 선수 카드들에게 총 5 만큼 데미지를 무작위로 나눠서 줍니다.\n이 카드가 '빌런' 태그를 가진 카드를 리타이어 시키면 자신의 덱 맨위에 있는 카드의 공격력을 2 증가시킵니다.(턴당 1회 발동)",
  "2ddf8c3d-ca4e-4f7e-b5aa-5fc66acd29e6": "업그레이드:+1/+1을 얻습니다.",
  "e44d337c-27ce-4f97-bc83-0ea7cde7d119":
    "내 필드를 '엘리트 용병'으로 채웁니다. 그리고 앞으로 고유 능력을 쓸때 '용병'을 추가하는 대신 '엘리트 용병'을 추가합니다.('용병'을 소환하는 고유 능력이 아니어도 '엘리트 용병'을 소환합니다)",
  "fda6bf5e-5150-4cb1-950a-385ba1a6a502":
    "이 카드가 상대 선수 카드를 리타이어 시키면 아군 필드에 '좀비'를 생성하고 자신은 +1/+1을 얻습니다. 이 카드가 필드에 있을때 아군 선수 카드가 리타이어 할 때마다 +1/+1을 얻습니다.",
  "df532c95-0e4d-4b17-8200-a86e6a682341":
    "등장: 자신의 양 옆에 이 카드를 제외한 '디 어쏘리티' 카드들 중에서 무작위로 소환하고 자신을 제외한 생성한 그 선수 카드들에게 '도발'을 부여합니다. 이 카드가 필드에 있을때 '디 어쏘리티' 카드가 소환되거나 등장할때 그 카드에게 +1/+1을 부여합니다.",
  "96bad223-bd08-407e-a7c4-1fc1c18e79dd":
    "콤보:'마피아' 태그를 가진 아군 선수 카드가 상대를 공격하면 그 카드에게 +1/+1을 부여합니다. 이 카드는 아군 필드에 '마피아' 태그가 있는 카드가 존재하는 동안 '무적'입니다.(이 카드는 '도발'을 보유 할 수 없습니다.)",
  "3fef0a3f-93c9-477c-a958-2f26af360104":
    "등장:필드에 있는 아군 선수를 하나 선택해서 +2/+2를 부여하고 '파괴의 전령'으로 지정합니다! 그 카드에게 다음과 같은 효과를 부여합니다.\n파괴의 전령:이 카드가 상대 선수 카드를 리타이어시킬때 리타이어시키지 않고 파괴시킵니다. 이 카드가 있을때 필드에서 선수 카드가 파괴 될때마다 이 카드는 +1/+1을 얻습니다.",
  "7c3153f3-4dc6-4a8f-8148-c64e624576c3":
    "필드에 있는 모든 선수 카드를 파괴하고, '베르모트(강림)'을 자신의 필드에 소환합니다.",
  "4641182f-8f4c-4e1a-bbb8-9aa17959b3f7":
    "등장:'메카 사이드킥'으로 변신합니다.\n업그레이드:변신한 카드의 '공격 불가' 키워드를 제거합니다.",
  "eaefcf6c-575d-4482-aaad-98b54561b49a":
    "이 카드는 자신이 리타이어 혹은 파괴 시킨 선수의 공격력과 최대 체력의 절반을 흡수합니다.",
  "683e07f7-d9f8-47f7-8142-779cab01e9b8":
    "등장:이 카드 비용을 지불하고 남은 골드를 전부 소비합니다. 이때 소비한 1 골드마다 공격을 +2씩 증가시킵니다",
  "crisis-awakening-tank":
    "이 카드는 다른 카드에게 직접 타격을 당할때 필드에 있는 모든 상대 선수 카드에게 2데미지를 줍니다.\n퇴장:'위마리(각성)'를 필드에 소환합니다.",
  "e1ac3fe0-f83e-497b-8ca5-02a419ffb4b9":
    "턴 종료:아군 필드에 '마피아' 태그를 가진 카드가 있다면 공격력이 +1 증가합니다.",
  "5f1fd584-7129-4f39-91a4-22f02ba677e5":
    "등장:손패에 '냥냥 펀치'를 추가합니다.\n턴 시작:지난 턴에 아군 선수 카드 혹은 챔피언이 체력을 회복했다면 손패에 '냥냥 펀치'를 추가한다.",
  "latest-wrestler-2": "이 카드는 한번에 최대 3 데미지만 입을 수 있습니다.",
  "52528873-0704-4569-9bd8-2c4ff227ce51":
    "이 카드를 제외한 다른 '피니셔' 카드 무작위 3장 중에서 한장을 골라서 가져옵니다.",
};
/** Reviewed saved revisions only: never guess effects for future administrator text. */
export function reviewedNovember11Abilities(
  card: PublishedCardRecord,
): CardAbility[] | null {
  const expected = reviewedTexts[card.id];
  if (
    expected === undefined ||
    expected.replace(/\s/gu, "") !== card.text.replace(/\s/gu, "")
  )
    return null;
  switch (card.id) {
    case "6754edbb-3139-46cb-9d7c-51c5c5591679":
      return [
        enter(
          fx("STUN", field("ALL")),
          fx("SILENCE", field("ALL")),
          summon("프로젝트 P(폭주)"),
        ),
      ];
    case "0406315b-73fc-482f-8e34-cf53863a3ebe":
      return [
        enter(fx("SILENCE", field("ALL", "ALL", { excludeSource: true }))),
        ab("TURN_END", [
          fx("SILENCE", field("ALL", "ALL", { excludeSource: true })),
        ]),
      ];
    case "2f47b929-7035-4bb9-abea-0af6a6f9c72d":
      return [enter(summon("오메가 좀비"))];
    case "57a19ccf-d63d-422a-b30a-07739c28a952":
      return [enter(summon("하늘을 떨구는 자(각성)"))];
    case "7c3153f3-4dc6-4a8f-8148-c64e624576c3":
      return [
        enter(fx("DESTROY", field("ALL")), summon("마왕 벨모르트(강림)")),
      ];
    case "522876df-ce6c-417c-9b51-451932de9437":
      return [
        enter(
          fx("DAMAGE", field("ENEMY", "PLAYER_CHOICE"), { amount: 3 }),
          fx(
            "BUFF",
            { zone: "HAND", owner: "SELF", selection: "ALL", count: 20 },
            { attack: 1, health: 1 },
          ),
        ),
      ];
    case "683e07f7-d9f8-47f7-8142-779cab01e9b8":
      return [
        enter(fx("SPEND_GOLD_BUFF_SELF", self, { attack: 2, health: 0 })),
      ];
    case "8be831d2-6e56-4f77-985e-3860d6eaa2d3":
      return [
        enter(
          fx("BUFF", self, {
            attackReference: "GRAVEYARD_WRESTLER_COUNT",
            referenceDivisor: 2,
          }),
        ),
      ];
    case "8aeb73b2-f4be-44ad-837e-4ac66641ab62":
      return [
        ab("SOURCE_RETIRED_TARGET", [fx("BUFF", self, { attack: 1 })]),
        ab("TURN_END", [
          fx(
            "BUFF",
            {
              zone: "DECK",
              owner: "SELF",
              cardType: "WRESTLER",
              selection: "TOP",
              count: 1,
            },
            {
              reference: "SOURCE",
              referenceStat: "CURRENT_ATTACK",
              balance: { operation: "BUFF_TOP_WRESTLER_ATTACK" },
            },
          ),
        ]),
      ];
    case "crisis-awakening-dealer":
      return [
        ab(
          "SELF_ENTERED",
          [
            fx("BUFF", self, {
              attackReference: "ALLIED_REMOVED_WRESTLER_COUNT",
              referenceDivisor: 2,
            }),
          ],
          { cannotAttackChampionWhileEnemyBoardOccupied: true },
        ),
      ];
    case "crisis-awakening-tank":
      return [
        ab("BEFORE_DAMAGE", [fx("DAMAGE", field("ENEMY"), { amount: 2 })], {
          condition: { type: "COMBAT_HIT" },
        }),
        ab("LEAVE_FIELD", [summon("위마리(각성)")]),
      ];
    case "e1ac3fe0-f83e-497b-8ca5-02a419ffb4b9":
      return [
        ab("TURN_END", [fx("BUFF", self, { attack: 1 })], {
          condition: { type: "BOARD_HAS_TAG", tag: "마피아" },
        }),
      ];
    case "9eef642f-bcf2-4b79-bd88-7bde31d10b93":
      return [
        ab("TURN_END", [fx("BUFF", self, { health: 1 })], {
          condition: { type: "BOARD_HAS_TAG", tag: "마피아" },
        }),
      ];
    case "2ddf8c3d-ca4e-4f7e-b5aa-5fc66acd29e6":
      return [enter(upgrade(fx("BUFF", self, { attack: 1, health: 1 })))];
    case "4641182f-8f4c-4e1a-bbb8-9aa17959b3f7":
      return [
        enter(
          fx("TRANSFORM_SOURCE", undefined, {
            definitionRef: { name: "메카 사이드킥" },
          }),
          upgrade(fx("REMOVE_KEYWORD", self, { keyword: "CANNOT_ATTACK" })),
        ),
      ];
    case "59c74665-af78-4d9d-b29b-d7ba9a792ac0":
      return [
        enter(
          op("CONDITIONAL_FIELD_BUFF", undefined, {
            tag: "마피아",
            nameIncludes: "조킹루이지",
            attack: 1,
            alternateAttack: 3,
            health: 1,
            keyword: "TAUNT",
          }),
        ),
      ];
    case "358ac04a-d921-4e77-b5ad-a2c516408e82":
      return [
        enter(
          op("COUNT_TAG_BUFF", undefined, {
            tag: "마피아",
            zones: ["BOARD", "HAND"],
            attack: 1,
          }),
        ),
        ab("SOURCE_RETIRED_TARGET", [
          fx("BUFF", self, { attack: 1 }),
          fx(
            "BUFF",
            field("SELF", "ALL", { tagsAny: ["마피아"], excludeSource: true }),
            { attack: 1 },
          ),
        ]),
      ];
    case "fda6bf5e-5150-4cb1-950a-385ba1a6a502":
      return [
        ab("SOURCE_RETIRED_TARGET", [
          summon("좀비"),
          fx("BUFF", self, { attack: 1, health: 1 }),
        ]),
        ab("CARD_RETIRED", [fx("BUFF", self, { attack: 1, health: 1 })], {
          eventOwner: "SELF",
          sourceZones: ["BOARD"],
        }),
      ];
    case "eaefcf6c-575d-4482-aaad-98b54561b49a":
      return [
        ab("SOURCE_RETIRED_TARGET", [
          op("ABSORB_REMOVED_STATS", undefined, { fraction: 0.5 }),
        ]),
        ab("SELF_ENTERED", [], { absorbDestroyedTargetStats: true }),
      ];
    case "5f1fd584-7129-4f39-91a4-22f02ba677e5":
      return [
        enter(
          fx("GENERATE", undefined, {
            definitionRef: { name: "냥냥 펀치" },
            count: 1,
          }),
        ),
        ab(
          "TURN_START",
          [
            fx("GENERATE", undefined, {
              definitionRef: { name: "냥냥 펀치" },
              count: 1,
            }),
          ],
          { condition: { type: "PREVIOUS_OWN_TURN_ANY_HEALED" } },
        ),
      ];
    case "latest-wrestler-2":
      return [ab("SELF_ENTERED", [], { maximumDamagePerHit: 3 })];
    case "96bad223-bd08-407e-a7c4-1fc1c18e79dd":
      return [
        ab("OTHER_ALLY_ATTACK", [
          fx("BUFF", field("SELF", "LAST_ATTACKER", { tagsAny: ["마피아"] }), {
            attack: 1,
            health: 1,
          }),
        ]),
        ab("SELF_ENTERED", [], {
          invulnerableWhileOtherAllyTag: "마피아",
          forbiddenKeywords: ["TAUNT"],
        }),
      ];
    case "a40e2092-f479-46f2-8619-2d8a030583d6":
      return [
        enter(
          op("DISTRIBUTE_RANDOM", undefined, {
            owner: "SELF",
            amount: 5,
            stat: "ATTACK",
          }),
          upgrade(
            op("DISTRIBUTE_RANDOM", undefined, {
              owner: "ENEMY",
              amount: 5,
              stat: "DAMAGE",
            }),
          ),
        ),
        ab(
          "SOURCE_RETIRED_TARGET",
          [
            fx(
              "BUFF",
              { zone: "DECK", owner: "SELF", selection: "TOP", count: 1 },
              { attack: 2, topCardOnly: true },
            ),
          ],
          {
            oncePerTurn: true,
            condition: { type: "REMOVED_TARGET_TAG", tag: "빌런" },
          },
        ),
      ];
    case "f1c322d1-eff0-4ac2-bf62-8f3858849686":
      return [
        enter(
          fx("BUFF", self, { attack: 1, health: 1 }),
          upgrade(fx("BUFF", self, { attack: 1, health: 1 })),
        ),
        ab("SOURCE_RETIRED_TARGET", [op("REPEAT_ENTRY")], {
          oncePerTurn: true,
          condition: { type: "REMOVED_TARGET_TAG", tag: "빌런" },
        }),
      ];
    case "862936b1-9a54-494e-88d1-b0ffbde83528":
      return [
        ab("SELF_ENTERED", [], { waiveUpgradeCost: true }),
        ab(
          "SOURCE_RETIRED_TARGET",
          [
            fx("BUFF", field("SELF", "ALL", { tagsAny: ["히어로"] }), {
              attack: 1,
            }),
          ],
          { condition: { type: "REMOVED_TARGET_TAG", tag: "빌런" } },
        ),
      ];
    case "56223c21-1970-49b4-bfd1-faa08680b587":
      return [
        ab(
          "CARD_ENTERED",
          [
            fx("BUFF", field("SELF", "SAME_TARGET", { tagsAny: ["마피아"] }), {
              attack: 1,
              health: 1,
            }),
          ],
          { eventOwner: "SELF" },
        ),
        ab("SELF_ENTERED", [], {
          generatedCardTagBuff: { tag: "마피아", attack: 1, health: 1 },
        }),
      ];
    case "df532c95-0e4d-4b17-8200-a86e6a682341":
      return [
        enter(
          op("SUMMON_RANDOM_ADJACENT", undefined, {
            tag: "디 어쏘리티",
            excludeChampionRarity: true,
            keyword: "TAUNT",
          }),
        ),
        ab(
          "CARD_ENTERED",
          [
            fx(
              "BUFF",
              field("SELF", "SAME_TARGET", { tagsAny: ["디 어쏘리티"] }),
              { attack: 1, health: 1 },
            ),
          ],
          { eventOwner: "SELF" },
        ),
      ];
    case "9cccd7c5-e603-4cf0-8b30-22ccf8c0bdf0":
      return [
        enter(
          op("DRAIN_HEALTH_TO_ONE", field("ENEMY", "PLAYER_CHOICE")),
          upgrade(fx("ADD_KEYWORD", self, { keyword: "MULTI_STRIKE" })),
        ),
      ];
    case "da7ebda6-269a-4dbb-a84b-2e283564e470":
      return [
        enter(
          op("SUMMON_FROM_DECK", undefined, { tag: "히어로" }),
          upgrade(op("BUFF_LAST_SUMMON", undefined, { attack: 1, health: 1 })),
        ),
        ab("TURN_START", [
          fx("REDUCE_COST", self, { amount: 1 }),
          fx("MOVE_TO_DECK", self, { preserveStats: true }),
        ]),
      ];
    case "c651644e-de3b-4e28-b925-a4c9f9bcd29c":
      return [enter(op("REFILL_RANDOM_HAND", undefined, { costReduction: 1 }))];
    case "9e20a336-0428-4d4e-9b56-a25d3957b690":
      return [
        enter(op("DISTINCT_TAG_GROWTH", undefined, { tag: "구슬마스터" })),
      ];
    case "152011c5-5d5d-4c8c-946d-eaf69c2d6442":
      return [
        ab("SELF_RETIRE", [
          op("REVIVE_WITH_PENALTY", undefined, { attack: -2, health: -2 }),
        ]),
        ab("SOURCE_RETIRED_TARGET", [
          fx("BUFF", self, { attack: 1, health: 1 }),
          op("BUFF_FOR_REMOVED_TAG", undefined, {
            tag: "악마",
            attack: 1,
            health: 1,
          }),
        ]),
      ];
    case "bba1d3a2-57e8-4ca7-8a68-391589cd3ae5":
      return [
        enter(
          op("GRANT_MESSENGER", field("SELF", "PLAYER_CHOICE"), {
            kind: "DARK",
            attack: 2,
            health: 2,
          }),
        ),
      ];
    case "3fef0a3f-93c9-477c-a958-2f26af360104":
      return [
        enter(
          op("GRANT_MESSENGER", field("SELF", "PLAYER_CHOICE"), {
            kind: "DESTRUCTION",
            attack: 2,
            health: 2,
          }),
        ),
      ];
    case "c7862e59-7691-4f5d-a518-81175f956fab":
      return [
        enter(
          op("DESTROY_SUMMON_HALF", field("ENEMY", "PLAYER_CHOICE"), {
            name: "판도라(폭주)",
          }),
        ),
      ];
    case "d71f5f92-c6ab-42ef-8e90-ea9f533d29a0":
      return [enter(op("RETIRE_HEAL_UPGRADE", field("ALL", "PLAYER_CHOICE")))];
    case "783685cc-6d45-4a96-a39d-3d02a899f49e":
      return [
        enter(
          summon("여울의 보디가드"),
          op("PERSISTENT_CHAMPION_FOLLOWUP", undefined, {
            gold: 1,
            effect: {
              action: "SUMMON",
              values: { definitionRef: { name: "여울의 보디가드" }, count: 1 },
            },
          }),
        ),
      ];
    case "e44d337c-27ce-4f97-bc83-0ea7cde7d119":
      return [
        enter(
          op("FILL_BOARD", undefined, { name: "엘리트 용병" }),
          op("ELITE_CHAMPION_ABILITY"),
        ),
      ];
    case "0672077d-06f0-426c-a925-135862f3f22d":
      return [
        enter(
          op("DAMAGE_GENERATE_ON_RETIRE", field("ENEMY", "PLAYER_CHOICE"), {
            amount: 5,
            tag: "마피아",
            rarity: "EPIC",
            cost: 0,
          }),
          op("PERSISTENT_CHAMPION_FOLLOWUP", undefined, {
            effect: {
              action: "BUFF",
              values: {
                balance: {
                  operation: "GENERATE_RANDOM_MATCH",
                  tag: "마피아",
                  rarities: ["NORMAL", "EPIC"],
                  cardType: "WRESTLER",
                  costReduction: 1,
                },
              },
            },
          }),
        ),
      ];
    case "4b69fb92-c8f9-40f6-9df1-f3309d0bf91f":
      return [
        enter(
          fx("DAMAGE", field("ENEMY", "PLAYER_CHOICE"), { amount: 3 }),
          fx("ADD_KEYWORD", field("SELF"), { keyword: "DODGE" }),
          upgrade(op("DAMAGE_REMAINING_ENEMIES", undefined, { amount: 3 })),
        ),
      ];
    case "52528873-0704-4569-9bd8-2c4ff227ce51":
      return [
        enter(
          op("DISCOVER_CATALOG", undefined, {
            tag: "피니셔",
            count: 3,
            excludeSource: true,
          }),
        ),
      ];
    default:
      return null;
  }
}
