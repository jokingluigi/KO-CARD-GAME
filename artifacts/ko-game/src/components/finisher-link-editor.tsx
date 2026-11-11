import { useState } from "react";
import { validFinisherReward } from "@/game/champions/finisher-config";
import type { FinisherChoice } from "@/game/champions/types";
type Card = {
  id: string;
  name: string;
  cardType: string;
  rarity?: string;
  isChampionToken: boolean;
  cost: number;
  text: string;
  status: string;
  imageUrl: string | null;
};
export function FinisherLinkEditor({
  publishedChampion=false,
  condition,
  cards,
  hasQuest,
  legacyId,
  onChange,
}: {
  publishedChampion?:boolean;
  condition: Record<string, unknown> | null;
  cards: Card[];
  hasQuest: boolean;
  legacyId: string | null;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const [search, setSearch] = useState(""),
    q = condition ?? {},
    value = validFinisherReward(q.finisher) ? q.finisher : undefined,
    choices = Array.isArray(q.finisherChoices)
      ? (q.finisherChoices as FinisherChoice[])
      : [];
  const legacy = cards.find((c) => c.id === legacyId),
    selected = cards.find((c) => c.id === value?.cardDefinitionId);
  const set = (id: string, delivery = value?.delivery ?? "HAND") => {
    const next = { ...q };
    if (id) next.finisher = { cardDefinitionId: id, delivery };
    else delete next.finisher;
    onChange(next);
  };
  return (
    <section className="md:col-span-2 space-y-4 rounded border border-neutral-800 p-4">
      <h4>완료 보상 설정</h4>
      {choices.length ? (
        <>
          <p>
            각 준비 조건의 피니셔와 완료 처리는 ‘피니셔 준비’ 탭의 선택지에서
            각각 설정합니다.
          </p>
          <ul className="space-y-3">
            {choices.map((o) => (
              <li key={o.id} className="rounded border p-3">
                <strong>{o.name}</strong>
                <p>
                  {cards.find((c) => c.id === o.cardDefinitionId)?.name ??
                    o.cardDefinitionId}{" "}
                  · {o.delivery === "CAST" ? "즉시 발동" : "손패에 추가"}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p>
            준비 조건을 완료하면 연결한 챔피언 등급 토큰 주문을 손패에
            추가하거나 즉시 발동합니다. 연결한 경우 기존 완료 효과 대신 피니셔를
            사용합니다.
          </p>
          <label className="block space-y-2">
            피니셔 검색
            <input
              aria-label="피니셔 검색"
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-3"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block space-y-2">
            연결할 피니셔
            <select
              aria-label="연결할 피니셔"
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-3"
              value={value?.cardDefinitionId ?? ""}
              onChange={(e) => set(e.target.value)}
            >
              <option value="">연결하지 않음 (기존 완료 효과 유지)</option>
              {cards
                .filter(
                  (c) =>
                    c.cardType === "TECHNIQUE" &&
                    c.isChampionToken &&
                    (!c.rarity || c.rarity === "CHAMPION") &&
                    (!search ||
                      c.name.includes(search) ||
                      c.id === value?.cardDefinitionId),
                )
                .map((c) => (
                  <option key={c.id} value={c.id} disabled={c.status==='DISABLED'}>
                    {c.name} · {c.cost}G · {{PUBLISHED:'공개',DRAFT:'미공개',DISABLED:'비활성화'}[c.status]??c.status}
                  </option>
                ))}
            </select>
          </label>
          {publishedChampion&&selected?.status==='DRAFT'&&<p role="note" className="rounded border border-amber-700/60 bg-amber-950/20 p-3 text-sm text-amber-200">‘{selected.name}’은 아직 미공개예요. 수정 저장을 누르면 이 피니셔의 공개와 챔피언 연결을 함께 확인할 수 있습니다.</p>}
          {value && (
            <label className="block space-y-2">
              준비 완료 시 처리
              <select
                aria-label="준비 완료 시 피니셔 처리"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-3"
                value={value.delivery ?? "HAND"}
                onChange={(e) =>
                  set(value.cardDefinitionId, e.target.value as "HAND" | "CAST")
                }
              >
                <option value="HAND">손패에 추가</option>
                <option value="CAST">즉시 발동 (기본 비용 없음)</option>
              </select>
            </label>
          )}
          <p className="text-sm text-neutral-400">
            손패가 가득 차면 기존 손패 1장을 직접 버린 뒤 획득합니다. 즉시
            발동은 손패를 거치지 않으며 필요한 대상은 기존 선택 화면에서
            지정합니다.
          </p>
          {selected && (
            <article className="rounded border p-3">
              <strong>{selected.name}</strong>
              <p>{selected.text}</p>
              {selected.imageUrl && (
                <img
                  src={selected.imageUrl}
                  alt={selected.name}
                  className="mt-3 h-40 object-contain"
                />
              )}
            </article>
          )}
          {!value && legacy?.cardType === "TECHNIQUE" && (
            <button
              type="button"
              className="min-h-11 rounded border px-3"
              onClick={() => set(legacy.id)}
            >
              기존 연결 주문 ‘{legacy.name}’을 피니셔로 사용
            </button>
          )}
          {!hasQuest && (
            <p className="text-amber-200">
              피니셔 준비 사용을 켜고 완료 조건을 설정해야 대전에서 획득합니다.
            </p>
          )}
        </>
      )}
      {legacy?.cardType === "WRESTLER" && (
        <details>
          <summary>기존 능력용 선수 토큰 연결</summary>
          <p>{legacy.name} · 기존 고유 능력과 카드 효과의 연결은 유지합니다.</p>
        </details>
      )}
    </section>
  );
}
