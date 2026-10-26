import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(
    process.env.KO_QA_PLAYWRIGHT ??
      "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
  ).href
);
const fixture = JSON.parse(
  await readFile("qa-results/cosmetics/fixture.json", "utf8"),
);
const origin = process.env.KO_COSMETICS_FRONTEND ?? "http://127.0.0.1:5175";
for (const address of [origin, fixture.origin])
  if (!["127.0.0.1", "localhost"].includes(new URL(address).hostname))
    throw new Error("Cosmetic QA only supports isolated loopback servers");
const output = "qa-results/cosmetics";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.KO_QA_CHROMIUM_EXECUTABLE ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
const results = [];
const errors = [];
async function context(user, width = 390, height = 844) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 600,
    hasTouch: width < 600,
  });
  const cookie = fixture.cookies[user].split("=");
  await ctx.addCookies([
    { name: cookie[0], value: cookie.slice(1).join("="), url: origin },
  ]);
  await ctx.addInitScript(() =>
    localStorage.setItem("ko-match-coach-v1", "done"),
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("BROWSER ERROR", e.message);
  });
  return { ctx, page };
}
async function shot(page, name) {
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
async function check(name, task) {
  await task();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
}
async function api(page, path, method = "GET", body) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch("/api" + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, method, body },
  );
}
const a = await context("player-a"),
  b = await context("player-b"),
  admin = await context("admin", 1440, 1000);
try {
  await check(
    "actual administrator cosmetics catalog, editor and account search",
    async () => {
      await admin.page.goto(origin + "/admin/cosmetics");
      await admin.page
        .getByRole("heading", { name: "꾸미기 관리", exact: true })
        .first()
        .waitFor();
      await admin.page
        .getByRole("button", { name: /검증 (CHAMPION_SKIN|챔피언 스킨)/ })
        .click();
      await admin.page
        .getByLabel("아이템 이름")
        .fill("검증 챔피언 스킨 · UI 수정");
      await admin.page
        .getByRole("button", { name: "아이템 저장", exact: true })
        .click();
      await admin.page
        .getByRole("status")
        .filter({ hasText: "저장했어" })
        .waitFor();
      await admin.page.reload();
      await admin.page
        .getByRole("button", { name: /검증 챔피언 스킨 · UI 수정/ })
        .waitFor();
      await admin.page
        .getByLabel("플레이어 검색", { exact: true })
        .fill("player-a");
      await admin.page
        .getByRole("button", { name: "플레이어 검색", exact: true })
        .click();
      await admin.page
        .getByRole("button", { name: "player-a", exact: true })
        .click();
      await admin.page
        .getByRole("heading", { name: /player-a 보유 아이템/ })
        .waitFor();
      await shot(admin.page, "admin-cosmetics-desktop");
      await admin.page
        .getByRole("button", { name: "새 아이템", exact: true })
        .click();
      await admin.page.getByLabel("아이템 이름").fill("브라우저 등록 이모티콘");
      await admin.page.getByLabel("아이템 유형").selectOption("IMAGE_EMOTE");
      await admin.page.getByLabel("art 이미지 업로드").setInputFiles({
        name: "qa-emote.png",
        mimeType: "image/png",
        buffer: await readFile(output + "/upload-fixture.png"),
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
      const grant = admin.page
        .locator("article")
        .filter({ hasText: "브라우저 등록 이모티콘" });
      await grant.getByRole("button", { name: "지급", exact: true }).click();
      await grant.getByRole("button", { name: "회수", exact: true }).waitFor();
      await grant.getByRole("button", { name: "회수", exact: true }).click();
      await grant.getByRole("button", { name: "지급", exact: true }).waitFor();
    },
  );
  await check(
    "player actual skin preview, equip/default/reload persistence and four emote slots",
    async () => {
      await a.page.goto(origin + "/");
      await a.page.getByTestId("button-main-menu-online").waitFor();
      assert.equal(
        await a.page
          .getByTestId("button-main-menu-online")
          .getAttribute("data-menu-tier"),
        "battle",
      );
      assert.equal(
        await a.page
          .getByTestId("button-main-menu-ai")
          .getAttribute("data-menu-tier"),
        "battle",
      );
      assert.equal(
        await a.page
          .getByTestId("button-main-menu-꾸미기")
          .getAttribute("data-menu-tier"),
        "utility",
      );
      await a.page.getByTestId("button-main-menu-꾸미기").click();
      await a.page
        .getByRole("heading", { name: "꾸미기", exact: true })
        .waitFor();
      await a.page.getByRole("button", { name: "기본 외형으로" }).click();
      await a.page.getByRole("button", { name: "장착", exact: true }).click();
      await a.page.reload();
      await a.page.getByText("장착 중", { exact: true }).waitFor();
      await a.page
        .getByRole("button", { name: "카드 스킨", exact: true })
        .click();
      await a.page.locator(".ko-card-depth").first().waitFor();
      await shot(a.page, "player-card-preview-mobile");
      await a.page
        .getByRole("button", { name: "이모티콘", exact: true })
        .click();
      await a.page.getByRole("button", { name: /슬롯 4: 검증/ }).waitFor();
      await shot(a.page, "player-emote-slots-mobile");
    },
  );
  await check(
    "two real authenticated browser sessions receive identical frozen PvP skins and opaque backs",
    async () => {
      await Promise.all([
        a.page.goto(origin + "/online/match/" + fixture.matchId),
        b.page.goto(origin + "/online/match/" + fixture.matchId),
      ]);
      for (const { page } of [a, b]) {
        await page
          .getByRole("button", { name: "이미지 이모티콘", exact: true })
          .waitFor({ timeout: 30000 });
        await page.locator(".ko-champion-portrait-art img").first().waitFor();
      }
      const aSelf = await a.page
          .locator(".ko-player-champion img")
          .first()
          .getAttribute("src"),
        bOpponent = await b.page
          .locator(".ko-opponent-champion img")
          .first()
          .getAttribute("src");
      assert.equal(aSelf, bOpponent);
      assert.match(aSelf, /uploads\/cosmetics/);
      assert.match(
        await b.page
          .locator(".ko-player-champion img")
          .first()
          .getAttribute("src"),
        /original.png/,
      );
      const aBack = await a.page
          .locator(".ko-player-zones .cosmetic-card-back")
          .getAttribute("src"),
        bBack = await b.page
          .locator(".ko-player-zones .cosmetic-card-back")
          .getAttribute("src");
      assert.notEqual(aBack, bBack);
      assert.equal(
        await a.page
          .locator(".ko-opponent-hand .cosmetic-card-back")
          .first()
          .getAttribute("src"),
        bBack,
      );
      assert.equal(
        await b.page
          .locator(".ko-opponent-hand .cosmetic-card-back")
          .first()
          .getAttribute("src"),
        aBack,
      );
      assert.ok(
        (await b.page
          .locator(
            '.ko-opponent-board-row .ko-card-depth img[src*="/uploads/cosmetics/"]',
          )
          .count()) > 0,
      );
      for (const { page } of [a, b]) {
        assert.ok(
          (await page
            .locator(".ko-opponent-hand .cosmetic-card-back")
            .count()) > 0,
        );
        assert.ok(
          (await page.locator(".ko-zone-stack .cosmetic-card-back").count()) >
            0,
        );
      }
      await shot(a.page, "pvp-player-a-mobile");
      await shot(b.page, "pvp-player-b-mobile");
      await b.page
        .locator(".ko-opponent-board-row [data-touch-inspect-trigger]")
        .first()
        .tap();
      const info = b.page.getByRole("complementary", {
        name: "상세정보",
        exact: true,
      });
      await info.waitFor();
      assert.ok(
        (await info
          .locator('.ko-card-depth img[src*="/uploads/cosmetics/"]')
          .count()) > 0,
      );
      await shot(b.page, "pvp-card-info-mobile");
      await info.getByRole("button", { name: /풀 일러스트 보기/ }).tap();
      await b.page.getByRole("dialog").last().waitFor();
      assert.match(
        await b.page
          .getByRole("dialog")
          .last()
          .locator("img")
          .getAttribute("src"),
        /uploads\/cosmetics/,
      );
      await b.page.keyboard.press("Escape");
      await b.page
        .getByRole("button", { name: "상세정보 닫기", exact: true })
        .tap();
    },
  );
  await check(
    "A image emote appears on both actual PvP screens, then expires; B hide preference works",
    async () => {
      await a.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .click();
      await a.page
        .getByRole("button", { name: "검증 IMAGE_EMOTE", exact: true })
        .click();
      for (const { page } of [a, b])
        await page.locator(".cosmetic-emote-overlay img").first().waitFor();
      await b.page.waitForTimeout(180);
      await shot(b.page, "pvp-opponent-image-emote-mobile");
      await b.page
        .locator(".cosmetic-emote-overlay")
        .waitFor({ state: "detached", timeout: 4000 });
      await b.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .click();
      await b.page.getByLabel("상대 이미지 숨기기").check();
      await b.page
        .locator(".cosmetic-emote-picker")
        .getByRole("button", { name: "닫기", exact: true })
        .click();
      await a.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .click();
      await a.page
        .getByRole("button", { name: "검증 IMAGE_EMOTE", exact: true })
        .click();
      await a.page.locator(".cosmetic-emote-overlay img").first().waitFor();
      assert.equal(
        await b.page.locator(".cosmetic-emote-overlay img").count(),
        0,
      );
    },
  );
  await check(
    "B image emote reaches A and client reload restores existing battle and both loadouts",
    async () => {
      await b.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .click();
      await b.page
        .getByRole("button", { name: "상대 검증 이모티콘", exact: true })
        .click();
      await a.page
        .locator('[data-cosmetic-emote-player="PLAYER_TWO"] img')
        .waitFor();
      const count = await a.page
        .locator(".ko-board-slot.ko-card-depth")
        .count();
      await a.page.reload();
      await a.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .waitFor();
      assert.equal(
        await a.page.locator(".ko-board-slot.ko-card-depth").count(),
        count,
      );
      assert.match(
        await a.page
          .locator(".ko-player-champion img")
          .first()
          .getAttribute("src"),
        /uploads\/cosmetics/,
      );
      await shot(a.page, "pvp-reconnected-mobile");
    },
  );
  await check(
    "mobile cosmetics/admin viewports have no horizontal overflow and usable touch targets",
    async () => {
      for (const [width, height] of [
        [360, 740],
        [375, 812],
        [390, 844],
        [412, 915],
      ]) {
        await a.page.setViewportSize({ width, height });
        await a.page.goto(origin + "/cosmetics");
        await a.page.getByText("장착 중", { exact: true }).first().waitFor();
        assert.ok(
          await a.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await a.page
          .getByRole("button", { name: "이모티콘", exact: true })
          .click();
        await shot(a.page, `cosmetics-${width}`);
        await admin.page.setViewportSize({ width, height });
        await admin.page.goto(origin + "/admin/cosmetics");
        await admin.page
          .getByRole("button", { name: "새 아이템", exact: true })
          .waitFor();
        assert.ok(
          await admin.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
      }
      await shot(admin.page, "admin-cosmetics-mobile");
    },
  );
  await check(
    "missing skin download falls back to original champion/card images and default back without blocking match",
    async () => {
      await a.page.route(
        "**/api/storage/objects/uploads/cosmetics/**",
        (route) => route.abort(),
      );
      await a.page.goto(origin + "/online/match/" + fixture.matchId);
      await a.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .waitFor();
      await a.page.waitForFunction(() => {
        const img = document.querySelector(".ko-player-champion img");
        return (
          img &&
          img.complete &&
          img.naturalWidth > 0 &&
          img.src.includes("original.png")
        );
      });
      assert.equal(await a.page.locator(".ko-player-champion img").evaluate(e=>e.style.transform),"scale(1)");
      assert.equal(await a.page.locator(".ko-player-champion img").evaluate(e=>e.style.objectPosition),"50% 50%");
      assert.equal(await a.page.locator(".cosmetic-card-back").count(), 0);
      assert.ok(
        (await a.page
          .locator(
            '.ko-player-board-row .ko-card-depth img[src*="original.png"]',
          )
          .count()) > 0,
      );
      await a.page
        .locator(".ko-player-board-row [data-touch-inspect-trigger]")
        .first()
        .tap();
      const info = a.page.getByRole("complementary", {
        name: "상세정보",
        exact: true,
      });
      await info.waitFor();
      await info.getByRole("button", { name: /풀 일러스트 보기/ }).tap();
      await a.page.waitForFunction(() => {
        const img = document.querySelector('[role="dialog"] img');
        return (
          img &&
          img.complete &&
          img.naturalWidth > 0 &&
          img.src.includes("original.png")
        );
      });
      await a.page.keyboard.press("Escape");
      await a.page
        .getByRole("button", { name: "상세정보 닫기", exact: true })
        .tap();

      await shot(a.page, "failed-assets-original-fallback");
      await a.page.unroute("**/api/storage/objects/uploads/cosmetics/**");
    },
  );
  await check(
    "actual AI setup/start displays frozen equipped champion/back and locally usable image emotes",
    async () => {
      await a.page.goto(origin + "/ai-match");
      await a.page.waitForTimeout(1000);
      await shot(a.page, "ai-setup");
      await a.page
        .getByRole("button", { name: "매치 시작", exact: true })
        .click();
      await a.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .waitFor({ timeout: 30000 });
      const intro = a.page.getByTestId("img-champion-portrait-self");
      await intro.waitFor();
      assert.match(await intro.getAttribute("src"), /uploads\/cosmetics/);
      const skip = a.page.getByRole("button", { name: /건너뛰기/ });
      if (await skip.count()) await skip.first().click();
      await a.page.waitForTimeout(5000);
      assert.match(
        await a.page
          .locator(".ko-player-champion img")
          .first()
          .getAttribute("src"),
        /uploads\/cosmetics/,
      );
      await a.page
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .click();
      await a.page
        .getByRole("button", { name: "검증 IMAGE_EMOTE", exact: true })
        .click();
      await a.page.locator(".cosmetic-emote-overlay img").first().waitFor();
      assert.ok(
        (await a.page
          .locator(
            '.ko-player-hand .ko-hand-card img[src*="/uploads/cosmetics/"]',
          )
          .count()) > 0,
      );
      assert.equal(
        await a.page
          .locator(".ko-player-zones .cosmetic-card-back")
          .getAttribute("src"),
        fixture.registered.CARD_BACK.imageAssets.art,
      );
      await shot(a.page, "ai-cosmetics-image-emote-mobile");
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/browser-results.json`,
    JSON.stringify(
      {
        kind: "Chromium mobile emulation, not a physical phone",
        results,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await shot(a.page, "failure-player-a");
  await shot(b.page, "failure-player-b");
  console.error("PLAYER SCREEN", await a.page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
