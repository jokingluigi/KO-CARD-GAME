import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const b = await chromium.launch(),
  out = "qa-results/quality-guidance",
  results = [];
await mkdir(out, { recursive: true });
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [740, 360],
    [1440, 900],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", (r) => {
      const path = new URL(r.request().url()).pathname;
      let json = {};
      if (path.endsWith("/auth/me"))
        json = {
          authenticated: true,
          user: {
            id: "guide",
            nickname: "Guide",
            role: "USER",
            currencyBalance: 0,
            prismBalance: 0,
          },
        };
      else if (path.endsWith("/server-status"))
        json = { enabled: false, allowed: true };
      else if (path.endsWith("/cards")) json = { cards: [] };
      else if (path.endsWith("/champions")) json = { champions: [] };
      else if (path.endsWith("/decks")) json = { decks: [] };
      return r.fulfill({ json });
    });
    await p.goto("http://127.0.0.1:5186/");
    const trigger = p.getByTestId("button-main-menu-튜토리얼");
    await trigger.click();
    const dialog = p.getByRole("dialog");
    await dialog.waitFor();
    for (let i = 0; i < 10; i++) {
      await p.keyboard.press("Tab");
      assert.equal(
        await dialog.evaluate((n) => n.contains(document.activeElement)),
        true,
      );
    }
    await p.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await trigger.click();
    let active = false,
      turn = false;
    for (let i = 0; i < 8; i++) {
      const text = await dialog.innerText();
      active ||= text.includes("필드에 있는 동안 총 1회");
      turn ||= text.includes("표시된 한 턴 전체에서 최대 2회");
      if (text.includes("액티브는 총 1회"))
        await p.screenshot({
          path: `${out}/tutorial-${width}.png`,
          animations: "disabled",
        });
      await dialog
        .getByRole("button", { name: i === 7 ? "완료" : "다음", exact: true })
        .click();
    }
    await dialog.waitFor({ state: "detached" });
    assert.equal(active, true);
    assert.equal(turn, true);
    assert.equal(await p.evaluate(() => scrollY), 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      focusTrapped: true,
      escapeCloses: true,
      eightSteps: true,
      lifetimeActiveAndPairedTurnExplained: true,
      noHomeScroll: true,
      errors,
    });
    await p.close();
  }
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.route("**/api/**", (r) =>
    r.fulfill({ json: { cards: [], frames: [] } }),
  );
  await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
  await p.locator(".ko-game-shell").waitFor();
  await p
    .locator("[data-preview-tools]")
    .evaluate((n) => (n.style.display = "none"));
  await p.evaluate(async () => {
    const { boardFixture, definitions } =
      await import("/qa/black-gold-fixture.ts");
    const { generateCardInstance, executeAction, applyEffect } =
      await import("/src/game/index.ts");
    let s = boardFixture();
    s.events = [];
    s.turn = 3;
    s.players[0].champion.questCompleted = true;
    s.players[0].champion.upgradedAbility = {
      ...s.players[0].champion.ability,
      cost: 3,
    };
    s.players[0].currentGold = 2;
    const z = definitions.find((c) => c.name === "좀비");
    s.players[0].board[0] = {
      ...generateCardInstance(z, { instanceId: "trace-z" }),
      boardSlot: 0,
    };
    const d = {
      ...z,
      id: "trace-victim",
      name: "검증 선수",
      isToken: false,
      abilities: [],
      rulesText: "",
    };
    const victim = {
      ...generateCardInstance(d, { instanceId: "trace-v" }),
      boardSlot: 3,
    };
    s.cardPool = [...definitions, d];
    s.players[0].board[3] = victim;
    s = applyEffect(s, "player-1", victim, {
      type: "STRUCTURED",
      action: "RETIRE",
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
    });
    s = applyEffect(s, "player-1", s.players[0].board[0], {
      type: "STRUCTURED",
      action: "SUMMON",
      values: { definitionRef: { id: z.id }, count: 1 },
    });
    window.dispatchEvent(
      new CustomEvent("ko-qa-load-state", {
        detail: { state: s, definitions: s.cardPool },
      }),
    );
  });
  await p.waitForTimeout(200);
  assert.match(await p.locator(".ko-ability-cost").textContent(), /3 골드/);
  assert.equal(
    await p.locator(".ko-champion-ability").getAttribute("aria-disabled"),
    "true",
  );
  await p.keyboard.press("Alt");
  await p.waitForTimeout(50);
  await p.locator(".ko-player-ability").hover();
  await p
    .locator('aside[aria-label="상세정보"]')
    .getByText("비용 3 골드", { exact: true })
    .waitFor();
  await p.keyboard.press("Escape");
  await p
    .locator('aside[aria-label="상세정보"]')
    .waitFor({ state: "detached" });
  await p
    .locator('.ko-player-board-row [data-card-instance-id="trace-z"]')
    .hover();
  const panel = p.locator('aside[aria-label="상세정보"]');
  await panel
    .getByText("출처: 아군 리타이어 강화 · 1/2회", { exact: true })
    .first()
    .waitFor();
  assert.match(await panel.innerText(), /효과로 소환된 좀비 흡수/);
  assert.match(await panel.innerText(), /턴 2/);
  await panel.evaluate((n) => (n.scrollTop = n.scrollHeight));
  await p.screenshot({ path: `${out}/provenance.png`, animations: "disabled" });
  results.push({
    upgradedAbilityCostMatchesEngine: true,
    zombieSourcesSeparated: true,
    historyUsesDisplayedTurn: true,
  });
  await p.close();
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
