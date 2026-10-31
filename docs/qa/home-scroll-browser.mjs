import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const phase = process.env.PHASE ?? "after",
  illustrated = process.env.ILLUSTRATED === "1",
  out = `qa-results/home-scroll-${phase}${illustrated ? "-illustrated" : ""}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
    args: ["--disable-features=OverlayScrollbar"],
  }),
  results = [];
try {
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [844, 390],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ]) {
    const page = await browser.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (r) => {
      const p = new URL(r.request().url()).pathname;
      let json = {};
      if (p.endsWith("/auth/me"))
        json = {
          authenticated: true,
          user: {
            id: "scroll-test",
            nickname: "홈 화면 검증",
            role: "USER",
            currencyBalance: 500,
            prismBalance: 300,
            championPrismBalance: 200,
          },
        };
      else if (p.endsWith("/server-status"))
        json = { enabled: false, allowed: true };
      else if (p.endsWith("/main-content"))
        json = {
          notices: Array.from({ length: 6 }, (_, i) => ({
            id: String(i),
            title: "공지 확인 " + i,
            body: "긴 공지도 페이지 전체에서 자연스럽게 스크롤되어야 합니다.\n".repeat(
              12,
            ),
            displayOrder: i,
          })),
          background: illustrated
            ? {
                id: "fixture-art",
                assetUrl:
                  "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
                mediaType: "BACKGROUND",
                name: "Existing fixture art",
              }
            : null,
          bgm: null,
        };
      else if (p.endsWith("/cards")) json = { cards: [] };
      else if (p.endsWith("/champions")) json = { champions: [] };
      else if (p.endsWith("/card-frames")) json = { frames: [] };
      else if (p.endsWith("/decks")) json = { decks: [] };
      else if (p.endsWith("/online-matches/active")) json = { match: null };
      return r.fulfill({ json });
    });
    await page.goto("http://127.0.0.1:5186/");
    await page.locator(".ko-main-menu__content").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    const measure = () =>
      page.evaluate(() => {
        const n = document.querySelector(".ko-main-menu__content"),
          d = document.documentElement;
        return {
          viewport: innerWidth,
          documentWidth: d.scrollWidth,
          documentHeight: d.scrollHeight,
          innerWidth: n.clientWidth,
          innerScrollWidth: n.scrollWidth,
          innerHeight: n.clientHeight,
          innerScrollHeight: n.scrollHeight,
          overflowX: getComputedStyle(n).overflowX,
          overflowY: getComputedStyle(n).overflowY,
        };
      });
    const closed = await measure();
    await page.screenshot({ path: `${out}/home-${width}.png` });
    if (phase === "after") {
      assert.ok(closed.documentWidth <= width + 1);
      assert.equal(closed.overflowY, "visible");
      assert.equal(closed.innerScrollHeight, closed.innerHeight);
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(80);
      assert.ok((await page.evaluate(() => scrollY)) > 0);
      assert.equal(
        await page
          .locator(".ko-main-menu__content")
          .evaluate((n) => n.scrollTop),
        0,
      );
      await page.getByRole("button", { name: /공지 · 6건/ }).click();
      const expanded = await measure();
      assert.ok(expanded.documentWidth <= width + 1);
      assert.ok(expanded.documentHeight > closed.documentHeight);
      await page
        .locator('[data-testid="button-main-menu-내 팩"]')
        .scrollIntoViewIfNeeded();
      assert.ok(
        await page
          .locator('[data-testid="button-main-menu-내 팩"]')
          .isVisible(),
      );
    }
    assert.deepEqual(errors, []);
    results.push({ width, height, ...closed, errors });
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
