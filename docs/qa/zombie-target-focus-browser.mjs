import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/zombie-target-focus";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [740, 360],
    [1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (r) =>
      r.fulfill({ json: { cards: [], frames: [] } }),
    );
    await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await page.locator(".ko-game-shell").waitFor();
    await page
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    async function load(mode) {
      await page.evaluate(async (mode) => {
        const { boardFixture, definitions } =
          await import("/qa/black-gold-fixture.ts");
        const { generateCardInstance } = await import("/src/game/index.ts");
        const s = boardFixture();
        s.gameId = "focus-" + crypto.randomUUID();
        s.events = [];
        if (mode === "spell")
          s.players[0].hand = [
            generateCardInstance(
              definitions.find((c) => c.name === "봉인"),
              { instanceId: "focus-spell" },
            ),
          ];
        if (mode === "zombie") {
          const {
            championRecordToDefinition,
            createInitialGameState,
          } = await import("/src/game/index.ts");
          const cr =
            await import("/src/game/qa/fixtures/champions-2026-10-12-all.json");
          const hero = cr.default.find((c) => c.name === "챔피언 라 칼라베라");
          const z = definitions.find((c) => c.name === "좀비");
          const champs = [championRecordToDefinition(hero)];
          const fresh = createInitialGameState(
            [champs[0].id, champs[0].id],
            definitions,
            champs,
          );
          fresh.gameId = s.gameId;
          fresh.status = "IN_PROGRESS";
          fresh.turn = 3;
          fresh.activePlayerId = fresh.players[0].id;
          fresh.events = [];
          for (const p of fresh.players) {
            p.board = [null, null, null, null];
            p.currentGold = 10;
            p.champion.quest = null;
          }
          for (let i = 0; i < 3; i++)
            fresh.players[0].board[i] = {
              ...generateCardInstance(z, { instanceId: "z-" + i }),
              boardSlot: i,
            };
          window.dispatchEvent(
            new CustomEvent("ko-qa-load-state", {
              detail: { state: fresh, definitions },
            }),
          );
          return;
        }
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: s, definitions },
          }),
        );
      }, mode);
      await page.waitForTimeout(160);
    }
    await load("spell");
    await page.screenshot({ path: `${out}/normal-${width}.png` });
    const before = await page.getByTestId("state-json").textContent();
    await page.locator(".ko-hand-card").click({ position: { x: 18, y: 45 } });
    await page.getByRole("button", { name: "사용", exact: true }).click();
    await page.getByTestId("effect-target-focus").waitFor();
    assert.equal(
      await page
        .getByTestId("effect-target-focus")
        .evaluate((n) => getComputedStyle(n).pointerEvents),
      "none",
    );
    const ids = await page
      .getByTestId("state-json")
      .textContent()
      .then(JSON.parse)
      .then((s) => s.targetingState.validTargetIds);
    const holes = await page
      .locator("[data-focus-target]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-focus-target")),
      );
    assert.ok(holes.length > 0);
    assert.ok(holes.every((id) => ids.includes(id)));
    const target = page
      .locator(".ko-opponent-board-row .ko-board-slot")
      .first();
    const box = await target.boundingBox();
    const top = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest(".ko-board-slot") !== null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    assert.equal(top, true);
    await page.screenshot({ path: `${out}/selection-${width}.png` });
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(100);
    assert.equal(
      await page.getByTestId("effect-target-focus").getAttribute("viewBox"),
      `0 0 ${height} ${width}`,
    );
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    await page.getByRole("button", { name: "선택 취소", exact: true }).click();
    await page
      .getByTestId("effect-target-focus")
      .waitFor({ state: "detached" });
    assert.equal(await page.getByTestId("state-json").textContent(), before);
    await page.locator(".ko-hand-card").click({ position: { x: 18, y: 45 } });
    await page.getByRole("button", { name: "사용", exact: true }).click();
    await page.getByTestId("effect-target-focus").waitFor();
    const b = await target.boundingBox();
    await target.click({ position: { x: 18, y: b.height - 14 } });
    await page
      .getByTestId("effect-target-focus")
      .waitFor({ state: "detached" });
    await page.waitForFunction(
      () =>
        JSON.parse(
          document.querySelector("[data-testid=state-json]").textContent,
        ).players[0].hand.length === 0,
    );
    await load("zombie");
    const gold = await page
      .getByTestId("state-json")
      .textContent()
      .then(JSON.parse)
      .then((s) => s.players[0].currentGold);
    await page
      .getByTestId("preview-busy")
      .filter({ hasText: "false" })
      .waitFor();
    await page.locator(".ko-champion-ability").click();
    await page.waitForFunction(() =>
      JSON.parse(document.querySelector("[data-testid=state-json]").textContent)
        .players[0].board.filter(Boolean)
        .every((c) => c.currentAttack === 2),
    );
    const state = await page
      .getByTestId("state-json")
      .textContent()
      .then(JSON.parse);
    assert.equal(state.players[0].board.filter(Boolean).length, 3);
    assert.ok(state.players[0].currentGold < gold);
    await page.screenshot({ path: `${out}/all-zombies-${width}.png` });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      selectionDim: true,
      validHolesOnly: true,
      inputPassThrough: true,
      rotateAndCancel: true,
      actualSpell: true,
      actualChampionBuffAllThree: true,
      errors,
    });
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
