/** Real admin frame page, actual CardRenderer, isolated API. No frame saved to production. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { chromium } from "./black-gold-playwright.mjs";
const f = await startTutorialFixture(),
  browser = await chromium.launch(),
  out = "docs/qa/20261111-upgrade-card-ui";
await mkdir(out, { recursive: true });
const results = [];
// Independently measured centers of transparent stat openings in bundled PNGs (% of source).
const centers = {
  NORMAL: {
    cost: [13.66, 9.89],
    attack: [12.15, 86.43],
    health: [87.49, 86.45],
  },
  EPIC: { cost: [13.66, 9.89], attack: [12.15, 86.43], health: [87.49, 86.45] },
  LEGENDARY: {
    cost: [12.82, 10.74],
    attack: [12.56, 85.26],
    health: [85.8, 85.25],
  },
  CHAMPION: {
    cost: [13.2, 11.51],
    attack: [13.1, 84.13],
    health: [86.58, 84.12],
  },
};
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    const context = await browser.newContext({ viewport }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      const r = await fetch(f.origin + u.pathname + u.search, {
        method: req.method(),
        headers: {
          Cookie: f.cookie,
          ...(req.headers()["content-type"]
            ? { "Content-Type": req.headers()["content-type"] }
            : {}),
        },
        ...(req.postDataBuffer() ? { body: req.postDataBuffer() } : {}),
      });
      await route.fulfill({
        status: r.status,
        body: await r.text(),
        contentType: r.headers.get("content-type") ?? "application/json",
      });
    });
    await page.goto("http://127.0.0.1:5186/admin/card-frames");
    await page
      .getByRole("heading", { name: "카드 프레임 관리", exact: true })
      .waitFor();
    for (const rarity of ["NORMAL", "EPIC", "LEGENDARY", "CHAMPION"]) {
      await page
        .getByRole("button")
        .filter({ has: page.getByText("WRESTLER", { exact: true }) })
        .filter({ has: page.getByText(rarity, { exact: true }) })
        .click();
      const card = page.locator(`.ko-card-depth[data-rarity="${rarity}"]`);
      await card.waitFor();
      await card.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await page.waitForTimeout(200);
      const geometry = async () =>
        card.evaluate((root) => {
          const b = root.getBoundingClientRect(),
            rect = (n) => {
              const r = n.getBoundingClientRect();
              return {
                x: ((r.x - b.x) / b.width) * 100,
                y: ((r.y - b.y) / b.height) * 100,
                w: (r.width / b.width) * 100,
                h: (r.height / b.height) * 100,
              };
            };
          const result = {};
          for (const key of ["cost", "attack", "health"]) {
            const r = rect(
              root.querySelector(`[data-card-stat="${key}"]`).parentElement,
            );
            result[key] = [r.x + r.w / 2, r.y + r.h / 2];
          }
          result.name = rect(root.querySelector("[data-card-name]"));
          result.rules = rect(root.querySelector("[data-card-rules]"));
          result.frame = root
            .querySelector(".ko-card-frame")
            .getAttribute("src");
          return result;
        });
      const before = await geometry();
      const asset = rarity === "EPIC" ? "normal" : rarity.toLowerCase();
      assert.ok(before.frame.endsWith(`card-frame-${asset}.png`));
      for (const key of ["cost", "attack", "health"])
        for (let i = 0; i < 2; i++) {
          const expected = 50 + (centers[rarity][key][i] - 50) * 1.1;
          assert.ok(
            Math.abs(before[key][i] - expected) < 0.5,
            JSON.stringify({ rarity, key, actual: before[key], expected }),
          );
        }
      assert.ok(before.name.x > before.cost[0] + 4);
      assert.ok(before.name.y + before.name.h < 18);
      assert.ok(before.rules.y > 60);
      assert.ok(before.rules.y + before.rules.h < 95);
      await card.screenshot({
        path: `${out}/frame-${rarity}-${viewport.width}.png`,
      });
      await page.getByRole("tab", { name: "프레임 정렬", exact: true }).click();
      const sliders = page.getByRole("slider");
      // Two percent in each direction: frame/name/rules/stats must all follow, never reverse.
      for (const index of [1, 2]) {
        const slider = sliders.nth(index);
        await slider.focus();
        for (let n = 0; n < 4; n++) await slider.press("ArrowRight");
      }
      const after = await geometry();
      for (const key of ["cost", "attack", "health"])
        for (let i = 0; i < 2; i++)
          assert.ok(
            Math.abs(after[key][i] - before[key][i] - 2) < 0.15,
            `${rarity} ${key} ${i}`,
          );
      assert.ok(Math.abs(after.name.x - before.name.x - 2) < 0.15);
      assert.ok(Math.abs(after.name.y - before.name.y - 2) < 0.15);
      assert.ok(Math.abs(after.rules.x - before.rules.x - 2) < 0.15);
      assert.ok(Math.abs(after.rules.y - before.rules.y - 2) < 0.15);
      results.push({
        viewport,
        rarity,
        actualFrame: before.frame,
        statCentersInOpenings: true,
        nameAndRulesAligned: true,
        offsetsFollowFrame: true,
      });
    }
    await page
      .getByRole("button")
      .filter({ has: page.getByText("TECHNIQUE", { exact: true }) })
      .filter({ has: page.getByText("CHAMPION", { exact: true }) })
      .click();
    assert.equal(await page.locator('[data-card-stat="attack"]').count(), 0);
    assert.equal(await page.locator('[data-card-stat="health"]').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    out + "/frame-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await f.close();
}
