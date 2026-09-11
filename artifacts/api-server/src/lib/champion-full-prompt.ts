import type { Analysis } from "./structured-effects";

export type ChampionFullSectionStatus = "SUPPORTED" | "NEW_MECHANIC_REQUIRED" | "ANALYSIS_FAILED";

export type ChampionFullSection = {
  key: string;
  label: string;
  status: ChampionFullSectionStatus;
  sourceText?: string;
  structuredEffect?: unknown;
  analysis?: Analysis;
  note?: string;
};

export type ChampionFullToken = {
  id: string;
  name: string;
  cardType: string;
  cost: number;
  attack: number;
  health: number;
  text: string;
  keywords: string[];
  effectId: string | null;
  effectConfig: Record<string, unknown>;
  isToken: boolean;
  isChampionToken: boolean;
  status: string;
};

export type ChampionFullPromptData = {
  champion: Record<string, unknown>;
  sections: ChampionFullSection[];
  unsupportedParts: string[];
  token?: ChampionFullToken;
  tokenReferenceError?: string;
  library: {
    actions: Array<Record<string, unknown>>;
    triggers: Array<Record<string, unknown>>;
    conditions: Array<Record<string, unknown>>;
    targetResolvers: Array<Record<string, unknown>>;
    valueResolvers: Array<Record<string, unknown>>;
  };
};

export function dedupeUnsupportedMechanics(parts: readonly string[]): string[] {
  return [...new Set(parts.map((part) => part.trim()).filter(Boolean))];
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function sectionStatusLines(sections: ChampionFullSection[]): string {
  return sections.map((section) => {
    const details = [
      `상태: ${section.status}`,
      section.sourceText ? `원본 텍스트: "${section.sourceText}"` : "",
      section.note ?? "",
      section.analysis?.summaries.length ? `분석 요약:\n${section.analysis.summaries.map((item) => `- ${item}`).join("\n")}` : "",
      section.analysis?.effects.length ? `분석된 Structured Effects:\n${json(section.analysis.effects)}` : "",
      section.analysis?.condition ? `분석된 Quest Condition:\n${json(section.analysis.condition)}` : "",
      section.structuredEffect ? `저장된 Structured Effect:\n${json(section.structuredEffect)}` : "",
      section.analysis?.unsupportedSegments.length
        ? `이 영역의 unsupportedParts:\n${section.analysis.unsupportedSegments.map((item) => `- ${item}`).join("\n")}`
        : "",
      section.analysis?.reason ? `분석 사유: ${section.analysis.reason}` : "",
    ].filter(Boolean).join("\n");
    return `### ${section.label}\n${details || "현재 저장된 상세 데이터 없음"}`;
  }).join("\n\n");
}

function libraryLines(data: ChampionFullPromptData["library"]): string {
  const render = (label: string, entries: Array<Record<string, unknown>>) =>
    `${label}:\n${entries.length ? entries.map((entry) => `- ${String(entry.name ?? "UNKNOWN")} · ${String(entry.status ?? "UNKNOWN")} · ${String(entry.description ?? "")}`).join("\n") : "- 없음"}`;
  return [
    render("Actions", data.actions),
    render("Triggers", data.triggers),
    render("Conditions", data.conditions),
    render("Target Resolvers", data.targetResolvers),
    render("Value Resolvers", data.valueResolvers),
  ].join("\n");
}

export function createChampionFullPrompt(data: ChampionFullPromptData): string {
  const champion = data.champion;
  const token = data.token;
  const unsupported = data.unsupportedParts.length
    ? data.unsupportedParts.map((item) => `- ${item}`).join("\n")
    : "- 없음";
  const tokenBlock = token
    ? `연결된 Champion Token은 Card Admin의 CardDefinition이 source of truth입니다. ChampionDefinition에 Token 효과를 복제하거나 별도로 저장하지 마세요.
${json(token)}`
    : data.tokenReferenceError
      ? `연결된 Champion Token을 resolve하지 못했습니다: ${data.tokenReferenceError}`
      : "- 연결된 Champion Token 없음";

  return `KO Champion 전체 구현 지시문

현재 Champion이 작성된 설계 그대로 실제 게임에서 완전히 동작하도록 필요한 범용 메커니즘을 한 번에 구현하세요. 이 문서는 자동 실행 명령이 아니라 관리자가 Replit Agent에 붙여넣는 개발 지시문입니다.

## 1. 현재 ChampionDefinition
${json(champion)}

## 2. 모든 영역의 최신 분석 결과
${sectionStatusLines(data.sections)}

## 3. 종합 unsupportedParts / 새 메커니즘
${unsupported}

같은 unsupported mechanic은 여러 영역에서 반복 구현하지 말고 하나의 재사용 가능한 범용 메커니즘으로 통합하세요.

## 4. 연결된 Champion Token
${tokenBlock}

## 5. 구현 규칙
- 현재 Effect Library를 먼저 확인하세요.
- 기존 Trigger, Action, Target Resolver, Value Resolver, Condition, Listener, Duration, Sequence를 먼저 재사용하세요.
- 기존 Quest system, Champion system, CardDefinition/Card Registry, Match Snapshot 정책을 재사용하세요.
- 기존 기능 조합으로 가능한 것은 새로 만들지 마세요.
- 부족한 부분만 다른 Champion에서도 사용할 수 있는 generic mechanic으로 추가하세요.
- 특정 Champion 이름이나 ID로 분기하지 마세요. 예: if (champion.name === "..."), if (champion.id === "...").
- 구조화된 검증 데이터와 정식 TypeScript executor를 사용하세요. eval(), new Function(), 자연어의 런타임 코드 실행, 외부 AI API 호출을 금지합니다.
- Card Admin에 있는 Champion Token 효과를 ChampionDefinition에 복제하지 마세요.
- 폼의 원본 텍스트와 현재 Structured Effect를 모두 보존하고, 부분적으로 해석된 결과를 완전한 효과로 적용하지 마세요.

## 6. 권장 구현 순서
1. 현재 ChampionDefinition 확인
2. Effect Registry 확인
3. 각 Champion effect 분석 결과 확인
4. 기존 effect 조합으로 가능한 부분 연결
5. 중복 제거한 missing mechanic 목록 생성
6. missing mechanic만 범용으로 구현
7. Analyzer mapping 추가
8. Schema/Registry 등록
9. Executor 연결
10. Quest progress 연결
11. Champion upgrade/reward 연결
12. Targeting 연결
13. Champion Token reference 연결
14. 테스트 작성
15. 현재 Champion 전체 기능 검증

## 7. Effect Library 상태
${libraryLines(data.library)}

## 8. 분석 실패 처리
ANALYSIS_FAILED 영역이 있으면 구현을 중단하지 마세요. 해당 영역의 원본 텍스트를 기준으로 현재 DSL과 비교하고, 필요한 Analyzer 확장과 범용 메커니즘을 설계하세요. 이해하지 못한 문장을 임의의 효과로 조용히 변환하지 마세요.

## 9. 검증 요구사항
- 정상 실행, 대상 없음, 잘못된 대상, 조건 불충족, 값 계산, GameState 무결성을 테스트하세요.
- Quest, 강화 Ability, Champion Token 연결, Targeting, ENTER_FIELD 및 Token 퇴장 규칙을 검증하세요.
- 기존 카드 효과와 다른 Champion에 대한 호환성을 확인하세요.
- TypeScript 검사와 기존 핵심 테스트를 통과시키세요.

요구한 Champion 기능이 정상 작동하면 임의의 추가 기능을 만들지 말고 종료하세요. 완료 시 수정한 파일 목록과 실행한 테스트/결과만 간결하게 보고하세요.`;
}