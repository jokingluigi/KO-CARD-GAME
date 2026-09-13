import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Coins, Gift, ShoppingBag } from "lucide-react";
import { fetchShop, purchaseShopListing, type ShopListing } from "@/lib/collection-client";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ShopPage() {
  const [currency, setCurrency] = useState(0);
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [message, setMessage] = useState("상점을 불러오는 중...");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [success, setSuccess] = useState("");

  async function refresh() {
    const result = await fetchShop();
    setCurrency(result.currency);
    setListings(result.listings);
  }

  useEffect(() => {
    refresh()
      .then(() => setMessage(""))
      .catch((error: Error) => {
        if (error.message.includes("로그인이 필요합니다")) {
          window.location.href = basePath;
          return;
        }
        setMessage(error.message);
      });
  }, []);

  const hasListings = useMemo(() => listings.length > 0, [listings]);

  async function handlePurchase(listing: ShopListing) {
    if (purchasingId) return;
    setPurchasingId(listing.id);
    setSuccess("");
    setMessage("");
    try {
      const result = await purchaseShopListing(listing.id);
      setCurrency(result.currency);
      setListings((current) => current.map((item) => item.id === listing.id
        ? { ...item, quantity: result.quantity }
        : item));
      setSuccess(`${listing.pack.name}을 구매했습니다. 내 팩에서 확인할 수 있습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "구매에 실패했습니다.");
    } finally {
      setPurchasingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-7 text-neutral-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex items-center justify-between gap-4">
          <button type="button" onClick={() => { window.location.href = basePath; }} className="flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> 메인 메뉴
          </button>
          <div className="flex items-center gap-2 rounded-full border border-amber-700/50 bg-amber-950/30 px-4 py-2 text-sm font-black text-amber-200">
            <Coins className="h-4 w-4 text-amber-400" /> {currency.toLocaleString()} Gold
          </div>
        </div>
        <header className="mb-8 flex items-end justify-between border-b border-neutral-800 pb-6">
          <div><p className="font-display text-xs font-bold tracking-[0.25em] text-primary">KO SHOP</p><h1 className="mt-2 text-3xl font-black">카드팩 상점</h1><p className="mt-2 text-sm text-neutral-500">게임에서 획득한 Gold로 공개된 카드팩을 구매합니다.</p></div>
          <ShoppingBag className="h-8 w-8 text-amber-400" />
        </header>
        {message && <p className="mb-6 rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{message}</p>}
        {success && <p role="status" className="mb-6 rounded border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">{success}</p>}
        {!message && !hasListings && <div className="rounded-xl border border-dashed border-neutral-800 px-5 py-16 text-center text-sm text-neutral-500">현재 판매 중인 카드팩이 없습니다.</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const canAfford = currency >= listing.price;
            const busy = purchasingId === listing.id;
            return (
              <article key={listing.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-black/40">
                <div className="flex min-h-40 items-center justify-center bg-gradient-to-br from-amber-950/50 to-neutral-950 p-5">
                  {listing.pack.imageUrl ? <img src={listing.pack.imageUrl} alt="" className="max-h-36 rounded object-contain" /> : <Gift className="h-16 w-16 text-amber-400/80" />}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-black">{listing.pack.name}</h2><p className="mt-1 text-sm text-neutral-500">{listing.pack.description || "KO 카드팩"}</p></div>
                    <span className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs font-bold text-neutral-300">보유 ×{listing.quantity}</span>
                  </div>
                  <p className="mt-4 text-xs text-neutral-400">{listing.pack.cardsPerPack}장 · 일반 {listing.pack.normalRate}% · 레전더리 {listing.pack.legendaryRate}% · Champion {listing.pack.championRate}%</p>
                  <button type="button" disabled={Boolean(purchasingId) || !canAfford} onClick={() => void handlePurchase(listing)} className="mt-5 flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-3 text-sm font-black text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50">
                    <Coins className="h-4 w-4" /> {busy ? "구매 중..." : canAfford ? `${listing.price.toLocaleString()} Gold로 구매` : "재화 부족"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => { window.location.href = `${basePath}/packs`; }} className="rounded border border-neutral-700 px-5 py-3 text-sm font-black text-neutral-200 hover:border-amber-500 hover:text-amber-300">내 팩 / 팩 열기</button>
        </div>
      </div>
    </main>
  );
}