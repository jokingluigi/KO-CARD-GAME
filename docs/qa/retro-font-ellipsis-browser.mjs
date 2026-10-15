import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE,
});
const results = [];
const origin = process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5175";
try {
  for (const width of [360, 375, 390, 412, 1440])
    for (const mode of ["full", "hybrid"]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: width < 800,
        hasTouch: width < 800,
        reducedMotion: "reduce",
      });
      await context.route("https://fonts.googleapis.com/**", (r) =>
        r.fulfill({ contentType: "text/css", body: "" }),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(
        `${origin}/qa/retro-font-scene.html?scene=cards&mode=${mode}`,
      );
      await page.locator("[data-qa-compact-rules]").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(200);
      const boxes = await page
        .locator("[data-qa-compact-rules]")
        .evaluateAll((nodes) =>
          nodes.map((e) => {
            const r = e.getBoundingClientRect(),
              b = e.parentElement.getBoundingClientRect();
            return {
              text: e.textContent,
              truncated: e.dataset.qaTruncated,
              marker: getComputedStyle(e, "::after").content,
              top: r.top,
              bottom: r.bottom,
              boxTop: b.top,
              boxBottom: b.bottom,
              lines: e.style.getPropertyValue("--qa-rules-lines"),
              lineHeight: getComputedStyle(e).lineHeight,
            };
          }),
        );
      assert.ok(boxes.some((b) => b.truncated === "true"));
      for (const b of boxes) {
        assert.ok(
          b.top >= b.boxTop - 1 && b.bottom <= b.boxBottom + 1,
          JSON.stringify(b),
        );
        if (b.truncated === "true") assert.equal(b.marker, '"••••"');
      }
      await page
        .getByRole("button", { name: "카드 상세정보 열기", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      assert.match(await dialog.textContent(), /등장:필드에 있는/);
      assert.deepEqual(errors, []);
      assert.equal(
        await dialog.locator("p.mt-2.whitespace-pre-wrap").textContent(),
        JSON.parse(
          fs.readFileSync("artifacts/ko-game/qa/retro-font/fixtures.json"),
        ).cards.reduce((a, b) => (a.text.length > b.text.length ? a : b)).text,
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.waitForTimeout(250);
      if (width === 390)
        await page.screenshot({
          path: `qa-results/retro-font-preview/individual/ellipsis-${mode}-390.png`,
          fullPage: true,
        });
      await page
        .locator(".qa-mini-card")
        .last()
        .click({ position: { x: 30, y: 35 } });
      await page.waitForTimeout(100);
      assert.equal(
        await page
          .locator(".qa-detail-card [data-qa-compact-rules]")
          .getAttribute("data-qa-truncated"),
        "false",
        "short effect should not receive dots",
      );
      await page.goto(
        `${origin}/qa/retro-font-scene.html?scene=battle&mode=${mode}`,
      );
      await page
        .locator(".ko-game-shell [data-qa-compact-rules]")
        .first()
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const battleBoxes = await page
        .locator(".ko-game-shell [data-qa-compact-rules]")
        .evaluateAll((nodes) =>
          nodes.map((e) => {
            const r = e.getBoundingClientRect(),
              b = e.parentElement.getBoundingClientRect();
            return {
              text: e.textContent,
              top: r.top,
              bottom: r.bottom,
              boxTop: b.top,
              boxBottom: b.bottom,
            };
          }),
        );
      for (const b of battleBoxes)
        assert.ok(
          b.top >= b.boxTop - 1 && b.bottom <= b.boxBottom + 1,
          JSON.stringify(b),
        );
      results.push({ battleBoxes, width, mode, pass: true, boxes });
      await context.close();
    }
  const demoContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await demoContext.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ contentType: "text/css", body: "" }),
  );
  const demoPage = await demoContext.newPage();
  for (const variant of ["before", "after"]) {
    await demoPage.goto(
      `${origin}/qa/retro-font-scene.html?scene=cards&mode=full${variant === "before" ? "&ellipsis=off" : ""}`,
    );
    await demoPage.locator(".qa-card-gallery").waitFor();
    await demoPage.evaluate(async () => {
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
    await demoPage.waitForTimeout(150);
    assert.equal(
      (await demoPage.locator('[data-qa-truncated="true"]').count()) > 0,
      variant === "after",
    );
    await demoPage.screenshot({
      path: `qa-results/retro-font-preview/individual/ellipsis-${variant}-390.png`,
      fullPage: true,
    });
  }
  await demoContext.close();
  fs.writeFileSync(
    "qa-results/retro-font-preview/ellipsis-results.json",
    JSON.stringify({ results }, null, 2),
  );
  console.log("PASS " + results.length + " cases");
} finally {
  await browser.close();
}
