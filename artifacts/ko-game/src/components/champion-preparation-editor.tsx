import { useRef, type ReactNode } from "react";
import { FinisherOptionsEditor } from "./finisher-options-editor";
import type { FinisherChoice } from "@/game/champions/types";
type Fields = {
  hasQuest: boolean;
  questName: string | null;
  questText: string | null;
  questProgressRequired: number | null;
  questCondition: Record<string, unknown> | null;
};
export function ChampionPreparationEditor({
  value,
  onChange,
  cards,
  reward,
  ability,
  presentation,
}: {
  value: Fields;
  onChange: (patch: Partial<Fields>) => void;
  cards: { id: string; name: string; cardType: string }[];
  reward: ReactNode;
  ability: ReactNode;
  presentation: ReactNode;
}) {
  const q = value.questCondition ?? {},
    choices = (q.finisherChoices as FinisherChoice[] | undefined) ?? [],
    backup = useRef<FinisherChoice[] | undefined>(
      choices.length ? choices : undefined,
    );
  if (choices.length) backup.current = choices;
  const hasChoices = choices.length > 0,
    required = value.questProgressRequired ?? Number(q.required ?? 1);
  function chooseMode(mode: "single" | "choices") {
    const next = { ...q };
    if (mode === "single") delete next.finisherChoices;
    else
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
  return (
    <div
      className="admin-preparation md:col-span-2"
      data-testid="champion-preparation-editor"
    >
      <label className="admin-preparation-toggle">
        <input
          type="checkbox"
          checked={value.hasQuest}
          onChange={(event) => {
            const enabled = event.target.checked;
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
          <small>
            준비 조건을 완료하면 연결한 피니셔 또는 완료 효과를 적용합니다.
          </small>
        </span>
      </label>
      {!value.hasQuest ? (
        <div className="admin-preparation-empty">
          이 챔피언은 피니셔 준비를 사용하지 않습니다.
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-400">
            조건과 효과를 문장으로 적어 저장하세요. 실제 판정과 효과는 기존
            구현을 유지하며, 설명에 맞춘 변경은 별도로 구현합니다.
          </p>
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
              <span>하나의 조건과 피니셔를 사용합니다.</span>
            </button>
            <button
              type="button"
              aria-pressed={hasChoices}
              onClick={() => chooseMode("choices")}
            >
              <strong>피니셔 선택지</strong>
              <span>선택지마다 조건 설명과 피니셔를 연결합니다.</span>
            </button>
          </div>
          {hasChoices ? (
            <section className="admin-preparation-section">
              <h5>선택지별 조건과 피니셔</h5>
              <p>
                먼저 완료한 피니셔 하나를 획득하고, 동시에 완료하면 플레이어가
                선택합니다.
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
                <h5>준비 조건</h5>
                <label className="block space-y-2">
                  피니셔 준비 조건 설명
                  <textarea
                    aria-label="피니셔 준비 조건 설명"
                    className="min-h-28 w-full rounded border border-neutral-700 bg-neutral-900 p-3"
                    value={value.questText ?? ""}
                    onChange={(event) =>
                      onChange({ questText: event.target.value })
                    }
                    placeholder="예: 이번 게임에서 아군 선수가 10회 리타이어하면 준비 완료."
                  />
                </label>
              </section>
              <section className="admin-preparation-section">
                <h5>준비 완료 효과</h5>
                {q.finisher ? (
                  <p>
                    ‘피니셔 연결’ 탭에서 완료 시 받을 카드와 손패 추가·즉시
                    발동을 설정합니다.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {reward}
                    <div className="admin-preparation-fields">{ability}</div>
                  </div>
                )}
              </section>
            </>
          )}
          <section className="admin-preparation-section">
            <h5>준비 완료 음악</h5>
            {presentation}
          </section>
        </>
      )}
    </div>
  );
}
