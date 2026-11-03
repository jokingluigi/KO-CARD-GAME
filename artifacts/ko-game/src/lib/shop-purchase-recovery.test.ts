import test from "node:test";
import assert from "node:assert/strict";
import {
  readShopPurchase,
  storeShopPurchase,
  clearShopPurchase,
} from "./shop-purchase-recovery";
const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
  };
};
const ticket = {
  accountId: "one",
  listingId: "listing",
  quantity: 2,
  idempotencyKey: "stable-request-00001",
};
test("purchase intent survives reload and stays scoped to its original account", () => {
  const storage = memory();
  storeShopPurchase(storage, ticket);
  assert.deepEqual(readShopPurchase(storage, "one"), ticket);
  assert.equal(readShopPurchase(storage, "two"), null);
  clearShopPurchase(storage, "one");
  assert.equal(readShopPurchase(storage, "one"), null);
});
test("failed persistence and corrupted recovery do not silently permit a new purchase", () => {
  const storage = memory();
  assert.throws(
    () =>
      storeShopPurchase(
        {
          ...storage,
          setItem() {
            throw Error("quota");
          },
        },
        ticket,
      ),
    /구매 요청은 보내지 않았습니다/,
  );
  storage.setItem("ko-shop-purchase:one", "broken");
  assert.throws(() => readShopPurchase(storage, "one"), /이전 구매 결과/);
});
test("a second purchase cannot overwrite or clear an unresolved purchase ticket", () => {
  const storage = memory();
  storeShopPurchase(storage, ticket);
  assert.throws(
    () =>
      storeShopPurchase(storage, {
        ...ticket,
        idempotencyKey: "different-request-0002",
      }),
    /이전 구매 결과/,
  );
  assert.throws(
    () =>
      clearShopPurchase(storage, ticket.accountId, "different-request-0002"),
    /다른 구매/,
  );
  assert.deepEqual(readShopPurchase(storage, "one"), ticket);
});
