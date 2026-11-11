/** Actual admin create/upload/save flow, registered frame assets, disposable DB + in-memory storage only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { chromium } from "./black-gold-playwright.mjs";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
const out = "docs/qa/20261111-registered-preview",
  origin = "http://127.0.0.1:5186";
await mkdir(out, { recursive: true });
process.env.SESSION_SECRET = "isolated-preview-" + randomUUID();
const f = await startTutorialFixture(),
  browser = await chromium.launch(),
  results = [],
  objects = new Map();
const { CardImageStorage } =
  await import("../../artifacts/api-server/src/lib/object-storage.ts");
const originals = Object.fromEntries(
  ["createUpload", "verifyImage", "staleUploads", "remove"].map((k) => [
    k,
    CardImageStorage.prototype[k],
  ]),
);
CardImageStorage.prototype.createUpload = async () => {
  const id = randomUUID();
  return {
    assetId: id,
    objectPath: `/objects/uploads/card-images/${id}.png`,
    uploadURL: origin + "/api/qa-upload/" + id,
  };
};
CardImageStorage.prototype.verifyImage = async (path, type, max) =>
  objects.has(path) &&
  objects.get(path).length > 0 &&
  objects.get(path).length <= max &&
  type === "image/png";
CardImageStorage.prototype.staleUploads = async () => [];
CardImageStorage.prototype.remove = async (path) => {
  objects.delete(path);
};
const frameFiles = new Map();
for (const type of ["WRESTLER", "TECHNIQUE"])
  for (const rarity of ["NORMAL", "EPIC", "LEGENDARY", "CHAMPION"]) {
    const file =
      type === "TECHNIQUE" && ["LEGENDARY", "CHAMPION"].includes(rarity)
        ? `WRESTLER-${rarity}`
        : `${type}-${rarity}`;
    const path =
      "/objects/uploads/card-images/qa-frame-" + type + "-" + rarity + ".png";
    frameFiles.set(
      "/api/storage" + path,
      await readFile(`${out}/assets/${file}.png`),
    );
    await f.db.insert(f.schema.cardFrameDefinitionsTable).values({
      id: type + "-" + rarity,
      cardType: type,
      rarity,
      frameAssetId: path,
      frameUrl: "/api/storage" + path,
      enabled: true,
      frameScale: 1.1,
      frameOffsetX: 0,
      frameOffsetY: 0,
    });
  }
const text =
  "선택한 상대 선수 카드에게 3데미지를 주고 내 챔피언의 체력을 3 회복합니다. 이번 효과로 리타이어한 선수는 묘지로 이동합니다.";
try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 1000],
  ]) {
    const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width < 1000,
        isMobile: width < 1000,
      }),
      page = await context.newPage(),
      errors = [];
    let failComplete = true,
      created = null,
      cardWrites = 0;
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        path = u.pathname;
      if (frameFiles.has(path))
        return route.fulfill({
          contentType: "image/png",
          body: frameFiles.get(path),
        });
      if (path.startsWith("/api/qa-upload/")) {
        objects.set(
          "/objects/uploads/card-images/" + path.split("/").at(-1) + ".png",
          req.postDataBuffer(),
        );
        return route.fulfill({ status: 200, body: "" });
      }
      if (path.startsWith("/api/storage/objects/")) {
        const data = objects.get(path.slice("/api/storage".length));
        if (data)
          return route.fulfill({ contentType: "image/png", body: data });
      }
      if (path === "/api/admin/cards/images/complete" && failComplete) {
        failComplete = false;
        return route.fulfill({
          status: 503,
          json: { message: "격리 검증: 업로드 완료 일시 실패" },
        });
      }
      if (path === "/api/admin/cards" && req.method() === "POST") cardWrites++;
      const r = await fetch(f.origin + path + u.search, {
        method: req.method(),
        headers: {
          Cookie: f.cookie,
          ...(req.headers()["content-type"]
            ? { "Content-Type": req.headers()["content-type"] }
            : {}),
        },
        ...(req.postDataBuffer() ? { body: req.postDataBuffer() } : {}),
      });
      const body = await r.text();
      if (
        path === "/api/admin/cards" &&
        req.method() === "POST" &&
        r.status === 201
      )
        created = JSON.parse(body).card;
      return route.fulfill({
        status: r.status,
        body,
        contentType: r.headers.get("content-type") ?? "application/json",
      });
    });
    await page.goto(origin + "/admin/cards");
    await page.getByTestId("button-create-card").click();
    const editor = page.locator("[data-admin-workbench]"),
      preview = editor.getByRole("complementary", { name: "카드 미리보기" });
    await editor
      .getByTestId("input-card-name")
      .fill("세븐 스타 레디언트 " + width);
    await editor.getByTestId("input-card-card-type").selectOption("TECHNIQUE");
    await editor.getByTestId("input-card-rarity").selectOption("CHAMPION");
    await editor.getByTestId("input-card-cost").fill("3");
    await editor
      .getByRole("tab", { name: "효과 및 조건", exact: true })
      .click();
    await editor.getByTestId("input-card-text").fill(text);
    await editor.getByRole("tab", { name: "이미지", exact: true }).click();
    const choose = page.waitForEvent("filechooser");
    await editor.getByTestId("button-select-card-image").click();
    await (
      await choose
    ).setFiles(
      "artifacts/ko-game/qa/retro-font/assets/card-102e8061-c3b8-44a5-a11c-56379996fee7.png",
    );
    await preview
      .getByRole("button", { name: "이미지 다시 업로드", exact: true })
      .waitFor();
    const art = preview
      .locator("img")
      .filter({ hasNot: page.locator(".never") })
      .first();
    await page.waitForFunction(() => {
      const n = document.querySelector('[aria-label="카드 미리보기"] img');
      return n?.src.startsWith("blob:") && n.complete && n.naturalWidth > 0;
    });
    await editor.getByTestId("button-save-card").click();
    assert.equal(cardWrites, 0);
    await preview
      .getByRole("button", { name: "이미지 다시 업로드", exact: true })
      .click();
    await editor
      .locator('[role="status"]')
      .filter({ hasText: "파일 업로드 중" })
      .waitFor({ state: "hidden" });
    await preview
      .getByRole("button", { name: "이미지 다시 업로드", exact: true })
      .waitFor({ state: "detached" });
    const card = preview.locator(".ko-card-depth");
    await card.locator(".ko-card-rules-copy").waitFor();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="카드 미리보기"] .ko-card-depth')
          ?.getAttribute("data-frame-layout") === "registered",
    );
    assert.equal(
      await card.locator(".ko-card-rules-copy").getAttribute("data-full-text"),
      text,
    );
    assert.equal(
      await card.locator(".ko-card-rules-copy").getAttribute("data-truncated"),
      "false",
    );
    assert.equal(
      (
        await preview
          .getByRole("region", { name: "효과 설명 전체" })
          .textContent()
      ).includes(text),
      true,
    );
    const positions = await card.evaluate((root) => {
      const b = root.getBoundingClientRect(),
        rect = (n) => {
          const r = n.getBoundingClientRect();
          return {
            x: ((r.x - b.x) / b.width) * 100,
            y: ((r.y - b.y) / b.height) * 100,
            w: (r.width / b.width) * 100,
            h: (r.height / b.height) * 100,
          };
        };
      const c = rect(
        root.querySelector('[data-card-stat="cost"]').parentElement,
      );
      return {
        cost: [c.x + c.w / 2, c.y + c.h / 2],
        name: rect(root.querySelector("[data-card-name]")),
        rules: rect(root.querySelector("[data-card-rules]")),
      };
    });
    assert.ok(Math.abs(positions.cost[0] - (50 + (15.24 - 50) * 1.1)) < 0.6);
    assert.ok(Math.abs(positions.cost[1] - (50 + (10.26 - 50) * 1.1)) < 0.6);
    assert.ok(positions.name.y < 7);
    assert.ok(positions.rules.h > 15);
    const titleFits = await card
      .locator("[data-card-name] span")
      .evaluate(
        (n) =>
          n.scrollWidth <= n.clientWidth + 1 &&
          n.getBoundingClientRect().height <=
            n.parentElement.getBoundingClientRect().height + 1,
      );
    assert.equal(titleFits, true);
    await editor
      .getByRole("tab", { name: "효과 및 조건", exact: true })
      .click();
    const longText = text.repeat(8);
    await editor.getByTestId("input-card-text").fill(longText);
    await page.waitForFunction(
      (expected) =>
        document
          .querySelector('[aria-label="카드 미리보기"] .ko-card-rules-copy')
          ?.getAttribute("data-full-text") === expected,
      longText,
    );
    assert.equal(
      await card.locator(".ko-card-rules-copy").getAttribute("data-truncated"),
      "false",
    );
    assert.ok(
      await card
        .locator("[data-card-rules]")
        .first()
        .evaluate((n) => n.scrollHeight > n.clientHeight),
    );
    await editor.getByTestId("input-card-text").fill(text);
    await editor.getByRole("tab", { name: "이미지", exact: true }).click();
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `${out}/new-card-${width}.png` });
    await page.screenshot({ path: `${out}/editor-${width}.png` });
    await editor.getByTestId("button-save-card").click();
    await editor.waitFor({ state: "detached" });
    assert.ok(created);
    const [saved] = await f.db
      .select()
      .from(f.schema.cardsTable)
      .where(eq(f.schema.cardsTable.id, created.id));
    assert.ok(saved.imageAssetId);
    assert.equal(saved.text, text);
    await page
      .getByTestId("input-card-search")
      .fill("세븐 스타 레디언트 " + width);
    await page.getByTestId("row-card-" + created.id).click();
    await page.waitForFunction(() => {
      const n = document.querySelector('[aria-label="카드 미리보기"] img');
      return (
        n && n.complete && n.naturalWidth > 0 && !n.src.startsWith("blob:")
      );
    });
    assert.equal(
      await preview
        .locator(".ko-card-rules-copy")
        .getAttribute("data-truncated"),
      "false",
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      newImagePreviewDecoded: true,
      failedUploadRetainsLocalImage: true,
      failedUploadCannotSave: true,
      retryAndRealSave: true,
      savedImageRestoredOnReentry: true,
      registeredFrameWindows: true,
      registeredCostAndNameAligned: true,
      fullCardRules: true,
      longRulesScrollableWithoutEllipsis: true,
      titleWithinActualNameplate: true,
      fullReadableText: true,
      errors,
    });
    await context.close();
  }
  await writeFile(
    out + "/browser-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  for (const [k, v] of Object.entries(originals))
    CardImageStorage.prototype[k] = v;
  await f.close();
}
