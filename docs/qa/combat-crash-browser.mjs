import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.KO_QA_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE }
    : {}),
});
const results = [];
try {
  for (const [width, height, touch] of [
    [390, 844, true],
    [1440, 900, false],
  ])
    for (const unsupported of [false, true]) {
      const page = await browser.newPage({
        viewport: { width, height },
        isMobile: touch,
        hasTouch: touch,
        reducedMotion: "no-preference",
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" && m.text().includes("ErrorBoundary caught"))
          errors.push(m.text());
      });
      await page.route("**/api/**", (route) => {
        assert.equal(route.request().method(), "GET");
        return route.fulfill({
          json: { cards: [], champions: [], frames: [] },
        });
      });
      await page.goto(
        (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5174") +
          "/qa/combat-crash.html",
      );
      await page
        .locator(".ko-player-board-row [data-rarity]")
        .first()
        .waitFor();
      if (unsupported)
        await page.evaluate(() => {
          window.__rejectedAnimations = 0;
          Element.prototype.animate = function () {
            window.__rejectedAnimations++;
            throw new DOMException(
              "Unsupported animation properties",
              "NotSupportedError",
            );
          };
        });
      const activate = async (locator) =>
        touch ? locator.tap() : locator.click();
      await activate(
        page.locator(".ko-player-board-row [data-rarity]").first(),
      );
      await activate(
        page.locator(".ko-opponent-board-row [data-rarity]").first(),
      );
      await page.waitForFunction(() => {
        const output = document.querySelector("[data-testid=state-json]");
        if (!output) return false;
        const s = JSON.parse(output.textContent);
        return s.players.every(
          (p) => p.board.every((c) => !c) && p.graveyard.length === 1,
        );
      });
      await page.waitForFunction(
        () => !document.querySelector(".attack-animation"),
      );
      const before = JSON.parse(
        await page.getByTestId("state-json").textContent(),
      );
      await page.waitForTimeout(450);
      const after = JSON.parse(
        await page.getByTestId("state-json").textContent(),
      );
      assert.deepEqual(
        after,
        before,
        "cosmetic completion must not alter combat",
      );
      assert.equal(before.status, "IN_PROGRESS");
      assert.equal(
        before.events.filter((e) => e.type === "ATTACK_DECLARED").length,
        1,
      );
      assert.equal(
        before.events.filter((e) => e.type === "CARD_RETIRED").length,
        2,
      );
      assert.equal(
        await page.getByText("Something went wrong", { exact: true }).count(),
        0,
      );
      assert.deepEqual(errors, []);
      const rejected = await page.evaluate(
        () => window.__rejectedAnimations ?? 0,
      );
      if (unsupported)
        assert.ok(
          rejected > 0,
          "failure injection must exercise animation fallback",
        );
      results.push({
        width,
        height,
        touch,
        unsupported,
        rejected,
        attacks: 1,
        retirements: 2,
        status: "PASS",
      });
      console.log(
        "PASS",
        width,
        height,
        unsupported ? "rejected Web Animations" : "normal",
      );
      await page.close();
    }
  fs.mkdirSync("qa-results/combat-crash", { recursive: true });
  fs.writeFileSync(
    "qa-results/combat-crash/results.json",
    JSON.stringify(
      {
        results,
        physicalDevice: "NOT_RUN",
        reportedProductionIncident: "UNCONFIRMED: no original stack trace",
        productionWrites: false,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
