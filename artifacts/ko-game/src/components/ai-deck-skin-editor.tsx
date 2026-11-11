import type { AIDeckOptions } from "@/lib/ai-decks-client";
/** One skin per card definition; every copy in this AI deck uses the selected appearance. */
export function AIDeckSkinEditor({
  options,
  championId,
  cardIds,
  selectedIds,
  onChange,
  busy,
}: {
  options: AIDeckOptions | null;
  championId: string | null;
  cardIds: string[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  busy: boolean;
}) {
  const targets = [
    ...(championId
      ? [
          {
            id: championId,
            name:
              options?.champions.find((c) => c.id === championId)?.name ??
              "챔피언",
            type: "CHAMPION_SKIN",
            copies: 1,
          },
        ]
      : []),
    ...Array.from(new Set(cardIds)).map((id) => ({
      id,
      name: options?.cards.find((c) => c.id === id)?.name ?? id,
      type: "CARD_SKIN",
      copies: cardIds.filter((c) => c === id).length,
    })),
  ];
  const items = options?.cosmetics ?? [],
    invalid = selectedIds.filter(
      (id) =>
        !items.some(
          (item) =>
            item.id === id &&
            targets.some((t) => t.id === item.targetId && t.type === item.type),
        ),
    );
  return (
    <fieldset
      className="min-w-0 space-y-5 md:col-span-2"
      disabled={busy || options?.aiCosmeticsAvailable !== true}
    >
      <legend className="text-base font-bold text-amber-200">AI 덱 스킨</legend>
      <p className="text-sm text-neutral-300">
        챔피언과 덱에 넣은 선수 카드의 스킨을 각각 지정하세요. 같은 카드의 모든
        복사본에 함께 적용됩니다. 저장 후 새 대전에서 확인할 수 있습니다.
      </p>
      {options?.aiCosmeticsAvailable === false && (
        <p role="status">현재 서버에서 AI 스킨 저장을 사용할 수 없습니다.</p>
      )}
      {!championId && <p>기본 설정에서 챔피언을 먼저 선택하세요.</p>}
      {!cardIds.length && (
        <p>덱 구성에서 선수를 넣으면 이곳에 선수별 스킨 설정이 나타납니다.</p>
      )}
      {targets.map((target) => {
        const choices = items.filter(
            (i) => i.type === target.type && i.targetId === target.id,
          ),
          selected = choices.find((i) => selectedIds.includes(i.id));
        return (
          <div
            key={target.type + target.id}
            className="min-w-0 rounded-lg border border-neutral-700 p-3"
          >
            <label
              className="block text-sm font-bold"
              htmlFor={"ai-skin-" + target.id}
            >
              {target.type === "CHAMPION_SKIN" ? "챔피언" : "카드"} ·{" "}
              {target.name}
              {target.type === "CARD_SKIN" ? ` · ${target.copies}장` : ""}
            </label>
            <select
              id={"ai-skin-" + target.id}
              aria-label={target.name + " 스킨"}
              className="mt-2 min-h-12 w-full min-w-0 rounded border border-neutral-700 bg-neutral-950 p-2"
              disabled={!choices.length}
              value={selected?.id ?? ""}
              onChange={(e) =>
                onChange([
                  ...selectedIds.filter(
                    (id) => !choices.some((i) => i.id === id),
                  ),
                  ...(e.target.value ? [e.target.value] : []),
                ])
              }
            >
              <option value="">
                {choices.length
                  ? "기본 일러스트"
                  : "기본 일러스트 · 등록된 스킨 없음"}
              </option>
              {choices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <img
              className="mt-3 max-h-40 w-full object-contain"
              alt={target.name + " 선택 외형"}
              src={
                selected?.imageAssets.art ??
                selected?.imageAssets.portrait ??
                selected?.imageAssets.intro ??
                (target.type === "CHAMPION_SKIN"
                  ? options?.champions.find((c) => c.id === target.id)?.imageUrl
                  : options?.cards.find((c) => c.id === target.id)?.imageUrl) ??
                undefined
              }
            />
          </div>
        );
      })}
      {invalid.length > 0 && (
        <button
          type="button"
          className="min-h-12 rounded border border-red-800 p-3 text-red-200"
          onClick={() =>
            onChange(selectedIds.filter((id) => !invalid.includes(id)))
          }
        >
          덱과 맞지 않거나 삭제된 스킨 {invalid.length}개 정리
        </button>
      )}
      <p className="text-xs text-neutral-400">
        스킨은 외형만 바꾸며 AI의 카드 성능과 플레이어의 스킨 보유 상태를
        변경하지 않습니다.
      </p>
    </fieldset>
  );
}
