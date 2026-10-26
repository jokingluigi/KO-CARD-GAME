import { chromium } from "./black-gold-playwright.mjs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const fixture = JSON.parse(
  await readFile("qa-results/cosmetics/fixture.json", "utf8"),
);
const origin = process.env.KO_COSMETICS_FRONTEND;
if (!origin || new URL(origin).hostname !== "127.0.0.1")
  throw new Error("Local fixture only");
const out = "qa-results/champion-common-art";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
async function session(user) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const [name, ...value] = fixture.cookies[user].split("=");
  await context.addCookies([{ name, value: value.join("="), url: origin }]);
  await context.addInitScript(() =>
    localStorage.setItem("ko-match-coach-v1", "done"),
  );
  const page = await context.newPage();
  return { context, page };
}
try {
  const admin = await session("admin");
  const errors = [];
  admin.page.on("pageerror", (e) => errors.push(e.message));
  await admin.page.goto(origin + "/admin/cosmetics");
  await admin.page.getByRole("button", { name: /검증 CHAMPION_SKIN/ }).click();
  assert.equal(
    await admin.page
      .getByLabel("portrait 이미지 업로드", { exact: true })
      .count(),
    0,
  );
  assert.equal(
    await admin.page.getByLabel("intro 이미지 업로드", { exact: true }).count(),
    0,
  );
  assert.equal(
    await admin.page
      .getByLabel("awakened 이미지 업로드", { exact: true })
      .count(),
    1,
  );
  await admin.page
    .getByLabel("art 이미지 업로드", { exact: true })
    .setInputFiles({
      name: "common.png",
      mimeType: "image/png",
      buffer: await readFile("qa-results/cosmetics/upload-fixture.png"),
    });
  await admin.page
    .getByRole("status")
    .filter({ hasText: "이미지 검증 완료" })
    .waitFor();
  const shared = await admin.page
    .getByAltText("art 미리보기", { exact: true })
    .getAttribute("src");
  assert.notEqual(shared, fixture.registered.CHAMPION_SKIN.imageAssets.art);
  await admin.page
    .getByRole("button", { name: "아이템 저장", exact: true })
    .click();
  await admin.page
    .getByRole("status")
    .filter({ hasText: "저장했어" })
    .waitFor();
  for (const [width, height] of [
    [390, 844],
    [360, 740],
    [1440, 900],
  ]) {
    await admin.page.setViewportSize({ width, height });
    assert.equal(
      await admin.page.getByLabel("art 이미지 업로드", { exact: true }).count(),
      1,
    );
    assert.equal(
      await admin.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await admin.page.screenshot({
      path: `${out}/editor-${width}.png`,
      fullPage: true,
    });
  }
  const player = await session("player-a");
  player.page.on("pageerror", (e) => errors.push(e.message));
  await player.page.goto(origin + "/cosmetics");
  const preview = player.page
    .locator("article")
    .filter({ hasText: "검증 CHAMPION_SKIN" });
  await preview.getByAltText("검증 CHAMPION_SKIN", { exact: true }).waitFor();
  assert.equal(
    await preview
      .getByAltText("검증 CHAMPION_SKIN", { exact: true })
      .getAttribute("src"),
    shared,
  );
  await player.page.goto(origin + "/ai-match");
  await player.page
    .getByRole("button", { name: "매치 시작", exact: true })
    .click();
  const intro = player.page.getByTestId("img-champion-portrait-self");
  await intro.waitFor({ timeout: 30000 });
  assert.equal(await intro.getAttribute("src"), shared);
  await player.page.screenshot({
    path: `${out}/intro-390.png`,
    fullPage: true,
  });
  const skip = player.page
    .getByRole("button", { name: /건너뛰기|SKIP/ })
    .first();
  if (await skip.isVisible())
    await skip.click({ timeout: 1000 }).catch(() => {});
  await player.page.waitForTimeout(5000);
  const portrait = player.page.locator(".ko-player-champion img").first();
  await portrait.waitFor();
  assert.equal(await portrait.getAttribute("src"), shared);
  await player.page.screenshot({
    path: `${out}/battle-390.png`,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/results.json",
    JSON.stringify(
      {
        singleUpload: true,
        editorViewports: [390, 360, 1440],
        collection: true,
        actualAiIntro: true,
        actualBattlePortrait: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS one upload: actual administrator editor → cosmetics preview → AI VS intro → battle HUD",
  );
  await player.context.close();
  await admin.context.close();
} finally {
  await browser.close();
}
