import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE,
});
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
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5175") +
      "/qa/retro-font-scene.html?scene=cards&mode=full",
  );
  await page.locator("[data-qa-compact-rules]").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const keyword = page
    .locator(".qa-mini-card [data-qa-compact-rules] [role=button]")
    .first();
  const label = await keyword.getAttribute("aria-label");
  await keyword.click();
  await page.locator("[data-card-rules-dialog=true]").waitFor();
  assert.ok(
    (await page.locator("[data-card-rules-dialog=true]").textContent()).length >
      10,
  );
  await page.keyboard.press("Escape");
  await page
    .locator("[data-card-rules-dialog=true]")
    .waitFor({ state: "hidden" });
  const verify = () =>
    page.locator("[data-qa-compact-rules]").evaluateAll((ns) =>
      ns.every((e) => {
        const original = e.parentElement.querySelector(
          "[data-qa-source-rules]",
        );
        const r = e.getBoundingClientRect(),
          b = e.parentElement.getBoundingClientRect();
        return (
          original.textContent === e.dataset.qaOriginal &&
          getComputedStyle(e).textAlign === "center" &&
          Math.abs(r.left + r.right - b.left - b.right) < 2 &&
          (e.dataset.qaTruncated === "false" || e.textContent.endsWith("...."))
        );
      }),
    );
  for (const width of [1440, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(250);
    assert.ok(await verify());
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "qa-results/retro-font-preview/inline-interaction-results.json",
    JSON.stringify(
      {
        pass: true,
        keyword: label,
        keywordDialog: true,
        resizeWidths: [1440, 360, 390],
        originalRichTextPreserved: true,
        noPageErrors: true,
      },
      null,
      2,
    ),
  );
  console.log("PASS visible keyword dialog and responsive recentering");
} finally {
  await browser.close();
}
