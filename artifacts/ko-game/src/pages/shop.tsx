import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Coins, Gift, ShoppingBag } from "lucide-react";
import { fetchShop, purchaseShopListing, type ShopListing } from "@/lib/collection-client";
import { useToast } from "@/hooks/use-toast";
import { PackDetailDialog } from "@/components/pack-detail-dialog";
import { CollectionActionAnimation, type CollectionActionScene } from "@/components/collection-action-animation";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import { MAX_SHOP_PURCHASE_QUANTITY } from "../../../../lib/game-engine/src/shop-purchase";

export default function ShopPage() {
  const [, navigate] = useLocation();
  const [currency, setCurrency] = useState(0);
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [currencyDisplayName, setCurrencyDisplayName] = useState("크레딧");
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [message, setMessage] = useState("상점을 불러오는 중...");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [rewardScene, setRewardScene] = useState<CollectionActionScene | null>(null);
  const [selectedListing, setSelectedListing] = useState<ShopListing | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const purchasingRef = useRef(false);
  const { toast } = useToast();

  async function refresh() {
    const result = await fetchShop();
    setCurrency(result.currencyBalance);
    setIsTestAccount(result.isTestAccount);
    setCurrencyDisplayName(result.currencyDisplayName);
    setListings(result.listings);
  }

  useEffect(() => {
    refresh()
      .then(() => setMessage(""))
      .catch((error: Error) => {
        if (error.message.includes("로그인이 필요합니다")) {
          navigate(ROUTES.MAIN_MENU);
          return;
        }
        setMessage(error.message);
      });
  }, [navigate]);

  const hasListings = useMemo(() => listings.length > 0, [listings]);

  async function handlePurchase(listing: ShopListing) {
    if (purchasingRef.current) return;
    const quantity = quantities[listing.id] ?? 1;
    const total = listing.price * quantity;
    const packQuantity = listing.packQuantity * quantity;
    const confirmed = window.confirm(`${listing.name || listing.pack.name} ${quantity}묶음 (팩 ${packQuantity}개)을\n총 ${total.toLocaleString()} ${currencyDisplayName}으로 구매하시겠습니까?`);
    if (!confirmed) return;
    purchasingRef.current = true;
    setPurchasingId(listing.id);
    setSuccess("");
    setMessage("");
    try {
      const result = await purchaseShopListing(listing.id, quantity);
      setCurrency(result.currencyBalance);
      setListings((current) => current.map((item) => item.id === listing.id
        ? { ...item, ownedQuantity: result.ownedQuantity }
        : item));
      setSuccess(`팩 ${result.packQuantity}개를 획득했습니다.`);
      setRewardScene({ id: Date.now(), kind: "PACK_PURCHASE", name: listing.name || listing.pack.name, imageUrl: listing.pack.imageUrl, quantity: result.packQuantity });
      toast({ title: "구매 완료", description: `팩 ${result.packQuantity}개를 획득했습니다.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "구매에 실패했습니다.";
      setMessage(message);
      if (message.includes("크레딧이 부족합니다")) {
        toast({ title: "구매 실패", description: "크레딧이 부족합니다.", variant: "destructive" });
      }
    } finally {
      purchasingRef.current = false;
      setPurchasingId(null);
    }
  }

  return (
    <main className="ko-page-enter min-h-screen bg-neutral-950 px-5 py-7 text-neutral-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex items-center justify-between gap-4">
           <button type="button" onClick={() => navigate(ROUTES.MAIN_MENU)} className="flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> 메인 메뉴
          </button>
           <div className="flex items-center gap-2 rounded-full border border-amber-700/50 bg-amber-950/30 px-4 py-2 text-sm font-black text-amber-200">
             <Coins className="h-4 w-4 text-amber-400" /> {isTestAccount ? "∞" : currency.toLocaleString()} {currencyDisplayName}
          </div>
        </div>
        <header className="mb-8 flex items-end justify-between border-b border-neutral-800 pb-6">
          <div><p className="font-display text-xs font-bold tracking-[0.25em] text-primary">KO SHOP</p><h1 className="mt-2 text-3xl font-black">카드팩 상점</h1><p className="mt-2 text-sm text-neutral-500">크레딧으로 공개된 카드팩을 구매합니다.</p></div>
          <ShoppingBag className="h-8 w-8 text-amber-400" />
        </header>
        {message && <p className="mb-6 rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{message}</p>}
        {success && <p role="status" className="mb-6 rounded border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">{success}</p>}
        {!message && !hasListings && <div className="rounded-xl border border-dashed border-neutral-800 px-5 py-16 text-center text-sm text-neutral-500">현재 판매 중인 카드팩이 없습니다.</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const quantity = quantities[listing.id] ?? 1;
            const total = listing.price * quantity;
            const canAfford = isTestAccount || currency >= total;
            const busy = purchasingId === listing.id;
            return (
              <article key={listing.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-black/40">
                <div className="flex min-h-40 items-center justify-center bg-gradient-to-br from-amber-950/50 to-neutral-950 p-5">
                  {listing.pack.imageUrl ? <img src={listing.pack.imageUrl} alt="" className="max-h-36 rounded object-contain" /> : <Gift className="h-16 w-16 text-amber-400/80" />}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-black">{listing.name || listing.pack.name}</h2><p className="mt-1 text-sm text-neutral-500">{listing.description || listing.pack.description || "KO 카드팩"}</p></div>
                    <span className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs font-bold text-neutral-300">보유 ×{listing.ownedQuantity}</span>
                  </div>
                  <p className="mt-4 text-xs text-neutral-400">{listing.pack.name} · 팩 {listing.packQuantity}개 · {listing.pack.cardsPerPack}장</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <label htmlFor={`purchase-${listing.id}`} className="text-sm font-bold text-neutral-300">구매 수량</label>
                    <input id={`purchase-${listing.id}`} type="number" inputMode="numeric" min={1} max={MAX_SHOP_PURCHASE_QUANTITY} step={1} value={quantity} disabled={Boolean(purchasingId)} onChange={event => setQuantities(current => ({ ...current, [listing.id]: Math.max(1, Math.min(MAX_SHOP_PURCHASE_QUANTITY, Math.floor(Number(event.target.value) || 1))) }))} className="w-20 min-w-0 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-base text-white" />
                    {[1, 5, 10].map(amount => <button key={amount} type="button" disabled={Boolean(purchasingId)} aria-pressed={quantity === amount} onClick={() => setQuantities(current => ({ ...current, [listing.id]: amount }))} className={`rounded border px-3 py-2 text-sm font-bold ${quantity === amount ? "border-amber-500 text-amber-300" : "border-neutral-700 text-neutral-400"}`}>{amount}</button>)}
                  </div>
                  <p className="mt-2 text-sm text-amber-200">팩 {listing.packQuantity * quantity}개 · 총 {total.toLocaleString()} {currencyDisplayName}</p>
                   <button type="button" onClick={() => setSelectedListing(listing)} className="mt-5 w-full rounded border border-neutral-700 px-4 py-2.5 text-sm font-black text-neutral-200 transition hover:border-amber-500 hover:text-amber-300">
                     구성품 및 확률 보기
                   </button>
                   <button type="button" disabled={Boolean(purchasingId) || !canAfford} onClick={() => void handlePurchase(listing)} className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50">
                    <Coins className="h-4 w-4" /> {busy ? "구매 중..." : canAfford ? `${quantity}묶음 구매 · ${total.toLocaleString()} ${currencyDisplayName}` : "크레딧 부족"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
           <button type="button" onClick={() => navigate(ROUTES.PACKS)} className="rounded border border-neutral-700 px-5 py-3 text-sm font-black text-neutral-200 hover:border-amber-500 hover:text-amber-300">내 팩 / 팩 열기</button>
        </div>
      </div>
       {selectedListing && <PackDetailDialog pack={selectedListing.pack} price={selectedListing.price} packQuantity={selectedListing.packQuantity} onClose={() => setSelectedListing(null)} />}
       {rewardScene && <CollectionActionAnimation scene={rewardScene} onComplete={() => setRewardScene(null)} />}
    </main>
  );
}
