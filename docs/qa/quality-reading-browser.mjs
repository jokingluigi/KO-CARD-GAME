/** Actual AI entry + shared battle components; controlled reorder additionally uses existing QA state harness. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
const {
  createInitialGameState,
  startGame,
  cardRecordToDefinition,
  championRecordToDefinition,
  generateCardInstance,
} = await import("../../lib/game-engine/src/index.ts");
const catalog = JSON.parse(
    await readFile("artifacts/ko-game/public/tutorial-catalog.json", "utf8"),
  ),
  base = JSON.parse(
    await readFile("artifacts/ko-game/qa/art-direction-data.json", "utf8"),
  );
const cardRecords = [
    ...new Map(
      [...base.cards.cards, ...catalog.cards].map((c) => [
        c.id,
        { ...c, status: "PUBLISHED" },
      ]),
    ).values(),
  ],
  championRecords = base.champions.champions.map((c) => ({
    ...c,
    status: "PUBLISHED",
  }));
const defs = cardRecords.map(cardRecordToDefinition),
  champions = championRecords.map(championRecordToDefinition),
  token = defs.find((d) => d.rarity === "CHAMPION" && d.isChampionToken),
  normal = defs.find(
    (d) => d.cardType === "WRESTLER" && !d.isToken && !d.isChampionToken,
  );
assert.ok(token && normal);
const out = process.env.KO_QUALITY_READING_OUT ?? "qa-results/quality-reading",
  origin = process.env.KO_UI_ORIGIN ?? "http://127.0.0.1:5186";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
        ignoreHTTPSErrors: true,
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const fixture = await auditSetup(p);
    const readerSkin = {
      id: "reader-fixture-skin",
      type: "CARD_SKIN",
      targetId: token.id,
      name: "Reader fixture",
      imageAssets: { art: "/qa/retro-font/assets/card-latest-wrestler-10.png" },
      isActive: true,
      sortOrder: 0,
    };
    await p.route("**/api/cosmetics", (r) =>
      r.fulfill({
        json: {
          owned: [{ item: readerSkin }],
          loadout: {
            skins: { ["card:" + token.id]: readerSkin },
            cardBack: null,
            emotes: [],
          },
        },
      }),
    );
    await p.addInitScript(() =>
      localStorage.setItem(
        "ko-combat-presentation-v1",
        JSON.stringify({ detailTextScale: 1.3, reducedMotion: true }),
      ),
    );
    await p.route("**/api/cards", (r) =>
      r.fulfill({ json: { cards: cardRecords } }),
    );
    await p.route("**/api/champions", (r) =>
      r.fulfill({ json: { champions: championRecords } }),
    );
    await p.route("**/api/daily-quests/ai-match-start", (r) => {
      const request = r.request().postDataJSON();
      const s = startGame(
        createInitialGameState(
          [champions[0].id, champions[0].id],
          defs,
          champions,
          undefined,
          { gameId: request.matchId, randomSeed: 2 },
        ),
        () => 0.5,
      );
      s.status = "IN_PROGRESS";
      s.activePlayerId = s.players[0].id;
      s.players.forEach((x) => (x.mulliganUsed = true));
      s.players[0].hand = [
        {...generateCardInstance(token, { instanceId: "read-token" }),isChampionToken:false},
        generateCardInstance(normal, { instanceId: "read-normal" }),
      ];
      return r.fulfill({ json: { state: s, difficulty: "NORMAL" } });
    });
    await p.goto(origin + "/ai-match");
    await p
      .locator(".ko-game-shell")
      .waitFor()
      .catch(async (error) => {
        console.log((await p.locator("body").innerText()).slice(0, 1400));
        throw error;
      });
    await p.getByRole("button", { name: "설정 열기", exact: true }).click();
    await p.getByRole("button", { name: /손패 크게 읽기/ }).click();
    const reader = p.getByRole("dialog", { name: "손패 읽기", exact: true });
    await reader.waitFor();
    const ruleBounds=await reader.getByTestId('silence-immunity-notice').boundingBox();assert.ok(ruleBounds.y>=0&&ruleBounds.y+ruleBounds.height<=height,'hand-reader protection visible without scrolling');
    await reader.locator("img").first().waitFor();
    assert.equal(
      await reader.locator("img").first().getAttribute("src"),
      readerSkin.imageAssets.art,
    );
    await reader
      .getByRole("heading", { name: token.name, exact: true })
      .waitFor();
    assert.ok(
      await reader
        .getByTestId("silence-immunity-notice")
        .locator("p")
        .first()
        .evaluate((n) => parseFloat(getComputedStyle(n).fontSize) >= 18),
    );
    assert.ok(
      await reader
        .locator(".ko-readable-content")
        .evaluate((n) => parseFloat(getComputedStyle(n).fontSize) >= 20),
    );
    await p.screenshot({
      path: `${out}/actual-ai-reader-${width}x${height}.png`,
    });
    await reader.getByRole("button", { name: "다음", exact: true }).click();
    assert.equal(
      await reader.getByTestId("silence-immunity-notice").count(),
      0,
    );
    await reader.getByRole("button", { name: "이전", exact: true }).click();
    await reader.getByTestId("silence-immunity-notice").waitFor();
    results.push({
      width,
      height,
      actualAIEntry: true,
      tokenRuleInHandReader: true,
      protectionVisibleWithoutScrolling:true,
      readingScale130: true,
      selectedSkinInReader: true,
      legacyTokenFlagDoesNotHideSkin:true,
      ordinaryCardNotMislabelled: true,
      errors,
    });
    assert.deepEqual(errors, []);
    await p.context().close();
  }
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.route("**/api/**", (r) =>
    r.fulfill({ json: { cards: [], frames: [] } }),
  );
  await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
  await p.locator(".ko-game-shell").waitFor();
  await p
    .locator("[data-preview-tools]")
    .evaluate((n) => (n.style.display = "none"));
  await p.getByRole("button", { name: "설정 열기", exact: true }).click();
  await p.getByRole("button", { name: /손패 크게 읽기/ }).click();
  const reader = p.getByRole("dialog", { name: "손패 읽기", exact: true });
  const initialName = await reader.locator("h3").textContent();
  await p.evaluate(() => {
    const s = JSON.parse(
      document.querySelector("[data-testid=state-json]").textContent,
    );
    s.players[0].hand.unshift({
      ...s.players[0].hand[0],
      instanceId: "inserted-" + crypto.randomUUID(),
    });
    window.dispatchEvent(
      new CustomEvent("ko-qa-load-state", { detail: { state: s } }),
    );
  });
  await p.waitForTimeout(80);
  assert.equal(await reader.locator("h3").textContent(), initialName);
  await reader.getByRole("button", { name: "다음", exact: true }).click();
  const name = await reader.locator("h3").textContent();
  await p.evaluate(() => {
    const s = JSON.parse(
      document.querySelector("[data-testid=state-json]").textContent,
    );
    s.players[0].hand.unshift({
      ...s.players[0].hand[0],
      instanceId: "inserted-" + crypto.randomUUID(),
    });
    window.dispatchEvent(
      new CustomEvent("ko-qa-load-state", { detail: { state: s } }),
    );
  });
  await p.waitForTimeout(80);
  assert.equal(await reader.locator("h3").textContent(), name);
  results.push({
    controlledStateHarness: true,
    readerKeepsSelectedInstanceOnReorder: true,
  });
  await p.context().close();
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
