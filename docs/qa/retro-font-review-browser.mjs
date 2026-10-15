import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE,
});
const results = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width === 390,
      hasTouch: width === 390,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("https://fonts.googleapis.com/**", (r) =>
      r.fulfill({ contentType: "text/css", body: "" }),
    );
    await page.goto(
      (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5175") +
        "/qa/retro-font-review.html",
    );
    for (const [label, selector] of [
      ["메인 메뉴", ".ko-main-menu__item"],
      ["선수 · 주문 카드", ".qa-card-gallery"],
      ["챔피언 · 능력 · 퀘스트", ".qa-champions"],
      ["전투 화면", ".ko-game-shell"],
      ["작은 본문 · 긴 효과 비교", "[data-testid=readability-card]"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      for (let i = 0; i < 3; i++) {
        const frame = page.locator("iframe").nth(i).contentFrame();
        await frame.locator(selector).first().waitFor();
        await frame.locator("body").evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            [...document.images].map((i) =>
              i.complete
                ? Promise.resolve()
                : new Promise((resolve) => {
                    i.onload = i.onerror = resolve;
                  }),
            ),
          );
        });
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
      );
      assert.deepEqual(errors, []);
      results.push({ width, scene: label, status: "PASS", framesRendered: 3 });
      if (width === 390 && label === "메인 메뉴")
        await page.screenshot({
          path: "qa-results/retro-font-preview/review-page.png",
          fullPage: true,
        });
    }
    await page.close();
    await context.close();
  }
  fs.writeFileSync(
    "qa-results/retro-font-preview/review-results.json",
    JSON.stringify({ results }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ results }));
} finally {
  await browser.close();
}
