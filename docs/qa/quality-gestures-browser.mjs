import assert from "node:assert/strict";
import { chromium } from "./black-gold-playwright.mjs";
const browser = await chromium.launch();
try {
  const p = await browser.newPage({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    }),
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
  async function load() {
    await p.evaluate(async () => {
      const { boardFixture, definitions } =
        await import("/qa/black-gold-fixture.ts");
      const { generateCardInstance } = await import("/src/game/index.ts");
      const d = {
        ...definitions.find((c) => c.name === "리버덩크"),
        id: "qa-drag-source",
        name: "드래그 점검용 선수",
        rulesText: "좀비를 소환합니다.",
        abilities: [],
        contentRule: undefined,
      };
      const s = boardFixture();
      s.gameId = "gesture-stable";
      s.events = [];
      s.players[0].hand = [
        generateCardInstance(d, { instanceId: "gesture-card" }),
      ];
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", {
          detail: { state: s, definitions: [...definitions, d] },
        }),
      );
    });
    await p.waitForTimeout(200);
  }
  const c = await p.context().newCDPSession(p);
  async function start() {
    const link = p
      .locator(".ko-hand-card")
      .getByRole("button", { name: "좀비 정보 보기", exact: true });
    const a = await link.boundingBox(),
      r = await p
        .locator(".ko-player-board-row .ko-board-slot")
        .nth(2)
        .boundingBox();
    await c.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }],
    });
    await p.waitForTimeout(60);
    await c.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }],
    });
    await p.locator(".ko-card-drag-ghost").waitFor();
  }
  const state = () => p.getByTestId("state-json").textContent();
  await load();
  await start();
  await p.waitForTimeout(650);
  assert.equal(await p.locator("[data-card-rules-dialog]").count(), 0);
  await p.evaluate(() =>
    document.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: 999,
        isPrimary: false,
      }),
    ),
  );
  assert.equal(await p.locator(".ko-card-drag-ghost").count(), 1);
  await c.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await p.waitForFunction(
    () =>
      JSON.parse(document.querySelector("[data-testid=state-json]").textContent)
        .players[0].hand.length === 0,
  );
  await p.getByTestId("preview-busy").filter({ hasText: "false" }).waitFor();
  for (const change of ["blur", "turn", "invalidated"]) {
    await load();
    await start();
    if (change === "blur")
      await p.evaluate(() => window.dispatchEvent(new Event("blur")));
    else
      await p.evaluate((mode) => {
        const s = JSON.parse(
          document.querySelector("[data-testid=state-json]").textContent,
        );
        if (mode === "turn") s.turn += 2;
        else s.players[0].currentGold = 0;
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", { detail: { state: s } }),
        );
      }, change);
    const before = await state();
    await p.locator(".ko-card-drag-ghost").waitFor({ state: "detached" });
    await c.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert.equal(await state(), before);
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      longHoldDoesNotOpenDuringDrag: true,
      secondaryCancelIgnored: true,
      actualSummon: true,
      blurCancels: true,
      sameGameTurnChangeCancels: true,
      stateInvalidationCancels: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
