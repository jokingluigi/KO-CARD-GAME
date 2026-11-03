import {
  DECK_SIZE,
  MAX_LEGENDARY_CARDS,
  MAX_COPIES_BY_RARITY,
} from "@workspace/game-engine/rules";
import { BOARD_SIZE, MAX_HAND_SIZE } from "../../game/rules/constants";
export const GUIDE_CATEGORIES = [
  ["all", "전체"],
  ["start", "기본 규칙"],
  ["combat", "전투 판정"],
  ["champion", "챔피언·토큰"],
  ["keywords", "키워드 사전"],
  ["account", "계정·보상"],
] as const;
export type GuideCategory = (typeof GUIDE_CATEGORIES)[number][0];
export type GuideEntry = {
  id: string;
  category: Exclude<GuideCategory, "all">;
  title: string;
  answer: string;
  example?: string;
  terms?: string;
  source: string;
};
export const GUIDE_CHAPTERS: Record<
  Exclude<GuideCategory, "all">,
  { title: string; description: string }
> = {
  start: {
    title: "1. 기본 규칙 · 경기 준비",
    description:
      "승리 조건부터 덱 구성, 카드 조작까지 처음 시작할 때 필요한 내용입니다.",
  },
  combat: {
    title: "2. 전투 판정",
    description:
      "피해·공격·능력 사용·퇴장처럼 실제 경기 결과를 결정하는 규칙입니다.",
  },
  champion: {
    title: "3. 챔피언과 챔피언 토큰",
    description:
      "본체와 토큰의 차이, 출전, 본체 보호와 침묵 면역을 한곳에서 확인하세요.",
  },
  keywords: {
    title: "4. 키워드 사전",
    description: "카드에 적힌 키워드의 기본 뜻을 찾아보는 참고 자료입니다.",
  },
  account: {
    title: "5. 계정 · 수집 · 보상",
    description: "스킨·이모티콘·재화·기록 등 경기 밖 기능을 안내합니다.",
  },
};
/** Player-facing explanations of existing rules. Do not infer effects from illustrations or animation. */
export const GAME_GUIDE: GuideEntry[] = [
  {
    id: "champion-token-identity",
    category: "champion",
    title: "챔피언 본체와 챔피언 토큰 카드는 무엇이 다른가요?",
    answer:
      "챔피언 본체는 화면의 초상화와 체력·고유능력을 가진 내 지휘관입니다. 챔피언 토큰 카드는 그와 별도로 필드에 나오는 카드입니다. 필드 칸을 차지하고 자체 공격력·체력·효과를 가집니다. 일반 토큰이나 레전더리 선수와도 구별하세요.",
    example:
      "필드의 챔피언 토큰이 퇴장했다고 챔피언 본체의 체력이 함께 0이 되는 것은 아닙니다. 승패는 본체의 체력과 기존 특수 판정을 따릅니다.",
    terms: "챔피언 등급 CHAMPION 일반 토큰",
    source: "game/engine/champion-token.ts; game/engine/direct-champion.ts",
  },
  {
    id: "champion-token-deploy",
    category: "champion",
    title: "챔피언 토큰은 어떻게 얻고 출전시키나요?",
    answer:
      "챔피언에게 연결된 토큰은 해당 챔피언의 능력·퀘스트 보상 등 카드에 적힌 효과로 생성되거나 출전합니다. 모든 챔피언이 같은 조건으로 토큰을 소환하는 것은 아닙니다. 일반 출전 덱에 토큰을 직접 넣는 방식은 아닙니다.",
    example:
      "내 챔피언의 고유능력과 퀘스트 보상 설명에서 어떤 카드가 나오는지 확인하세요.",
    source: "game/engine/champion-token.ts; game/champions/quests.ts",
  },
  {
    id: "champion-token-protection",
    category: "champion",
    title: "챔피언 토큰이 있으면 왜 본체를 공격할 수 없나요?",
    answer:
      "내 필드에 챔피언 토큰·직접 출전 챔피언 또는 챔피언 등급 카드가 있으면 챔피언 본체가 보호됩니다. 본체를 향한 공격과 효과·피로 피해를 막는 기존 규칙입니다. 토큰이 손패나 묘지에 있는 것만으로는 본체가 보호되지 않습니다.",
    example:
      "본체를 지키는 카드가 필드를 떠나고 다른 보호 카드도 없다면 보호가 끝납니다. 토큰 자체의 방어·면역·체력은 별도로 확인하세요.",
    terms: "보호 PROTECTED 본체 무적",
    source:
      "game/engine/direct-champion.ts; game/engine/protection-rules.test.ts",
  },
  {
    id: "champion-token-space",
    category: "champion",
    title: "토큰 출전 시 필드가 꽉 차 있으면 어떻게 되나요?",
    answer:
      "일반적인 챔피언 직접 출전은 빈칸이 있으면 그곳으로 나옵니다. 빈칸이 없으면 손패로 가고, 손패도 가득 차면 덱 위로 갑니다. 퀘스트 보상으로 출전하는 경우에는 기존 보상 공간 확보·교체 선택 절차를 따릅니다.",
    example:
      "공간 처리 중 선택 안내가 나오면 화면에 표시된 유효한 카드를 골라 진행하세요. 다른 소환 효과까지 모두 같은 처리가 된다고 생각하면 안 됩니다.",
    source:
      "game/engine/champion-token.ts; game/engine/champion-reward-replacement.ts",
  },
  {
    id: "champion-token-departure",
    category: "champion",
    title: "챔피언 토큰은 어떻게 상대하나요?",
    answer:
      "침묵 면역은 모든 공격과 퇴장을 막는 무적이 아닙니다. 공격 피해·기절·리타이어·파괴·소멸은 각각의 판정을 따릅니다. 다만 토큰에 방어·면역·회피 같은 다른 보호가 함께 있다면 그 보호를 먼저 확인해야 합니다.",
    example:
      "침묵으로 능력을 지우려 하기보다, 그 카드에 실제로 가능한 공격과 효과 대상을 확인하세요.",
    terms: "제거 처치 약점 무적",
    source:
      "game/engine/champion-token-silence.test.ts; game/engine/protection-rules.test.ts",
  },

  {
    id: "gold",
    category: "combat",
    title: "남은 골드를 다음 턴에 모아둘 수 있나요?",
    answer:
      "기본 골드는 자기 행동 턴 시작 시 1, 2, 3…으로 늘어나며 최대 6까지 지급됩니다. 쓰지 않은 골드를 계속 쌓는 방식이 아닙니다. 다음 턴 추가 골드 같은 효과는 기본 지급과 별도로 처리되므로 실제 보유량과 카드 비용을 확인하세요.",
    source: "game/engine/turn-system.ts",
  },
  {
    id: "fatigue",
    category: "combat",
    title: "덱이 비면 바로 패배하나요?",
    answer:
      "빈 덱에서 카드를 뽑으려 할 때 피로가 발생하고, 누적 피로 횟수에 따른 피해를 챔피언이 받습니다. 일반적으로 1, 2, 3…으로 커집니다. 체력이 0이 되면 승패 판정을 따릅니다. 피로 피해를 막는 별도 보호 효과가 있다면 해당 규칙을 함께 적용합니다.",
    source: "game/engine/draw-card.ts",
  },
  {
    id: "overdraw",
    category: "combat",
    title: "손패가 가득 찬 상태에서 카드를 뽑으면요?",
    answer:
      "일반 드로우에서 손패가 이미 최대라면 새로 뽑은 카드는 손패에 남지 않고 전투에서 제거됩니다. 묘지로 보내는 리타이어와 다릅니다. 카드 생성·복귀·퀘스트 보상은 각 효과의 공간 처리 안내를 확인하세요.",
    terms: "과다 드로우 오버드로우 손패 초과",
    source: "game/engine/draw-card.ts",
  },
  {
    id: "protections",
    category: "combat",
    title: "면역·방어·회피·침묵 면역은 같은 건가요?",
    answer:
      "아니요. 면역은 카드·챔피언 효과의 직접 지정 제한이며 모든 피해를 0으로 만든다는 뜻이 아닙니다. 방어는 등장 직후 일정 기간의 피해·대상 지정·퇴장 효과 보호입니다. 회피는 받는 피해를 정해진 횟수만큼 무효화합니다. 침묵 면역은 침묵의 영향만 막습니다. 자세한 범위는 키워드 항목을 확인하세요.",
    source:
      "components/alt-inspector-utils.ts; game/engine/champion-token-silence.test.ts",
  },

  {
    id: "win",
    category: "start",
    title: "어떻게 승리하나요?",
    answer:
      "상대 챔피언의 체력을 0으로 만드는 것이 기본 승리 조건입니다. 항복이나 카드에 적힌 특수 승패 조건도 있으므로 최종 결과는 게임 판정을 따릅니다. 두 챔피언의 체력과 중요한 카드 효과를 함께 확인하세요.",
    source: "game/engine/combat.ts; game/actions/engine-actions.ts",
  },
  {
    id: "deck",
    category: "start",
    title: "출전 덱은 어떻게 준비하나요?",
    answer: `챔피언 1명과 카드 ${DECK_SIZE}장으로 구성합니다. 같은 카드는 일반 ${MAX_COPIES_BY_RARITY.NORMAL}장, 에픽 ${MAX_COPIES_BY_RARITY.EPIC}장, 레전더리 ${MAX_COPIES_BY_RARITY.LEGENDARY}장까지이며, 덱 전체의 레전더리는 최대 ${MAX_LEGENDARY_CARDS}장입니다. 일반 출전 덱에는 토큰을 직접 넣지 않습니다.`,
    example:
      "덱 편집에서 저장한 뒤 출전 덱으로 지정하세요. 빠른 대전과 AI 대전은 그 덱을 사용합니다.",
    source: "lib/game-engine/src/rules.ts; pages/decks.tsx",
  },
  {
    id: "saved-selected",
    category: "start",
    title: "덱을 저장했는데 출전 덱이 바뀌지 않았어요.",
    answer:
      "저장과 출전 지정은 서로 다른 행동입니다. 저장은 덱 구성을 보관하고, 출전 지정은 실제 대전에 사용할 덱을 선택합니다. 수정 중인 덱은 먼저 저장하고 출전으로 지정하세요. 대기열에 들어간 뒤 덱을 바꿔도 이미 준비 중인 경기의 구성은 바뀌지 않습니다.",
    source: "pages/decks.tsx; online/lobby.ts; lib/frozen-launch-deck.ts",
  },
  {
    id: "practice",
    category: "start",
    title: "규칙 설명과 직접 연습은 어디서 보나요?",
    answer:
      "이 도움말은 궁금한 내용을 찾아 읽는 용도입니다. 플레이 배우기에서는 카드 선택·소환·공격·주문 대상 지정·액티브·챔피언 능력을 직접 연습합니다. 비회원 연습은 계정의 카드·재화·실전 기록을 바꾸지 않습니다.",
    source: "components/tutorial/lesson-engine.ts; components/home-entry.tsx",
  },
  {
    id: "spaces",
    category: "start",
    title: "필드와 손패에는 몇 장까지 둘 수 있나요?",
    answer: `선수 필드는 각자 ${BOARD_SIZE}칸이고 손패는 최대 ${MAX_HAND_SIZE}장입니다. 빈칸·손패 공간을 요구하는 효과는 공간 상황도 확인해야 합니다. 공간이 없을 때의 처리는 해당 효과의 규칙과 선택 안내를 따릅니다.`,
    source: "game/rules/constants.ts; game/engine/champion-token.ts",
  },
  {
    id: "summon",
    category: "start",
    title: "모바일에서 카드 내기와 공격은 어떻게 하나요?",
    answer:
      "손패의 선수를 고른 뒤 내 필드의 빈칸을 누르거나, 손패에서 빈칸으로 드래그합니다. 공격은 내 선수를 고르고 강조된 상대 선수·챔피언을 누르거나 상대에게 드래그합니다. 손패는 좌우로 밀어 다른 카드를 볼 수 있습니다.",
    source:
      "components/battle-card-drag.tsx; components/battle-attack-drag.tsx",
  },
  {
    id: "inspect",
    category: "start",
    title: "작은 카드의 전체 효과와 관련 카드는 어떻게 보나요?",
    answer:
      "카드의 ⓘ 버튼으로 상세 정보를 여세요. PC에서는 ALT로 정보 모드를 전환할 수 있습니다. 설명에서 밑줄로 표시된 카드명·키워드는 눌러서 추가 정보를 확인할 수 있습니다. 전투에서 효과가 예상과 달랐다면 로그의 실제 처리 결과도 확인하세요.",
    source: "components/alt-inspector.tsx; components/card-rules-text.tsx",
  },
  {
    id: "turn",
    category: "combat",
    title: "내 턴과 화면의 턴 숫자는 같은 건가요?",
    answer:
      "화면의 한 턴은 두 플레이어의 행동 턴을 묶어 셉니다. 턴 종료를 누르면 상대에게 행동권이 넘어갑니다. 카드가 말하는 자기 턴 시작·자기 턴 종료와 화면의 턴 숫자를 구별해 읽으세요.",
    terms: "라운드 횟수 제한",
    source: "lib/game-engine/src/rules.ts; components/match-tutorial.tsx",
  },
  {
    id: "entry",
    category: "combat",
    title: "소환한 선수가 왜 바로 공격하지 못하나요?",
    answer:
      "일반 선수는 소환한 행동 턴에 공격할 수 없습니다. 러쉬는 등장한 턴에도 선수와 상대 챔피언을 공격할 수 있고, 기습은 등장한 턴에 상대 선수만 공격할 수 있습니다. 공격불가·기절·도발 같은 다른 제한도 함께 적용됩니다.",
    example: "기습 선수를 방금 냈다면 상대 챔피언을 직접 때릴 수는 없습니다.",
    source: "game/engine/keyword-rules.ts; components/alt-inspector-utils.ts",
  },
  {
    id: "active",
    category: "combat",
    title: "액티브는 매 턴 한 번인가요?",
    answer:
      "아니요. 필드에 있는 동안 총 1회입니다. 소환한 턴에는 사용할 수 없고 다음 자기 턴부터 사용할 수 있습니다. 사용 후 다음 턴이 오거나 변신해도 다시 쓸 수 없습니다. 사용 확정 전 취소하거나 사용에 실패한 경우에는 소모되지 않습니다.",
    example:
      "사용 완료라고 표시된 액티브는 턴을 넘겨도 다시 활성화되지 않습니다.",
    source: "game/engine/active-once.test.ts; game/engine/card-status.ts",
  },
  {
    id: "combo",
    category: "combat",
    title: "콤보는 공격이 끝난 다음 발동하나요?",
    answer:
      "유효한 공격이 확정되면 피해 계산 전에 관련 콤보를 처리합니다. 따라서 그 콤보가 이번 공격의 공격력을 바꾸면 바뀐 수치가 피해에 반영될 수 있습니다. 공격 대상만 살펴보거나 불가능한 공격을 시도한 것으로는 발동하지 않습니다.",
    source: "game/engine/combo-before-attack.test.ts; game/engine/combat.ts",
  },
  {
    id: "cancel",
    category: "combat",
    title: "대상 선택은 언제 취소할 수 있나요?",
    answer:
      "사용 확정 전 선택은 취소할 수 있고 카드와 골드를 소모하지 않습니다. 이미 효과가 처리되기 시작한 뒤에는 취소할 수 없는 필수 선택도 있습니다. 화면의 선택 가능한 대상과 취소 버튼 상태를 확인하세요. 선택을 취소하는 것과 처리된 효과를 되돌리는 것은 다릅니다.",
    source: "game/effects/effect-engine.ts; game/actions/engine-actions.ts",
  },
  {
    id: "departures",
    category: "combat",
    title: "리타이어·파괴·소멸은 뭐가 다른가요?",
    answer:
      "리타이어는 체력 0 또는 리타이어 효과로 처리되며 관련 리타이어 반응과 연결됩니다. 파괴는 별도 파괴 판정이며 리타이어와 같은 사건으로 세지 않습니다. 소멸은 묘지에 보내지 않고 현재 전투에서 제거합니다. 손패·덱 복귀나 변신도 이 셋과 구별합니다.",
    example:
      "“아군 리타이어 시” 효과를 파괴·소멸로도 발동한다고 생각하면 안 됩니다.",
    source:
      "game/effects/effect-engine.ts; game/engine/zombie-multi-buff.test.ts",
  },
  {
    id: "silence-immune",
    category: "champion",
    title: "챔피언 등급 토큰은 침묵이 안 걸리나요?",
    answer:
      "네. 챔피언 등급 토큰 선수는 침묵 면역입니다. 침묵으로 키워드·능력이 제거되지 않습니다. 일반 토큰·레전더리 토큰이라는 이유만으로 이 면역이 생기지는 않습니다. 챔피언 본체와 필드에 놓인 챔피언 등급 토큰도 구별하세요.",
    example:
      "침묵 면역은 파괴·소멸·기절·피해까지 막는 보호가 아닙니다. 각각 다른 규칙을 따릅니다.",
    terms: "침묵면역 CHAMPION 챔피언 카드",
    source:
      "game/cards/silence-immunity.ts; game/engine/champion-token-silence.test.ts",
  },
  {
    id: "armor",
    category: "combat",
    title: "아머가 있는데 주문 피해는 왜 그대로 받나요?",
    answer:
      "아머는 공격·반격으로 받는 피해를 수치만큼 줄이고 최소 피해는 0입니다. 카드 효과 피해는 줄이지 않습니다. 일반 면역·방어·회피와 서로 다른 규칙입니다.",
    example:
      "아머 2인 선수가 공격 피해 5를 받으면 다른 경감이 없을 때 3을 받습니다. 카드 효과 피해 5에는 아머 경감을 적용하지 않습니다.",
    source: "components/alt-inspector-utils.ts; game/engine/combat.ts",
  },
  {
    id: "quest",
    category: "champion",
    title: "퀘스트 완료·각성과 표정 변화는 같은 건가요?",
    answer:
      "퀘스트는 각 챔피언에 적힌 조건을 실제 전투 결과로 달성했을 때 완료됩니다. 표정·각성 이미지·사운드는 그 결과를 보여주는 연출입니다. 스킨이나 표정 설정을 바꿔도 능력·퀘스트 판정은 바뀌지 않습니다.",
    source: "game/champions/quests.ts; components/champion-battle-actor.tsx",
  },
  {
    id: "zombie",
    category: "combat",
    title: "좀비가 여러 장이면 강화는 한 장만 받나요?",
    answer:
      "필드에 있는 각 좀비가 자기 반응을 처리합니다. 아군 리타이어로 받는 강화는 각 좀비마다 화면에 표시된 한 턴 전체에서 최대 2회입니다. 고유능력 등 다른 효과로 기존 좀비들에게 주는 버프와 이 횟수 제한은 구별합니다.",
    source:
      "game/engine/zombie-multi-buff.test.ts; game/engine/zombie-token.ts",
  },
  {
    id: "skin",
    category: "account",
    title: "스킨을 얻었는데 원본 카드가 없으면요?",
    answer:
      "팩에서 스킨을 얻었을 때 해당 원본이 없다면 원본도 함께 지급됩니다. 챔피언 스킨에 토큰 이미지가 연결되어 있으면 해당 챔피언 토큰에도 그 외형을 사용합니다. 스킨은 카드 성능을 바꾸지 않습니다.",
    source:
      "api-server/src/routes/packs.ts; api-server/src/lib/skin-original-grant.ts",
  },
  {
    id: "duplicate",
    category: "account",
    title: "중복 스킨·이모티콘은 어떻게 되나요?",
    answer:
      "중복 꾸미기는 일반 프리즘으로 전환됩니다. 현재 지급 수량은 내 팩·팩 상세 안내와 개봉 결과에서 확인하세요. 챔피언 중복 해금에 지급되는 챔피언 프리즘과는 별도입니다.",
    source:
      "api-server/src/routes/packs.ts; components/cosmetic-duplicate-policy.tsx",
  },
  {
    id: "emote",
    category: "account",
    title: "이모티콘을 장착해야 사용할 수 있나요?",
    answer:
      "이미지 이모티콘은 장착하지 않아도 보유하고 있으면 전투에서 사용할 수 있습니다. 상대 이모티콘을 보고 싶지 않다면 전투의 숨김 설정을 이용하세요. 챔피언의 기본 감정표현과 보유 이미지 이모티콘은 구별됩니다.",
    source:
      "components/cosmetic-battle.tsx; api-server/src/lib/owned-image-emote.ts",
  },
  {
    id: "currencies",
    category: "account",
    title: "크레딧·일반 프리즘·챔피언 프리즘은 어떻게 다른가요?",
    answer:
      "상점에서는 상품에 표시된 재화를 확인하세요. 일반 프리즘은 일반 카드 제작·분해에, 챔피언 프리즘은 챔피언 제작과 중복 챔피언 보상에 사용됩니다. 실제 비용·보상은 각 화면에 표시된 현재 설정을 따릅니다.",
    source:
      "api-server/src/routes/prism.ts; api-server/src/lib/champion-prism.ts; pages/shop.tsx",
  },
  {
    id: "recovery",
    category: "account",
    title: "로그인이나 저장이 늦으면 계속 눌러도 되나요?",
    answer:
      "처리 중에는 중복 요청을 피하세요. 팩 개봉 응답이 끊기면 보유량만 보고 새로 개봉하지 말고 이전 요청 확인 기능으로 결과를 복구하세요. 비밀번호는 로그인 화면의 복구 링크 또는 설정의 계정 항목에서 변경할 수 있습니다.",
    source: "pages/packs.tsx; lib/auth-client.ts; pages/account-recovery.tsx",
  },
  {
    id: "settings",
    category: "account",
    title: "글자가 작거나 흔들림이 부담스러워요.",
    answer:
      "메인 설정의 화면·접근성에서 카드 설명·대사 글자 크기와 전투 안내를 조절하세요. 강한 타격·편안한 표현·움직임 최소화 프리셋도 있습니다. 소리 설정은 별도 항목이며 설정은 현재 기기에 저장됩니다.",
    source: "pages/settings.tsx; components/combat-settings.tsx",
  },
  {
    id: "journal",
    category: "account",
    title: "내 기록은 공식 전적인가요?",
    answer:
      "내 기록은 기기에 보관하는 유저용 기록이며 공식 순위 전적은 아닙니다. 계정 동기화는 화면의 상태로 확인하세요. 동기화 준비 중이거나 연결에 실패해도 이 기기의 기록은 유지됩니다. 비회원 연습 완료 표시는 해당 기기에 저장됩니다.",
    source:
      "components/player-tools/shelf.ts; pages/player-notebook.tsx; components/tutorial/lesson-ui.tsx",
  },
];
export function searchGuide(
  entries: GuideEntry[],
  query: string,
  category: GuideCategory,
) {
  const terms = query
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko")
    .split(/\s+/)
    .filter(Boolean);
  const filtered = entries.filter(
    (e) =>
      (category === "all" || e.category === category) &&
      terms.every((term) =>
        [e.title, e.answer, e.example ?? "", e.terms ?? ""]
          .join(" ")
          .normalize("NFKC")
          .toLocaleLowerCase("ko")
          .includes(term),
      ),
  );
  if (!terms.length) return filtered;
  const score = (e: GuideEntry) =>
    terms.reduce(
      (sum, term) =>
        sum +
        (e.title.normalize("NFKC").toLocaleLowerCase("ko").includes(term)
          ? 4
          : 0) +
        ((e.terms ?? "")
          .normalize("NFKC")
          .toLocaleLowerCase("ko")
          .includes(term)
          ? 2
          : 0),
      0,
    );
  return filtered.sort((a, b) => score(b) - score(a));
}
