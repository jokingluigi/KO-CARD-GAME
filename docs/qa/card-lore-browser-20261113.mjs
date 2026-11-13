import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
const out = "/tmp/ko-card-lore-browser";
await mkdir(out, { recursive: true });
const f = await startTutorialFixture(),
  browser = await chromium.launch();
const results = [];
const lore =
  "잊힌 경기장에서 온 선수.\n\n<script>window.loreExecuted=true</script>\n등장: 모든 상대 선수를 파괴합니다.";
try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      isMobile: width < 1000,
      hasTouch: width < 1000,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const r = await fetch(f.origin + url.pathname + url.search, {
        method: req.method(),
        headers: { Cookie: f.cookie, "Content-Type": "application/json" },
        ...(req.postData() ? { body: req.postData() } : {}),
      });
      await route.fulfill({
        status: r.status,
        body: await r.text(),
        contentType: r.headers.get("content-type") ?? "application/json",
      });
    });
    await page.goto(
      "http://127.0.0.1:5186/qa/champion-features.html?admin=card",
    );
    await page.getByTestId("button-create-card").click();
    const name = "카드 소개 검증 " + width;
    await page.getByTestId("input-card-name").fill(name);
    await page.getByTestId("input-card-lore").fill(lore);
    await page
      .locator(".admin-editor-preview")
      .getByTestId("card-introduction")
      .waitFor({ state: "attached" });
    await page.screenshot({ path: `${out}/admin-${width}.png` });
    await page.getByTestId("button-save-card").click();
    await page.getByTestId("input-card-name").waitFor({ state: "hidden" });
    let cards = await fetch(f.origin + "/api/admin/cards", {
      headers: { Cookie: f.cookie },
    }).then((r) => r.json());
    const card = cards.cards.find((c) => c.name === name);
    assert.equal(card.lore, lore);
    assert.equal(card.text, "");
    assert.deepEqual(card.effectConfig, {});
    await page.reload();
    const edit = page.getByTestId("button-edit-card-" + card.id);
    await edit.locator("xpath=ancestor::details[1]").locator("summary").click();
    await edit.click();
    assert.equal(await page.getByTestId("input-card-lore").inputValue(), lore);
    // Publish only inside disposable SQL so the real collection/detail receives the same saved text.
    let r = await fetch(f.origin + "/api/admin/cards/" + card.id + "/status", {
      method: "POST",
      headers: { Cookie: f.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
    assert.equal(r.status, 200);
    await page.goto("http://127.0.0.1:5186/collection");
    await page.getByLabel("카드 이름 검색", { exact: true }).fill(name);
    await page
      .getByTestId("collection-card-grid")
      .locator("article")
      .first()
      .click();
    const dialog = page.getByRole("dialog").first();
    await dialog.getByTestId("card-introduction").waitFor();
    assert.equal(
      await dialog.getByTestId("card-introduction").locator("p").innerText(),
      lore,
    );
    assert.equal(await page.evaluate(() => window.loreExecuted), undefined);
    assert.equal(
      await dialog.getByTestId("card-introduction").locator("script").count(),
      0,
    );
    await page.screenshot({ path: `${out}/detail-${width}.png` });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      adminSaveAndReload: true,
      publicCollectionDetail: true,
      literalTextNoScriptExecution: true,
      effectsUntouched: true,
      noHorizontalOverflow: true,
    });
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await f.close();
}
