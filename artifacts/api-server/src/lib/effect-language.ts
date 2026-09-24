export const EFFECT_LANGUAGE_NORMALIZER_VERSION = 1 as const;

export type EffectLanguageNormalization = {
  version: typeof EFFECT_LANGUAGE_NORMALIZER_VERSION;
  normalizedText: string;
  corrections: string[];
};

export type EffectSemanticAmbiguity = {
  code:
    | "UNSPECIFIED_ACTION"
    | "UNSPECIFIED_REMOVAL"
    | "UNSPECIFIED_VALUE"
    | "UNSPECIFIED_STAT"
    | "UNSPECIFIED_TARGET"
    | "UNRESOLVED_PRONOUN";
  question: string;
};

type Rewrite = {
  code: string;
  pattern: RegExp;
  replacement: string;
};

const safeRewrites: readonly Rewrite[] = [
  { code: "TYPO_MUJAKI", pattern: /무작이/giu, replacement: "무작위" },
  { code: "TYPO_RETIRE", pattern: /리타어/giu, replacement: "리타이어" },
  { code: "TYPO_COST_DECREASE", pattern: /비용\s*깍/giu, replacement: "비용 깎" },
  { code: "SLANG_RANDOM", pattern: /랜덤/giu, replacement: "무작위" },
  { code: "SLANG_LOWEST", pattern: /젤/gu, replacement: "가장" },
  { code: "SLANG_TURN_END", pattern: /턴\s*끝/gu, replacement: "턴 종료" },
  { code: "SLANG_TURN_START", pattern: /턴\s*시작/gu, replacement: "턴 시작" },
  {
    code: "SLANG_ALLY_EXCLUSION",
    pattern: /나\s*빼고/gu,
    replacement: "자신을 제외하고",
  },
  {
    code: "SLANG_ALLY_FIELD",
    pattern: /내\s*필드\s*애들?/gu,
    replacement: "아군 선수",
  },
  {
    code: "SLANG_HAND_AND_DECK",
    pattern: /손\s*(?:이랑|하고|과)\s*덱/gu,
    replacement: "손패와 덱",
  },
  {
    code: "SLANG_CHAMPION_TOKEN",
    pattern: /챔\s*토큰\s*(?:빼|제외)/gu,
    replacement: "챔피언 토큰 제외",
  },
  {
    code: "SLANG_RANDOM_WRESTLER",
    pattern: /(?:랜덤|무작위)\s*한?\s*(?:놈|애)(?:\s*하나)?/giu,
    replacement: "무작위 선수 하나",
  },
  {
    code: "SLANG_WRESTLER",
    pattern: /(상대|적|아군|내)\s*(?:놈|애)(?=\s|하나|\d|$)/gu,
    replacement: "$1 선수",
  },
  {
    code: "ABBREVIATION_DAMAGE",
    pattern: /(\d+)\s*(?:뎀|딜)/giu,
    replacement: "$1 피해",
  },
  {
    code: "DAMAGE_TERM",
    pattern: /(\d+)\s*데미지/giu,
    replacement: "$1 피해",
  },
  {
    code: "ABBREVIATION_COST_DECREASE",
    pattern: /코\s*(\d+)\s*(?:깎|감소)(?:고)?/giu,
    replacement: "비용 -$1",
  },
  {
    code: "ABBREVIATION_CHEAPER",
    pattern: /(\d+)\s*싸게/giu,
    replacement: "비용 -$1",
  },
  {
    code: "ABBREVIATION_COST_THRESHOLD",
    pattern: /(\d+)\s*코\s*이상/giu,
    replacement: "$1 비용 이상",
  },
  {
    code: "ABBREVIATION_STAT_PAIR",
    pattern: /공체\s*(\d+)\s*씩?/giu,
    replacement: "공격력 +$1 체력 +$1",
  },
  {
    code: "ABBREVIATION_STAT_PAIR",
    pattern: /공\s*(\d+)\s*(?:(?:및|과|[,，])\s*)?체\s*(\d+)/giu,
    replacement: "공격력 +$1 체력 +$2",
  },
  {
    code: "ABBREVIATION_LOW_HEALTH",
    pattern: /(?:피|체력)(?:\s*(?:가|이|는))?\s*(?:가장|제일)?\s*(?:낮은|적은)\s*(?:놈|애|선수)?/gu,
    replacement: "체력이 가장 낮은 선수",
  },
  {
    code: "ABBREVIATION_LOW_HEALTH",
    pattern: /(?:피|체력)(?:\s*(?:가|이|는))?\s*가장\s*(?:낮은|적은)\s*(?:놈|애|선수)?/gu,
    replacement: "체력이 가장 낮은 선수",
  },
  {
    code: "SLANG_ATTACK_SURVIVED",
    pattern: /^(?:이\s*카드가\s*)?공격(?:하고|한\s*뒤(?:에)?)\s*(?:살면|안\s*죽었으면|안죽었으면|죽지\s*않으면)\s*[:,：]?\s*/u,
    replacement: "ATTACK_SURVIVED: ",
  },
  {
    code: "SLANG_ENTER_FIELD",
    pattern: /^(?:필드에\s*)?(?:나올\s*때|필드\s*나오면|나오면)\s*[:,：]?\s*/u,
    replacement: "등장: ",
  },
];

function applyRewrite(text: string, rewrite: Rewrite): { text: string; changed: boolean } {
  const next = text.replace(rewrite.pattern, rewrite.replacement);
  return { text: next, changed: next !== text };
}

function restoreCommonWordBoundaries(text: string): string {
  return text
    .replace(/(등장|출현)(?=(?:상대|적|상대방|아군|내|필드))/gu, "$1 ")
    .replace(/(상대방|상대|적|아군|내)(?=(?:중|필드|보드|무작위|랜덤|선수|카드|캐릭터|챔피언|손|덱))/gu, "$1 ")
    .replace(/중(?=(?:체력|공격력|비용|선수|카드|피해))/gu, "중 ")
    .replace(/(선수|유닛|카드|캐릭터|대상|놈)(?=(?:하나|한장|\d))/gu, "$1 ")
    .replace(/(선수|유닛|카드|캐릭터)(?=(?:공격력|체력|비용))/gu, "$1 ")
    .replace(/(제외하고|제외해|하고|그리고)(?=(?:상대|적|아군|내|자신|손패|덱|필드|보드))/gu, "$1 ")
    .replace(/(손패|덱|필드|보드)(?=\d)/gu, "$1 ")
    .replace(/(이상|이하)(?=(?:전부|모든))/gu, "$1 ")
    .replace(/(전부|모든)(?=(?:비용|공격력|체력|피해|\d))/gu, "$1 ")
    .replace(/(하나|한장)(?=\d|퇴장|파괴|리타이어|제거)/gu, "$1 ")
    .replace(/(퇴장|파괴|리타이어|제거)(?=챔피언|카드|선수|토큰)/gu, "$1 ")
    .replace(/(-?\d+)(?=(?:손으로|덱으로|필드|보드|상대|적|아군|카드|선수))/gu, "$1 ")
    .replace(/(\d+)(?=(?:뎀|딜|공|체|코|턴))/giu, "$1 ");
}

function isConcreteAction(text: string): boolean {
  return /(?:DAMAGE|BUFF|SET_STAT|SET_STATS|MODIFY_STAT|RETIRE|DESTROY|REMOVE_FROM_GAME|MOVE_TO_HAND|MOVE_TO_DECK|STUN|SILENCE|DRAW|SUMMON|GENERATE|REVIVE|ADD_KEYWORD|REMOVE_KEYWORD|파괴|리타이어|퇴장|피해|데미지|기절|침묵|드로우|뽑|소환|생성|부활|이동|보내|증가|감소|올리|낮추|버프|약화|도발|회피)/iu.test(text);
}

export function normalizeEffectLanguage(input: string): EffectLanguageNormalization {
  const corrections = new Set<string>();
  let normalizedText = input
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/[：]/gu, ":")
    .replace(/[.。!！?？]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (normalizedText !== input.normalize("NFC").trim()) corrections.add("PUNCTUATION_AND_SPACING");
  for (const rewrite of safeRewrites) {
    const result = applyRewrite(normalizedText, rewrite);
    normalizedText = result.text;
    if (result.changed) corrections.add(rewrite.code);
  }

  const withBoundaries = restoreCommonWordBoundaries(normalizedText)
    .replace(/\s+/gu, " ")
    .trim();
  if (withBoundaries !== normalizedText) corrections.add("RESTORED_WORD_BOUNDARIES");
  normalizedText = withBoundaries;

  return {
    version: EFFECT_LANGUAGE_NORMALIZER_VERSION,
    normalizedText,
    corrections: [...corrections],
  };
}

export function detectEffectSemanticAmbiguities(input: string): EffectSemanticAmbiguity[] {
  const text = normalizeEffectLanguage(input).normalizedText;
  const ambiguities: EffectSemanticAmbiguity[] = [];
  const add = (code: EffectSemanticAmbiguity["code"], question: string) => {
    if (!ambiguities.some((item) => item.code === code)) ambiguities.push({ code, question });
  };
  const concreteAction = isConcreteAction(text);
  const explicitChampionUpgrade = /고유\s*능력[^.!?]{0,16}강화/iu.test(text);

  if (/(?:처리|치워|치우|없애|없애줘|삭제|죽여|죽이|제거)/iu.test(text) &&
      !/(?:파괴|리타이어|퇴장|DESTROY|RETIRE|REMOVE_FROM_GAME|게임에서\s*제거|키워드[^.!?]{0,12}제거)/iu.test(text)) {
    add("UNSPECIFIED_REMOVAL", "제거 방식이 파괴, 리타이어, 게임에서 제거 중 무엇인지 지정해 주세요.");
  }

  if (/(?:세게|약하게|강하게|적당히|버프|약화|강화)/iu.test(text) &&
      !explicitChampionUpgrade &&
      !/(?:[+-]?\d+|공격력|체력|비용|공체|도발|회피|기절|침묵|RUSH|DODGE|TAUNT)/iu.test(text)) {
    add("UNSPECIFIED_VALUE", "강화·약화할 값과 수치, 또는 적용할 구체적인 키워드를 지정해 주세요.");
  }

  if (/(?:피|체력)\s*(?:올려|높여|늘려|회복|치유)/iu.test(text) &&
      !/\d/u.test(text)) {
    add("UNSPECIFIED_VALUE", "회복 또는 체력 증가량을 지정해 주세요.");
  }

  if (/(?:피해|데미지)(?:를|을)?\s*(?:줘|준다|줍니다|입혀|입힌다)/iu.test(text) &&
      !/\d/u.test(text) &&
      !/(?:만큼|수치|결과값|RESULT_VALUE)/iu.test(text)) {
    add("UNSPECIFIED_VALUE", "피해량을 지정해 주세요.");
  }

  if (/(?:공격력|체력|비용|코스트)[^.!?]{0,20}(?:올려|높여|늘려|증가|감소|강화)/iu.test(text) &&
      !/\d/u.test(text) &&
      !/(?:만큼|같은\s*수치|현재\s*공격력|현재\s*체력|RESULT_VALUE)/iu.test(text)) {
    add("UNSPECIFIED_VALUE", "변경량을 지정해 주세요.");
  }

  if (/\d+\s*(?:올려|올려줘|증가|낮춰|줄여)/iu.test(text) &&
      !/(?:공격력|공격|체력|피해|데미지|비용|코스트|골드|공체)/iu.test(text)) {
    add("UNSPECIFIED_STAT", "변경할 능력치나 자원을 지정해 주세요.");
  }

  if (/(?:가져와|가져오|데려와|데려오)/iu.test(text) &&
      !/(?:손|손패|덱|묘지|무덤|필드|보드|패|카드|선수|소환|부활)/iu.test(text)) {
    add("UNSPECIFIED_TARGET", "가져올 카드의 출처 구역과 대상을 지정해 주세요.");
  }

  if (/(?:손으로|덱으로)\s*(?:보내|옮겨)/iu.test(text) &&
      !/(?:선수|카드|챔피언|토큰|선택한|무작위|랜덤|묘지|필드|보드|손패|덱)/iu.test(text)) {
    add("UNSPECIFIED_TARGET", "이동할 카드와 현재 구역을 지정해 주세요.");
  }

  if (/(?:그\s*카드|그놈|걔|쟤|방금\s*고른\s*애)/iu.test(text) &&
      !/(?:선택|고른|소환|생성|부활|뽑|드로우|먼저|직전|방금)/iu.test(text)) {
    add("UNRESOLVED_PRONOUN", "대명사가 가리키는 대상을 지정하거나, 그 대상을 먼저 선택·생성해 주세요.");
  }

  if (/(?:하나|한놈|한\s*장)?\s*(?:줘|주세요|주라)\s*$/iu.test(text) &&
      !/(?:부여|버프|피해|데미지|기절|침묵|도발|회피|소환|생성|추가|증가|감소)/iu.test(text)) {
    add("UNSPECIFIED_ACTION", "무엇을 어떤 방식으로 줄지(카드 생성, 소환, 능력 부여 등) 지정해 주세요.");
  }

  if (/(?:상대|적|아군|내)\s*(?:선수|카드|대상)?\s*(?:하나|한\s*장)/iu.test(text) &&
      !concreteAction) {
    add("UNSPECIFIED_ACTION", "대상에게 실행할 동작을 지정해 주세요.");
  }

  if (/(?:보내|옮겨|이동)/iu.test(text) &&
      !/(?:손패|손으로|덱|묘지|무덤|필드|보드|제외|추방)/iu.test(text)) {
    add("UNSPECIFIED_TARGET", "카드를 어디로 이동할지 지정해 주세요.");
  }

  if (!concreteAction && !explicitChampionUpgrade && /(?:효과|능력|강해짐|약해짐|처리|뭔가|적당히)/iu.test(text)) {
    add("UNSPECIFIED_ACTION", "실행할 게임 동작을 구체적으로 지정해 주세요.");
  }

  return ambiguities;
}