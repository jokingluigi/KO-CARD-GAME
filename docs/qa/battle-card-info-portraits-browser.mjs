import assert from "node:assert/strict";
import fs from "node:fs";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.KO_QA_CHROMIUM_EXECUTABLE,
});
const baseline = process.argv.includes("--baseline");
const output = "qa-results/battle-card-info-portraits";
fs.mkdirSync(output, { recursive: true });
const fixture = JSON.parse(
  fs.readFileSync("artifacts/ko-game/qa/retro-font/fixtures.json"),
);
const results = [];
try {
  for (const [width, height] of baseline
    ? [[390, 844]]
    : [
        [320, 740],
        [360, 740],
        [375, 812],
        [390, 844],
        [412, 915],
        [844, 390],
        [1440, 900],
      ]) {
    const mobile = width < 1000;
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: "reduce",
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.route("https://fonts.googleapis.com/**", (r) => r.abort());
    await page.route("**/api/**", (r) => {
      assert.equal(r.request().method(), "GET");
      return r.fulfill({ json: { cards: [], champions: [], frames: [] } });
    });
    await page.goto(
      (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5175") +
        "/qa/champion-features.html",
    );
    await page.getByTestId("state-json").waitFor({ state: "attached" });
    await page
      .getByTestId("board-check")
      .evaluate((e) => (e.parentElement.style.display = "none"));
    await page.evaluate(async (fixture) => {
      const { createInitialGameState, generateCardInstance } =
        await import("/src/game/index.ts");
      const d = {
        id: "inspection-portrait-test",
        name: "정보 검증 선수",
        cardType: "WRESTLER",
        rarity: "EPIC",
        cost: 1,
        attack: 3,
        health: 8,
        imageUrl: fixture.cards[0].previewImageUrl,
        rulesText: "상대 선수 1장에게 2 데미지.",
        keywords: [],
        abilities: [
          {
            trigger: "ENTER_FIELD",
            effects: [
              {
                type: "STRUCTURED",
                action: "DAMAGE",
                target: {
                  zone: "BOARD",
                  owner: "ENEMY",
                  selection: "PLAYER_CHOICE",
                  count: 1,
                },
                values: { amount: 2 },
              },
            ],
          },
        ],
        isToken: false,
        isChampionToken: false,
      };
      const s = createInitialGameState(undefined, [d]);
      s.status = "IN_PROGRESS";
      s.turn = 3;
      s.activePlayerId = "player-1";
      s.events = [];
      s.cardPool = [d];
      for (const [i, p] of s.players.entries()) {
        p.health = 20;
        p.currentGold = 6;
        p.hand = [];
        p.graveyard = [];
        p.board = [null, null, null, null];
        p.deck = Array.from({ length: 20 }, (_, n) =>
          generateCardInstance(d, { instanceId: p.id + "-deck-" + n }),
        );
        p.champion.name = fixture.champions[i].name;
        p.champion.imageUrl = fixture.champions[i].previewImageUrl;
        p.champion.imageDisplayMode = "CONTAIN";
        p.champion.imageScale = 0.7;
        p.champion.imagePositionX = 50;
        p.champion.imagePositionY = 50;
        p.champion.quest = {
          id: "inspect-quest",
          name: "선수 소환",
          description: "선수 카드를 7번 소환합니다.",
          trackedEvent: "CARD_PLAYED",
          requiredProgress: 7,
          reward: { type: "GAIN_GOLD", amount: 1 },
        };
        p.champion.questProgress = 0;
        p.champion.questCompleted = false;
        p.board[0] = {
          ...generateCardInstance(d, { instanceId: p.id + "-board" }),
          boardSlot: 0,
          enteredThisTurn: false,
          hasAttackedThisTurn: false,
        };
      }
      s.players[0].hand = [
        generateCardInstance(d, { instanceId: "inspection-hand" }),
      ];
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: s, definitions: [d] },
        }),
      );
    }, fixture);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const activate = (locator) => (mobile ? locator.tap() : locator.click());
    const inspect = page.getByRole("complementary", {
      name: "상세정보",
      exact: true,
    });
    if (mobile)
      await activate(
        page.locator(".ko-player-board-row .ko-board-inspect-button"),
      );
    else {
      await page.keyboard.press("Alt");
      await page.locator(".ko-player-board-row .ko-board-slot").first().hover();
    }
    if (baseline) {
      await page.waitForTimeout(300);
      assert.equal(
        await page
          .getByRole("dialog")
          .filter({ hasText: "풀 일러스트" })
          .count(),
        1,
        "Expected original information tap to fall through into full artwork",
      );
      await page.screenshot({
        path: output + "/before-info-click-through.png",
        fullPage: true,
      });
      console.log("REPRODUCED original info tap opened full artwork");
      await context.close();
      continue;
    }
    await inspect.waitFor();
    assert.equal(
      await page.getByRole("dialog").count(),
      0,
      "Information action must not open artwork",
    );
    assert.match(
      await inspect.getByTestId("inspector-card-rules").textContent(),
      /相|상대 선수 1장에게 2/,
    );
    assert.match(await inspect.textContent(), /공격력/);
    await activate(
      inspect.getByRole("button", {
        name: "정보 검증 선수 풀 일러스트 보기",
        exact: true,
      }),
    );
    const art = page.getByRole("dialog").filter({ hasText: "풀 일러스트" });
    await art.waitFor();
    assert.equal(
      await art
        .locator("img")
        .evaluate((e) => e.complete && e.naturalWidth > 0),
      true,
    );
    await page.keyboard.press("Escape");
    await art.waitFor({ state: "hidden" });
    if (await inspect.isVisible())
      await activate(
        inspect.getByRole("button", { name: "상세정보 닫기", exact: true }),
      );
    if (!mobile) await page.keyboard.press("Alt");
    if (mobile) {
      await activate(page.locator(".ko-player-hand .ko-hand-inspect-button"));
      await inspect.waitFor();
      assert.equal(await page.getByRole("dialog").count(), 0);
      await activate(
        inspect.getByRole("button", { name: "상세정보 닫기", exact: true }),
      );
    }
    for (const side of ["player", "opponent"]) {
      const portrait = page.locator(".ko-" + side + "-champion");
      const box = await portrait.boundingBox();
      assert.ok(
        box.width >= 72 && box.height >= 84,
        JSON.stringify({ side, width, height, box }),
      );
      assert.equal(
        (await portrait.textContent()).trim(),
        "",
        "Champion names must not cover the portrait",
      );
      const image = await portrait.locator("img").evaluate((e) => ({
        loaded: e.complete && e.naturalWidth > 0,
        fit: getComputedStyle(e).objectFit,
        transform: getComputedStyle(e).transform,
      }));
      assert.equal(image.loaded, true);
      assert.equal(image.fit, "cover");
      assert.equal(
        image.transform,
        "matrix(1.35, 0, 0, 1.35, 0, 0)",
        "Small administrator artwork scale must not leave an undersized portrait",
      );
    }
    const state = async () =>
      JSON.parse(await page.getByTestId("state-json").textContent());
    const ally = page
      .locator(".ko-player-board-row")
      .getByRole("button", { name: "정보 검증 선수", exact: true });
    await activate(ally);
    assert.equal(
      await inspect.count(),
      0,
      "Ordinary card tap keeps attack selection",
    );
    assert.equal(await art.count(), 0);
    await activate(
      page
        .locator(".ko-opponent-board-row")
        .getByRole("button", { name: "정보 검증 선수", exact: true }),
    );
    assert.equal(
      (await state()).players[1].board[0].currentHealth,
      5,
      "Ordinary tap must still attack",
    );
    await activate(
      page
        .locator(".ko-player-hand")
        .getByRole("button", { name: "정보 검증 선수", exact: true }),
    );
    await activate(
      page.getByRole("button", { name: "2구역에 카드 배치", exact: true }),
    );
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector("[data-testid=state-json]").textContent,
        ).targetingState?.active,
    );
    await activate(
      page
        .locator(".ko-opponent-board-row")
        .getByRole("button", { name: "정보 검증 선수", exact: true }),
    );
    assert.equal(
      (await state()).players[1].board[0].currentHealth,
      3,
      "Effect target selection must remain usable",
    );
    assert.equal((await state()).targetingState?.active ?? false, false);
    await page.locator(".ko-player-champion").scrollIntoViewIfNeeded();
    await activate(page.locator(".ko-player-champion"));
    const emotes = page.getByRole("menu", { name: "챔피언 감정표현" });
    await emotes.waitFor();
    const emoteBox = await emotes.boundingBox();
    assert.ok(
      emoteBox.x >= 0 &&
        emoteBox.x + emoteBox.width <= width + 1 &&
        emoteBox.y >= 0 &&
        emoteBox.y + emoteBox.height <= height + 1,
    );
    await activate(emotes.getByRole("menuitem").first());
    const viewport = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      scale: visualViewport.scale,
    }));
    assert.ok(viewport.scroll <= width + 1);
    assert.equal(viewport.scale, 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: output + `/battle-${width}x${height}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      status: "PASS",
      portraitNamesRemoved: true,
      infoThenArtwork: true,
      attackAndTargetingPreserved: true,
      emotesReachable: true,
    });
    console.log("PASS " + width + "x" + height);
    await context.close();
  }
  if (!baseline)
    fs.writeFileSync(
      output + "/results.json",
      JSON.stringify(
        { results, physicalPhone: "NOT_RUN", operationalWrites: false },
        null,
        2,
      ),
    );
} finally {
  await browser.close();
}
