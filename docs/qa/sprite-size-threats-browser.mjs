import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/sprite-size-threats";
await mkdir(out, { recursive: true });
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
);
const place = { scale: 1, x: 50, y: 40, crop: false, flip: false };
const config = {
  version: 1,
  frames: Object.fromEntries(
    ["default", "surprised"].map((k) => [
      k,
      {
        url: "/api/storage/objects/uploads/cosmetics/size-" + k + ".png",
        self: { ...place },
        opponent: { ...place },
      },
    ]),
  ),
  reactions: {},
};
const saved = { config: structuredClone(config), revision: "qa-1" };
const b = await chromium.launch();
const results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const ctx = await b.newContext({
      viewport: { width, height },
      hasTouch: width === 390,
      reducedMotion: "reduce",
    });
    const p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      const image = path.match(/size-(default|surprised)\.png/);
      if (image)
        return r.fulfill({
          body: await readFile(
            "qa-results/final-ten-sprites/fixtures/" + image[1] + ".png",
          ),
          contentType: "image/png",
        });
      if (path.endsWith("/auth/me") || path.endsWith("/admin/session"))
        return r.fulfill({
          json: {
            authenticated: true,
            user: {
              id: "qa-size-admin",
              nickname: "QA",
              role: "ADMIN",
              email: "qa@size.invalid",
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
      if (path.startsWith("/api/admin/battle-sprites")) {
        if (r.request().method() === "PATCH") {
          saved.config = r.request().postDataJSON().sprite;
          saved.revision = "qa-" + Date.now();
          return r.fulfill({ json: saved });
        }
        return r.fulfill({
          json: {
            targets: [
              {
                key: "default:qa-champion",
                kind: "default",
                id: "qa-champion",
                championId: "qa-champion",
                championName: "QA 크기 검증",
                name: "기본 외형",
                imageUrl: null,
                ...saved,
              },
            ],
          },
        });
      }
      if (path === "/api/minion-a/cards")
        return r.fulfill({ json: { definitions: [] } });
      if (path.includes("/champions"))
        return r.fulfill({ json: { champions } });
      if (path.includes("/cards")) return r.fulfill({ json: { cards } });
      return r.fulfill({
        json: {
          cards: [],
          champions: [],
          frames: [],
          items: [],
          notices: [],
          media: [],
        },
      });
    });
    await p.goto("http://127.0.0.1:5186/admin/battle-sprites");
    const input = () => p.getByLabel("스프라이트 크기 퍼센트", { exact: true });
    await input()
      .waitFor()
      .catch(async (e) => {
        console.log(
          "ADMIN",
          errors,
          (await p.locator("body").innerText()).slice(0, 2000),
        );
        await p.screenshot({ path: out + "/failure.png" });
        throw e;
      });
    async function percent(n) {
      await input().fill(String(n));
      await input().blur();
      assert.equal(await input().inputValue(), String(n));
    }
    assert.equal(
      await p.locator(".ko-sprite-frame-preview .ko-portrait-rim").count(),
      1,
    );
    await percent(250);
    await p
      .getByRole("button", { name: "스프라이트 10% 축소", exact: true })
      .click();
    assert.equal(await input().inputValue(), "240");
    await p
      .getByRole("button", { name: "스프라이트 10% 확대", exact: true })
      .click();
    assert.equal(await input().inputValue(), "250");
    assert.ok(
      await p
        .locator('img[alt="상태·반응 미리보기"]')
        .evaluate((n) => n.style.transform === "scale(2.5)"),
    );
    await p
      .getByRole("button", { name: "스프라이트 저장", exact: true })
      .click();
    await p
      .getByText("스프라이트 설정을 저장했습니다.", { exact: true })
      .waitFor();
    await p.reload();
    await input().waitFor();
    assert.equal(await input().inputValue(), "250");
    await p.getByRole("button", { name: "100% 초기화", exact: true }).click();
    assert.equal(await input().inputValue(), "100");
    await percent(50);
    await percent(300);
    await p
      .getByRole("button", { name: "양쪽 위치에 배율 적용", exact: true })
      .click();
    await p
      .getByRole("button", { name: "스프라이트 저장", exact: true })
      .click();
    await p
      .getByText("스프라이트 설정을 저장했습니다.", { exact: true })
      .waitFor();
    assert.equal(saved.config.frames.default.self.scale, 3);
    assert.equal(saved.config.frames.default.opponent.scale, 3);
    assert.equal(saved.config.frames.surprised.self.scale, 1);
    await p.screenshot({ path: `${out}/admin-${width}.png`, fullPage: true });
    await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await p.locator(".ko-game-shell").waitFor();
    await p
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    await p.evaluate(async (config) => {
      const { boardFixture } = await import("/qa/black-gold-fixture.ts");
      const { generateCardInstance, executeAction } =
        await import("/src/game/index.ts");
      window.__threatLoad = (mode) => {
        const s = boardFixture();
        s.gameId = "size-" + crypto.randomUUID();
        s.status = "IN_PROGRESS";
        s.activePlayerId = "player-2";
        s.turn = 4;
        s.events = [];
        const d = {
          id: "qa-threat",
          name: "QA threat",
          cardType: mode === "spell" ? "TECHNIQUE" : "WRESTLER",
          cost: mode === "cost" || mode === "spell" ? 6 : 1,
          attack: 2,
          health: 3,
          rarity: mode === "legend" ? "LEGENDARY" : "NORMAL",
          isChampionToken: mode === "token",
          keywords: [],
          abilities: [],
          rulesText: "",
        };
        s.cardPool = [d];
        const cosmetics = {};
        for (const pl of s.players) {
          pl.hand = [];
          pl.board = [null, null, null, null];
          pl.health = 20;
          pl.currentGold = 10;
          pl.champion.quest = null;
          pl.champion.questCompleted = false;
          cosmetics[pl.id] = {
            cardBack: null,
            emotes: [null, null, null, null],
            skins: {
              ["champion:" + pl.champion.id]: {
                id: "size-selected-" + pl.id,
                type: "CHAMPION_SKIN",
                targetId: pl.champion.id,
                name: "QA size skin",
                isActive: true,
                sortOrder: 0,
                imageAssets: { __battle: JSON.stringify(config) },
              },
            },
          };
        }
        s.players[1].hand = [
          generateCardInstance(d, { instanceId: "threat-instance" }),
        ];
        window.__before = s;
        window.__playThreat = () => {
          let n;
          if (mode === "quest") {
            n = structuredClone(s);
            n.players[1].champion.questCompleted = true;
            n.events.push({
              type: "CHAMPION_QUEST_COMPLETED",
              playerId: "player-2",
            });
          } else {
            const r = executeAction(s, {
              type: mode === "spell" ? "PLAY_TECHNIQUE" : "PLAY_WRESTLER",
              playerId: "player-2",
              cardInstanceId: "threat-instance",
              ...(mode === "spell" ? {} : { boardSlot: 0 }),
            });
            if (!r.success) throw Error(r.message);
            n = r.state;
          }
          window.dispatchEvent(
            new CustomEvent("ko-qa-load-state", {
              detail: { state: n, definitions: [d], cosmetics },
            }),
          );
        };
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: s, definitions: [d], cosmetics },
          }),
        );
      };
    }, saved.config);
    const own = p.locator(".ko-player-champion .ko-battle-actor"),
      enemy = p.locator(".ko-opponent-champion .ko-battle-actor");
    for (const mode of [
      "normal",
      "legend",
      "token",
      "cost",
      "spell",
      "quest",
    ]) {
      await p.evaluate((m) => window.__threatLoad(m), mode);
      await own.locator("img").waitFor();
      assert.equal(
        await own
          .locator(".ko-battle-actor__body img")
          .evaluate((n) => n.style.transform),
        "scale(3)",
      );
      assert.equal(
        await enemy
          .locator(".ko-battle-actor__body")
          .evaluate((n) => n.style.transform),
        "scaleX(-1)",
      );
      await p.evaluate(() => window.__playThreat());
      if (mode === "normal") {
        await p.waitForTimeout(100);
        assert.equal(await own.getAttribute("data-reaction"), "IDLE");
      } else {
        await p.waitForFunction(
          () =>
            document
              .querySelector(".ko-player-champion .ko-battle-actor")
              ?.getAttribute("data-reaction") === "ALLY_RETIRED",
        );
        await own.locator('img[src*="size-surprised"]').first().waitFor();
        assert.equal(
          await own
            .locator(".ko-battle-actor__body img")
            .evaluate((n) => n.style.transform),
          "scale(1)",
        );
        if (mode === "legend")
          await p.screenshot({ path: `${out}/surprise-${width}.png` });
        await p.waitForFunction(
          () =>
            document
              .querySelector(".ko-player-champion .ko-battle-actor")
              ?.getAttribute("data-reaction") === "IDLE" &&
            document.querySelector(
              ".ko-player-champion .ko-battle-actor__body img",
            )?.style.transform === "scale(3)",
        );
        assert.equal(
          await own
            .locator(".ko-battle-actor__body img")
            .evaluate((n) => n.style.transform),
          "scale(3)",
        );
      }
    }
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      adminMockSaveReload: true,
      scale50to300: true,
      battleScale300: true,
      opponentAutomaticFlip: true,
      opponentThreats: ["legend", "token", "cost", "spell", "quest"],
      ordinarySummonIgnored: true,
      physicalDevice: false,
    });
    console.log("PASS " + width);
    await ctx.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
} finally {
  await b.close();
}
