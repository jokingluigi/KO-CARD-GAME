/** Deployed tutorial; public data/images are live, account is isolated, writes blocked. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "docs/qa/20261102-playable-tutorial",
  browser = await chromium.launch(),
  p = await browser.newPage({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
    reducedMotion: "reduce",
  }),
  errors = [],
  writes = [],
  reads = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
try {
  await p.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
  });
  await p.route("**/api/**", (r) => {
    const q = r.request(),
      path = new URL(q.url()).pathname;
    if (q.method() !== "GET") {
      writes.push(path);
      return r.fulfill({
        status: 503,
        json: { message: "read-only verification" },
      });
    }
    if (path.endsWith("/auth/me"))
      return r.fulfill({
        json: {
          authenticated: true,
          user: {
            id: "tutorial-deploy-verification",
            nickname: "배포 확인",
            role: "USER",
          },
        },
      });
    if (path.endsWith("/server-status"))
      return r.fulfill({ json: { enabled: false, allowed: true } });
    if (path.endsWith("/cosmetics"))
      return r.fulfill({
        json: {
          owned: [],
          loadout: { version: 1, skins: {}, emotes: [], cardBack: null },
        },
      });
    reads.push(path);
    return r.continue();
  });
  await p.goto("https://ko-card-game-vr69.onrender.com/tutorial");
  await p.getByTestId("lesson-basics").waitFor({ timeout: 25000 });
  for (const id of ["basics", "combat", "rush", "spell", "active", "champion"])
    assert.equal(await p.getByTestId("lesson-" + id).isEnabled(), true, id);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out + "/deployed-courses.png" });
  await p.getByTestId("lesson-basics").click();
  await p.getByRole("button", { name: "직접 해보기", exact: true }).click();
  await p.getByRole("button", { name: "그대로 시작", exact: true }).click();
  await p.locator('[data-goal="summon"]').waitFor();
  await p.locator(".ko-hand-card").first().click();
  await p.locator(".ko-player-board-row .ko-board-slot").first().click();
  await p.locator('[data-goal="turn"]').waitFor();
  await p
    .locator('[data-testid="tutorial-current-goal"][data-busy="false"]')
    .waitFor();
  await p.screenshot({ path: out + "/deployed-battle.png" });
  await p.locator(".ko-turn-end").click();
  if (
    await p
      .getByRole("button", { name: "남은 행동이 있지만 턴 종료 확정" })
      .count()
  )
    await p
      .getByRole("button", { name: "남은 행동이 있지만 턴 종료 확정" })
      .click();
  await p.locator('[data-goal="finish"]').waitFor();
  await p
    .locator('[data-testid="tutorial-current-goal"][data-busy="false"]')
    .waitFor();
  await p.locator(".ko-player-board-row .ko-board-slot").first().click();
  await p
    .getByRole("button", { name: "상대 챔피언 대상", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("heading", { name: "실습 성공", exact: true })
    .waitFor({ timeout: 20000 });
  assert.ok(reads.includes("/api/cards"));
  assert.ok(reads.includes("/api/champions"));
  assert.ok(writes.every((path) => path.endsWith("/ws-ticket")));
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/deployed-browser.json",
    JSON.stringify(
      {
        deployedBundle: true,
        publicCatalogLive: true,
        allSixLessonsAvailable: true,
        actualMulliganSummonTurnAndVictory: true,
        accountIntercepted: true,
        productionWritesSent: 0,
        blockedRequests: writes,
        publicGetPaths: [...new Set(reads)],
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS deployed tutorial with live public catalog; actual basic victory, no production writes",
  );
} finally {
  await browser.close();
}
