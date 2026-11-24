/**
 * 카드 효과 글 맞춤법 도우미 — rule-based checks tuned for KO CARD GAME wording.
 * It never changes text by itself: it returns suggestions, and the admin screen applies the ones the user picks.
 * House style (from the live cards): "등장:" with no space, "2 데미지" with a space, keywords in '작은따옴표',
 * "묘지" (not 무덤), "데미지" (not 피해), sentences end with ".".
 */

export type SpellingFix = { id: string; from: string; to: string; reason: string; start: number; end: number };

const HANGUL_BASE = 0xac00;
const isHangul = (ch: string) => { const c = ch.charCodeAt(0); return c >= HANGUL_BASE && c <= 0xd7a3; };
/** 받침 code: 0 = no 받침, 8 = ㄹ, others = other 받침. */
function batchim(ch: string): number | null {
  if (isHangul(ch)) return (ch.charCodeAt(0) - HANGUL_BASE) % 28;
  // digits as read in Korean: 영 일 이 삼 사 오 육 칠 팔 구 (십 for 0 after another digit is close enough)
  const digit: Record<string, number> = { "0": 21, "1": 8, "2": 0, "3": 16, "4": 0, "5": 0, "6": 1, "7": 8, "8": 8, "9": 0 };
  if (ch in digit) return digit[ch]!;
  if (/[a-z]/i.test(ch)) return null;
  return null;
}
const has = (b: number | null) => b !== null && b !== 0;

/** Game words that are always nouns, so particles after them can be checked safely. */
const GAME_NOUNS = [
  "데미지", "공격력", "체력", "카드", "선수", "선수 카드", "기술", "기술 카드", "필드", "묘지", "덱", "손패", "챔피언", "골드", "토큰", "아머", "효과", "턴", "상대", "아군", "적군",
  "도발", "러쉬", "기습", "회피", "방어", "흡혈", "치유", "면역", "연타", "수배", "기절", "침묵", "봉인", "무적", "프로그램", "합체", "등장", "유언", "태그", "수치", "피니셔", "퀘스트", "능력",
];

const PARTICLES: Array<{ re: string; pick: (b: number | null) => string | null; label: string }> = [
  { re: "을|를", pick: (b) => (b === null ? null : has(b) ? "을" : "를"), label: "을/를" },
  { re: "이|가", pick: (b) => (b === null ? null : has(b) ? "이" : "가"), label: "이/가" },
  { re: "은|는", pick: (b) => (b === null ? null : has(b) ? "은" : "는"), label: "은/는" },
  { re: "과|와", pick: (b) => (b === null ? null : has(b) ? "과" : "와"), label: "과/와" },
  { re: "으로|로", pick: (b) => (b === null ? null : has(b) && b !== 8 ? "으로" : "로"), label: "으로/로" },
];

/** Verbs/nouns that look like a wrong 을/를 but are fine. */
const OBJECT_EXCEPTIONS = new Set(["가을", "마을", "노을", "고을", "들를", "다을"]);

const NOUN_VERBS = "파괴|회복|획득|부여|공격|소환|추가|증가|감소|발동|사용|선택|이동|복사|변경|제거|무효화|봉인|기절|침묵|생성|교체|변신|합체|강화|약화|회수|적용|해제|파괴|반사|흡수|저장|배치|등장|퇴장|리타이어|부활|재생|소멸|복제|처치|승리|패배|방어|공개|분해|제작";

type Rule = { re: RegExp; to: (m: RegExpExecArray) => string | null; reason: string };

const RULES: Rule[] = [
  // 게임 용어 통일
  { re: /피해/g, to: () => "데미지", reason: "게임 용어: '피해' 대신 '데미지'" },
  { re: /무덤/g, to: () => "묘지", reason: "게임 용어: '무덤' 대신 '묘지'" },
  { re: /(\d+)\s*(?:점의?\s*)?(데미지|골드)/g, to: (m) => `${m[1]} ${m[2]}`, reason: "숫자와 '데미지'·'골드' 사이는 한 칸 띄어요 (예: 2 데미지, 1 골드)" },
  { re: /(?<![가-힣])(다음|이번|매|상대|내)턴/g, to: (m) => `${m[1]} 턴`, reason: "'다음 턴'처럼 띄어 써요" },
  { re: /(^|\n)(\s*)(등장|퇴장|유언|턴 종료|턴 시작|콤보|업그레이드|액티브|합체|공격 시)\s*:[ \t]+/g, to: (m) => `${m[1]}${m[2]}${m[3]}:`, reason: "'등장:' 처럼 쌍점 뒤는 붙여 써요" },
  { re: /(^|\n)(\s*)(등장|퇴장|유언|턴 종료|턴 시작|콤보|업그레이드|액티브|합체)[ \t]+:/g, to: (m) => `${m[1]}${m[2]}${m[3]}:`, reason: "쌍점 앞은 붙여 써요" },
  { re: /[‘’`]([^‘’`'\n]{1,20})[‘’`]/g, to: (m) => `'${m[1]}'`, reason: "따옴표는 ' ' 로 통일해요" },
  { re: /["“”]([^"“”\n]{1,20})["“”]/g, to: (m) => `'${m[1]}'`, reason: "따옴표는 ' ' 로 통일해요" },
  // 자주 틀리는 말
  { re: /깍/g, to: () => "깎", reason: "'깍다'가 아니라 '깎다'" },
  { re: /됬/g, to: () => "됐", reason: "'됬'이 아니라 '됐'" },
  { re: /되요/g, to: () => "돼요", reason: "'되요'가 아니라 '돼요'" },
  { re: /몇일/g, to: () => "며칠", reason: "'몇일'이 아니라 '며칠'" },
  { re: /왠만/g, to: () => "웬만", reason: "'왠만'이 아니라 '웬만'" },
  { re: /금새/g, to: () => "금세", reason: "'금새'가 아니라 '금세'" },
  { re: /어떻해/g, to: () => "어떡해", reason: "'어떻해'가 아니라 '어떡해'" },
  { re: /(희생|대신|소비)\s*하여/g, to: (m) => `${m[1]}하여`, reason: "'~하여'는 붙여 써요" },
  { re: /최대\s*치/g, to: () => "최댓값", reason: "'최대치' 대신 '최댓값' (표준어)" },
  { re: /갯수/g, to: () => "개수", reason: "'갯수'가 아니라 '개수'" },
  // 띄어쓰기
  { re: /([가-힣])(때|때마다|때까지)(?=[\s,.:]|$)/g, to: (m) => (batchim(m[1]!) === 8 ? `${m[1]} ${m[2]}` : null), reason: "'~할 때'는 띄어 써요" },
  { re: /([가-힣])\s?수(있|없)/g, to: (m) => (batchim(m[1]!) === 8 ? `${m[1]} 수 ${m[2]}` : null), reason: "'수 있다/없다'는 띄어 써요" },
  { re: /(?<![가-힣])(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)(장|번|명|개|칸)(?![가-힣])/g, to: (m) => `${m[1]} ${m[2]}`, reason: "'한 장', '두 번'처럼 띄어 써요" },
  { re: /(?<![가-힣])(한|두|세|네)(장|번|명|개|칸)(에게|을|를|이|의|씩|만|까지|부터|에)(?![가-힣])/g, to: (m) => `${m[1]} ${m[2]}${m[3]}`, reason: "'한 장', '두 번'처럼 띄어 써요" },
  { re: new RegExp(`(${NOUN_VERBS})[ \\t]+(합니다|시킵니다|됩니다|하고|시키고|되고|하며|하면|되면|시키면|한다|된다|할|한|된|될|시킬|하는|되는|시킨|시키는|하지|되지|했|됐|시켰|해|돼|하여|되어|시켜)(?![가-힣])`, "g"), to: (m) => `${m[1]}${m[2]}`, reason: "'파괴합니다'처럼 '~하다'는 붙여 써요" },
  { re: /(\d+)\s+(장|번|명|개|턴|회|칸|배)(?![가-힣])/g, to: (m) => `${m[1]}${m[2]}`, reason: "숫자와 단위는 붙여 써요 (예: 2장, 3회)" },
  { re: /(\d+)\s+(장|번|명|개|턴|회|칸|배)(에게|을|를|이|의|씩|만|까지|부터|에|동안)(?![가-힣])/g, to: (m) => `${m[1]}${m[2]}${m[3]}`, reason: "숫자와 단위는 붙여 써요 (예: 2장, 3회)" },
  { re: /([+-]\d+)\s*\/\s*([+-]?\d+)/g, to: (m) => `${m[1]}/${m[2]}`, reason: "'+1/+1'은 붙여 써요" },
  { re: /([가-힣])\s+([.,!?])/g, to: (m) => `${m[1]}${m[2]}`, reason: "문장 부호 앞은 붙여 써요" },
  { re: /(?<!\.)([.,])([가-힣'])/g, to: (m) => `${m[1]} ${m[2]}`, reason: "쉼표·마침표 뒤는 한 칸 띄어요" },
  { re: /[ \t]{2,}/g, to: () => " ", reason: "띄어쓰기가 두 칸이에요" },
  { re: /[ \t]+(?=\n|$)/g, to: () => "", reason: "줄 끝에 빈칸이 있어요" },
];

function overlaps(a: SpellingFix, list: SpellingFix[]) { return list.some((b) => a.start < b.end && b.start < a.end); }

/** Suggestions for one effect text. `names` = card/champion/tag names used to check particles after them. */
export function checkCardText(text: string, names: readonly string[] = []): SpellingFix[] {
  const fixes: SpellingFix[] = [];
  const push = (start: number, end: number, to: string, reason: string) => {
    const from = text.slice(start, end);
    if (from === to) return;
    const fix = { id: `${start}:${end}:${to}`, from, to, reason, start, end };
    if (!overlaps(fix, fixes)) fixes.push(fix);
  };

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      const to = rule.to(m);
      if (to !== null) push(m.index, m.index + m[0].length, to, rule.reason);
      if (m[0].length === 0) rule.re.lastIndex++;
    }
  }

  // 조사: after quoted words ('마피아'를), game nouns, known names, and numbers.
  const nouns = [...new Set([...names.filter((n) => n.trim().length >= 1), ...GAME_NOUNS])].sort((a, b) => b.length - a.length);
  const escaped = nouns.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  for (const p of PARTICLES) {
    const patterns = [
      new RegExp(`'([^'\\n]{1,30})'(${p.re})(?![가-힣])`, "g"),
      new RegExp(`(?<![가-힣])(${escaped.join("|")})(${p.re})(?![가-힣])`, "g"),
      new RegExp(`(?<![\\d./+-])([+-]?\\d+(?:/[+-]?\\d+)?)(${p.re})(?![가-힣])`, "g"),
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const word = m[1]!, particle = m[2]!;
        const want = p.pick(batchim(word.at(-1)!));
        if (!want || want === particle) continue;
        const start = m.index + m[0].length - particle.length;
        push(start, start + particle.length, want, `받침에 맞는 조사: '${word}${want}' (${p.label})`);
      }
    }
  }
  // 일반 낱말 + 을/를 (두 글자 이상 낱말만, 받침과 안 맞으면)
  const obj = /(?<![가-힣])([가-힣]{2,})(을|를)(?![가-힣])/g;
  let m: RegExpExecArray | null;
  while ((m = obj.exec(text))) {
    const word = m[1]!, particle = m[2]!;
    if (OBJECT_EXCEPTIONS.has(word + particle) || OBJECT_EXCEPTIONS.has((word + particle).slice(-2))) continue;
    const want = has(batchim(word.at(-1)!)) ? "을" : "를";
    if (want === particle) continue;
    const start = m.index + word.length;
    push(start, start + 1, want, `받침에 맞는 조사: '${word}${want}' (을/를)`);
  }

  // 문장 끝 마침표
  const trimmed = text.replace(/\s+$/, "");
  if (/[가-힣)]$/.test(trimmed) && /(니다|어요|아요|해요|다)$/.test(trimmed)) push(trimmed.length, trimmed.length, ".", "문장 끝에 마침표를 찍어요");

  return fixes.sort((a, b) => a.start - b.start);
}

/** Apply the chosen fixes (non-overlapping) from the end so positions stay valid. */
export function applySpellingFixes(text: string, fixes: readonly SpellingFix[]): string {
  return [...fixes].sort((a, b) => b.start - a.start).reduce((s, f) => s.slice(0, f.start) + f.to + s.slice(f.end), text);
}

/** Fix everything, repeating until nothing changes (one fix can reveal another). */
export function fixAllSpelling(text: string, names: readonly string[] = []): string {
  let current = text;
  for (let i = 0; i < 5; i++) {
    const fixes = checkCardText(current, names);
    if (!fixes.length) break;
    current = applySpellingFixes(current, fixes);
  }
  return current;
}
