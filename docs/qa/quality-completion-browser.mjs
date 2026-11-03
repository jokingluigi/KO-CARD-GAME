/** Actual screens with isolated mutation endpoints; never sends live purchases/logout. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
const origin = process.env.KO_UI_ORIGIN ?? "http://127.0.0.1:5186";
const out = process.env.KO_QUALITY_OUT ?? "qa-results/quality-completion";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const context = await b.newContext({
        viewport: { width, height },
        isMobile: width === 390,
        hasTouch: width === 390,
        reducedMotion: "reduce",
        ignoreHTTPSErrors: true,
      }),
      errors = [];
    let p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await context.addInitScript(() => {
      window.__blockPurchaseCleanup = true;
      const original = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        if (
          key.startsWith("ko-shop-purchase:") &&
          window.__blockPurchaseCleanup
        )
          throw new Error("QA storage cleanup");
        return original.call(this, key);
      };
    });
    const fixture = await auditSetup(context),
      pack = fixture.packs[0];
    let balance = 1000,
      owned = pack.quantity,
      grantCount = 0,
      failNextShopRead=false;
    const receipts = new Map(),
      keys = [];
    await context.route("**/api/shop", (r) => {
      if(failNextShopRead){failNextShopRead=false;return r.fulfill({status:503,json:{message:'보유량 확인 지연'}});}
      return r.fulfill({
        json: {
          accountId: "launch-user",
          purchaseRecovery: true,
          currencyBalance: balance,
          currencyDisplayName: "크레딧",
          isTestAccount: false,
          listings: [
            {
              id: "quality-listing",
              name: pack.name,
              packDefinitionId: pack.id,
              price: 100,
              packQuantity: 1,
              ownedQuantity: owned,
              isActive: 1,
              pack,
            },
          ],
        },
      });
    });
    await context.route("**/api/shop/quality-listing/purchase", (r) => {
      const v = r.request().postDataJSON();
      keys.push(v.idempotencyKey);
      assert.equal(v.accountId, "launch-user");
      let receipt = receipts.get(v.idempotencyKey);
      if (!receipt) {
        grantCount++;
        balance -= 100 * v.quantity;
        owned += v.quantity;
        receipt = {
          currencyBalance: balance,
          ownedQuantity: owned,
          packQuantity: v.quantity,
          pack,
        };
        receipts.set(v.idempotencyKey, receipt);
        return r.fulfill({
          status: 502,
          json: { message: "응답을 전달하지 못했어요." },
        });
      }
      return r.fulfill({ json: receipt });
    });
    await p.goto(origin + "/shop");
    await p.locator(".ko-market-item .ko-surface-primary").first().click();
    const confirmation = p.getByRole("dialog");
    await confirmation
      .getByRole("button", { name: /구매하기|구매 확정|구매$/ })
      .click();
    await p.getByTestId("shop-purchase-recovery").waitFor();
    assert.equal(grantCount, 1);
    assert.equal(
      await p.locator(".ko-market-item .ko-surface-primary").isDisabled(),
      true,
    );
    await p.screenshot({ path: `${out}/shop-recovery-${width}x${height}.png` });
    await p.close();
    p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/shop");
    await p.getByTestId("shop-purchase-recovery").waitFor();
    await p
      .getByRole("button", { name: "같은 구매 확인", exact: true })
      .click();
    await p.getByText("구매는 완료됐어요.", { exact: false }).first().waitFor();
    assert.equal(
      await p.locator(".ko-market-item .ko-surface-primary").isDisabled(),
      true,
    );
    await p.evaluate(() => {
      window.__blockPurchaseCleanup = false;
    });
    failNextShopRead=true;
    await p
      .getByRole("button", { name: "같은 구매 확인", exact: true })
      .click();
    await p.getByTestId("shop-purchase-recovery").waitFor({ state: "hidden" });
    await p.getByRole('button',{name:'다시 확인',exact:true}).waitFor();
    assert.equal(await p.locator('.ko-market-item .ko-surface-primary').isDisabled(),true);
    await p.getByRole('button',{name:'다시 확인',exact:true}).click();
    await p.getByRole('button',{name:'다시 확인',exact:true}).waitFor({state:'hidden'});
    await p.locator('.ko-market-item .ko-surface-primary:not(:disabled)').waitFor();
    assert.equal(grantCount, 1);
    assert.equal(keys.length, 3);
    assert.ok(keys.every((k) => k === keys[0]));
    assert.equal(balance, 900);
    assert.equal(
      await p.locator(".ko-market-item .ko-surface-primary").isEnabled(),
      true,
    );
    await p.goto(origin + "/collection");
    await p.locator(".ko-collection-controls").waitFor();
    const first = p.locator(".ko-collection-item").first();
    await first.waitFor();
    await p.evaluate(() => document.fonts.ready);
    const gridTop = (await first.boundingBox()).y;
    await p.screenshot({
      path: `${out}/collection-default-${width}x${height}.png`,
    });
    const filters = p.locator(".ko-catalog-filter-disclosure");
    assert.equal(await filters.getAttribute("open"), null);
    await filters.locator("summary").click();
    await p.getByLabel("카드 종류", { exact: true }).selectOption("WRESTLER");
    await p.getByLabel("정렬", { exact: true }).selectOption("NAME");
    await filters.locator("summary").click();
    await p
      .getByRole("searchbox")
      .count()
      .catch(() => 0);
    assert.match(await filters.locator("summary").innerText(), /선수/);
    await p.screenshot({ path: `${out}/collection-${width}x${height}.png` });
    await p.goto(origin + "/");
    await p.getByText("출전 검증 덱", { exact: true }).waitFor();
    let logoutCalls = 0;
    await context.route("**/api/auth/logout", (r) => {
      logoutCalls++;
      return r.fulfill({
        status: 503,
        json: { message: "로그아웃 응답을 확인하지 못했어요." },
      });
    });
    await p.getByRole("button", { name: "계정 메뉴", exact: true }).click();
    await p.getByRole("menuitem", { name: "로그아웃", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("heading", { name: "로그아웃 결과 확인" })
      .waitFor();
    assert.equal(await p.locator(".ko-home-learning").count(), 1);
    assert.equal(logoutCalls, 1);
    await p.screenshot({
      path: `${out}/logout-failure-${width}x${height}.png`,
    });
    const close = p.getByRole("dialog").locator(".ko-game-dialog-close");
    const closeRect = await close.boundingBox();
    assert.ok(closeRect.width >= 44 && closeRect.height >= 44);
    await close.click();
    assert.equal(
      await p
        .getByRole("button", { name: "계정 메뉴", exact: true })
        .evaluate((n) => n === document.activeElement),
      true,
    );
    let journalPosts = 0;
    await context.route("**/api/player-journal/sync", (r) => {
      journalPosts++;
      return r.fulfill({
        status: 503,
        json: { code: "FEATURE_SETUP_PENDING" },
      });
    });
    await p.goto(origin + "/player-notebook");
    await p
      .getByText("이 기기에 보관 중 · 계정 동기화는 준비 중이에요.", {
        exact: true,
      })
      .waitFor();
    await p.evaluate(() => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("online"));
    });
    await p.waitForTimeout(80);
    assert.equal(journalPosts, 1);
    await p
      .getByRole("button", { name: "동기화 다시 시도", exact: true })
      .click();
    await p.waitForFunction(() =>
      document
        .querySelector(".ko-journal-sync")
        ?.textContent?.includes("준비 중"),
    );
    assert.equal(journalPosts, 2);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      purchaseLostReplyRecoveredAfterNewTab: true,
      oneDebitAndGrant: true,
      localCleanupFailureKeepsRecovery: true,
      staleInventoryBlocksPurchaseUntilReadRefresh:true,
      samePurchaseKeyReused: true,
      newPurchasesLockedUntilRecovery: true,
      logoutFailureRetainsScreen: true,
      logoutFocusRestored: true,
      collectionSortAndTypeAvailable: true,
      collectionFirstCardTop: gridTop,
      disabledJournalDoesNotSpam: true,
      explicitJournalRetryAvailable: true,
      errors,
    });
    await p.context().close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
