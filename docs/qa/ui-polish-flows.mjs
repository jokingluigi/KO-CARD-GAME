import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
const origin = process.env.KO_UI_ORIGIN ?? "http://127.0.0.1:5186";
assert.ok(
  ["http://127.0.0.1:5186", "https://ko-card-game-vr69.onrender.com"].includes(
    origin,
  ),
);
const out = process.env.KO_UI_OUT ?? "qa-results/ui-polish-flows";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
async function page(width, height, options) {
  const p = await b.newPage({
    viewport: { width, height },
    reducedMotion: "reduce",
    ignoreHTTPSErrors: origin.startsWith("https:"),
  });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const x = await auditSetup(p, options);
  return { p, x, errors };
}
async function feedback(p) {
  await p
    .locator(".collection-action")
    .waitFor({ state: "detached", timeout: 5000 });
}
async function check(p) {
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
}
try {
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [844, 390],
    [1440, 1000],
  ]) {
    const { p, x, errors } = await page(width, height, { delayClaims: 200 });
    await p.goto(origin + "/attendance");
    const claim = p.getByRole("button", {
      name: "오늘 출석하고 보상 받기",
      exact: true,
    });
    await claim.waitFor();
    const rect = await claim.boundingBox();
    assert.ok(rect.width >= 44 && rect.height >= 44);
    await claim.evaluate((n) => {
      n.click();
      n.click();
    });
    await p
      .getByRole("button", { name: "오늘 출석 완료", exact: true })
      .waitFor();
    await feedback(p);
    assert.equal(
      x.requests.filter((r) => r.path === "/api/attendance/claim").length,
      1,
    );
    await p.reload();
    await p
      .getByRole("button", { name: "오늘 출석 완료", exact: true })
      .waitFor();
    await p.goto(origin + "/daily-quests");
    const quest = p.locator("article").filter({
      has: p.getByRole("heading", { name: "링 위의 첫 승리", exact: true }),
    });
    await quest
      .getByRole("button", { name: "보상 받기", exact: true })
      .waitFor();
    const firstArticle = await p
      .locator(".ko-quest-entry")
      .first()
      .getByRole("heading")
      .textContent();
    assert.equal(firstArticle, "링 위의 첫 승리");
    await quest
      .getByRole("button", { name: "보상 받기", exact: true })
      .evaluate((n) => {
        n.click();
        n.click();
        window.dispatchEvent(new Event("focus"));
      });
    await quest
      .getByRole("button", { name: "수령 완료", exact: true })
      .waitFor();
    await feedback(p);
    assert.equal(
      x.requests.filter((r) => r.path.includes("q-ready/claim")).length,
      1,
    );
    await p.getByRole("button", { name: "시즌 퀘스트", exact: true }).click();
    await p
      .getByRole("heading", {
        name: "이 분류의 목표를 준비 중이에요",
        exact: true,
      })
      .waitFor();
    await p.getByRole("button", { name: "일일 퀘스트", exact: true }).click();
    await quest
      .getByRole("button", { name: "수령 완료", exact: true })
      .waitFor();
    x.completeBonus();
    await p.reload();
    const bonus = p.getByTestId("button-claim-daily-completion-bonus");
    await bonus.filter({ hasText: "추가 보상 받기" }).waitFor();
    await bonus.click();
    await bonus.filter({ hasText: "수령 완료" }).waitFor();
    await feedback(p);
    await p.goto(origin + "/shop");
    const listing = p.locator(".ko-market-item").first();
    await listing.getByRole("button", { name: "5", exact: true }).click();
    await listing.getByRole("button", { name: /5묶음 구매/ }).click();
    let dialog = p.getByRole("dialog", { name: "구매 확인" });
    await dialog.waitFor();
    assert.equal(
      x.requests.filter((r) => r.path.includes("/purchase")).length,
      0,
    );
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await listing.getByRole("button", { name: /5묶음 구매/ }).click();
    await dialog
      .getByRole("button", { name: "구매 확정", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    await feedback(p);
    assert.equal(
      x.requests.filter((r) => r.path.includes("/purchase")).length,
      1,
    );
    assert.equal(
      x.requests.find((r) => r.path.includes("/purchase")).body.quantity,
      5,
    );
    await p
      .getByRole("button", { name: "구성품 및 확률 보기", exact: true })
      .first()
      .click();
    dialog = p.getByRole("dialog");
    await dialog.getByText("이모티콘", { exact: true }).first().waitFor();
    assert.equal(
      await dialog
        .getByText("스킨은 카드 보상 확률과 별도의 보너스 판정입니다.", {
          exact: false,
        })
        .count(),
      0,
    );
    await dialog
      .getByRole("button", { name: "팩 상세 닫기", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    await p.goto(origin + "/packs");
    await p.getByTestId("button-open-quantity-audit-pack-5").click();
    await p.getByTestId("button-open-pack-audit-pack").click();
    await p.getByTestId("button-close-pack-opening").waitFor();
    await p.getByTestId("button-close-pack-opening").click();
    await p
      .getByTestId("text-pack-quantity-audit-pack")
      .filter({ hasText: "×8" })
      .waitFor();
    const open = x.requests.find((r) => r.path.includes("/open-bulk"));
    assert.ok(open.key);
    assert.equal(open.body.quantity, 5);
    await p.goto(origin + "/player-notebook");
    await p.getByRole("button", { name: "AI 대전", exact: true }).click();
    assert.equal(await p.locator(".ko-notebook-matches>li").count(), 4);
    await p.getByRole("button", { name: /수집 목표/ }).click();
    const remove = p.getByRole("button", {
      name: "수집 목표 카드 목표 해제",
      exact: true,
    });
    await remove.click();
    dialog = p.getByRole("dialog", { name: "수집 목표를 해제할까요?" });
    await dialog.getByRole("button", { name: "유지하기", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await remove.click();
    await dialog
      .getByRole("button", { name: "목표 해제", exact: true })
      .click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await p.locator(".ko-notebook-wish").count(), 1);
    await p.reload();
    await p.getByRole("button", { name: /수집 목표/ }).click();
    assert.equal(await p.locator(".ko-notebook-wish").count(), 1);
    await check(p);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      attendanceSingleClaimAndReload: true,
      questSingleClaimAndSeason: true,
      bonusClaim: true,
      purchaseConfirmCancelAndExactQuantity: true,
      sixUnifiedPackRates: true,
      bulkOpenReceiptKey: true,
      notebookFilterAndConfirmedRemoval: true,
      errors,
    });
    await p.close();
  }
  for (const path of ["/attendance", "/daily-quests", "/shop", "/packs"]) {
    const { p, x, errors } = await page(390, 844, { fail: true });
    await p.goto(origin + path);
    await p
      .getByRole("alert")
      .filter({ hasText: "화면을 불러오지 못했어요." })
      .waitFor();
    x.recover();
    await p.getByRole("button", { name: "다시 확인", exact: true }).click();
    await p
      .locator(".ko-surface-message.is-error")
      .waitFor({ state: "detached" });
    await p
      .locator(
        path === "/attendance"
          ? ".ko-attendance-day"
          : path === "/daily-quests"
            ? ".ko-quest-entry"
            : ".ko-market-item",
      )
      .first()
      .waitFor();
    await check(p);
    assert.deepEqual(errors, []);
    results.push({ path, readFailureRetry: true });
    await p.close();
  }
  for (const path of [
    "/attendance",
    "/daily-quests",
    "/shop",
    "/packs",
    "/player-notebook",
  ]) {
    const { p, errors } = await page(390, 844, { empty: true });
    await p.goto(origin + path);
    await p.locator(".ko-surface-empty").waitFor();
    await p.screenshot({
      path: `${out}/empty-${path.slice(1)}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await check(p);
    assert.deepEqual(errors, []);
    results.push({ path, emptyStateAndNextAction: true });
    await p.close();
  }
  {
    const { p, errors } = await page(390, 844);
    await p.route("**/api/attendance", (r) =>
      r.fulfill({
        json: {
          today: "2026-11-02",
          nextDayIndex: 1,
          claims: [],
          definitions: [
            {
              dayIndex: 1,
              rewardType: "CURRENCY",
              rewardAmount: 100,
              rewardTargetId: null,
              enabled: false,
              state: "LOCKED",
            },
          ],
        },
      }),
    );
    await p.goto(origin + "/attendance");
    await p
      .getByRole("heading", {
        name: "지금 받을 수 있는 보상이 없어요",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await p
        .getByRole("button", {
          name: "지금 받을 수 있는 보상이 없어요",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    assert.equal(
      await p.getByText("오늘 출석 완료", { exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    results.push({ attendanceUnavailableDoesNotClaimCompleted: true });
    await p.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
