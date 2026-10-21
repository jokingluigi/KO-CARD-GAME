/** Offline, actual UI captures. No production requests or account mutations. */
import assert from "node:assert/strict";
import { chromium } from "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const exec = promisify(execFile),
  origin = process.env.KO_BOARD_ORIGIN ?? "http://127.0.0.1:5186";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out =
  process.env.KO_BOARD_CAPTURE_OUTPUT ?? "qa-results/wood-cloth-board";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium",
  headless: true,
});
const results = [],
  errors = [],
  missingArt = [];
try {
  for (const [w, h] of [
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
    [1440, 1000],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      isMobile: w < 600,
      hasTouch: w < 600,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      assert.ok(
        ["localhost", "127.0.0.1"].includes(url.hostname),
        "No external network requests",
      );
      if (!url.pathname.startsWith("/api/")) return route.continue();
      assert.equal(route.request().method(), "GET");
      if (
        url.pathname.startsWith("/api/storage/objects/uploads/card-images/")
      ) {
        try {
          const { stdout } = await exec("python3", [
            "docs/qa/black-gold-artwork-cache.py",
            url.pathname,
          ]);
          const f = JSON.parse(stdout);
          return route.fulfill({
            body: await readFile(f.path),
            contentType: f.type,
          });
        } catch {
          missingArt.push(url.pathname);
          return route.abort();
        }
      }
      await route.fulfill({
        json: { cards: [], champions: [], items: [], frames: [] },
      });
    });
    const open = async (theme) => {
      await page.goto(
        origin +
          "/qa/black-gold-board.html" +
          (theme === "classic" ? "?theme=classic" : ""),
      );
      await page.locator(".ko-game-stage").waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);
      await page
        .locator("[data-preview-tools]")
        .evaluate((e) => (e.style.display = "none"));
    };
    for (const theme of ["new", "classic"]) {
      await open(theme);
      const x = await page.evaluate(() => {
        const box = (s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        };
        const mats = [".ko-opponent-board-row", ".ko-player-board-row"].map(
          (s) => {
            const c = getComputedStyle(document.querySelector(s), "::before");
            return {
              image: c.backgroundImage,
              pointerEvents: c.pointerEvents,
              content: c.content,
            };
          },
        );
        return {
          width: innerWidth,
          height: innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          scale: visualViewport.scale,
          portrait: box(".ko-player-champion"),
          enemy: box(".ko-opponent-champion"),
          card: box(".ko-board-slot"),
          hand: box(".ko-player-hand"),
          handCard: box(".ko-hand-card"),
          controls: box(".ko-game-controls"),
          ability: box(".ko-champion-ability"),
          images: [
            ...document.querySelectorAll(".ko-champion-portrait-art img"),
          ].map((i) => ({
            loaded: i.complete && i.naturalWidth > 0,
            fit: getComputedStyle(i).objectFit,
          })),
          slots: document.querySelectorAll(".ko-board-slot").length,
          wood: getComputedStyle(document.querySelector(".ko-game-shell"))
            .backgroundImage,
          oldVeil: getComputedStyle(
            document.querySelector(".ko-board-area"),
            "::before",
          ).content,
          oldAmbience: getComputedStyle(
            document.querySelector(".ko-cinematic-background"),
          ).display,
          mats,
          portraitFrames: [".ko-player-champion", ".ko-opponent-champion"].map(
            (sel) => {
              const e = document.querySelector(sel),
                c = getComputedStyle(e),
                r = e.getBoundingClientRect();
              return {
                width: r.width,
                height: r.height,
                borders: [
                  c.borderTop,
                  c.borderRight,
                  c.borderBottom,
                  c.borderLeft,
                ],
              };
            },
          ),
          blackBackings: [
            ...document.querySelectorAll(
              ".ko-board-slot,.ko-board-slot-wrapper,.ko-hand-card,.ko-hand-cards > :has(.ko-hand-card)",
            ),
          ].map((e) => getComputedStyle(e).backgroundColor),
          handTrackTop: getComputedStyle(
            document.querySelector(".ko-hand-cards"),
          ).top,
          questAbilityGap:
            document
              .querySelector(".ko-champion-ability")
              .getBoundingClientRect().top -
            document.querySelector(".ko-player-quest").getBoundingClientRect()
              .bottom,
          panelBorders: [
            ...document.querySelectorAll(
              ".ko-player-quest > div,.ko-opponent-quest > div,.ko-champion-ability,.ko-player-zones > *, .ko-opponent-zones > *,.ko-player-stats > div,.ko-opponent-stats > div,.ko-game-controls,.ko-player-hand",
            ),
          ].map((e) => {
            const c = getComputedStyle(e);
            return [c.borderTop, c.borderRight, c.borderBottom, c.borderLeft];
          }),
        };
      });
      assert.equal(x.scrollWidth, w);
      assert.equal(x.slots, 8);
      assert.ok(x.images.every((i) => i.loaded && i.fit === "contain"));
      if (theme === "new") {
        assert.equal(x.oldVeil, "none");
        assert.deepEqual(
          x.portraitFrames[0],
          x.portraitFrames[1],
          "Seat portrait boxes and all four borders match",
        );
        assert.ok(
          x.portraitFrames[0].borders.every(
            (b) => b === "1px solid rgb(185, 154, 96)",
          ),
        );
        assert.ok(
          x.blackBackings.every((c) => c === "rgb(0, 0, 0)"),
          "Opaque black under every card, including frame gaps",
        );
        assert.ok(
          x.panelBorders.every((bs) =>
            bs.every((b) => b === "1px solid rgb(185, 154, 96)"),
          ),
          "Panels have matching matte gold borders",
        );
        assert.equal(x.handTrackTop, "-8px");
        assert.ok(x.questAbilityGap >= 4, "Quest and ability do not overlap");
        assert.equal(x.oldAmbience, "none");
        assert.ok(/(?:svg|webp)/.test(x.wood));
        assert.ok(
          x.mats.every(
            (m) =>
              m.content === '""' &&
              m.pointerEvents === "none" &&
              m.image.includes("svg"),
          ),
        );
      }
      results.push({ viewport: [w, h], theme, ...x });
      await page.screenshot({
        path: `${out}/${theme}-${w}x${h}.png`,
        fullPage: true,
      });
      if (theme === "new") {
        await page.locator(".ko-hand-card").first().click();
        await page.waitForTimeout(300);
        const clearance = await page.evaluate(() => {
          const card = document
              .querySelector(".ko-hand-card--selected")
              .getBoundingClientRect(),
            mat = document
              .querySelector(".ko-player-hand")
              .getBoundingClientRect();
          return { top: card.top - mat.top, bottom: mat.bottom - card.bottom };
        });
        assert.ok(
          clearance.top >= 0 && clearance.bottom >= 0,
          "Selected hand card stays inside the scroll clip",
        );
        results.at(-1).selectedCardClearance = clearance;
        assert.ok(
          await page.locator(".ko-board-slot:not(.group)").evaluateAll((es) =>
            es.every((e) => {
              const c = getComputedStyle(e);
              return (
                c.backgroundColor === "rgb(0, 0, 0)" &&
                c.opacity === "1" &&
                c.borderTopWidth === "1px"
              );
            }),
          ),
          "Selectable empty slots remain opaque black behind their targeting outline",
        );
        if (w === 390)
          await page.screenshot({
            path: out + "/selected-hand-390x844.png",
            fullPage: true,
          });
        await open("new");
      }
      if (w === 390 && theme === "new") {
        await page.locator(".ko-player-champion").click();
        await page.getByRole("menu", { name: "챔피언 감정표현" }).waitFor();
        await page.screenshot({
          path: out + "/ability-emotes-390x844.png",
          fullPage: true,
        });
        await open("new");
        await page.evaluate(async () => {
          const { boardFixture, definitions } =
            await import("/qa/black-gold-fixture.ts");
          const state = boardFixture();
          state.players.forEach((p) => (p.board = [null, null, null, null]));
          window.dispatchEvent(
            new CustomEvent("ko-qa-load-state", {
              detail: { state, definitions },
            }),
          );
        });
        await page.waitForTimeout(200);
        assert.equal(
          await page.locator(".ko-board-slot:not(.group)").count(),
          8,
        );
        await page.screenshot({
          path: out + "/empty-390x844.png",
          fullPage: true,
        });
      }
    }
    const [fresh, classic] = results.slice(-2);
    assert.equal(fresh.handCard.w, classic.handCard.w, "Hand width unchanged");
    assert.equal(fresh.handCard.h, classic.handCard.h, "Hand height unchanged");
    await ctx.close();
  }
  assert.equal(errors.length, 0);
  assert.equal(missingArt.length, 0);
} finally {
  await browser.close();
  await writeFile(
    out + "/measurements.json",
    JSON.stringify({ results, errors, missingArt }, null, 2),
  );
}
console.log(
  JSON.stringify({
    viewportCount: 5,
    comparisonRenders: 10,
    errors,
    missingArt,
  }),
);
