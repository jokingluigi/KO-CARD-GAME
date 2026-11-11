import { PREPARATION_EVENTS } from "@/lib/champion-preparation-editor";
import { useRef, type ReactNode } from "react";
import { validChampionQuestCondition } from "@workspace/game-engine";
import { ChampionQuestConditionEditor } from "./champion-quest-condition-editor";
import { FinisherOptionsEditor } from "./finisher-options-editor";
import type { FinisherChoice } from "@/game/champions/types";
type Fields = {
  hasQuest: boolean;
  questName: string | null;
  questText: string | null;
  questProgressRequired: number | null;
  questCondition: Record<string, unknown> | null;
};
const events = PREPARATION_EVENTS;

export function ChampionPreparationEditor({
  value,
  onChange,
  cards,
  reward,
  ability,
  presentation,
  awakeningTools,
}: {
  value: Fields;
  onChange: (patch: Partial<Fields>) => void;
  cards: { id: string; name: string; cardType: string }[];
  reward: ReactNode;
  ability: ReactNode;
  presentation: ReactNode;
  awakeningTools: ReactNode;
}) {
  const q = value.questCondition ?? {},
    choices = (q.finisherChoices as FinisherChoice[] | undefined) ?? [];
  const backup = useRef<FinisherChoice[] | undefined>(
    choices.length ? choices : undefined,
  );
  if (choices.length) backup.current = choices;
  const hasChoices = choices.length > 0,
    required = value.questProgressRequired ?? Number(q.required ?? 1);
  const kind = q.goldSpent
    ? "gold"
    : q.selfEffectDamage
      ? "selfDamage"
      : q.event === "STATE_CONDITION"
        ? "compound"
        : "event";
  const condition = q.condition;
  const setCondition = (patch: Record<string, unknown>) =>
    onChange({ questCondition: { ...q, ...patch } });
  function chooseMode(mode: "single" | "choices") {
    const next = { ...q };
    if (mode === "single") {
      delete next.finisherChoices;
      onChange({ questCondition: next });
      return;
    }
    next.finisherChoices =
      backup.current ??
      [1, 2].map((i) => ({
        id: `option-${i}`,
        name: `피니셔 ${i}`,
        description: "",
        cardDefinitionId: "",
        condition: { type: "TURN", turn: 5 },
      }));
    onChange({ questCondition: next });
  }
  function chooseKind(nextKind: string) {
    const next = { ...q };
    delete next.condition;
    delete next.goldSpent;
    delete next.selfEffectDamage;
    if (nextKind === "compound") {
      next.event = "STATE_CONDITION";
      next.condition = validChampionQuestCondition(condition)
        ? condition
        : { type: "TURN", turn: 5 };
    } else if (nextKind === "gold") {
      next.event = "GOLD_CHANGED";
      next.goldSpent = true;
    } else if (nextKind === "selfDamage") {
      next.event = "DAMAGE_DEALT";
      next.selfEffectDamage = true;
    } else
      next.event =
        kind === "event" && typeof q.event === "string"
          ? q.event
          : "CARD_PLAYED";
    next.required = required;
    onChange({ questCondition: next });
  }
  const eventLabel =
    events.find(([key]) => key === q.event)?.[1] ?? String(q.event ?? "미설정");
  return (
    <div
      className="admin-preparation md:col-span-2"
      data-testid="champion-preparation-editor"
    >
      <label className="admin-preparation-toggle">
        <input
          type="checkbox"
          checked={value.hasQuest}
          onChange={(e) => {
            const enabled = e.target.checked;
            onChange({
              hasQuest: enabled,
              questName: enabled
                ? value.questName?.trim() || "피니셔 준비"
                : value.questName,
              questProgressRequired: enabled ? required : null,
              questCondition: enabled
                ? {
                    ...(value.questCondition ?? {
                      event: "CARD_PLAYED",
                      progress: 1,
                    }),
                    required,
                  }
                : value.questCondition,
            });
          }}
        />
        <span>
          <strong>피니셔 준비 사용</strong>
          <small>기존 퀘스트의 진행 조건과 판정 엔진을 사용합니다.</small>
        </span>
      </label>
      {!value.hasQuest ? (
        <div className="admin-preparation-empty">
          이 챔피언은 피니셔 준비를 사용하지 않습니다. 기존 입력은 편집 중에
          유지되며, 사용 여부를 켜면 다시 확인할 수 있습니다.
        </div>
      ) : (
        <>
          <div
            className="admin-preparation-mode"
            role="group"
            aria-label="피니셔 준비 방식"
          >
            <button
              type="button"
              aria-pressed={!hasChoices}
              onClick={() => chooseMode("single")}
            >
              <strong>단일 준비 조건</strong>
              <span>조건 하나를 완료하고 기존 완료 효과를 적용합니다.</span>
            </button>
            <button
              type="button"
              aria-pressed={hasChoices}
              onClick={() => chooseMode("choices")}
            >
              <strong>피니셔 선택지</strong>
              <span>
                여러 조건을 따로 준비하고, 먼저 달성한 피니셔 하나를 획득합니다.
              </span>
            </button>
          </div>
          <div className="admin-preparation-summary" role="status">
            현재 설정 ·{" "}
            {hasChoices
              ? `피니셔 선택지 ${choices.length}개`
              : kind === "compound"
                ? "턴·체력·복합 조건"
                : kind === "gold"
                  ? `골드 ${required} 소모`
                  : kind === "selfDamage"
                    ? `자기 효과 피해 ${required}회`
                    : `${eventLabel} ${required} 진행`}
            {Boolean(q.awakening) && !hasChoices
              ? " · 전용 각성 연쇄 연결"
              : ""}
          </div>
          {hasChoices ? (
            <section className="admin-preparation-section">
              <h5>
                <span>1</span>선택지별 조건과 피니셔
              </h5>
              <p>
                단일 준비 조건과 기존 완료 효과는 이 방식에서 사용하지 않습니다.
                같은 처리에서 여러 조건을 달성하면 플레이어가 하나를 선택합니다.
              </p>
              <FinisherOptionsEditor
                embedded
                value={choices}
                cards={cards}
                onChange={(finisherChoices) => {
                  const next = { ...q };
                  if (finisherChoices) next.finisherChoices = finisherChoices;
                  else delete next.finisherChoices;
                  onChange({ questCondition: next });
                }}
              />
            </section>
          ) : (
            <>
              <section className="admin-preparation-section">
                <h5>
                  <span>1</span>준비 조건
                </h5>
                <div className="admin-preparation-fields">
                  <label className="admin-preparation-wide">
                    플레이어에게 보여줄 조건 설명
                    <textarea
                      value={value.questText ?? ""}
                      onChange={(e) => onChange({ questText: e.target.value })}
                      placeholder="게임 화면에 표시할 준비 조건을 적어주세요."
                    />
                  </label>
                  <label>
                    실제 판정 방식
                    <select
                      aria-label="준비 조건 판정 방식"
                      value={kind}
                      disabled={Boolean(q.awakening)}
                      onChange={(e) => chooseKind(e.target.value)}
                    >
                      <option value="event">행동 이벤트 누적</option>
                      <option value="gold">소모 골드 합계</option>
                      <option value="selfDamage">
                        자기 효과로 받은 피해 횟수
                      </option>
                      <option value="compound">턴 · 체력 · 복합 조건</option>
                    </select>
                  </label>
                  {kind !== "compound" && (
                    <label>
                      {kind === "gold" ? "필요 골드 합계" : "필요 진행도"}
                      <input
                        aria-label="준비 완료 필요 진행도"
                        type="number"
                        min={1}
                        value={required}
                        onChange={(e) => {
                          const amount = Math.max(
                            1,
                            Number(e.target.value) || 1,
                          );
                          onChange({
                            questProgressRequired: amount,
                            questCondition: { ...q, required: amount },
                          });
                        }}
                      />
                    </label>
                  )}
                  {kind === "event" && (
                    <label className="admin-preparation-wide">
                      집계할 행동
                      <select
                        aria-label="집계할 행동"
                        value={String(q.event ?? "")}
                        onChange={(e) =>
                          setCondition({ event: e.target.value })
                        }
                      >
                        <option value="">현재 설정 없음</option>
                        {Boolean(q.event) &&
                          !events.some(([key]) => key === q.event) && (
                            <option value={String(q.event)}>
                              기존 이벤트 · {String(q.event)}
                            </option>
                          )}
                        {events.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                {kind === "compound" &&
                  (validChampionQuestCondition(condition) ? (
                    <fieldset disabled={Boolean(q.awakening)}>
                      <ChampionQuestConditionEditor
                        value={condition}
                        onChange={(next) => setCondition({ condition: next })}
                      />
                      {Boolean(q.awakening) && (
                        <p>
                          현재 특수 각성 템플릿의 위기 조건을 사용합니다. 일반
                          준비 조건으로 전환하면 직접 편집할 수 있습니다.
                        </p>
                      )}
                    </fieldset>
                  ) : (
                    <p className="admin-preparation-warning">
                      현재 복합 조건 형식을 확인할 수 없습니다. 기존 값은
                      유지됩니다. 판정 방식을 다시 선택해 조건을 설정하세요.
                    </p>
                  ))}
                {kind === "gold" && (
                  <p>
                    카드 사용·고유 능력·추가 효과에서 실제로 소비한 골드를 기존
                    규칙대로 누적합니다.
                  </p>
                )}
                {kind === "selfDamage" && (
                  <p>
                    내 카드 또는 능력으로 아군 챔피언·선수가 실제 피해를 받은
                    횟수를 기존 규칙대로 누적합니다.
                  </p>
                )}
                {kind === "event" && (
                  <details className="admin-preparation-tools">
                    <summary>이벤트 세부 필터</summary>
                    <div className="admin-preparation-fields">
                      <label>
                        카드 유형
                        <select
                          value={String(q.cardType ?? "")}
                          onChange={(e) => {
                            const next = { ...q };
                            if (e.target.value) next.cardType = e.target.value;
                            else delete next.cardType;
                            onChange({ questCondition: next });
                          }}
                        >
                          <option value="">모든 유형</option>
                          <option value="WRESTLER">선수</option>
                          <option value="TECHNIQUE">주문</option>
                        </select>
                      </label>
                      <label>
                        이벤트당 진행량
                        <input
                          type="number"
                          min={1}
                          value={Number(q.progress ?? 1)}
                          onChange={(e) =>
                            setCondition({
                              progress: Math.max(
                                1,
                                Number(e.target.value) || 1,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <p>
                      기존 원인 필터:{" "}
                      {q.sourceActionType
                        ? String(q.sourceActionType)
                        : "제한 없음"}
                      {q.causedByOwner ? " · 아군이 원인인 사건만" : ""}
                      {q.strictEventCount ? " · 이벤트 횟수 엄격 집계" : ""}.
                      별도 설정은 유지됩니다.
                    </p>
                  </details>
                )}
              </section>
              <section className="admin-preparation-section">
                <h5>
                  <span>2</span>준비 완료 시 적용할 효과
                </h5>
                {q.finisher ? <p>‘피니셔 연결’ 탭에 연결한 주문이 완료 보상입니다. 손패 획득 또는 즉시 발동 방식도 해당 탭에서 설정합니다.</p> : <>
                <p>
                  이미 설정된 완료 효과와 기존 강화 능력을 편집합니다. 새 피니셔
                  카드를 임의로 생성하지 않습니다.
                </p>
                {reward}
                <details className="admin-preparation-tools" open={undefined}>
                  <summary>기존 강화 고유 능력 설정</summary>
                  <div className="admin-preparation-fields">{ability}</div>
                </details>
                </>}
                <details className="admin-preparation-tools">
                  <summary>특수 각성 템플릿 · 기존 연쇄 설정</summary>
                  {Boolean(q.awakening) && (
                    <p className="admin-preparation-warning">
                      전용 각성 설정이 연결되어 있습니다. 현재 조건과 연쇄 카드
                      참조는 유지됩니다.
                    </p>
                  )}
                  {awakeningTools}
                </details>
              </section>
            </>
          )}
          <section className="admin-preparation-section">
            <h5>
              <span>{hasChoices ? "2" : "3"}</span>완료 연출
            </h5>
            <p>
              음악과 이미지 같은 연출은 준비 완료 판정과 별도로 관리합니다. 완료
              대사와 초상화는 해당 편집 탭에서 설정할 수 있습니다.
            </p>
            <details className="admin-preparation-tools">
              <summary>준비 완료 음악</summary>
              {presentation}
            </details>
          </section>
        </>
      )}
    </div>
  );
}
