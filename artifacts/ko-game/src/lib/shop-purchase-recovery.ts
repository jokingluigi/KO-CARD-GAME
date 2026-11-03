import { MAX_SHOP_PURCHASE_QUANTITY } from "../../../../lib/game-engine/src/shop-purchase";
export type ShopPurchaseIntention = {
  accountId: string;
  listingId: string;
  quantity: number;
  idempotencyKey: string;
};
const key = (account: string) => "ko-shop-purchase:" + account;
export function readShopPurchase(
  storage: Pick<Storage, "getItem">,
  account: string,
): ShopPurchaseIntention | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key(account));
  } catch {
    throw new Error(
      "이 기기에서 구매 복구 기록을 확인하지 못했어요. 저장소 설정을 확인해 주세요.",
    );
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (
      v.accountId === account &&
      typeof v.listingId === "string" &&
      v.listingId.length > 0 &&
      Number.isSafeInteger(v.quantity) &&
      v.quantity >= 1 &&
      v.quantity <= MAX_SHOP_PURCHASE_QUANTITY &&
      typeof v.idempotencyKey === "string" &&
      /^[a-zA-Z0-9_-]{16,100}$/.test(v.idempotencyKey)
    )
      return v;
  } catch {}
  throw new Error(
    "구매 복구 기록을 읽지 못했어요. 새 구매 전에 지원을 통해 이전 구매 결과를 확인해 주세요.",
  );
}
export function storeShopPurchase(
  storage: Pick<Storage, "setItem" | "getItem">,
  v: ShopPurchaseIntention,
) {
  const existing = readShopPurchase(storage, v.accountId);
  if (existing && existing.idempotencyKey !== v.idempotencyKey)
    throw new Error(
      "이전 구매 결과부터 확인해 주세요. 새 구매 요청은 보내지 않았습니다.",
    );
  try {
    storage.setItem(key(v.accountId), JSON.stringify(v));
    if (
      readShopPurchase(storage, v.accountId)?.idempotencyKey ===
      v.idempotencyKey
    )
      return;
  } catch {}
  throw new Error(
    "구매 복구 기록을 저장하지 못했어요. 구매 요청은 보내지 않았습니다.",
  );
}
export function clearShopPurchase(
  storage: Pick<Storage, "removeItem" | "getItem">,
  account: string,
  expectedKey?: string,
) {
  const existing = readShopPurchase(storage, account);
  if (expectedKey && existing && existing.idempotencyKey !== expectedKey)
    throw new Error(
      "다른 구매의 복구 기록이 남아 있어요. 해당 구매를 먼저 확인해 주세요.",
    );
  storage.removeItem(key(account));
  if (storage.getItem(key(account)))
    throw new Error(
      "구매는 확인됐지만 복구 기록을 정리하지 못했어요. 같은 구매 확인으로 복구해 주세요.",
    );
}
