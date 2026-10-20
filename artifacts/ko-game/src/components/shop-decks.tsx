import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  shopDeckRequest,
  type ShopDeckProduct,
  type ShopDeckChampion,
} from "@/lib/shop-decks-client";
import { CardArtwork } from "./card-artwork";
import { ShopDeckDetail } from "./shop-deck-detail";
export function ShopDecks({
  currency,
  isTestAccount,
  onBalance,
}: {
  currency: number;
  isTestAccount: boolean;
  onBalance: (n: number) => void;
}) {
  const [items, setItems] = useState<ShopDeckProduct[]>([]),
    [champions, setChampions] = useState<ShopDeckChampion[]>([]),
    [selection, setSelection] = useState<Record<string, string>>({}),
    [detail, setDetail] = useState<ShopDeckProduct | null>(null),
    [message, setMessage] = useState("불러오는 중..."),
    [busy, setBusy] = useState<string | null>(null);
  const working = useRef(false);
  const [, navigate] = useLocation();
  async function load() {
    const r = await shopDeckRequest<{
      items: ShopDeckProduct[];
      champions: ShopDeckChampion[];
    }>("/shop/decks");
    setItems(r.items);
    setChampions(r.champions);
  }
  useEffect(() => {
    void load()
      .then(() => setMessage(""))
      .catch((e) => setMessage(e.message));
  }, []);
  async function buy(item: ShopDeckProduct) {
    if (working.current) return;
    if (
      !window.confirm(
        `${item.name} · ${item.price.toLocaleString()} 크레딧\n카드 부족분 지급 및 덱 자동 저장. 계정당 1회 구매합니다.\n${item.includeChampion ? "추천 챔피언 포함" : "챔피언 미포함, 보유 챔피언 사용"}`,
      )
    )
      return;
    working.current = true;
    setBusy(item.id);
    setMessage("");
    try {
      const r = await shopDeckRequest<{
        currencyBalance: number;
        alreadyPurchased: boolean;
      }>(`/shop/decks/${encodeURIComponent(item.id)}/purchase`, {
        method: "POST",
        body: JSON.stringify({
          championDefinitionId: selection[item.id] || null,
        }),
      });
      onBalance(r.currencyBalance);
      await load();
      setMessage(
        r.alreadyPurchased
          ? "이미 구매한 상품입니다. 추가 차감은 없습니다."
          : "구매 완료! 부족한 카드와 완성 덱을 지급했습니다. 덱 편집에서 확인해 주세요.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "구매 실패");
    } finally {
      working.current = false;
      setBusy(null);
    }
  }
  return (
    <section aria-label="완성 덱 상품">
      <p className="mb-4 text-sm text-neutral-400">
        계정당 상품별 1회 구매 · 이미 보유한 카드는 부족한 수량만 지급 · 덱은
        자유롭게 편집 가능
      </p>
      {message && (
        <p role="status" className="mb-4 break-words text-amber-200">
          {message}
        </p>
      )}
      {!message && !items.length && <p>현재 판매 중인 완성 덱이 없습니다.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="min-w-0 rounded-xl border border-neutral-800 bg-black/40 p-5"
          >
            <div className="mb-4 h-44">
              {item.imageUrl ? (
                <CardArtwork
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full"
                  imageDisplayMode="CONTAIN"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-amber-400">
                  KO · 25
                </div>
              )}
            </div>
            <h2 className="break-words text-xl">{item.name}</h2>
            <p className="mt-2 break-words text-sm text-neutral-400">
              {item.description}
            </p>
            <p className="mt-3">
              {item.cardDefinitionIds.length}장 · {item.price.toLocaleString()}{" "}
              크레딧
            </p>
            <p className="my-3 text-sm text-amber-200">
              {item.recommendedChampion
                ? `추천: ${item.recommendedChampion.name} · `
                : ""}
              {item.includeChampion ? "챔피언 포함" : "챔피언 미포함"}
            </p>
            {!item.includeChampion && !item.purchase && (
              <label className="block text-sm">
                저장할 챔피언
                <select
                  aria-label={`${item.name} 챔피언 선택`}
                  className="mt-2 min-h-11 w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-base"
                  value={selection[item.id] ?? ""}
                  onChange={(e) =>
                    setSelection((s) => ({ ...s, [item.id]: e.target.value }))
                  }
                >
                  <option value="">
                    {champions.length
                      ? "보유 챔피언 자동 선택"
                      : "보유 챔피언 없음"}
                  </option>
                  {champions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="mt-4 min-h-11 w-full rounded border border-neutral-700 p-3"
              onClick={() => setDetail(item)}
            >
              덱 구성 보기
            </button>
            {item.purchase ? (
              <>
                <p className="mt-3 text-center text-emerald-300">구매 완료</p>
                <button
                  type="button"
                  className="mt-3 min-h-11 w-full border border-neutral-700 p-3"
                  onClick={() => navigate("/decks")}
                >
                  덱 편집으로 이동
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={
                  !!busy ||
                  !!item.unavailable ||
                  (!isTestAccount && currency < item.price) ||
                  (!item.includeChampion && !champions.length)
                }
                onClick={() => void buy(item)}
                className="mt-3 min-h-11 w-full rounded bg-primary p-3 text-black disabled:opacity-40"
              >
                {busy === item.id
                  ? "구매 중..."
                  : item.unavailable
                    ? "현재 구매 불가"
                    : !isTestAccount && currency < item.price
                      ? "크레딧 부족"
                      : "완성 덱 구매"}
              </button>
            )}
            {item.unavailable && (
              <p className="mt-2 text-sm text-red-300">{item.unavailable}</p>
            )}
          </article>
        ))}
      </div>
      {detail && (
        <ShopDeckDetail product={detail} onClose={() => setDetail(null)} />
      )}
    </section>
  );
}
