import {
  GamePageHeader,
  SHOP_PAGE_LINKS,
  SurfaceEmpty,
} from "@/components/game-page-header";
import { PackCover } from "@/components/pack-cover";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { prefersReducedMotion } from "@/components/presentation-config";
import { MotionNumber } from "@/components/presentation-motion";
import { ShopDecks } from "@/components/shop-decks";
import { useEffect, useMemo, useRef, useState } from "react";
import { Coins } from "lucide-react";
import {
  fetchShop,
  purchaseShopListing,
  type ShopListing,
} from "@/lib/collection-client";
import { useToast } from "@/hooks/use-toast";
import { PackDetailDialog } from "@/components/pack-detail-dialog";
import {
  CollectionActionAnimation,
  type CollectionActionScene,
} from "@/components/collection-action-animation";
import { useLocation } from "wouter";
import { ROUTES } from "@/lib/routes";
import { MAX_SHOP_PURCHASE_QUANTITY } from "../../../../lib/game-engine/src/shop-purchase";

export default function ShopPage() {
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<"PACK" | "DECK">("PACK");
  const [currency, setCurrency] = useState(0);
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [currencyDisplayName, setCurrencyDisplayName] = useState("크레딧");
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [message, setMessage] = useState("상점을 불러오는 중...");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [rewardScene, setRewardScene] = useState<CollectionActionScene | null>(
    null,
  );
  const [selectedListing, setSelectedListing] = useState<ShopListing | null>(
    null,
  );
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const purchasingRef = useRef(false);
  const purchaseOrigin = useRef<HTMLButtonElement | null>(null);
  const rewardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(rewardTimer.current), []);
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
      .then(() => {
        setMessage("");
        setLoadError(false);
      })
      .catch((error: Error) => {
        if (error.message.includes("로그인이 필요합니다")) {
          navigate(ROUTES.MAIN_MENU);
          return;
        }
        setMessage(error.message);
        setLoadError(true);
      });
  }, [navigate]);

  const [pendingPurchase, setPendingPurchase] = useState<{
    listing: ShopListing;
    quantity: number;
  } | null>(null);
  const hasListings = useMemo(() => listings.length > 0, [listings]);

  async function handlePurchase(
    listing: ShopListing,
    confirmedQuantity?: number,
  ) {
    if (purchasingRef.current) return;
    const quantity = confirmedQuantity ?? quantities[listing.id] ?? 1;
    if (confirmedQuantity === undefined) {
      setMessage("");
      setPendingPurchase({ listing, quantity });
      return;
    }
    purchasingRef.current = true;
    setPurchasingId(listing.id);
    setSuccess("");
    setMessage("");
    try {
      const result = await purchaseShopListing(listing.id, quantity);
      setCurrency(result.currencyBalance);
      setPendingPurchase(null);
      setListings((current) =>
        current.map((item) =>
          item.id === listing.id
            ? { ...item, ownedQuantity: result.ownedQuantity }
            : item,
        ),
      );
      setSuccess(`팩 ${result.packQuantity}개를 획득했습니다.`);
      const scene: CollectionActionScene = {
        id: Date.now(),
        kind: "PACK_PURCHASE",
        name: listing.name || listing.pack.name,
        imageUrl: listing.pack.imageUrl,
        quantity: result.packQuantity,
      };
      // Let the confirmation exit finish; receipt data is already committed above.
      clearTimeout(rewardTimer.current);
      rewardTimer.current = setTimeout(
        () => setRewardScene(scene),
        prefersReducedMotion() ? 0 : 210,
      );
      toast({
        title: "구매 완료",
        description: `팩 ${result.packQuantity}개를 획득했습니다.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "구매에 실패했습니다.";
      setMessage(message);
      if (message.includes("크레딧이 부족합니다")) {
        toast({
          title: "구매 실패",
          description: "크레딧이 부족합니다.",
          variant: "destructive",
        });
      }
    } finally {
      purchasingRef.current = false;
      setPurchasingId(null);
    }
  }

  return (
    <main className="ko-experience-page ko-player-page">
      <div className="ko-page-content">
        <GamePageHeader
          eyebrow="KO MARKET"
          title="상점"
          description="새로운 선수를 영입하고, 다음 덱의 가능성을 열어보세요."
          links={SHOP_PAGE_LINKS}
          aside={
            <div className="ko-market-balance">
              <span>보유 재화</span>
              <strong>
                {isTestAccount ? (
                  "∞"
                ) : (
                  <MotionNumber
                    value={currency}
                    format={(n) => n.toLocaleString()}
                  />
                )}
              </strong>
              <small>{currencyDisplayName}</small>
            </div>
          }
        />
        <nav aria-label="상점 카테고리" className="ko-surface-tabs">
          <button
            type="button"
            aria-pressed={category === "PACK"}
            className=""
            onClick={() => setCategory("PACK")}
          >
            카드팩
          </button>
          <button
            type="button"
            aria-pressed={category === "DECK"}
            className=""
            onClick={() => setCategory("DECK")}
          >
            완성 덱
          </button>
        </nav>
        {category === "DECK" ? (
          <ShopDecks
            currency={currency}
            isTestAccount={isTestAccount}
            onBalance={setCurrency}
          />
        ) : (
          <>
            {message && (
              <p
                role={loadError ? "alert" : "status"}
                className={
                  "ko-surface-message " + (loadError ? "is-error" : "")
                }
              >
                {message}
                {loadError && (
                  <button
                    type="button"
                    disabled={Boolean(purchasingId)}
                    onClick={() => {
                      setMessage("상점을 다시 확인하고 있어요…");
                      setLoadError(false);
                      void refresh()
                        .then(() => setMessage(""))
                        .catch((e) => {
                          setMessage(
                            e instanceof Error
                              ? e.message
                              : "상점을 불러오지 못했어요.",
                          );
                          setLoadError(true);
                        });
                    }}
                  >
                    다시 확인
                  </button>
                )}
              </p>
            )}
            {success && (
              <p
                data-ui-mount-motion
                data-ui-motion-state={`SUCCESS:${success}`}
                role="status"
                className="mb-6 rounded border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200"
              >
                {success}
              </p>
            )}
            {!message && !hasListings && (
              <SurfaceEmpty
                title="다음 상품을 준비 중이에요"
                href="/packs"
                label="내 팩 확인"
              >
                보유한 팩이 있다면 지금 열어볼 수 있어요.
              </SurfaceEmpty>
            )}
            <div className="ko-market-grid">
              {listings.map((listing) => {
                const quantity = quantities[listing.id] ?? 1;
                const total = listing.price * quantity;
                const canAfford = isTestAccount || currency >= total;
                const busy = purchasingId === listing.id;
                return (
                  <article
                    key={listing.id}
                    data-ui-motion-state={
                      purchasingId === listing.id
                        ? "PENDING"
                        : selectedListing?.id === listing.id
                          ? "ACTIVE"
                          : ""
                    }
                    className="ko-market-item"
                  >
                    <PackCover
                      src={listing.imageUrl || listing.pack.imageUrl}
                      name={listing.name || listing.pack.name}
                    />
                    <div className="ko-market-item__copy">
                      <div className="ko-market-item__title">
                        <div>
                          <h2 className="font-black">
                            {listing.name || listing.pack.name}
                          </h2>
                          <p className="ko-market-item__description">
                            {listing.description ||
                              listing.pack.description ||
                              "KO 카드팩"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded bg-neutral-800 px-2 py-1 text-xs font-bold text-neutral-300">
                          보유 ×{listing.ownedQuantity}
                        </span>
                      </div>
                      <p className="ko-market-item__meta">
                        {listing.pack.name} · 팩 {listing.packQuantity}개 ·{" "}
                        {listing.pack.cardsPerPack}장
                      </p>
                      <div className="ko-market-item__quantity ko-market-item__controls">
                        <label
                          htmlFor={`purchase-${listing.id}`}
                          className="text-sm font-bold text-neutral-300"
                        >
                          구매 수량
                        </label>
                        <input
                          id={`purchase-${listing.id}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={MAX_SHOP_PURCHASE_QUANTITY}
                          step={1}
                          value={quantity}
                          disabled={Boolean(purchasingId)}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [listing.id]: Math.max(
                                1,
                                Math.min(
                                  MAX_SHOP_PURCHASE_QUANTITY,
                                  Math.floor(Number(event.target.value) || 1),
                                ),
                              ),
                            }))
                          }
                          className="w-20 min-w-0 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-base text-white"
                        />
                        {[1, 5, 10].map((amount) => (
                          <button
                            key={amount}
                            type="button"
                            disabled={Boolean(purchasingId)}
                            aria-pressed={quantity === amount}
                            onClick={() =>
                              setQuantities((current) => ({
                                ...current,
                                [listing.id]: amount,
                              }))
                            }
                            className={`rounded border px-3 py-2 text-sm font-bold ${quantity === amount ? "border-amber-500 text-amber-300" : "border-neutral-700 text-neutral-400"}`}
                          >
                            {amount}
                          </button>
                        ))}
                      </div>
                      <p className="ko-market-item__price">
                        팩 {listing.packQuantity * quantity}개 · 총{" "}
                        {total.toLocaleString()} {currencyDisplayName}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedListing(listing)}
                        className="ko-market-item__link"
                      >
                        구성품 및 확률 보기
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(purchasingId) || !canAfford}
                        data-ui-motion-state={busy ? "PENDING" : ""}
                        onClick={(event) => {
                          purchaseOrigin.current = event.currentTarget;
                          void handlePurchase(listing);
                        }}
                        className="ko-surface-primary"
                      >
                        <Coins className="h-4 w-4" />{" "}
                        {busy
                          ? "구매 중..."
                          : canAfford
                            ? `${quantity}묶음 구매 · ${total.toLocaleString()} ${currencyDisplayName}`
                            : `${(total - currency).toLocaleString()} ${currencyDisplayName} 부족`}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
        <div className="ko-market-footer">
          <button
            type="button"
            onClick={() => navigate(ROUTES.PACKS)}
            className="rounded border border-neutral-700 px-5 py-3 text-sm font-black text-neutral-200 hover:border-amber-500 hover:text-amber-300"
          >
            내 팩 / 팩 열기
          </button>
        </div>
      </div>
      {selectedListing && (
        <PackDetailDialog
          pack={selectedListing.pack}
          price={selectedListing.price}
          packQuantity={selectedListing.packQuantity}
          onClose={() => setSelectedListing(null)}
        />
      )}
      <Dialog
        open={Boolean(pendingPurchase)}
        onOpenChange={(open) => {
          if (!open && !purchasingRef.current) setPendingPurchase(null);
        }}
      >
        <DialogContent
          className="bg-neutral-950 text-white"
          overlayClassName="ko-purchase-overlay"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            purchaseOrigin.current?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle>구매 확인</DialogTitle>
          <DialogDescription>
            {pendingPurchase?.listing.name ||
              pendingPurchase?.listing.pack.name}{" "}
            · {pendingPurchase?.quantity}묶음
          </DialogDescription>
          {pendingPurchase && (
            <p className="text-lg text-amber-200">
              팩{" "}
              {pendingPurchase.listing.packQuantity * pendingPurchase.quantity}
              개 · 총{" "}
              {(
                pendingPurchase.listing.price * pendingPurchase.quantity
              ).toLocaleString()}{" "}
              {currencyDisplayName}
            </p>
          )}
          {message && <p role="alert">{message}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={Boolean(purchasingId)}
              className="min-h-11 flex-1 border border-neutral-600"
              onClick={() => setPendingPurchase(null)}
            >
              취소
            </button>
            <button
              type="button"
              disabled={Boolean(purchasingId)}
              aria-busy={Boolean(purchasingId)}
              data-ui-motion-state={purchasingId ? "PENDING" : ""}
              className="min-h-11 flex-1 border border-amber-600 bg-amber-950 text-amber-100"
              onClick={() => {
                if (pendingPurchase)
                  void handlePurchase(
                    pendingPurchase.listing,
                    pendingPurchase.quantity,
                  );
              }}
            >
              {purchasingId ? "구매 확인 중…" : "구매 확정"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {rewardScene && (
        <CollectionActionAnimation
          scene={rewardScene}
          onComplete={() => setRewardScene(null)}
        />
      )}
    </main>
  );
}
