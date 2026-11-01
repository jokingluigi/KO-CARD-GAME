/** Actual administrator and home routes. Network fixtures only; no production writes. */
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/home-menu-admin";
await mkdir(out, { recursive: true });
const origin = "http://127.0.0.1:5186",
  art =
    "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png";
const placement = () => ({
  scale: 1,
  x: 50,
  y: 50,
  flip: false,
  fit: "contain",
});
let layout = {
    version: 1,
    imageId: null,
    desktop: placement(),
    mobile: placement(),
  },
  images = [],
  writes = [],
  failRead = true;
const browser = await chromium.launch(),
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
  page = await ctx.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await ctx.route("**/api/**", async (r) => {
    let p = new URL(r.request().url()).pathname,
      json = {};
    const req = r.request(),
      method = req.method();
    if (p.endsWith("/admin/session") || p.endsWith("/auth/me"))
      json = {
        authenticated: true,
        user: {
          id: "qa-admin",
          nickname: "메뉴 검증",
          role: "ADMIN",
          currencyBalance: 100,
          prismBalance: 0,
          championPrismBalance: 0,
        },
      };
    else if (p.endsWith("/server-status"))
      json = { enabled: false, allowed: true };
    else if (p === "/api/admin/home-menu") {
      if (method === "GET" && failRead) {
        failRead = false;
        return r.fulfill({ status: 503, json: { message: "test failure" } });
      }
      if (method === "PUT") {
        layout = req.postDataJSON();
        writes.push({ method, layout });
      }
      json = { layout, images };
    } else if (p.endsWith("/uploads/request-url")) {
      writes.push(req.postDataJSON());
      json = {
        uploadURL: origin + "/qa-menu-put",
        objectPath: "/objects/uploads/game-backgrounds/qa.png",
      };
    } else if (p.endsWith("/uploads/complete"))
      json = {
        mediaType: "HOME_MENU_ART",
        objectPath: "/objects/uploads/game-backgrounds/qa.png",
        uploadToken: "fixture",
      };
    else if (p === "/api/admin/game-media") {
      if (method === "POST") {
        const image = { ...req.postDataJSON(), id: "qa-art", assetUrl: art };
        images.push(image);
        json = { media: image };
      } else json = { media: [] };
    } else if (p === "/api/admin/game-media/qa-art" && method === "DELETE") {
      images = [];
      return r.fulfill({ status: 204 });
    } else if (p === "/api/main-content")
      json = {
        notices: [],
        background: { id: "fixture", assetUrl: art },
        bgm: null,
        battleMenuArtwork: { ...layout, imageUrl: layout.imageId ? art : null },
      };
    else if (p.endsWith("/decks")) json = { decks: [] };
    else if (p.endsWith("/cards")) json = { cards: [] };
    else if (p.endsWith("/champions")) json = { champions: [] };
    else if (p.endsWith("/packs")) json = { packs: [] };
    else if (p.endsWith("/card-frames")) json = { frames: [] };
    else if (p.endsWith("/availability")) json = { enabled: true };
    return r.fulfill({ json });
  });
  await ctx.route("**/qa-menu-put", (r) => r.fulfill({ status: 200 }));
  await page.goto(origin + "/admin/media");
  const section = page.getByRole("region", { name: "홈 메뉴 이미지 관리" });
  await section.getByRole("button", { name: "설정 다시 불러오기" }).waitFor();
  assert.equal(
    await section
      .getByRole("button", { name: "홈 메뉴 저장", exact: true })
      .isDisabled(),
    true,
  );
  await section.getByRole("button", { name: "설정 다시 불러오기" }).click();
  await section.getByLabel("홈 메뉴 그림 업로드").setInputFiles({
    name: "temporary-qa-art.png",
    mimeType: "image/png",
    buffer: await readFile("artifacts/ko-game" + art),
  });
  await section
    .getByRole("status")
    .filter({ hasText: "이미지를 등록했습니다" })
    .waitFor();
  await section.getByLabel("확대·축소", { exact: true }).fill("1.5");
  await section.getByLabel("메뉴 그림 맞춤").selectOption("cover");
  await section.getByLabel("메뉴 그림 배치 화면").selectOption("desktop");
  assert.equal(
    await section.getByLabel("확대·축소", { exact: true }).inputValue(),
    "1",
  );
  await section.getByLabel("가로 기준점", { exact: true }).fill("65");
  await section
    .getByRole("button", { name: "홈 메뉴 저장", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("홈 메뉴 이미지와 배치를 저장했습니다."),
  );
  assert.equal(layout.mobile.scale, 1.5);
  assert.equal(layout.mobile.fit, "cover");
  assert.equal(layout.desktop.scale, 1);
  assert.equal(layout.desktop.x, 65);
  assert.equal(layout.imageId, "qa-art");
  await section.screenshot({ path: out + "/admin-pc.png" });
  await page.reload();
  await section.getByLabel("홈 메뉴 등록 이미지").waitFor();
  assert.equal(
    await section.getByLabel("홈 메뉴 등록 이미지").inputValue(),
    "qa-art",
  );
  assert.equal(
    await section.getByLabel("확대·축소", { exact: true }).inputValue(),
    "1.5",
  );
  assert.equal(
    await section
      .getByRole("button", { name: "선택 이미지 삭제", exact: true })
      .isDisabled(),
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await section.screenshot({ path: out + "/admin-mobile.png" });
  await page.goto(origin + "/");
  await page.getByTestId("button-battle-modes").waitFor();
  await page.locator(".ko-battle-mode-button img").waitFor();
  assert.equal(
    await page
      .getByTestId("button-battle-modes")
      .evaluate((n) =>
        getComputedStyle(n).getPropertyValue("--hero-scale").trim(),
      ),
    "1.5",
  );
  await page.screenshot({ path: out + "/home-mobile-with-temporary-art.png" });
  await page.getByTestId("button-battle-modes").click();
  await page
    .getByRole("button", { name: "온라인 대전 빠른 대전 · 친구 대전" })
    .click();
  await page.waitForURL("**/online");
  await page.goto(origin + "/admin/media");
  await section.getByRole("button", { name: "등록 해제", exact: true }).click();
  await section
    .getByRole("button", { name: "홈 메뉴 저장", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("홈 메뉴 이미지와 배치를 저장했습니다."),
  );
  assert.equal(layout.imageId, null);
  await section.getByLabel("홈 메뉴 등록 이미지").selectOption("qa-art");
  await section
    .getByRole("button", { name: "선택 이미지 삭제", exact: true })
    .click();
  await section.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await page.waitForFunction(() =>
    document.body.textContent.includes("사용하지 않는 이미지를 삭제했습니다."),
  );
  assert.equal(images.length, 0);
  assert.equal(writes[0].mediaType, "HOME_MENU_ART");
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/results.json",
    JSON.stringify(
      {
        actualRoutes: true,
        fixtureArt: true,
        productionWrites: false,
        initialFailureDisablesSave: true,
        upload: true,
        independentPlacement: true,
        saveReentry: true,
        activeDeleteGuard: true,
        unregisterAndDelete: true,
        homeIntegration: true,
        onlineChoice: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS admin upload, placement, persistence, home integration, delete and failure recovery",
  );
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  console.log({
    url: page.url(),
    errors,
    body: (await page.locator("body").innerText()).slice(0, 2500),
  });
  throw e;
} finally {
  await browser.close();
}
