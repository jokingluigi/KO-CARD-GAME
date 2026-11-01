import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const browser = await chromium.launch(),
  out = "qa-results/battle-decision",
  results = [];
await mkdir(out, { recursive: true });
try {
  for (const [width, height] of [
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
    [740, 360],
    [1440, 900],
  ]) {
    const page = await browser.newPage({
        viewport: { width, height },
        hasTouch: width < 768,
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("ko-controls-hint-v1", "done");
      HTMLMediaElement.prototype.play = function () {
        window.__soundCount = (window.__soundCount ?? 0) + 1;
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function () {};
    });
    await page.route("**/api/**", (r) =>
      r.fulfill({ json: { cards: [], frames: [] } }),
    );
    await page.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
    await page.locator(".ko-game-shell").waitFor();
    await page
      .locator("[data-preview-tools]")
      .evaluate((n) => (n.style.display = "none"));
    const load = () =>
      page.evaluate(async () => {
        const { boardFixture, definitions } =
          await import("/qa/black-gold-fixture.ts");
        const s = boardFixture();
        s.events = [];
        s.players[0].board[0] = {
          ...s.players[0].board[0],
          currentAttack: 5,
          currentHealth: 5,
          enteredThisTurn: false,
          attacksUsedThisTurn: 0,
          abilities: [],
          keywords: [],
        };
        s.players[1].board[0] = {
          ...s.players[1].board[0],
          currentAttack: 2,
          currentHealth: 4,
          abilities: [],
          keywords: [],
        };
        window.dispatchEvent(
          new CustomEvent("ko-qa-load-state", {
            detail: { state: s, definitions },
          }),
        );
      });
    await load();
    await page.waitForTimeout(150);
    const state = () => page.getByTestId("state-json").textContent();
    const mine = page
        .locator(".ko-player-board-row [data-card-instance-id]")
        .first(),
      enemy = page
        .locator(".ko-opponent-board-row [data-card-instance-id]")
        .first();
    await mine.click();
    const command = page.getByTestId("battle-command-strip");
    await command.getByRole("button", { name: "공격 결과 미리보기" }).waitFor();
    const before = await state();
    await enemy.hover();
    await page.getByTestId("attack-forecast").waitFor();
    assert.match(
      await page.getByTestId("attack-forecast").innerText(),
      /기본 피해 5 · 반격 2/,
    );
    await command.getByRole("button", { name: "공격 결과 미리보기" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "기본 교환 예상" }).waitFor();
    assert.match(await dialog.innerText(), /승패를 확정하는 표시가 아닙니다/);
    assert.equal(await state(), before);
    await page.screenshot({
      path: `${out}/forecast-${width}.png`,
      animations: "disabled",
    });
    await dialog
      .getByRole("button", { name: "닫기", exact: true })
      .first()
      .click();
    await command.getByRole("button", { name: "선택 취소" }).click();
    // Unavailable hand action shows a reason at that card, without spending.
    await page.evaluate(() => {
      const s = JSON.parse(
        document.querySelector("[data-testid=state-json]").textContent,
      );
      s.players[0].currentGold = 0;
      window.dispatchEvent(
        new CustomEvent("ko-qa-load-state", { detail: { state: s } }),
      );
    });
    await page.waitForTimeout(100);
    const noGold = await state();
    await page.locator(".ko-hand-card").first().click();
    await page.getByTestId("local-action-reason").waitFor();
    assert.match(
      await page.getByTestId("local-action-reason").innerText(),
      /골드/,
    );
    assert.equal(await state(), noGold);
    const reason = await page.getByTestId("local-action-reason").boundingBox();
    assert.ok(
      reason.x >= 0 &&
        reason.y >= 0 &&
        reason.x + reason.width <= width + 1 &&
        reason.y + reason.height <= height + 1,
    );
    await page.screenshot({
      path: `${out}/reason-${width}.png`,
      animations: "disabled",
    });
    // Real engine action creates the grouped history.
    await load();
    await page.waitForTimeout(100);
    await mine.click();
    await enemy.click();
    await page
      .getByTestId("preview-busy")
      .filter({ hasText: "false" })
      .waitFor();
    await page.getByTestId("button-battle-match-history").click();
    await page
      .getByRole("heading", { name: "경기 기록", exact: true })
      .waitFor();
    const group = page
      .locator("[data-history-group]")
      .filter({ hasText: "피해 합계" })
      .first();
    await group.locator("summary").click();
    assert.match(await group.innerText(), /피해/);
    assert.ok((await group.locator("li").count()) >= 2);
    await page.screenshot({
      path: `${out}/history-${width}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "경기 로그 닫기" }).click();
    // Preview changes cannot mutate the battle, autoplay audio, or move board hitboxes.
    await page.getByRole("button", { name: "설정 열기", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "게임 설정" });
    await settings.waitFor();
    const preview = settings.getByRole("region", {
      name: "전투 연출 미리보기",
    });
    const battleBefore = await state();
    await preview.getByRole("button", { name: /타격·소리 재생/ }).click();
    await page.waitForTimeout(350);
    const sounds = await page.evaluate(() => window.__soundCount ?? 0);
    assert.ok(sounds > 0);
    await settings.getByLabel("카메라 줌", { exact: true }).selectOption("0");
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__soundCount ?? 0), sounds);
    await settings.getByLabel("평상시 반복 강조 줄이기").uncheck();
    assert.equal(
      await page.locator(".ko-game-shell").getAttribute("data-quiet-board"),
      "false",
    );
    assert.equal(await state(), battleBefore);
    await settings.getByLabel("설정 닫기").click();
    assert.equal(
      await page.locator("[data-testid=combat-settings-preview]").count(),
      0,
    );
    assert.deepEqual(errors, []);
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      inner: innerHeight,
      width: document.documentElement.scrollWidth,
    }));
    assert.ok(dimensions.scroll <= height + 2);
    assert.ok(dimensions.width <= width + 2);
    results.push({
      width,
      height,
      forecastReadOnly: true,
      reasonAnchored: true,
      engineAttackAndGroupedLog: true,
      previewUsesCurrentSettings: true,
      settingsChangeSilent: true,
      quietPreference: true,
      noPageScroll: true,
      errors,
    });
    await page.close();
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
