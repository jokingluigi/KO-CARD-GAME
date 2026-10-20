/** Actual shared UI and engine, isolated localhost state. No account/database/API writes. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
const { chromium } = await import(
  process.env.KO_QA_PLAYWRIGHT ??
    "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"
);
const origin = process.env.KO_BOARD_ORIGIN ?? "http://127.0.0.1:5186";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = process.env.KO_BOARD_OUTPUT ?? "qa-results/black-gold-board";
await mkdir(out, { recursive: true });
const exec = promisify(execFile),
  results = [],
  errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
});
async function check(name, fn) {
  await fn();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
}
try {
  for (const [width, height] of [
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await ctx.addInitScript(() =>
      localStorage.setItem("ko-match-coach-v1", "done"),
    );
    await page.route("**/api/**", async (route) => {
      assert.equal(route.request().method(), "GET");
      const p = new URL(route.request().url()).pathname;
      if (p.startsWith("/api/storage/objects/uploads/card-images/")) {
        const { stdout } = await exec("python3", [
          "docs/qa/black-gold-artwork-cache.py",
          p,
        ]);
        const f = JSON.parse(stdout);
        await route.fulfill({
          body: await readFile(f.path),
          contentType: f.type,
        });
        return;
      }
      await route.fulfill({
        json: { cards: [], champions: [], frames: [], items: [] },
      });
    });
    await page.goto(origin + "/qa/black-gold-board.html");
    await page.locator(".ko-board-preview").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const state = () =>
      page.getByTestId("state-json").textContent().then(JSON.parse);
    const idle = () =>
      page.waitForFunction(
        () =>
          document.querySelector("[data-testid=preview-busy]").textContent ===
          "false",
        {},
        { timeout: 12000 },
      );
    const load = async (mode) => {
      await page.evaluate(async (mode) => {
        const { boardFixture, definitions } =
          await import("/qa/black-gold-fixture.ts");
        const { generateCardInstance } = await import("/src/game/index.ts");
        const s = boardFixture();
        const plain = definitions.find((c) => c.name === "리버덩크");
        if (mode === "summon")
          s.players[0].hand = [
            generateCardInstance(plain, { instanceId: "summon-local" }),
          ];
        if (mode === "spell")
          s.players[0].hand = [
            generateCardInstance(
              definitions.find((c) => c.name === "봉인"),
              { instanceId: "spell-local" },
            ),
          ];
        if (mode === "destroy")
          s.players[0].hand = [
            generateCardInstance(
              definitions.find((c) => c.name === "절멸"),
              { instanceId: "destroy-local" },
            ),
          ];
        if (mode === "champion") s.players[1].board = [null, null, null, null];
        if (mode === "quest") s.players[0].champion.questProgress = 7;
        if (mode === "many")
          s.players[0].hand = Array.from({ length: 10 }, (_, i) =>
            generateCardInstance(plain, { instanceId: "many-" + i }),
          );
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: s, definitions },
          }),
        );
      }, mode);
      await page.waitForTimeout(200);
      await idle();
    };
    const geometry = () =>
      page.evaluate(() => {
        const r = (s) => {
          const b = document.querySelector(s).getBoundingClientRect();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        };
        return {
          w: innerWidth,
          h: innerHeight,
          scroll: document.documentElement.scrollWidth,
          scale: visualViewport.scale,
          portrait: r(".ko-player-champion"),
          enemy: r(".ko-opponent-champion"),
          field: r(".ko-board-slot"),
          hand: r(".ko-hand-card"),
          controls: r(".ko-game-controls"),
        };
      });
    await check(
      width + " layout, images, real sizes, theme toggle without state change",
      async () => {
        const before = await state(),
          g = await geometry();
        assert.equal(g.scroll, width);
        assert.equal(g.scale, 1);
        assert.equal(await page.locator(".ko-board-slot").count(), 8);
        for (const r of [g.portrait, g.enemy]) {
          assert.ok(Math.abs(r.x + r.w / 2 - width / 2) < 1);
          assert.ok(r.h > r.w);
        }
        assert.ok(g.portrait.w >= 93);
        for (const n of await page
          .locator(
            ".ko-game-controls > button:visible,.ko-champion-ability,.ko-player-zones button,.cosmetic-emote-tools > button,.ko-board-inspect-button:visible,.ko-hand-inspect-button:visible",
          )
          .all()) {
          assert.ok((await n.boundingBox()).height >= 44);
        }
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll(".ko-champion-portrait-art img")]
              .length === 2 &&
            [
              ...document.querySelectorAll(".ko-champion-portrait-art img"),
            ].every((i) => i.complete && i.naturalWidth > 0),
        );
        assert.ok(
          await page
            .locator(".ko-champion-portrait-art img")
            .evaluateAll((es) =>
              es.every((e) => getComputedStyle(e).objectFit === "contain"),
            ),
        );
        await page.locator("[data-preview-tools] button").first().click();
        await page.locator(".ko-board-preview").waitFor({ state: "detached" });
        assert.deepEqual(await state(), before);
        const classic = await geometry();
        assert.ok(g.field.w >= classic.field.w - 0.5);
        assert.ok(Math.abs(g.hand.w - classic.hand.w) < 0.5);
        await page.locator("[data-preview-tools] button").first().click();
        await page.locator(".ko-board-preview").waitFor();
      },
    );
    await check(
      width + " target selection/cancel preserves field geometry and gold",
      async () => {
        await load();
        const before = await state(),
          g = await geometry();
        await page.locator(".ko-champion-ability").click();
        await page.waitForFunction(
          () =>
            JSON.parse(
              document.querySelector("[data-testid=state-json]").textContent,
            ).targetingState?.active,
        );
        assert.equal((await geometry()).field.h, g.field.h);
        assert.ok(
          await page.locator(".ko-board-slot-wrapper").evaluateAll((es) =>
            es.every((e) => {
              const c = getComputedStyle(e);
              return c.backgroundColor === "rgb(0, 0, 0)" && c.opacity === "1";
            }),
          ),
          "Opaque black backing survives targeting dimming",
        );
        await page.locator(".ko-mobile-target-cancel").click();
        await page.waitForFunction(
          () =>
            !JSON.parse(
              document.querySelector("[data-testid=state-json]").textContent,
            ).targetingState?.active,
        );
        assert.equal(
          (await state()).players[0].currentGold,
          before.players[0].currentGold,
        );
        assert.equal((await geometry()).field.h, g.field.h);
      },
    );
    await check(
      width +
        " real ability damages own champion, advances/completes quest and upgrades",
      async () => {
        await load("quest");
        const before = await state();
        await page.locator(".ko-champion-ability").click();
        await page.locator(".ko-player-champion").click();
        await page.waitForFunction(
          () =>
            JSON.parse(
              document.querySelector("[data-testid=state-json]").textContent,
            ).players[0].champion.questCompleted,
        );
        const after = await state();
        assert.equal(after.players[0].health, before.players[0].health - 1);
        assert.ok(after.players[0].champion.questCompleted);
        await idle();
        assert.match(
          await page.locator(".ko-champion-ability").innerText(),
          /강화 능력/,
        );
      },
    );
    const cdp = await ctx.newCDPSession(page);
    const drag = async (from, to, cancel = false) => {
      const a = await from.boundingBox(),
        b = await to.boundingBox(),
        x = a.x + a.width * 0.45,
        y = a.y + a.height * 0.65,
        tx = b.x + b.width * 0.5,
        ty = b.y + b.height * 0.65;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 8; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: x + ((tx - x) * i) / 8, y: y + ((ty - y) * i) / 8 },
          ],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: cancel ? "touchCancel" : "touchEnd",
        touchPoints: [],
      });
    };
    await check(
      width + " touch drag summon and animation action-lock recovery",
      async () => {
        await load("summon");
        await page.evaluate(() => {
          window.__boardBusy = [];
          new MutationObserver(() =>
            window.__boardBusy.push({
              busy: document.querySelector("[data-testid=preview-busy]")
                .textContent,
              disabled: document.querySelector(".ko-turn-end").disabled,
              animationBackings: [
                ...document.querySelectorAll(
                  ".card-play-animation .ko-card-depth",
                ),
              ].map((e) => getComputedStyle(e).backgroundColor),
            }),
          ).observe(document.querySelector("[data-testid=preview-busy]"), {
            childList: true,
            characterData: true,
            subtree: true,
          });
        });
        await drag(
          page.locator(".ko-hand-card"),
          page.locator(".ko-player-board-row .ko-board-slot").nth(2),
        );
        await page.waitForFunction(
          () =>
            JSON.parse(
              document.querySelector("[data-testid=state-json]").textContent,
            ).players[0].board[2]?.instanceId === "summon-local",
        );
        await page.waitForFunction(() =>
          window.__boardBusy.some((x) => x.busy === "true"),
        );
        assert.ok(
          await page.evaluate(() =>
            window.__boardBusy.some((x) => x.busy === "true" && x.disabled),
          ),
        );
        await idle();
        assert.ok(
          await page.evaluate(() =>
            window.__boardBusy.some(
              (x) =>
                x.animationBackings.length > 0 &&
                x.animationBackings.every((c) => c === "rgb(0, 0, 0)"),
            ),
          ),
          "Animated card frame gaps also have a black backing",
        );
        assert.ok(await page.locator(".ko-turn-end").isEnabled());
        assert.equal((await state()).players[0].hand.length, 0);
      },
    );
    await check(
      width + " touch field attack, champion attack and canceled attack",
      async () => {
        await load();
        let before = await state();
        await drag(
          page.locator(".ko-player-board-row .ko-board-slot").nth(1),
          page.locator(".ko-opponent-board-row .ko-board-slot").nth(1),
        );
        await page.waitForFunction(() =>
          JSON.parse(
            document.querySelector("[data-testid=state-json]").textContent,
          ).events.some((e) => e.type === "ATTACK_DECLARED"),
        );
        let after = await state();
        assert.equal(
          after.events.filter((e) => e.type === "ATTACK_DECLARED").length,
          1,
        );
        assert.ok(
          after.players[1].board[1].currentHealth <
            before.players[1].board[1].currentHealth,
        );
        await idle();
        await load("champion");
        before = await state();
        await drag(
          page.locator(".ko-player-board-row .ko-board-slot").nth(1),
          page.locator(".ko-opponent-champion"),
        );
        await page.waitForFunction(
          () =>
            JSON.parse(
              document.querySelector("[data-testid=state-json]").textContent,
            ).players[1].health < 25,
        );
        assert.ok((await state()).players[1].health < before.players[1].health);
        await idle();
        await load();
        before = await state();
        await drag(
          page.locator(".ko-player-board-row .ko-board-slot").nth(1),
          page.locator(".ko-opponent-champion"),
          true,
        );
        assert.deepEqual(await state(), before);
      },
    );
    await check(
      width + " actual targeted spell moves selected opponent into own deck",
      async () => {
        await load("spell");
        const before = await state(),
          victim = before.players[1].board[0].instanceId;
        await page.locator(".ko-hand-card").click();
        await page.getByRole("button", { name: "사용", exact: true }).click();
        await page
          .locator(".ko-opponent-board-row .ko-board-slot")
          .first()
          .click({ position: { x: 20, y: 75 } });
        await page.waitForFunction(
          (id) =>
            JSON.parse(
              document.querySelector("[data-testid=state-json]").textContent,
            ).players[0].deck.some((c) => c.instanceId === id),
          victim,
        );
        assert.equal((await state()).players[1].board[0], null);
        await idle();
      },
    );
    await check(
      width + " destruction effect preserves all four slot indices",
      async () => {
        await load("destroy");
        const before = await state();
        await page.locator(".ko-hand-card").click();
        await page.getByRole("button", { name: "사용", exact: true }).click();
        await page.waitForFunction(() =>
          JSON.parse(
            document.querySelector("[data-testid=state-json]").textContent,
          ).events.some((e) => e.type === "CARD_DESTROYED"),
        );
        const after = await state();
        assert.equal(after.players[0].board[0], null);
        assert.equal(after.players[1].board[0], null);
        assert.equal(
          after.players[0].graveyard.length,
          before.players[0].graveyard.length + 1,
          "spell goes to graveyard; destroyed player does not",
        );
        assert.equal(await page.locator(".ko-board-slot").count(), 8);
        await idle();
      },
    );
    await check(
      width +
        " emotes, settings, history, graveyard, card info and hand scroll",
      async () => {
        await load("many");
        await page.locator(".ko-player-champion").click();
        await page.getByRole("menu", { name: "챔피언 감정표현" }).waitFor();
        for (const n of await page.getByRole("menuitem").all())
          assert.ok((await n.boundingBox()).height >= 44);
        await page.getByRole("menuitem").first().click();
        assert.ok(
          (await state()).events.some((e) => e.type === "CHAMPION_EMOTE"),
        );
        await page
          .getByRole("button", { name: "설정 열기", exact: true })
          .click();
        await page.getByRole("dialog", { name: "게임 설정" }).waitFor();
        await page
          .getByRole("button", { name: "설정 닫기", exact: true })
          .click();
        await page.getByRole("button", { name: "경기 로그 열기" }).click();
        await page.getByRole("button", { name: "경기 로그 닫기" }).click();
        await page.locator(".ko-player-zones button").click();
        await page
          .getByRole("dialog", { name: "내 묘지", exact: true })
          .getByRole("button", { name: "닫기", exact: true })
          .click();
        await page
          .locator(".ko-player-board-row .ko-board-inspect-button")
          .first()
          .click();
        await page.locator(".ko-touch-inspector").waitFor();
        assert.equal(
          await page.getByRole("dialog").count(),
          0,
          "field info opens rules before full illustration",
        );
        await page
          .locator(".ko-touch-inspector")
          .getByRole("button", { name: /풀 일러스트 보기/ })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Close", exact: true })
          .click();
        if (await page.locator(".ko-touch-inspector-close").count())
          await page.locator(".ko-touch-inspector-close").click();
        await page
          .locator(".ko-player-hand")
          .evaluate((e) => (e.scrollLeft = e.scrollWidth));
        assert.ok(
          await page
            .locator(".ko-player-hand")
            .evaluate((e) => e.scrollLeft > 0),
        );
        assert.equal(await page.evaluate(() => visualViewport.scale), 1);
      },
    );
    await check(
      width +
        " end turn and serialised state restore preserve HUD and four slots",
      async () => {
        await load();
        await page.locator(".ko-turn-end").click();
        if ((await page.locator(".ko-turn-end").innerText()) === "그래도 종료")
          await page.locator(".ko-turn-end").click();
        await page.waitForFunction(
          () =>
            JSON.parse(
              document.querySelector("[data-testid=state-json]").textContent,
            ).activePlayerId === "player-2",
        );
        assert.ok(await page.locator(".ko-turn-end").isDisabled());
        await page.waitForFunction(
          () =>
            getComputedStyle(document.querySelector(".ko-turn-end"))
              .backgroundColor === "rgb(109, 91, 60)",
          undefined,
          { timeout: 2000 },
        );
        assert.ok(
          await page
            .locator(".ko-hand-cards > :has(.ko-hand-card)")
            .evaluateAll((es) =>
              es.every((e) => {
                const c = getComputedStyle(e);
                return (
                  c.backgroundColor === "rgb(0, 0, 0)" && c.opacity === "1"
                );
              }),
            ),
          "Unavailable hand cards retain an opaque backing",
        );
        const saved = await state();
        await page.evaluate(
          (s) =>
            window.dispatchEvent(
              new CustomEvent("ko-qa-load-state", { detail: { state: s } }),
            ),
          saved,
        );
        assert.deepEqual(await state(), saved);
        assert.equal(await page.locator(".ko-board-slot").count(), 8);
      },
    );
    await ctx.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(
    out + "/interaction-results.json",
    JSON.stringify(
      { results, errors, physicalPhone: "NOT_RUN", productionApiWrites: 0 },
      null,
      2,
    ) + "\n",
  );
}
