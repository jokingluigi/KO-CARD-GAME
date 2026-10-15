import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE,
});
const results = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await context.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ contentType: "text/css", body: "" }),
  );
  for (const mode of ["baseline", "full", "hybrid"]) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5175") +
        "/qa/retro-font-scene.html?scene=battle&feedback=1&mode=" +
        mode,
    );
    await page
      .locator(".presentation-feedback--damage")
      .waitFor({ state: "attached" });
    await page.evaluate(async () => {
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
      for (const node of document.querySelectorAll(".presentation-feedback"))
        for (const animation of node.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime =
            Number(animation.effect.getComputedTiming().activeDuration) * 0.45;
        }
    });
    assert.match(
      await page.locator(".presentation-feedback--damage").textContent(),
      /-12/,
    );
    assert.match(
      await page.locator(".presentation-feedback--turn").textContent(),
      /YOUR TURN/,
    );
    const before = await page.evaluate(() =>
      JSON.stringify(window.__fontReview.state),
    );
    await page.screenshot({
      path: `qa-results/retro-font-preview/individual/feedback-${mode}-390.png`,
    });
    assert.equal(
      await page.evaluate(() => JSON.stringify(window.__fontReview.state)),
      before,
    );
    assert.deepEqual(errors, []);
    results.push({
      mode,
      status: "PASS",
      animation:
        "Actual PresentationFeedback, paused at identical 45% progress for capture",
    });
    await page.close();
  }
  fs.writeFileSync(
    "qa-results/retro-font-preview/feedback-results.json",
    JSON.stringify({ results }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ results }));
} finally {
  await browser.close();
}
