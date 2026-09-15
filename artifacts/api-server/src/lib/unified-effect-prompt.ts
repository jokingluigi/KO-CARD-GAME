import type { Analysis } from "./structured-effects";

export type UnifiedStatus = "SUPPORTED" | "NEW_MECHANIC_REQUIRED" | "ANALYSIS_FAILED";
export type UnifiedSourceKind = "WRESTLER_CARD" | "CHAMPION";

export type UnifiedEntry = {
  kind: UnifiedSourceKind;
  id: string;
  name: string;
  version: number;
  recordStatus: string;
  slot: string;
  label: string;
  sourceText: string;
  status: UnifiedStatus;
  analysis?: Analysis;
  storedStructuredEffect?: unknown;
  note?: string;
};

export type UnifiedMechanic = {
  key: string;
  label: string;
  occurrences: Array<{
    kind: UnifiedSourceKind;
    id: string;
    name: string;
    slot: string;
    label: string;
    sourceText: string;
  }>;
};

export type UnifiedEffectPromptData = {
  entries: UnifiedEntry[];
  mechanics: UnifiedMechanic[];
  tokenReferences: Array<{
    championId: string;
    championName: string;
    definitionId: string;
    name: string;
    text: string;
    status: string;
  }>;
  library: {
    actions: Array<Record<string, unknown>>;
    triggers: Array<Record<string, unknown>>;
    conditions: Array<Record<string, unknown>>;
    targetResolvers: Array<Record<string, unknown>>;
    valueResolvers: Array<Record<string, unknown>>;
  };
};

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function normalizeMechanic(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[“”"'`]/g, "")
    .replace(/[.。!！?？,:：;；()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function entryLines(entries: UnifiedEntry[]): string {
  return entries.map((entry) => {
    const analysis = entry.analysis;
    return [
      `### [${entry.kind}] ${entry.name} · ${entry.label}`,
      `ID: ${entry.id} · record status: ${entry.recordStatus} · version: ${entry.version}`,
      `분류: ${entry.status}`,
      `원문: "${entry.sourceText || "(없음)"}"`,
      entry.note ?? "",
      analysis?.summaries.length
        ? `Analyzer 요약:\n${analysis.summaries.map((item) => `- ${item}`).join("\n")}`
        : "",
      analysis?.effects.length ? `해석된 Structured Effects:\n${json(analysis.effects)}` : "",
      analysis?.condition ? `해석된 Quest Condition:\n${json(analysis.condition)}` : "",
      entry.storedStructuredEffect
        ? `현재 저장 Structured Effect:\n${json(entry.storedStructuredEffect)}`
        : "",
      analysis?.unsupportedSegments.length
        ? `미지원 영역:\n${analysis.unsupportedSegments.map((item) => `- ${item}`).join("\n")}`
        : "",
      analysis?.reason ? `분석 사유: ${analysis.reason}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

function libraryLines(library: UnifiedEffectPromptData["library"]): string {
  const render = (label: string, entries: Array<Record<string, unknown>>) =>
    `${label}:\n${entries.length
      ? entries.map((entry) =>
        `- ${String(entry.name ?? "UNKNOWN")} · ${String(entry.status ?? "UNKNOWN")} · ${String(entry.description ?? "")}`,
      ).join("\n")
      : "- 없음"}`;
  return [
    render("Actions", library.actions),
    render("Triggers", library.triggers),
    render("Conditions", library.conditions),
    render("Target Resolvers", library.targetResolvers),
    render("Value Resolvers", library.valueResolvers),
  ].join("\n");
}

export function collectUnifiedMechanics(entries: UnifiedEntry[]): UnifiedMechanic[] {
  const grouped = new Map<string, UnifiedMechanic>();
  entries
    .filter((entry) => entry.status !== "SUPPORTED")
    .forEach((entry) => {
      const parts = entry.analysis?.unsupportedSegments.length
        ? entry.analysis.unsupportedSegments
        : [entry.analysis?.reason ?? entry.sourceText].filter(Boolean);
      parts.forEach((part) => {
        const label = part.trim();
        const key = normalizeMechanic(label);
        if (!key) return;
        const current = grouped.get(key) ?? { key, label, occurrences: [] };
        if (!current.occurrences.some((item) =>
          item.kind === entry.kind && item.id === entry.id && item.slot === entry.slot,
        )) {
          current.occurrences.push({
            kind: entry.kind,
            id: entry.id,
            name: entry.name,
            slot: entry.slot,
            label: entry.label,
            sourceText: entry.sourceText,
          });
        }
        grouped.set(key, current);
      });
    });
  return [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label, "ko"));
}

export function createUnifiedEffectPrompt(data: UnifiedEffectPromptData): string {
  const mechanics = data.mechanics.length
    ? data.mechanics.map((mechanic, index) => [
      `${index + 1}. ${mechanic.label}`,
      `   적용 위치: ${mechanic.occurrences.map((item) =>
        `${item.kind}:${item.name}(${item.slot})`,
      ).join(", ")}`,
    ].join("\n")).join("\n")
    : "- 없음. 현재 모든 분석 대상이 최신 Effect Registry로 지원됩니다.";
  const tokenReferences = data.tokenReferences.length
    ? data.tokenReferences.map((token) =>
      `- ${token.championName} · championId=${token.championId} · definitionId=${token.definitionId} · ${token.name} · status=${token.status}\n  원문: "${token.text}"`,
    ).join("\n")
    : "- 없음";
  const unsupportedCount = data.entries.filter((entry) => entry.status === "NEW_MECHANIC_REQUIRED").length;
  const failedCount = data.entries.filter((entry) => entry.status === "ANALYSIS_FAILED").length;
  const supportedCount = data.entries.filter((entry) => entry.status === "SUPPORTED").length;

  return `KO 전체 카드/챔피언 통합 구현 지시문

이 문서는 자동 실행 명령이 아니라 관리자가 현재 Replit Agent 채팅에 붙여넣는 개발 지시문입니다.
서버가 실행 시점의 DB와 현재 Effect Registry를 직접 읽어 WRESTLER 카드와 Champion 슬롯을 캐시 없이 최신 재분석한 결과입니다.

## 1. 분석 범위와 집계
- 분석 대상: 모든 WRESTLER CardDefinition과 모든 ChampionDefinition
- Champion 분석 슬롯: CHAMPION_ABILITY, QUEST_CONDITION, QUEST_REWARD, UPGRADED_CHAMPION_ABILITY
- Champion Token 자체 효과는 Card Admin/CardDefinition이 source of truth입니다. 아래 Token은 참조 정보이며 Champion 슬롯으로 재구현하지 마세요.
- SUPPORTED: ${supportedCount}개
- NEW_MECHANIC_REQUIRED: ${unsupportedCount}개
- ANALYSIS_FAILED: ${failedCount}개

## 2. 중복 제거된 미구현 메커니즘
같은 의미의 미지원 메커니즘은 카드/Champion별로 따로 구현하지 말고 하나의 다른 콘텐츠에도 재사용 가능한 범용 메커니즘으로 통합하세요.
${mechanics}

## 3. 전체 최신 분석 결과
SUPPORTED 항목도 검토용으로 아래에 표시하지만 구현 목록에서 제외하세요.
${entryLines(data.entries) || "- 분석 대상 슬롯 없음"}

## 4. Champion Token 참조
${tokenReferences}

## 5. 구현 규칙
- 현재 ACTIVE Effect Library와 Effect Registry를 먼저 확인하고 기존 Action, Trigger, Target Resolver, Value Resolver, Condition, Listener, Duration, Sequence를 최대한 재사용하세요.
- 기존 조합으로 표현할 수 없는 경우에만 위의 중복 제거 목록을 기준으로 범용 메커니즘을 추가하세요.
- 새 메커니즘은 Effect Registry, 저장 스키마/검증, Analyzer mapping, executor, 필요한 targeting/continuation/quest event 처리와 테스트를 함께 연결하세요.
- 카드 이름, Champion 이름, ID, 특정 원문 문장으로 분기하는 하드코딩을 추가하지 마세요.
- 자연어/DB 문자열을 eval(), new Function() 또는 런타임 코드로 실행하지 말고 구조화된 검증 데이터와 정식 TypeScript executor를 사용하세요.
- 부분적으로 해석된 결과를 완전한 효과로 조용히 적용하지 마세요. ANALYSIS_FAILED는 원문을 보존하고 필요한 analyzer 확장과 범용 메커니즘을 설계하세요.
- PLAYER_CHOICE가 포함된 효과는 손패/보드/Champion의 유효 대상, 잘못된 클릭, 대상 선택 후 continuation/resume까지 실제 게임에서 검증하세요.
- Quest Condition은 structured event/filter/progress로, Quest Reward와 강화 Ability는 기존 Champion quest/upgrade pipeline으로 연결하세요.
- Champion Token 효과는 CardDefinition에서만 실행되며 ChampionDefinition에 복제하지 마세요.

## 6. 현재 ACTIVE Effect Library
${libraryLines(data.library)}

## 7. 권장 구현 순서
1. Effect Registry와 현재 executor/targeting/quest 시스템 확인
2. 위의 SUPPORTED 결과가 실제 저장 Structured Effect와 일치하는지 확인
3. 중복 제거된 미구현 메커니즘마다 기존 요소 조합 가능 여부 확인
4. 필요한 범용 registry/action/resolver/condition/listener만 추가
5. Card와 Champion의 저장/공개/런타임 변환 연결
6. Analyzer와 관리자 적용 흐름 연결
7. 각 원문, 대상 선택, 조건 불충족, 수치 계산, 순서/continuation 테스트
8. 전체 WRESTLER 카드와 Champion을 다시 분석하고 모두 실행 검증

## 8. 검증 요구사항
- 정상 실행, 대상 없음, 잘못된 대상, 조건 불충족, 값 계산, GameState 무결성을 검증하세요.
- 카드 효과의 전투/손패/필드 범위와 Champion 능력의 턴 제한을 검증하세요.
- Quest progress filter, Quest Reward, 강화 Ability, Champion Token 생성/퇴장 규칙을 검증하세요.
- 기존 지원 카드와 다른 Champion에 대한 회귀 테스트를 유지하세요.
- TypeScript 검사, API 테스트, 게임 엔진 테스트와 빌드를 실행하세요.

${failedCount
    ? "ANALYSIS_FAILED가 있어도 전체 구현을 중단하지 말고, 해당 원문을 임의로 추측하지 않은 채 범용 확장 지점으로 처리하세요."
    : "현재 분석 실패 영역은 없습니다. 미구현 메커니즘만 구현하고 지원 완료 항목은 변경하지 마세요."}

요구한 기능이 실제 게임에서 정상 작동하면 추가 기능을 만들지 말고, 수정 파일과 실행한 검사 결과만 간단히 보고하세요.`;
}