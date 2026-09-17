import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { CardArtwork } from "@/components/card-artwork";
import { CardRenderer } from "@/components/card-renderer";
import {
  fetchPackDetails,
  type Pack,
  type PackDetailCard,
  type PackDetails,
} from "@/lib/collection-client";

function percent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

function DetailCard({ card }: { card: PackDetailCard }) {
  return (
    <div className="w-28 shrink-0">
      <CardRenderer
        name={card.name}
        cardType={card.cardType as "WRESTLER" | "TECHNIQUE"}
        cost={card.cost}
        attack={card.attack}
        health={card.health}
        rulesText={card.text}
        imageUrl={card.imageUrl}
        rarity={card.rarity as "NORMAL" | "LEGENDARY" | "CHAMPION"}
        imageDisplaySettings={card}
        size="detail"
        className="w-full"
      />
      <p className="mt-2 truncate text-center text-xs font-bold text-neutral-200">{card.name}</p>
      <p className="text-center text-[11px] font-black text-amber-300">{percent(card.individualProbability)}</p>
    </div>
  );
}

function Section({
  title,
  probability,
  children,
}: {
  title: string;
  probability?: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-black text-neutral-100">{title}</h3>
        {probability !== undefined && <span className="text-sm font-black text-amber-300">{percent(probability)}</span>}
      </div>
      {children}
    </section>
  );
}

export function PackDetailDialog({
  pack,
  price,
  packQuantity,
  onClose,
}: {
  pack: Pack;
  price?: number;
  packQuantity?: number;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<PackDetails | null>(null);
  const [message, setMessage] = useState("팩 구성품을 불러오는 중...");

  useEffect(() => {
    let cancelled = false;
    fetchPackDetails(pack.id)
      .then((result) => {
        if (cancelled) return;
        setDetails(result.details);
        setMessage("");
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [pack.id]);

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${pack.name} 팩 상세`}>
      <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950 p-5 text-neutral-100 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-xs font-bold tracking-[0.25em] text-primary">PACK DETAIL</p>
            <h2 className="mt-2 text-2xl font-black">{pack.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="팩 상세 닫기" className="rounded border border-neutral-700 p-2 text-neutral-300 hover:border-primary hover:text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[220px_1fr]">
          <div>
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-neutral-800 bg-gradient-to-br from-amber-950/60 to-neutral-950 p-5">
              {pack.imageUrl ? <img src={pack.imageUrl} alt="" className="max-h-44 rounded object-contain" /> : <span className="text-5xl text-amber-400">✦</span>}
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-400">{pack.description || "KO 카드팩"}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-neutral-800 bg-black/30 p-2"><dt className="text-neutral-500">팩 구성</dt><dd className="mt-1 font-black">{pack.cardsPerPack}장</dd></div>
              {price !== undefined && <div className="rounded border border-neutral-800 bg-black/30 p-2"><dt className="text-neutral-500">판매 가격</dt><dd className="mt-1 font-black">{price.toLocaleString()}</dd></div>}
              {packQuantity !== undefined && <div className="rounded border border-neutral-800 bg-black/30 p-2"><dt className="text-neutral-500">상품 수량</dt><dd className="mt-1 font-black">{packQuantity}팩</dd></div>}
            </dl>
          </div>

          <div className="space-y-4">
            <Section title="등장 확률">
              <div className="grid gap-2 sm:grid-cols-3">
                <Probability label="일반 카드" value={pack.normalRate} />
                <Probability label="레전더리 카드" value={pack.legendaryRate} />
                <Probability label="챔피언" value={pack.championRate} />
              </div>
              <p className="mt-3 text-[11px] text-neutral-500">카드 1회 추첨 기준 · 스킨은 카드 보상 확률과 별도의 보너스 판정입니다.</p>
            </Section>

            {message && <p className="rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{message}</p>}
            {details && !details.valid && (
              <div className="flex gap-2 rounded border border-red-800/70 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div><p className="font-black">현재 팩 설정을 확인해야 합니다.</p><ul className="mt-1 list-disc pl-5">{details.invalidReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
              </div>
            )}
            {details && (
              <>
                <Section title="포함 카드" probability={pack.normalRate}>
                  <ContentRow items={details.normalCards} empty="일반 카드가 없습니다." />
                </Section>
                <Section title="레전더리 카드" probability={pack.legendaryRate}>
                  <ContentRow items={details.legendaryCards} empty="레전더리 카드가 없습니다." />
                </Section>
                <Section title="챔피언" probability={pack.championRate}>
                  {details.champions.length ? (
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {details.champions.map((champion) => (
                        <div key={champion.id} className="w-28 shrink-0">
                          <CardArtwork src={champion.imageUrl} alt={champion.name} className="h-40 w-28 rounded-lg border border-rose-800/60" imageDisplayMode={champion.imageDisplayMode} imageScale={champion.imageScale} imagePositionX={champion.imagePositionX} imagePositionY={champion.imagePositionY} />
                          <p className="mt-2 truncate text-center text-xs font-bold">{champion.name}</p>
                          <p className="text-center text-[11px] font-black text-amber-300">{percent(champion.individualProbability)}</p>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-neutral-500">챔피언이 없습니다.</p>}
                </Section>
                <Section title="팩 전용 스킨" probability={pack.skinChance}>
                  {details.skins.length ? (
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {details.skins.map((skin) => (
                        <div key={skin.id} className="w-36 shrink-0">
                          <CardArtwork src={skin.imageUrl} alt={skin.name} className="h-40 w-36 rounded-lg border border-violet-800/60" imageDisplayMode={skin.imageDisplayMode} imageScale={skin.imageScale} imagePositionX={skin.imagePositionX} imagePositionY={skin.imagePositionY} />
                          <p className="mt-2 truncate text-center text-xs font-bold">{skin.name}</p>
                          <p className="text-center text-[11px] font-black text-violet-300">{percent(skin.individualProbability)}</p>
                          <p className="mt-1 truncate text-center text-[10px] text-neutral-500">적용 카드: {skin.card.name}</p>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-neutral-500">팩 전용 스킨이 없습니다.</p>}
                </Section>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Probability({ label, value }: { label: string; value: number }) {
  return <div className="rounded border border-neutral-800 bg-neutral-950 p-3"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-lg font-black text-amber-300">{percent(value)}</p></div>;
}

function ContentRow({ items, empty }: { items: PackDetailCard[]; empty: string }) {
  return items.length ? <div className="flex gap-4 overflow-x-auto pb-2">{items.map((card) => <DetailCard key={card.id} card={card} />)}</div> : <p className="text-sm text-neutral-500">{empty}</p>;
}