import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Gift } from "lucide-react";
import { PackOpening } from "@/components/pack-opening";
import { PackDetailDialog } from "@/components/pack-detail-dialog";
import {
  clearBulkOpenIntention,
  fetchPacks,
  getBulkOpenIntention,
  getBulkOpenQuantities,
  isDefinitivePackOpenRejection,
  isValidBulkOpenQuantity,
  MAX_BULK_PACK_OPEN_QUANTITY,
  openPack,
  openPacksBulk,
  readBulkOpenIntention,
  saveBulkOpenIntention,
  type BulkOpenIntention,
  type Pack,
  type PackReward,
} from "@/lib/collection-client";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import { fetchCurrentUser } from "@/lib/auth-client";

export default function PacksPage() {
  const [, navigate] = useLocation();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selected, setSelected] = useState<Pack | null>(null);
  const [rewards, setRewards] = useState<PackReward[]>([]);
  const [openedQuantity, setOpenedQuantity] = useState(0);
  const [openings, setOpenings] = useState<Array<{ rewards: PackReward[] }> | null>(null);
  const [quantityByPack, setQuantityByPack] = useState<Record<string, number>>({});
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<BulkOpenIntention | null>(null);
  const [openingPackName, setOpeningPackName] = useState("");
  const [message, setMessage] = useState("내 팩을 불러오는 중...");
  const openingIntentionRef = useRef<BulkOpenIntention | null>(null);
  const available = useMemo(() => packs, [packs]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const auth = await fetchCurrentUser();
        if (!auth.authenticated || !auth.user) {
          navigate(ROUTES.MAIN_MENU);
          return;
        }
        if (cancelled) return;
        const authenticatedUserId = auth.user.id;
        setUserId(authenticatedUserId);
        const unresolved = readBulkOpenIntention(sessionStorage, authenticatedUserId);
        if (unresolved) {
          openingIntentionRef.current = unresolved;
          setPendingRecovery(unresolved);
        }
        const body = await fetchPacks();
        if (!cancelled) {
          setPacks(body.packs);
          setMessage("");
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && error.message.includes("로그인이 필요합니다")) {
          navigate(ROUTES.MAIN_MENU);
          return;
        }
        setMessage(error instanceof Error ? error.message : "내 팩을 불러오지 못했습니다.");
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  function selectedQuantity(pack: Pack) {
    return quantityByPack[pack.id] ?? 1;
  }

  function chooseQuantity(pack: Pack, quantity: number) {
    if (openingRef.current || openingIntentionRef.current || !isValidBulkOpenQuantity(quantity) || quantity > pack.quantity) return;
    setQuantityByPack((current) => ({ ...current, [pack.id]: quantity }));
  }

  async function performOpen(intention: BulkOpenIntention, packName: string, pack: Pack | null) {
    if (openingRef.current || !userId) return;
    openingRef.current = true;
    setOpening(true);
    setSelected(pack);
    setOpeningPackName(packName);
    setMessage("");
    setRewards([]);
    setOpenedQuantity(0);
    setOpenings(null);
    try {
      const result = intention.quantity === 1
        ? await openPack(intention.packId, intention.key).then((single) => ({ quantity: 1, openings: [{ rewards: single.rewards }] }))
        : await openPacksBulk(intention.packId, intention.quantity, intention.key);
      const normalizedOpenings = result.openings;
      setOpenings(normalizedOpenings);
      setOpenedQuantity(result.quantity);
      setRewards(normalizedOpenings.flatMap((packOpening) => packOpening.rewards));
      const removed = clearBulkOpenIntention(sessionStorage, userId);
      if (removed) {
        openingIntentionRef.current = null;
        setPendingRecovery(null);
      } else {
        openingIntentionRef.current = intention;
        setPendingRecovery(intention);
        setMessage("개봉 결과는 서버에서 확인됐지만 복구 기록을 정리하지 못했습니다. 같은 요청을 다시 확인하기 전까지 새 개봉은 잠깁니다.");
      }
      try {
        setPacks(await fetchPacks().then((body) => body.packs));
      } catch (error) {
        const prefix = removed ? "개봉 결과는 저장되었습니다." : "개봉 결과는 저장되었습니다. 복구 기록도 아직 정리되지 않았습니다.";
        setMessage(`${prefix} 보유 팩을 새로고침하지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "팩을 열 수 없습니다.";
      setSelected(null);
      if (isDefinitivePackOpenRejection(error)) {
        const removed = clearBulkOpenIntention(sessionStorage, userId);
        if (removed) {
          openingIntentionRef.current = null;
          setPendingRecovery(null);
          setMessage(`${errorMessage} 서버가 요청을 거부해 팩은 소모되지 않았습니다. 새 수량으로 다시 시도할 수 있습니다.`);
        } else {
          openingIntentionRef.current = intention;
          setPendingRecovery(intention);
          setMessage(`${errorMessage} 요청은 거부되어 소모되지 않았지만 복구 기록을 정리하지 못했습니다. 기록을 안전하게 확인할 때까지 새 개봉은 잠깁니다.`);
        }
      } else {
        openingIntentionRef.current = intention;
        setPendingRecovery(intention);
        setMessage("개봉 요청 결과를 확인하지 못했습니다. 서버에서 이미 처리됐을 수 있으므로 수량 변경이나 새 개봉은 잠겼습니다. 같은 요청을 다시 확인해 결과를 안전하게 복구하세요.");
      }
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }

  async function handleOpen(pack: Pack) {
    const quantity = selectedQuantity(pack);
    if (openingRef.current || openingIntentionRef.current || pendingRecovery || !userId || !isValidBulkOpenQuantity(quantity) || quantity > pack.quantity) return;
    let intention: BulkOpenIntention;
    try {
      intention = getBulkOpenIntention(null, pack.id, quantity, () => globalThis.crypto.randomUUID());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "요청을 준비하지 못했습니다.");
      return;
    }
    if (!saveBulkOpenIntention(sessionStorage, userId, intention)) {
      setMessage("개봉 복구 정보를 브라우저 세션에 저장하지 못해 팩은 개봉하지 않았습니다. 브라우저 저장 공간을 허용한 뒤 다시 시도하세요.");
      return;
    }
    openingIntentionRef.current = intention;
    await performOpen(intention, pack.name, pack);
  }

  async function handleRetryPendingOpen() {
    const intention = pendingRecovery ?? openingIntentionRef.current;
    if (!intention || openingRef.current || !userId) return;
    const pack = packs.find((item) => item.id === intention.packId) ?? null;
    const name = pack?.name ?? "팩";
    openingIntentionRef.current = intention;
    await performOpen(intention, name, pack);
  }

  function closeOpening() {
    setSelected(null);
    setRewards([]);
    setOpenedQuantity(0);
    setOpenings(null);
    setOpeningPackName("");
  }

  return (
    <main className="ko-page-enter min-h-screen bg-neutral-950 px-5 py-7 text-neutral-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <button type="button" onClick={() => navigate(ROUTES.MAIN_MENU)} className="mb-7 flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> 메인 메뉴</button>
        <header className="mb-8 flex items-end justify-between border-b border-neutral-800 pb-6">
          <div><p className="font-display text-xs font-bold tracking-[0.25em] text-primary">PACK INVENTORY</p><h1 className="mt-2 text-3xl font-black">내 팩</h1></div>
          <Gift className="h-8 w-8 text-amber-400" />
        </header>
        {message && <p data-testid="status-packs-message" className="mb-6 rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200" role="status">{message}</p>}
        {pendingRecovery && <section data-testid="panel-pending-pack-recovery" className="mb-6 rounded-xl border border-amber-600/70 bg-amber-950/40 p-4 sm:p-5" role="alert" aria-labelledby="pending-pack-recovery-title">
          <h2 id="pending-pack-recovery-title" className="font-black text-amber-200">이전 팩 개봉 결과 확인 필요</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-200">
            {packs.find((pack) => pack.id === pendingRecovery.packId)?.name ?? "팩"} · {pendingRecovery.quantity}개 요청의 응답을 받지 못했습니다.
            서버에서 이미 개봉했을 수 있으므로 수량 변경과 새 개봉은 잠겨 있습니다. 동일한 요청 키로 재확인해 결과를 복구합니다.
          </p>
          <button type="button" data-testid="button-retry-pending-pack-open" disabled={opening} onClick={() => void handleRetryPendingOpen()} className="mt-4 w-full rounded bg-primary px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            {opening ? "같은 요청 확인 중..." : "같은 요청 다시 확인"}
          </button>
        </section>}
        {available.length === 0 && !message && <div className="rounded-xl border border-dashed border-neutral-800 px-5 py-16 text-center text-sm text-neutral-500">현재 공개된 팩이 없습니다.</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
           {available.map((pack) => {
             const chosenQuantity = selectedQuantity(pack);
             const fixedQuantities = getBulkOpenQuantities(pack.quantity);
             const allAvailable = Number.isInteger(pack.quantity) && pack.quantity > 1 && pack.quantity <= MAX_BULK_PACK_OPEN_QUANTITY;
             return (
            <article key={pack.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-black/40">
              <div className="flex min-h-36 items-center justify-center bg-gradient-to-br from-amber-950/50 to-neutral-950 p-5">
                {pack.imageUrl ? <img src={pack.imageUrl} alt="" className="max-h-32 rounded object-contain" /> : <Gift className="h-16 w-16 text-amber-400/80" />}
              </div>
               <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{pack.name}</h2><p className="mt-1 text-sm text-neutral-500">{pack.description || "KO 카드팩"}</p></div><span data-testid={`text-pack-quantity-${pack.id}`} className="rounded bg-amber-400 px-2 py-1 text-sm font-black text-black">×{pack.quantity}</span></div><p className="mt-4 text-xs text-neutral-400">{pack.cardsPerPack}장 · 일반 {pack.normalRate}% · 레전더리 {pack.legendaryRate}% · 챔피언 {pack.championRate}% · 스킨 확률 {pack.skinChance}%</p><button type="button" data-testid={`button-pack-details-${pack.id}`} disabled={opening || !!pendingRecovery} onClick={() => setSelected(pack)} className="mt-4 w-full rounded border border-neutral-700 px-4 py-2.5 text-sm font-black text-neutral-200 hover:border-amber-500 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50">구성품 및 확률 보기</button>
                  <fieldset className="mt-4" disabled={opening || !!pendingRecovery || !userId || pack.quantity < 1} aria-label={`${pack.name} 개봉 수량`}>
                   <legend className="mb-2 text-xs font-bold text-neutral-400">개봉 수량</legend>
                   <div className={`grid gap-2 ${pack.quantity > MAX_BULK_PACK_OPEN_QUANTITY ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-4"}`}>
                     {[1, 5, 10].map((quantity) => {
                       const enabled = fixedQuantities.includes(quantity);
                       return <button key={quantity} type="button" data-testid={`button-open-quantity-${pack.id}-${quantity}`} aria-pressed={chosenQuantity === quantity} disabled={!enabled || opening} onClick={() => chooseQuantity(pack, quantity)} className={`rounded border px-2 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${chosenQuantity === quantity ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-neutral-700 text-neutral-300"}`}>{quantity}</button>;
                     })}
                     {pack.quantity > 1 && <button type="button" data-testid={`button-open-quantity-${pack.id}-all`} aria-pressed={chosenQuantity === pack.quantity} disabled={!allAvailable || opening || pack.quantity < 1} onClick={() => chooseQuantity(pack, pack.quantity)} className={`rounded border px-2 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${chosenQuantity === pack.quantity && allAvailable ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-neutral-700 text-neutral-300"}`}>ALL{pack.quantity <= MAX_BULK_PACK_OPEN_QUANTITY ? ` (${pack.quantity})` : ""}</button>}
                     {pack.quantity > MAX_BULK_PACK_OPEN_QUANTITY && <button type="button" data-testid={`button-open-quantity-${pack.id}-max-safe`} aria-pressed={chosenQuantity === MAX_BULK_PACK_OPEN_QUANTITY} disabled={opening || pack.quantity < MAX_BULK_PACK_OPEN_QUANTITY} onClick={() => chooseQuantity(pack, MAX_BULK_PACK_OPEN_QUANTITY)} className={`rounded border px-2 py-2.5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 ${chosenQuantity === MAX_BULK_PACK_OPEN_QUANTITY ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-neutral-700 text-neutral-300"}`}>MAX 100</button>}
                   </div>
                 </fieldset>
                 {pack.quantity > MAX_BULK_PACK_OPEN_QUANTITY && <p data-testid={`text-max-bulk-quantity-${pack.id}`} className="mt-3 rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-200" role="status">한 번에 최대 {MAX_BULK_PACK_OPEN_QUANTITY}개까지 안전하게 개봉할 수 있습니다. 100개를 초과하는 ALL 개봉은 지원되지 않습니다. 필요한 수량만 선택해 별도 배치로 개봉하세요.</p>}
                  <button type="button" data-testid={`button-open-pack-${pack.id}`} disabled={opening || !!pendingRecovery || !userId || pack.quantity < 1 || chosenQuantity > pack.quantity || chosenQuantity > MAX_BULK_PACK_OPEN_QUANTITY} onClick={() => void handleOpen(pack)} className="mt-3 w-full rounded bg-primary px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50">{opening && selected?.id === pack.id ? "개봉 중..." : pack.quantity > 0 ? `${chosenQuantity}개 개봉` : "보유 없음"}</button></div>
            </article>
             );
           })}
        </div>
        {openingPackName && openings !== null && <PackOpening packName={openingPackName} rewards={rewards} packCount={openedQuantity || 1} perPackRewards={openings.map((item) => item.rewards)} notice={message || undefined} onClose={closeOpening} />}
        {selected && openings === null && !opening && <PackDetailDialog pack={selected} onClose={() => setSelected(null)} />}
      </div>
    </main>
  );
}
