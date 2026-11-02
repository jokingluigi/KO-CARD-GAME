import {CosmeticDuplicatePolicy} from '@/components/cosmetic-duplicate-policy';
import {
  GamePageHeader,
  SHOP_PAGE_LINKS,
  SurfaceEmpty,
} from "@/components/game-page-header";
import { PackCover } from "@/components/pack-cover";
import { packRateTotal, validPackRates } from "@workspace/cosmetics";
import { changeShelf, readShelf } from "@/components/player-tools/shelf";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { fetchCurrentUser,refreshCurrentUser } from "@/lib/auth-client";

export default function PacksPage() {
  const [, navigate] = useLocation();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selected, setSelected] = useState<Pack | null>(null);
  const [wishNotice, setWishNotice] = useState("");
  const [rewards, setRewards] = useState<PackReward[]>([]);
  const [openedQuantity, setOpenedQuantity] = useState(0);
  const [openings, setOpenings] = useState<Array<{
    rewards: PackReward[];
  }> | null>(null);
  const [quantityByPack, setQuantityByPack] = useState<Record<string, number>>(
    {},
  );
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingRecovery, setPendingRecovery] =
    useState<BulkOpenIntention | null>(null);
  const [openingPackName, setOpeningPackName] = useState("");
  const [message, setMessage] = useState("내 팩을 불러오는 중...");
  const [loadError, setLoadError] = useState(false);
  const openingIntentionRef = useRef<BulkOpenIntention | null>(null);
  const available = useMemo(
    () => packs.filter((pack) => pack.quantity > 0),
    [packs],
  );

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
        const unresolved = readBulkOpenIntention(
          sessionStorage,
          authenticatedUserId,
        );
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
        if (
          error instanceof Error &&
          error.message.includes("로그인이 필요합니다")
        ) {
          navigate(ROUTES.MAIN_MENU);
          return;
        }
        setMessage(
          error instanceof Error
            ? error.message
            : "내 팩을 불러오지 못했습니다.",
        );
        setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function selectedQuantity(pack: Pack) {
    return quantityByPack[pack.id] ?? 1;
  }

  function chooseQuantity(pack: Pack, quantity: number) {
    if (
      openingRef.current ||
      openingIntentionRef.current ||
      !isValidBulkOpenQuantity(quantity) ||
      quantity > pack.quantity
    )
      return;
    setQuantityByPack((current) => ({ ...current, [pack.id]: quantity }));
  }

  async function performOpen(
    intention: BulkOpenIntention,
    packName: string,
    pack: Pack | null,
  ) {
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
      const result =
        intention.quantity === 1
          ? await openPack(intention.packId, intention.key).then((single) => ({
              quantity: 1,
              openings: [{ rewards: single.rewards }],
            }))
          : await openPacksBulk(
              intention.packId,
              intention.quantity,
              intention.key,
            );
      void refreshCurrentUser().catch(()=>{});
      const normalizedOpenings = result.openings;
      setOpenings(normalizedOpenings);
      setOpenedQuantity(result.quantity);
      setRewards(
        normalizedOpenings.flatMap((packOpening) => packOpening.rewards),
      );
      const confirmed = normalizedOpenings.flatMap((x) => x.rewards),
        cardIds = confirmed
          .flatMap((r) => [r.cardDefinitionId, r.championDefinitionId])
          .filter(Boolean),
        skinIds = confirmed
          .flatMap((r) => [
            r.cosmeticId,
            r.cosmetic?.id,
            r.skinDefinitionId ? "legacy:" + r.skinDefinitionId : undefined,
          ])
          .filter(Boolean);
      const achieved = readShelf(userId).wishes.filter(
        (w) =>
          !w.acquired && (w.kind === "card" ? cardIds : skinIds).includes(w.id),
      );
      if (
        achieved.length &&
        changeShelf(userId, (s) => ({
          ...s,
          wishes: s.wishes.map((w) =>
            achieved.some((a) => a.id === w.id && a.kind === w.kind)
              ? { ...w, acquired: true }
              : w,
          ),
        }))
      )
        setWishNotice(
          "수집 목표 달성: " + achieved.map((w) => w.name).join(", "),
        );

      const removed = clearBulkOpenIntention(sessionStorage, userId);
      if (removed) {
        openingIntentionRef.current = null;
        setPendingRecovery(null);
      } else {
        openingIntentionRef.current = intention;
        setPendingRecovery(intention);
        setMessage(
          "개봉 결과는 서버에서 확인됐지만 복구 기록을 정리하지 못했습니다. 같은 요청을 다시 확인하기 전까지 새 개봉은 잠깁니다.",
        );
      }
      try {
        setPacks(await fetchPacks().then((body) => body.packs));
      } catch (error) {
        const prefix = removed
          ? "개봉 결과는 저장되었습니다."
          : "개봉 결과는 저장되었습니다. 복구 기록도 아직 정리되지 않았습니다.";
        setMessage(
          `${prefix} 보유 팩을 새로고침하지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "팩을 열 수 없습니다.";
      setSelected(null);
      if (isDefinitivePackOpenRejection(error)) {
        const removed = clearBulkOpenIntention(sessionStorage, userId);
        if (removed) {
          openingIntentionRef.current = null;
          setPendingRecovery(null);
          setMessage(
            `${errorMessage} 서버가 요청을 거부해 팩은 소모되지 않았습니다. 새 수량으로 다시 시도할 수 있습니다.`,
          );
        } else {
          openingIntentionRef.current = intention;
          setPendingRecovery(intention);
          setMessage(
            `${errorMessage} 요청은 거부되어 소모되지 않았지만 복구 기록을 정리하지 못했습니다. 기록을 안전하게 확인할 때까지 새 개봉은 잠깁니다.`,
          );
        }
      } else {
        openingIntentionRef.current = intention;
        setPendingRecovery(intention);
        setMessage(
          "개봉 요청 결과를 확인하지 못했습니다. 서버에서 이미 처리됐을 수 있으므로 수량 변경이나 새 개봉은 잠겼습니다. 같은 요청을 다시 확인해 결과를 안전하게 복구하세요.",
        );
      }
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }

  async function handleOpen(pack: Pack) {
    const quantity = selectedQuantity(pack);
    if (!validPackRates(pack)) {
      setMessage("팩 확률 설정을 확인 중입니다. 팩은 소모되지 않았습니다.");
      return;
    }
    if (
      openingRef.current ||
      openingIntentionRef.current ||
      pendingRecovery ||
      !userId ||
      !isValidBulkOpenQuantity(quantity) ||
      quantity > pack.quantity
    )
      return;
    let intention: BulkOpenIntention;
    try {
      intention = getBulkOpenIntention(null, pack.id, quantity, () =>
        globalThis.crypto.randomUUID(),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "요청을 준비하지 못했습니다.",
      );
      return;
    }
    if (!saveBulkOpenIntention(sessionStorage, userId, intention)) {
      setMessage(
        "개봉 복구 정보를 브라우저 세션에 저장하지 못해 팩은 개봉하지 않았습니다. 브라우저 저장 공간을 허용한 뒤 다시 시도하세요.",
      );
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
    <main className="ko-experience-page ko-player-page">
      {wishNotice && (
        <p role="status" className="border border-amber-800 p-3 text-amber-200">
          {wishNotice}
        </p>
      )}
      <div className="ko-page-content">
        <GamePageHeader
          eyebrow="PACK INVENTORY"
          title="내 팩"
          description="어떤 카드를 만나게 될까요? 보유한 팩을 골라 열어보세요."
          links={SHOP_PAGE_LINKS}
          aside={
            <div className="ko-surface-stat">
              <strong>{available.reduce((n, p) => n + p.quantity, 0)}</strong>
              <span>개봉 가능한 팩</span>
            </div>
          }
        />
        {message && (
          <p
            data-testid="status-packs-message"
            className={"ko-surface-message " + (loadError ? "is-error" : "")}
            role={loadError ? "alert" : "status"}
          >
            {message}
            {loadError && (
              <button
                type="button"
                disabled={opening}
                onClick={() => {
                  setLoadError(false);
                  setMessage("보유 팩을 다시 확인하고 있어요…");
                  void fetchPacks()
                    .then((body) => {
                      setPacks(body.packs);
                      setMessage("");
                    })
                    .catch((e) => {
                      setMessage(
                        e instanceof Error
                          ? e.message
                          : "보유 팩을 불러오지 못했어요.",
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
        {pendingRecovery && (
          <section
            data-testid="panel-pending-pack-recovery"
            className="mb-6 rounded-xl border border-amber-600/70 bg-amber-950/40 p-4 sm:p-5"
            role="alert"
            aria-labelledby="pending-pack-recovery-title"
          >
            <h2
              id="pending-pack-recovery-title"
              className="font-black text-amber-200"
            >
              이전 팩 개봉 결과 확인 필요
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-200">
              {packs.find((pack) => pack.id === pendingRecovery.packId)?.name ??
                "팩"}{" "}
              · {pendingRecovery.quantity}개 요청의 응답을 받지 못했습니다.
              서버에서 이미 개봉했을 수 있으므로 수량 변경과 새 개봉은 잠겨
              있습니다. 동일한 요청 키로 재확인해 결과를 복구합니다.
            </p>
            <button
              type="button"
              data-testid="button-retry-pending-pack-open"
              disabled={opening}
              onClick={() => void handleRetryPendingOpen()}
              className="mt-4 w-full rounded bg-primary px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {opening ? "같은 요청 확인 중..." : "같은 요청 다시 확인"}
            </button>
          </section>
        )}
        <CosmeticDuplicatePolicy/>
        {available.length === 0 && !message && (
          <SurfaceEmpty
            title="아직 열어볼 팩이 없어요"
            href="/shop"
            label="상점 둘러보기"
          >
            획득한 팩은 이곳에 모여요. 퀘스트와 출석 보상도 확인해 보세요.
          </SurfaceEmpty>
        )}
        <div className="ko-market-grid">
          {available.map((pack) => {
            const chosenQuantity = selectedQuantity(pack);
            const fixedQuantities = getBulkOpenQuantities(pack.quantity);
            const allAvailable =
              Number.isInteger(pack.quantity) &&
              pack.quantity > 1 &&
              pack.quantity <= MAX_BULK_PACK_OPEN_QUANTITY;
            return (
              <article key={pack.id} className="ko-market-item">
                <PackCover src={pack.imageUrl} name={pack.name} />
                <div className="ko-market-item__copy">
                  <div className="ko-market-item__title">
                    <div>
                      <h2 className="font-black">{pack.name}</h2>
                      <p className="ko-market-item__description">
                        {pack.description || "KO 카드팩"}
                      </p>
                    </div>
                    <span
                      data-testid={`text-pack-quantity-${pack.id}`}
                      className="rounded bg-amber-400 px-2 py-1 text-sm font-black text-black"
                    >
                      ×{pack.quantity}
                    </span>
                  </div>
                  <p className="ko-market-item__meta">
                    팩 하나당 {pack.cardsPerPack}개 보상 · 각 슬롯의 확률
                  </p>
                  <dl className="ko-pack-rate-list">
                    {[
                      ["일반", pack.normalRate],
                      ["에픽", pack.epicRate ?? 0],
                      ["레전더리", pack.legendaryRate],
                      ["챔피언", pack.championRate],
                      ["스킨", pack.skinChance],
                      ["이모티콘", pack.emoteRate ?? 0],
                    ].map(([label, rate]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{rate}%</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="ko-pack-rate-total">
                    확률 합계 {packRateTotal(pack)}%
                  </p>
                  <button
                    type="button"
                    data-testid={`button-pack-details-${pack.id}`}
                    disabled={opening || !!pendingRecovery}
                    onClick={() => setSelected(pack)}
                    className="ko-market-item__link"
                  >
                    구성품 및 확률 보기
                  </button>
                  {!validPackRates(pack) && (
                    <p className="mt-2 text-xs text-amber-200" role="status">
                      확률 설정 확인이 필요해 개봉할 수 없습니다. 보유 팩은
                      유지됩니다.
                    </p>
                  )}
                  <fieldset
                    className="mt-4"
                    disabled={
                      !validPackRates(pack) ||
                      opening ||
                      !!pendingRecovery ||
                      !userId ||
                      pack.quantity < 1
                    }
                    aria-label={`${pack.name} 개봉 수량`}
                  >
                    <legend className="mb-2 text-xs font-bold text-neutral-400">
                      개봉 수량
                    </legend>
                    <div
                      className={`grid gap-2 ${pack.quantity > MAX_BULK_PACK_OPEN_QUANTITY ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-4"}`}
                    >
                      {[1, 5, 10].map((quantity) => {
                        const enabled = fixedQuantities.includes(quantity);
                        return (
                          <button
                            key={quantity}
                            type="button"
                            data-testid={`button-open-quantity-${pack.id}-${quantity}`}
                            aria-pressed={chosenQuantity === quantity}
                            disabled={!enabled || opening}
                            onClick={() => chooseQuantity(pack, quantity)}
                            className={`rounded border px-2 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${chosenQuantity === quantity ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-neutral-700 text-neutral-300"}`}
                          >
                            {quantity}
                          </button>
                        );
                      })}
                      {pack.quantity > 1 && (
                        <button
                          type="button"
                          data-testid={`button-open-quantity-${pack.id}-all`}
                          aria-pressed={chosenQuantity === pack.quantity}
                          disabled={
                            !allAvailable || opening || pack.quantity < 1
                          }
                          onClick={() => chooseQuantity(pack, pack.quantity)}
                          className={`rounded border px-2 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${chosenQuantity === pack.quantity && allAvailable ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-neutral-700 text-neutral-300"}`}
                        >
                          ALL
                          {pack.quantity <= MAX_BULK_PACK_OPEN_QUANTITY
                            ? ` (${pack.quantity})`
                            : ""}
                        </button>
                      )}
                      {pack.quantity > MAX_BULK_PACK_OPEN_QUANTITY && (
                        <button
                          type="button"
                          data-testid={`button-open-quantity-${pack.id}-max-safe`}
                          aria-pressed={
                            chosenQuantity === MAX_BULK_PACK_OPEN_QUANTITY
                          }
                          disabled={
                            opening ||
                            pack.quantity < MAX_BULK_PACK_OPEN_QUANTITY
                          }
                          onClick={() =>
                            chooseQuantity(pack, MAX_BULK_PACK_OPEN_QUANTITY)
                          }
                          className={`rounded border px-2 py-2.5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 ${chosenQuantity === MAX_BULK_PACK_OPEN_QUANTITY ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-neutral-700 text-neutral-300"}`}
                        >
                          MAX 100
                        </button>
                      )}
                    </div>
                  </fieldset>
                  {pack.quantity > MAX_BULK_PACK_OPEN_QUANTITY && (
                    <p
                      data-testid={`text-max-bulk-quantity-${pack.id}`}
                      className="mt-3 rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-200"
                      role="status"
                    >
                      한 번에 최대 {MAX_BULK_PACK_OPEN_QUANTITY}개까지 안전하게
                      개봉할 수 있습니다. 100개를 초과하는 ALL 개봉은 지원되지
                      않습니다. 필요한 수량만 선택해 별도 배치로 개봉하세요.
                    </p>
                  )}
                  <button
                    type="button"
                    data-testid={`button-open-pack-${pack.id}`}
                    disabled={
                      !validPackRates(pack) ||
                      opening ||
                      !!pendingRecovery ||
                      !userId ||
                      pack.quantity < 1 ||
                      chosenQuantity > pack.quantity ||
                      chosenQuantity > MAX_BULK_PACK_OPEN_QUANTITY
                    }
                    onClick={() => void handleOpen(pack)}
                    className="ko-surface-primary"
                  >
                    {opening && selected?.id === pack.id
                      ? "개봉 중..."
                      : pack.quantity > 0
                        ? `${chosenQuantity}개 개봉`
                        : "보유 없음"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {openingPackName && openings !== null && (
          <PackOpening
            packName={openingPackName}
            rewards={rewards}
            packCount={openedQuantity || 1}
            perPackRewards={openings.map((item) => item.rewards)}
            notice={message || undefined}
            onClose={closeOpening}
          />
        )}
        {selected && openings === null && !opening && (
          <PackDetailDialog pack={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </main>
  );
}
