import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE,
});
const origin = process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5175";
const output = "qa-results/retro-font-production";
fs.mkdirSync(output, { recursive: true });
const before = JSON.parse(
  fs.readFileSync(
    "docs/qa/retro-font-preview/numeric-layout-preservation.json",
  ),
).before;
const fixture = JSON.parse(
  fs.readFileSync("artifacts/ko-game/qa/retro-font/fixtures.json"),
);
const layoutCSS = fs
  .readFileSync("artifacts/ko-game/qa/retro-font/typography.css", "utf8")
  .split("/* QA gallery only.")[1]
  .split("/* Approved preview policy:")[0];
const results = [];
try {
  for (const [width, height] of [
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: width < 800,
      hasTouch: width < 800,
      reducedMotion: "reduce",
    });
    await context.route("https://fonts.googleapis.com/**", (r) => r.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const scene of ["cards", "battle", "menu", "champions"]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(
        `${origin}/qa/retro-font-scene.html?scene=${scene}&mode=full&production=1`,
      );
      await page.waitForFunction(() => window.__fontReview);
      // Retain only gallery positioning; use production fonts/components/styles exclusively.
      await page.evaluate(() => {
        document
          .querySelectorAll(
            'style[data-vite-dev-id*="qa/retro-font/typography.css"]',
          )
          .forEach((e) => e.remove());
        delete document.documentElement.dataset.fontMode;
      });
      await page.addStyleTag({
        content: layoutCSS.slice(layoutCSS.indexOf("*/") + 2),
      });
      await page.evaluate(async () => {
        await document.fonts.load('400 16px "NeoDunggeunmo Pro"');
        await document.fonts.ready;
      });
      await page.waitForTimeout(150);
      assert.equal(
        await page.locator("[data-qa-compact-rules]").count(),
        0,
        "QA abbreviation hook must not run",
      );
      const geometry = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
        font: getComputedStyle(document.body).fontFamily,
      }));
      assert.ok(geometry.scroll <= width + 1);
      assert.match(geometry.font, /NeoDunggeunmo Pro/);
      for (const box of await page.locator("[data-card-rules]").all()) {
        const metrics = await box.evaluate((e) => {
          const r = e.getBoundingClientRect(),
            b = e.parentElement.getBoundingClientRect(),
            s = getComputedStyle(e);
          return {
            text: e.textContent,
            original: e.dataset.fullText,
            truncated: e.dataset.truncated,
            size: s.fontSize,
            weight: s.fontWeight,
            alignment: s.textAlign,
            padding: s.paddingInlineEnd,
            marker: getComputedStyle(e, "::after").content,
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            boxTop: b.top,
            boxBottom: b.bottom,
            boxLeft: b.left,
            boxRight: b.right,
          };
        });
        assert.ok(
          metrics.top >= metrics.boxTop - 1 &&
            metrics.bottom <= metrics.boxBottom + 1,
          JSON.stringify(metrics),
        );
        assert.equal(metrics.alignment, "center");
        assert.equal(metrics.padding, "0px");
        assert.equal(metrics.marker, "none");
        assert.equal(metrics.weight, "400");
        assert.ok(
          Math.abs(
            metrics.left + metrics.right - metrics.boxLeft - metrics.boxRight,
          ) < 2,
        );
        if (metrics.truncated === "true") {
          assert.ok(metrics.text.endsWith("...."));
          assert.ok(metrics.original.startsWith(metrics.text.slice(0, -4)));
        } else assert.equal(metrics.text, metrics.original);
      }
      if (scene === "cards" || scene === "battle") {
        const stats = await page.locator("[data-value]").evaluateAll((ns) =>
          ns.map((e) => {
            const s = getComputedStyle(e),
              r = e.getBoundingClientRect();
            return {
              value: e.getAttribute("data-value"),
              font: s.fontFamily,
              size: s.fontSize,
              weight: s.fontWeight,
              lineHeight: s.lineHeight,
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            };
          }),
        );
        assert.deepEqual(
          stats,
          before.find(
            (row) =>
              row.width === width && row.mode === "full" && row.scene === scene,
          ).stats,
          `cost/ATK/HP changed at ${width} ${scene}`,
        );
      }
      if (scene === "cards") {
        assert.ok(
          await page
            .locator('[data-card-rules][data-truncated="true"]')
            .count(),
        );
        const keyword = page
          .locator(".qa-mini-card [data-card-rules] [role=button]")
          .first();
        await keyword.click();
        await page.locator("[data-card-rules-dialog]").waitFor();
        await page.keyboard.press("Escape");
        await page
          .locator("[data-card-rules-dialog]")
          .waitFor({ state: "hidden" });
        await page
          .getByRole("button", { name: "카드 상세정보 열기", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        assert.equal(
          await dialog.locator("p.mt-2.whitespace-pre-wrap").textContent(),
          fixture.cards.reduce((a, b) =>
            a.text.length > b.text.length ? a : b,
          ).text,
        );
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
      }
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(150);
      await page.screenshot({
        path: `${output}/${scene}-${width}.png`,
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      results.push({
        width,
        height,
        scene,
        status: "PASS",
        numericFontsValuesGeometryUnchanged:
          scene === "cards" || scene === "battle",
      });
    }
    // Verify the real app entry has the production font even without any QA document.
    await context.route("**/api/**", (r) =>
      r.fulfill({
        json: r.request().url().endsWith("/auth/me")
          ? { authenticated: false, user: null }
          : { enabled: false, canAccess: true },
      }),
    );
    await page.goto(origin + "/");
    await page.locator("input[type=password]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.match(
      await page
        .locator("body")
        .evaluate((e) => getComputedStyle(e).fontFamily),
      /NeoDunggeunmo Pro/,
    );
    assert.equal(
      await page
        .locator("input[type=password]")
        .evaluate((e) => getComputedStyle(e).fontWeight),
      "400",
    );
    assert.equal(
      await page.evaluate(() =>
        document.fonts.check('400 16px "NeoDunggeunmo Pro"'),
      ),
      true,
    );
    results.push({ width, scene: "actual-app-guest-entry", status: "PASS" });
    await context.close();
  }
  fs.writeFileSync(
    output + "/results.json",
    JSON.stringify(
      {
        results,
        physicalPhone: "NOT_RUN",
        mode: "approved FULL RETRO",
        productionCSSOnly: true,
      },
      null,
      2,
    ),
  );
  console.log("PASS " + results.length + " production UI checks");
} finally {
  await browser.close();
}
