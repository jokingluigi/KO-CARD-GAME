import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/home-fit";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [320, 568],
    [360, 568],
    [360, 640],
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
    [740, 360],
    [844, 390],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ]) {
    const page = await browser.newPage({
        viewport: { width, height },
        userAgent:
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36",
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
            id: "fit-test",
            nickname: "챔피언과함께하는테스트유저",
            role: "USER",
            currencyBalance: 1234567,
            prismBalance: 300,
            championPrismBalance: 200,
          },
        };
      else if (p.endsWith("/server-status"))
        json = { enabled: false, allowed: true };
      else if (p.endsWith("/availability")) json = { enabled: true };
      else if (p.endsWith("/main-content"))
        json = {
          notices: Array.from({ length: 6 }, (_, i) => ({
            id: String(i),
            title: "공지 확인 " + i,
            body: "긴 공지도 별도 창에서 정상적으로 읽을 수 있어야 합니다.\n".repeat(
              20,
            ),
            displayOrder: i,
          })),
          background: {
            id: "fixture-art",
            assetUrl:
              "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
          },
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
    await page.getByTestId("button-main-menu-드래프트 모드").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const metrics = await page.evaluate(() => {
      const d = document.documentElement;
      return {
        width: d.scrollWidth,
        height: d.scrollHeight,
        viewportHeight: innerHeight,
      };
    });
    await page.screenshot({ path: `${out}/home-${width}x${height}.png` });
    assert.ok(metrics.width <= width + 1, JSON.stringify(metrics));
    assert.ok(metrics.height <= height + 1, JSON.stringify(metrics));
    const controls = await page
      .locator(".ko-main-menu__item")
      .evaluateAll((ns) =>
        ns.map((n) => {
          const r = n.getBoundingClientRect();
          return {
            label: n.textContent.trim(),
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            hit:
              document
                .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                ?.closest("button") === n,
          };
        }),
      );
    assert.equal(controls.length, 13);
    for (const c of controls) {
      assert.ok(c.y >= 0 && c.y + c.h <= height + 1, JSON.stringify(c));
      assert.ok(c.x >= 0 && c.x + c.w <= width + 1, JSON.stringify(c));
      assert.ok(c.w >= 44 && c.h >= 44, JSON.stringify(c));
      assert.equal(c.hit, true, JSON.stringify(c));
    }
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.getByRole("button", { name: /공지 · 6건/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.ok(await dialog.evaluate((n) => n.scrollHeight > n.clientHeight));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.getByRole("button", { name: "음량 설정", exact: true }).click();
    await page.getByRole("slider", { name: "배경음 볼륨" }).waitFor();
    await page.getByRole("button", { name: "음량 설정", exact: true }).click();
    await page
      .getByRole("button", { name: "닉네임 변경", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await page.getByLabel("새 닉네임").fill("새 이름");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page
      .getByRole("button", { name: "휴대폰에 앱 설치", exact: true })
      .click();
    const instructions = page
      .getByRole("status")
      .filter({ hasText: "안드로이드 Chrome" });
    await instructions.waitFor();
    const ib = await instructions.boundingBox();
    assert.ok(ib.x >= 0 && ib.x + ib.width <= width);
    await page
      .getByRole("button", { name: "휴대폰에 앱 설치", exact: true })
      .click();
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(100);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    );
    const rotated = await page
      .locator(".ko-main-menu__item")
      .evaluateAll((ns) =>
        ns.map((n) => {
          const r = n.getBoundingClientRect();
          return {
            label: n.textContent,
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
          };
        }),
      );
    for (const r of rotated)
      assert.ok(
        r.x >= 0 && r.y >= 0 && r.right <= height + 1 && r.bottom <= width + 1,
        JSON.stringify(r),
      );
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      metrics,
      all13MenusFit: true,
      min44Touch: true,
      noOverlap: true,
      noScroll: true,
      noticesDialog: true,
      soundSettings: true,
      nicknameDialog: true,
      installInstructions: true,
      rotation: true,
      errors,
    });
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
