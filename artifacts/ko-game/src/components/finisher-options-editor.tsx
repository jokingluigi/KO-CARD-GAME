import type { FinisherChoice } from "@/game/champions/types";
import { ChampionQuestConditionEditor } from "./champion-quest-condition-editor";

export function FinisherOptionsEditor({
  value,
  onChange,
  cards,
}: {
  value: FinisherChoice[];
  onChange: (value: FinisherChoice[] | undefined) => void;
  cards: { id: string; name: string; cardType: string }[];
}) {
  const set = (index: number, patch: Partial<FinisherChoice>) =>
    onChange(value.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  const blank = (index: number): FinisherChoice => ({
    id: `option-${index}`,
    name: `피니셔 ${index}`,
    description: "",
    cardDefinitionId: "",
    condition: { type: "TURN", turn: 5 },
  });
  return (
    <fieldset className="space-y-3 rounded border border-amber-700/60 p-3 md:col-span-2">
      <legend>피니셔 선택지</legend>
      <p className="text-xs text-neutral-400">
        선택지를 사용하면 아래 각 조건을 독립적으로 추적하며, 기존 단일 준비
        조건·보상을 대신합니다. 먼저 완료한 피니셔만 획득하고, 같은 처리에서
        함께 완료하면 플레이어가 하나를 선택합니다. 새 카드 효과는 자동으로
        만들지 않습니다.
      </p>
      {!value.length ? (
        <button
          type="button"
          className="min-h-11 border px-3"
          onClick={() => onChange([blank(1), blank(2)])}
        >
          피니셔 선택지 2개 설정
        </button>
      ) : (
        <>
          {value.map((option, index) => (
            <section
              key={index}
              className="space-y-2 rounded border border-neutral-700 p-3"
            >
              <label className="block">
                선택지 ID
                <input
                  className="min-h-11 w-full bg-black/40 p-2"
                  value={option.id}
                  onChange={(e) => set(index, { id: e.target.value })}
                />
              </label>
              <label className="block">
                선택지 이름
                <input
                  className="min-h-11 w-full bg-black/40 p-2"
                  value={option.name}
                  onChange={(e) => set(index, { name: e.target.value })}
                />
              </label>
              <label className="block">
                준비 조건 설명
                <textarea
                  className="w-full bg-black/40 p-2"
                  value={option.description}
                  onChange={(e) => set(index, { description: e.target.value })}
                />
              </label>
              <label className="block">
                획득할 챔피언 토큰 주문
                <select
                  className="min-h-11 w-full bg-black/40 p-2"
                  value={option.cardDefinitionId}
                  onChange={(e) =>
                    set(index, { cardDefinitionId: e.target.value })
                  }
                >
                  <option value="">주문 카드 선택</option>
                  {cards
                    .filter((c) => c.cardType === "TECHNIQUE")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <ChampionQuestConditionEditor
                value={option.condition}
                onChange={(condition) => set(index, { condition })}
              />
              <button
                type="button"
                disabled={value.length <= 2}
                className="min-h-11 px-3 disabled:opacity-40"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                이 선택지 삭제
              </button>
            </section>
          ))}
          <button
            type="button"
            disabled={value.length >= 8}
            className="min-h-11 border px-3"
            onClick={() => {
              let i = value.length + 1;
              while (value.some((o) => o.id === `option-${i}`)) i++;
              onChange([...value, blank(i)]);
            }}
          >
            선택지 추가
          </button>
          <button
            type="button"
            className="min-h-11 px-3 text-red-300"
            onClick={() => onChange(undefined)}
          >
            선택지 사용 해제 · 기존 준비 조건으로 복귀
          </button>
        </>
      )}
    </fieldset>
  );
}
