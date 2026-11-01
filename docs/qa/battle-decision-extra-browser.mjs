import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const b = await chromium.launch(),
  out = "qa-results/battle-decision",
  results = [];
await mkdir(out, { recursive: true });
try {
  const p = await b.newPage({
      viewport: { width: 390, height: 844 },
    recordVideo: {dir:out+"/videos",size:{width:390,height:844}},
      hasTouch: true,
    }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/api/**", (r) =>
    r.fulfill({ json: { cards: [], frames: [] } }),
  );
  await p.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
  });
  await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
  await p.locator(".ko-game-shell").waitFor();
  await p
    .locator("[data-preview-tools]")
    .evaluate((n) => (n.style.display = "none"));
  await p.evaluate(async () => {
    const { boardFixture, definitions } =
      await import("/qa/black-gold-fixture.ts");
    const { generateCardInstance } = await import("/src/game/index.ts");
    const s = boardFixture();
    s.gameId = "decision-drag";
    s.events = [];
    s.players[0].board[0] = {
      ...s.players[0].board[0],
      enteredThisTurn: false,
      keywords: [],
      abilities: [],
      currentAttack: 5,
      attacksUsedThisTurn: 0,
    };
    s.players[1].board[0] = {
      ...s.players[1].board[0],
      keywords: [],
      abilities: [],
      currentHealth: 8,
    };
    s.players[0].hand = [
      generateCardInstance(
        definitions.find((d) => d.name === "봉인"),
        { instanceId: "decision-spell" },
      ),
    ];
    window.dispatchEvent(
      new CustomEvent("ko-qa-load-state", {
        detail: { state: s, definitions },
      }),
    );
  });
  const mine = p
      .locator(".ko-player-board-row [data-card-instance-id]")
      .first(),
    enemy = p.locator(".ko-opponent-board-row [data-card-instance-id]").first();
  await mine.click();
  const a = await mine.boundingBox(),
    t = await enemy.boundingBox();
  const original = await p.getByTestId("state-json").textContent();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await p.mouse.down();
  await p.mouse.move(a.x + a.width / 2, a.y - 20, { steps: 3 });
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 5 });
  await p.locator(".ko-attack-drag-ghost").waitFor();
  await p.getByTestId("attack-forecast").waitFor();
  const cloneSize = await p.locator(".ko-attack-drag-ghost").evaluate((n) => {
    const root = n.getBoundingClientRect(),
      frame = n.querySelector(".ko-card-frame").getBoundingClientRect();
    return { root: root.width, frame: frame.width };
  });
  assert.ok(cloneSize.frame <= cloneSize.root * 1.2, JSON.stringify(cloneSize));
  assert.ok(cloneSize.root <= a.width * 1.1, JSON.stringify(cloneSize));
  assert.equal(await p.getByTestId("state-json").textContent(), original);
  assert.equal(
    await p.locator(".ko-attack-aim line").evaluate((n) => n.style.opacity),
    "1",
  );
  await p.screenshot({ path: `${out}/drag-forecast-mobile.png` });
  await p.mouse.up();
  await p.getByTestId("preview-busy").filter({ hasText: "false" }).waitFor();
  assert.notEqual(await p.getByTestId("state-json").textContent(), original);
  await p.locator(".ko-hand-card").first().click();
  await p.getByRole("button", { name: "사용", exact: true }).click();
  await p.getByTestId("effect-target-focus").waitFor();
  assert.ok((await p.locator("[data-focus-target]").count()) > 0);
  assert.match(
    await p.getByTestId("battle-command-strip").innerText(),
    /대상 선택/,
  );
  await p.screenshot({ path: `${out}/target-focus-mobile.png` });
  await p
    .getByTestId("battle-command-strip")
    .getByRole("button", { name: "선택 취소" })
    .click();
  await p.getByTestId("effect-target-focus").waitFor({ state: "detached" });
  await p.evaluate(async () => {
    const { boardFixture, definitions } =
      await import("/qa/black-gold-fixture.ts");
    const s = boardFixture();
    s.gameId = "heal-log";
    s.events = [];
    s.players[0].health = 2;
    s.players[0].champion.health = 2;
    window.dispatchEvent(
      new CustomEvent("ko-qa-load-state", {
        detail: { state: s, definitions },
      }),
    );
  });
  await p.waitForTimeout(100);
  await p.evaluate(async () => {
    const { applyEffect } = await import("/src/game/index.ts");
    const s = JSON.parse(
      document.querySelector("[data-testid=state-json]").textContent,
    );
    const next = applyEffect(s, s.players[0].id, s.players[0].board[0], {
      type: "STRUCTURED",
      action: "HEAL",
      target: { zone: "PLAYER", owner: "SELF", selection: "ALL", count: 1 },
      values: { amount: 2 },
    });
    window.dispatchEvent(
      new CustomEvent("ko-qa-load-state", { detail: { state: next } }),
    );
  });
  await p.getByTestId('battle-event-caption').filter({hasText:'내 챔피언 체력 +2 회복'}).waitFor();
  await p.screenshot({path:`${out}/committed-healing-caption-mobile.png`});
  await p.getByTestId("button-battle-match-history").click();
  await p.getByRole("heading", { name: "확인한 챔피언 회복" }).waitFor();
  assert.match(await p.getByRole("dialog").innerText(), /나 \+2 · 1회/);
  await p.screenshot({ path: `${out}/healing-log-mobile.png` });
  await p.getByRole("button", { name: "경기 로그 닫기" }).click();
  await p.getByRole("button", { name: "설정 열기", exact: true }).click();
  const settings = p.getByRole("dialog", { name: "게임 설정" });
  await settings
    .getByRole("region", { name: "전투 연출 미리보기" })
    .scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${out}/settings-preview-mobile.png` });
  await settings.getByLabel("설정 닫기").click();
  assert.deepEqual(errors, []);
  results.push({
    attackDragForecastAndAimVisibleBeforeCommit: true,
    attackCommits: true,
    effectTargetsAndCancel: true,
    actualHealingRecorded: true,
    committedHealingCaption:true,
    errors,
  });
  await writeFile(
    `${out}/extra-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
