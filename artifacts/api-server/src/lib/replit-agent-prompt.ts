import { effectLibrary, type Analysis } from "./structured-effects";

type LibraryEntry = { name: string; description: string; status: "ACTIVE" | "DISABLED" };
type LiveLibrary = ReturnType<typeof effectLibrary>;

type MechanicFamily = "permutation" | "time_stop" | "rewind";

function mechanicFamily(text: string, unsupported: string[]): MechanicFamily {
  const source = `${text} ${unsupported.join(" ")}`;
  if (/시간을?\s*멈/.test(source)) return "time_stop";
  if (/전\s*상태로\s*되돌/.test(source)) return "rewind";
  return "permutation";
}

function namedEntries(entries: readonly LibraryEntry[], names: readonly string[]) {
  return entries.filter((entry) => names.includes(entry.name));
}

function liveLine(label: string, entries: readonly LibraryEntry[]) {
  return `${label}: ${entries.length ? entries.map((entry) => `${entry.name} (${entry.description})`).join(", ") : "관련 ACTIVE 항목 없음"}`;
}

function reusableLibraryLines(text: string, analysis: Analysis, library: LiveLibrary) {
  const family = mechanicFamily(text, analysis.unsupportedSegments);
  const actions = library.actions.filter((entry) => entry.status === "ACTIVE");
  const triggers = library.triggers.filter((entry) => entry.status === "ACTIVE");
  const targets = library.targetResolvers.filter((entry) => entry.status === "ACTIVE");
  const values = library.valueResolvers.filter((entry) => entry.status === "ACTIVE");
  const inferredTriggerNames: string[] = [
    ...analysis.effects.map((effect) => effect.trigger),
    ...(/^등장|필드에\s*나올|소환/.test(text) ? ["ENTER_FIELD"] : /^퇴장|필드를\s*떠/.test(text) ? ["LEAVE_FIELD"] : /^액티브/.test(text) ? ["ACTIVE"] : []),
  ];
  const inferredTriggers = [...new Set(inferredTriggerNames)];
  const targetRelevant = /손패|필드|선수|캐릭터|카드|대상/.test(text);
  const statPermutation = family === "permutation" && /공격력|체력|스탯|\+\d+\s*\/\s*\+\d+/.test(text);
  return [
    liveLine("Trigger", namedEntries(triggers, inferredTriggers)),
    liveLine("Effect / Action", statPermutation ? namedEntries(actions, ["BUFF"]) : []),
    liveLine("Target Resolver", targetRelevant ? targets : []),
    liveLine("Value Resolver", statPermutation ? namedEntries(values, ["STAT_PAIR"]) : []),
    statPermutation
      ? "위 BUFF/STAT_PAIR는 각 대상의 기존 스탯을 읽고 쓰는 부분적 building block일 뿐이며, 현재 Action에는 대상 집합 사이의 값을 순열하는 기능이 없습니다."
      : family === "permutation"
        ? "현재 ACTIVE Action에는 카드/배치/값 집합을 순열·재배치·교환하는 기능이 없습니다."
        : "현재 ACTIVE Action에는 이 메커니즘을 의미적으로 안전하게 수행할 항목이 없습니다.",
  ].join("\n");
}

function genericCapability(text: string, unsupported: string[]) {
  const family = mechanicFamily(text, unsupported);
  if (family === "time_stop") {
    return "추정: TEMPORARY_ACTION_WINDOW_SUPPRESSION 또는 TURN_PROGRESS_GUARD처럼 범위와 만료가 명시된 범용 시간 정지 모델. 턴 규칙을 변경하지 않는 기존 모델이 없으면 구현하지 말고 설계를 보고하세요.";
  }
  if (family === "rewind") {
    return "추정: RESTORE_SERIALIZED_GAMESTATE_SNAPSHOT 또는 RESTORE_ENTITY_SNAPSHOT처럼 복원 범위와 권한이 명시된 범용 snapshot 복원. Match Snapshot 정책과 직렬화 보장을 만족하지 못하면 구현하지 말고 설계를 보고하세요.";
  }
  if (/공격력|체력|스탯/.test(text)) {
    return "추정: SHUFFLE_STAT_VALUES_ACROSS_TARGET_SET. 대상 집합의 공격력/체력 값을 결정적 RNG로 순열하되 카드 자체, Zone, 소유권은 바꾸지 않는 범용 기능.";
  }
  if (/교환/.test(`${text} ${unsupported.join(" ")}`)) {
    return "추정: EXCHANGE_TARGETS 또는 EXCHANGE_ZONE_POSITIONS. 교환 대상, 허용 Zone, 유효성 검사를 명시하는 범용 기능.";
  }
  return "추정: SHUFFLE_CARDS_IN_ZONE 또는 REORDER_TARGET_SET. 대상 Zone/필터와 deterministic RNG를 명시하는 범용 순열 기능.";
}

function estimates(text: string) {
  const trigger = /손패/.test(text)
    ? "추정: 손패 등 비필드 Zone에서 게임 이벤트를 감시하는 Trigger/Listener"
    : "추정: 현재 문장의 발동 시점에 맞는 Trigger 확장";
  const action = /섞|재배치|교환/.test(text)
    ? "추정: 범용적인 카드 순서/배치 변경 Action"
    : "추정: unsupportedParts를 표현하는 범용 Action";
  const target = /모든/.test(text)
    ? "추정: 조건에 맞는 모든 대상(Zone/owner/filter를 명시)"
    : "추정: source 또는 문장에 명시된 단일 대상";
  const value = /\d+/.test(text)
    ? "추정: 문장에 있는 정수 값은 기존 AMOUNT와 호환 가능한지 확인"
    : "추정: 고정 값이 없으면 새 Value Resolver가 필요한지 먼저 검토";
  const supporting = /턴\s*동안|손패|때마다/.test(text)
    ? "추정: Condition/Listener/Duration이 필요할 수 있음(Zone 제한과 정리 시점을 명시)"
    : "추정: 별도 Condition/Listener/Duration 없이 가능한지 먼저 확인";
  return { trigger, action, target, value, supporting };
}

export function createReplitAgentPrompt(
  originalCardText: string,
  analysis: Analysis,
  library: LiveLibrary = effectLibrary(),
  cardName = "이름 미입력",
): string {
  const estimate = estimates(originalCardText);
  const unsupported = analysis.unsupportedSegments.length
    ? analysis.unsupportedSegments.map((part) => `- ${part}`).join("\n")
    : "- 최신 분석에서 별도 세그먼트가 없지만 mechanism_required 판정 내용을 확인";
  const analysisSummary = analysis.summaries.length
    ? analysis.summaries.map((summary) => `- ${summary}`).join("\n")
    : "- 요약 없음";

  return `이 카드 효과가 실제 게임에서 동작하도록 구현하세요. KO 카드게임에 적용하는 최소한의 TypeScript 수정을 제안하세요. 이 문서는 자동 실행 명령이 아니라 관리자가 Replit Agent에 붙여넣는 개발 지시문입니다.

1. 카드 정보
카드 이름: ${cardName}
원본 카드 효과: "${originalCardText}"

2. 현재 Analyzer가 이해한 내용
판정: ${analysis.outcome} / ${analysis.status}
${analysisSummary}
${analysis.reason ? `사유: ${analysis.reason}` : ""}

3. 현재 지원되는 부분
${analysis.effects.length
    ? analysis.effects.map((effect, index) => `- ${index + 1}. ${JSON.stringify(effect)}`).join("\n")
    : analysis.keywords.length
      ? analysis.keywords.map((keyword) => `- 기본 키워드: ${keyword}`).join("\n")
      : "- 없음"}

4. 현재 지원되지 않는 부분
${unsupported}

5. 필요한 Trigger (추정)
${estimate.trigger}

6. 필요한 Action (추정)
${estimate.action}

7. 필요한 Target (추정)
${estimate.target}

8. 필요한 Value Resolver (추정)
${estimate.value}

9. 필요한 Condition / Listener / Duration / Sequence (추정)
${estimate.supporting}
추정 Sequence: 여러 효과의 순서, 중첩 트리거 재개 순서, 실패 시 중단/계속 정책을 문장 의미에 맞게 명시하세요.
현재 공유 Effect Library 메타데이터에는 ACTIVE Condition Registry, Listener Registry, Duration Registry가 등록되어 있지 않습니다. 비어 있는 registry를 존재하는 것처럼 가정하지 마세요.

10. 현재 재사용 가능한 ACTIVE Effect Library 기능 (실시간 메타데이터에서 결정적으로 선별)
${reusableLibraryLines(originalCardText, analysis, library)}

11. 새로 구현할 가능성이 높은 범용 기능 (추정)
${genericCapability(originalCardText, analysis.unsupportedSegments)}
위 후보는 추정입니다. unsupportedParts를 카드 한 장 전용으로 처리하지 말고, 실제 registry 조합으로 표현되지 않을 때에만 다른 카드에도 재사용 가능한 Trigger/Action/Target/Value Resolver/Condition/Listener/Duration 모듈을 제안하고 구현하세요.

12. 관련 KO 게임 규칙
턴 시스템, Gold 규칙, 4-slot Board 규칙, 공격 규칙, Champion 시스템, Champion Token 보호 규칙 및 targeting 시스템을 변경하거나 재작성하지 마세요. Match Snapshot 정책, snapshot 가능한 직렬화 GameState 구조, deterministic RNG를 유지하세요. Math.random을 직접 사용하지 마세요. invalid action은 reset/reload/exception을 일으키지 않고 안전하게 거절되어야 합니다.

13. 구현 안전 규칙과 최소 수정 순서
먼저 현재 Effect Library, Trigger Registry, Target Resolver, Value Resolver, Condition, Listener를 확인하세요. 기존 기능 조합으로 구현 가능하면 새 메커니즘을 만들지 마세요. 확인 순서는 현재 registry 확인 → 기존 조합 → 작은 범용 확장 → 새 재사용 모듈의 마지막 수단입니다.
프로젝트 전체를 다시 분석하거나 대규모 리팩터링하지 마세요. 정상 작동 중인 Effect를 삭제하지 말고 관련 파일만 최소 수정하세요. 필요한 경우에만 Effect Registry, Effect Schema, Effect Handler, Trigger, Target Resolver, Value Resolver, Condition, Listener, Duration, Sequence, Analyzer mapping, TypeScript type, Tests 순으로 수정하세요. 새 메커니즘을 구현하면 반드시 Effect Registry, Schema, Handler, Analyzer mapping 및 필요한 Resolver/Trigger/Condition/Listener와 테스트에 등록하세요.
특정 카드 이름 또는 id 기반 분기(예: card.name/card.id 비교)를 금지합니다. eval(), new Function(), DB의 JavaScript 문자열 실행, 자연어를 런타임 코드로 실행, 브라우저에서 임의 코드 실행을 금지합니다. 새 메커니즘은 정식 TypeScript source와 registry에 등록하세요.

14. 테스트 요구사항
신규/확장 메커니즘에 정상 실행, 대상 없음, 잘못된 대상, 조건 불충족, 값 계산, GameState 무결성, 기존 Effect 호환성 테스트를 작성하세요. 랜덤이면 같은 seed에서 같은 결과를 검증하세요. Duration/Listener가 있으면 올바른 Zone에서만 발동, source 제거 시 필요한 listener cleanup, 턴 경과 후 GameState 직렬화/복원을 검증하세요. 기존 핵심 테스트와 TypeScript compile도 통과시키세요.

요구한 기능이 정상 작동하면 임의의 추가 기능을 만들지 말고 종료하세요. 완료 시 수정한 파일 목록과 실행한 테스트/결과만 간결하게 보고하세요.`;
}

export function prepareReplitAgentPrompt(
  originalCardText: string,
  analysis: Analysis,
  library: LiveLibrary = effectLibrary(),
  cardName = "이름 미입력",
):
  | { kind: "ready"; prompt: string }
  | { kind: "supported" } {
  if (analysis.outcome === "supported") return { kind: "supported" };
  return { kind: "ready", prompt: createReplitAgentPrompt(originalCardText, analysis, library, cardName) };
}