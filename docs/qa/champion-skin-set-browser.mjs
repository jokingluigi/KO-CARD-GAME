/** Actual local HTTP/WS app screens and isolated PGlite fixture. No production writes. */
import { chromium } from "./black-gold-playwright.mjs";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const fixture = JSON.parse(
  await readFile("qa-results/cosmetics/fixture.json", "utf8"),
);
const origin = process.env.KO_COSMETICS_FRONTEND;
if (!origin || new URL(origin).hostname !== "127.0.0.1")
  throw new Error("Local fixture only");
const out = "qa-results/champion-skin-set";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const results = [];
async function session(user, w, h) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile: w < 600,
    hasTouch: w < 600,
  });
  const [name, ...value] = fixture.cookies[user].split("=");
  await ctx.addCookies([{ name, value: value.join("="), url: origin }]);
  await ctx.addInitScript(() =>
    localStorage.setItem("ko-match-coach-v1", "done"),
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    throw e;
  });
  return { ctx, page };
}
try {
  const admin = await session("admin", 1440, 1000);
  await admin.page.goto(origin + "/admin/cosmetics");
  await admin.page.getByRole("button", { name: /검증 CHAMPION_SKIN/ }).click();
  const upload = admin.page.getByLabel("token:set-token 이미지 업로드", {
    exact: true,
  });
  await upload.setInputFiles({
    name: "token.png",
    mimeType: "image/png",
    buffer: await readFile("qa-results/cosmetics/upload-fixture.png"),
  });
  await admin.page
    .getByRole("status")
    .filter({ hasText: "이미지 검증 완료" })
    .waitFor();
  await admin.page
    .getByRole("button", { name: "아이템 저장", exact: true })
    .click();
  await admin.page
    .getByRole("status")
    .filter({ hasText: "저장했어" })
    .waitFor();
  await admin.page.screenshot({
    path: out + "/admin-token-slot.png",
    fullPage: true,
  });
  await admin.ctx.close();
  for (const [w, h] of [
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
    [1440, 900],
  ]) {
    const { ctx, page } = await session("player-b", w, h);
    await page.goto(origin + "/packs");
    await page.getByTestId("button-open-pack-set-pack").click();
    await page.getByTestId("button-reveal-reward-0").click();
    await page.getByText("챔피언 스킨 세트 획득", { exact: true }).waitFor();
    await page.getByAltText("세트 포함 토큰 스킨", { exact: true }).waitFor();
    if (w === 360)
      await page.getByText("원본 챔피언 해금", { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: `${out}/pack-set-${w}.png`, fullPage: true });
    await page.goto(origin + "/cosmetics");
    const article = page
      .locator("article")
      .filter({ hasText: "검증 CHAMPION_SKIN" });
    await article.getByRole("button", { name: "장착", exact: true }).click();
    await article.getByText("장착 중", { exact: true }).waitFor();
    await article
      .getByAltText("세트 포함 토큰 스킨", { exact: true })
      .waitFor();
    await page.screenshot({
      path: `${out}/equipped-set-${w}.png`,
      fullPage: true,
    });
    await ctx.close();
    const battle = await session("player-a", w, h);
    await battle.page.goto(origin + "/online/match/" + fixture.matchId);
    const own = battle.page
      .locator(".ko-player-board-row")
      .getByAltText("세트 챔피언 토큰", { exact: true });
    const enemy = battle.page
      .locator(".ko-opponent-board-row")
      .getByAltText("세트 챔피언 토큰", { exact: true });
    await own.waitFor({ timeout: 30000 });
    await enemy.waitFor();
    assert.match(await own.getAttribute("src"), /uploads\/cosmetics/);
    assert.match(await enemy.getAttribute("src"), /qa-cosmetics\/original/); // Frozen opponent had no skin when match started.
    await battle.page.waitForFunction(() =>
      [...document.querySelectorAll(".ko-board-slot img")].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
    await battle.page.screenshot({
      path: `${out}/battle-token-${w}.png`,
      fullPage: true,
    });
    assert.equal(
      await battle.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    results.push({
      viewport: [w, h],
      packSet: true,
      equipment: true,
      ownTokenSkin: true,
      opponentOriginal: true,
      noOverflow: true,
    });
    await battle.ctx.close();
    console.log("PASS skin set actual pack, equipment, PvP token", w, h);
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
