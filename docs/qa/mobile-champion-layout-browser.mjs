import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/mobile-center";
await mkdir(out, { recursive: true });
const results = [];
const browser = await chromium.launch();
function overlap(a, b) {
  return (
    Math.min(a.right, b.right) > Math.max(a.x, b.x) + 1 &&
    Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y) + 1
  );
}
try {
  for (const [width, height] of process.env.KO_MOBILE_ADMIN_ONLY === "1"
    ? []
    : [
        [360, 640],
        [360, 740],
        [375, 812],
        [390, 844],
        [412, 915],
        [844, 390],
        [1440, 900],
      ]) {
    const ctx = await browser.newContext({
        viewport: { width, height },
        hasTouch: true,
      }),
      p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", (r) =>
      r.fulfill({ json: { cards: [], frames: [] } }),
    );
    await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await p.locator(".ko-game-shell").waitFor();
    await p
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    const measure = await p.evaluate(() => {
      const box = (s) => {
        const n = document.querySelector(s),
          r = n.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      };
      return {
        own: box(".ko-player-champion"),
        enemy: box(".ko-opponent-champion"),
        art: box(".ko-player-champion .ko-portrait-window"),
        hand: box(".ko-hand-card"),
        field: box(".ko-player-board-row .ko-board-slot"),
        button: box(".ko-player-ability"),
        gold: box(".ko-player-stats"),
        guide: box(".ko-battle-command"),
        quest: box(".ko-opponent-quest"),
        overflow:
          document.querySelector(".ko-game-shell").scrollHeight > innerHeight,
      };
    });
    assert.equal(measure.overflow, false);
    assert.ok(measure.field.w >= 44, "retain 44px field target");
    if (width < height && width < 1000) {
      assert.ok(Math.abs(measure.own.x + measure.own.w / 2 - width / 2) < 1);
      assert.ok(
        Math.abs(measure.enemy.x + measure.enemy.w / 2 - width / 2) < 1,
      );
      assert.equal(overlap(measure.own, measure.button), false);
      assert.equal(overlap(measure.own, measure.gold), false);
      assert.equal(overlap(measure.enemy, measure.guide), false);
      assert.equal(overlap(measure.enemy, measure.quest), false);
      assert.equal(
        await p
          .locator(".ko-player-champion .ko-sprite-visual")
          .getAttribute("data-motion-axis"),
        "vertical",
      );
    } else assert.ok(measure.own.x < measure.enemy.x);
    await p.screenshot({ path: `${out}/layout-${width}-${height}.png` });
    if (width === 390 || width === 1440) {
      await p.evaluate(async () => {
        const { boardFixture } = await import("/qa/black-gold-fixture.ts");
        const s = boardFixture();
        s.gameId = "center-target-" + crypto.randomUUID();
        s.players[1].board = [null, null, null, null];
        s.activePlayerId = s.players[0].id;
        s.players[0].board[0].enteredThisTurn = false;
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", { detail: { state: s } }),
        );
      });
      const health = JSON.parse(await p.getByTestId("state-json").textContent())
        .players[1].health;
      await p.locator(".ko-player-board-row .ko-board-slot").first().click();
      await p.locator(".ko-opponent-champion").click();
      await p.waitForFunction(
        (h) =>
          JSON.parse(
            document.querySelector("[data-testid=state-json]").textContent,
          ).players[1].health < h,
        health,
      );
      measure.championTargetClick = true;
    }

    assert.deepEqual(errors, []);
    results.push({ width, height, ...measure });
    await ctx.close();
  }
  const cards = JSON.parse(
    await readFile(
      "artifacts/ko-game/src/game/qa/fixtures/cards-2026-10-12-all.json",
      "utf8",
    ),
  );
  const champions = JSON.parse(
    await readFile(
      "artifacts/ko-game/src/game/qa/fixtures/champions-2026-10-12-all.json",
      "utf8",
    ),
  ).filter((c) => c.status === "PUBLISHED");
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
      }),
      p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", (r) => {
      const u = new URL(r.request().url()),
        path = u.pathname;
      if (path.endsWith("/auth/me"))
        return r.fulfill({
          json: {
            authenticated: true,
            user: {
              id: "layout-admin",
              email: "qa@layout.invalid",
              nickname: "QA",
              role: "ADMIN",
              currency: 0,
              currencyBalance: 0,
              prismBalance: 0,
              championPrismBalance: 0,
              isTestAccount: false,
            },
          },
        });
      if (path === "/api/server-status")
        return r.fulfill({
          json: { enabled: false, allowed: true, message: "" },
        });
      if (path === "/api/minion-a/cards")
        return r.fulfill({ json: { definitions: [] } });
      if (path.includes("/cards")) return r.fulfill({ json: { cards } });
      if (path.includes("/champions"))
        return r.fulfill({ json: { champions } });
      if (path.endsWith("/ws-ticket"))
        return r.fulfill({ status: 503, json: {} });
      return r.fulfill({
        json: {
          cards: [],
          champions: [],
          media: [],
          notices: [],
          items: [],
          frames: [],
          background: null,
          bgm: null,
        },
      });
    });
    await p.goto("http://127.0.0.1:5186/?source=admin");
    await p
      .locator(".ko-game-shell")
      .waitFor({ timeout: 15000 })
      .catch(async (e) => {
        console.log(
          "ADMIN_FAILED",
          errors,
          (await p.locator("body").innerText()).slice(0, 1600),
        );
        await p.screenshot({ path: out + "/admin-failure.png" });
        throw e;
      });
    const confirm = p.getByRole("button", { name: "0장 교체", exact: true });
    if (await confirm.isVisible()) await confirm.click();
    await p
      .getByRole("dialog", { name: "시작 손패 교체", exact: true })
      .waitFor({ state: "hidden", timeout: 12000 });
    assert.equal(
      await p
        .getByRole("button", { name: "테스트 덱 구성", exact: true })
        .count(),
      0,
      "no floating test toolbar during play",
    );
    await p.screenshot({ path: `${out}/actual-test-game-${width}.png` });
    await p.getByRole("button", { name: "설정 열기", exact: true }).click();
    const settings = p.getByRole("dialog", { name: "게임 설정", exact: true });
    await settings.waitFor();
    await p.screenshot({ path: `${out}/test-tools-settings-${width}.png` });
    await settings
      .getByRole("button", { name: "안 죽는 샌드백", exact: true })
      .click();
    await settings.waitFor({ state: "hidden" });
    await p.waitForFunction(() =>
      document.body.textContent.includes("안 죽는 샌드백"),
    );
    await p.getByRole("button", { name: "설정 열기", exact: true }).click();
    await settings
      .getByRole("button", { name: "테스트 덱 구성", exact: true })
      .click();
    const editor = p.getByRole("dialog", {
      name: "테스트 덱 구성",
      exact: true,
    });
    await editor.waitFor();
    assert.equal(await settings.count(), 0);
    await editor
      .getByRole("button", { name: "빠르게 25장 채우기", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "내 덱을 상대 덱에 복사", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "이 덱으로 테스트 시작", exact: true })
      .click();
    await editor.waitFor({ state: "hidden" });
    assert.equal(
      await p
        .getByRole("button", { name: "테스트 덱 구성", exact: true })
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      actualHomeAdminTools: true,
      dummyFromSettings: true,
      deckRestartFromSettings: true,
    });
    await ctx.close();
  }
  await writeFile(
    out +
      (process.env.KO_MOBILE_ADMIN_ONLY === "1"
        ? "/admin-tools-results.json"
        : "/results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
