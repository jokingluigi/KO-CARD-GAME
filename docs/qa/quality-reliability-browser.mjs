import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const browser = await chromium.launch(),
  results = [];
const out = "qa-results/quality-reliability";
await mkdir(out, { recursive: true });
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let tries = 0,
    release;
  await p.route("**/qa/*.png", async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (
      (path === "/qa/recover-1.png" && tries++ === 0) ||
      path === "/qa/recover-fallback.png"
    )
      return r.fulfill({ status: 503, body: "unavailable" });
    if (path === "/qa/card-primary-1.png")
      return r.fulfill({ status: 404, body: "missing" });
    if (path === "/qa/card-primary-2.png")
      await new Promise((resolve) => (release = resolve));
    return r.fulfill({ contentType: "image/png", body: png });
  });
  await p.goto("http://127.0.0.1:5186/qa/quality-reliability.html");
  await p.getByRole("button", { name: "이미지 다시 불러오기" }).waitFor();
  await p.getByRole("button", { name: "이미지 다시 불러오기" }).click();
  await p
    .getByTestId("recoverable")
    .locator("img")
    .evaluate((n) => n.decode());
  assert.ok(
    await p
      .getByTestId("recoverable")
      .locator("img")
      .evaluate((n) => n.naturalWidth > 0),
  );
  await p
    .getByTestId("card-art")
    .locator("img")
    .evaluate((n) => n.decode());
  assert.match(
    await p.getByTestId("card-art").locator("img").getAttribute("src"),
    /card-fallback/,
  );
  await p.getByRole("button", { name: "이미지 교체" }).click();
  await p.waitForTimeout(80);
  assert.equal(
    await p.getByTestId("card-art").locator("img").getAttribute("src"),
    "/qa/card-primary-2.png",
  );
  assert.equal(
    await p
      .getByTestId("card-art")
      .locator("img")
      .getAttribute("data-art-loading"),
    "true",
  );
  release();
  await p
    .getByTestId("card-art")
    .locator("img")
    .evaluate((n) => n.decode());
  await p.waitForTimeout(40);
  assert.equal(
    await p
      .getByTestId("card-art")
      .locator("img")
      .getAttribute("data-art-loading"),
    "false",
  );
  results.push({
    artworkFailureRetry: true,
    newSourceDoesNotFlashOldFallback: true,
    loadingState: true,
  });
  await p.close();
  for (const abandon of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    let releasePut,
      prepares = 0,
      completed = 0;
    await page.route("**/api/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      if (path === "/api/admin/cosmetics/uploads") {
        prepares++;
        return r.fulfill({
          json: {
            uploadURL: "http://127.0.0.1:5186/api/test-put",
            objectPath: "qa-upload",
          },
        });
      }
      if (path === "/api/test-put") {
        await new Promise((resolve) => (releasePut = resolve));
        try {
          return await r.fulfill({ status: 200 });
        } catch {
          return;
        }
      }
      if (path.endsWith("/complete")) {
        completed++;
        return r.fulfill({ json: { imageUrl: "/qa/accepted.png" } });
      }
      return r.fulfill({ json: { cards: [], frames: [] } });
    });
    await page.goto(
      "http://127.0.0.1:5186/qa/quality-reliability.html?sprite=1",
    );
    const input = page.getByLabel("대전 스프라이트 업로드");
    await input.waitFor();
    const before = await page.getByTestId("sprite-json").textContent();
    await input.setInputFiles({
      name: "sprite.png",
      mimeType: "image/png",
      buffer: png,
    });
    await page.waitForFunction(() =>
      document.body.textContent.includes("이미지 파일 전송 중"),
    );
    await page.waitForTimeout(50);
    assert.equal(prepares, 1);
    if (abandon)
      await page.getByRole("button", { name: "편집기 이탈" }).click();
    else {
      await page
        .getByRole("button", { name: "업로드 취소", exact: true })
        .click();
      await page
        .getByText("업로드를 취소했어요. 기존 표정은 유지됩니다.")
        .waitFor();
      assert.equal(await input.isEnabled(), true);
    }
    releasePut();
    await page.waitForTimeout(180);
    assert.equal(completed, 0);
    assert.equal(await page.getByTestId("sprite-json").textContent(), before);
    results.push({
      upload: abandon ? "unmount" : "cancel",
      preservesPreviousFrame: true,
      noFinalize: true,
    });
    if (!abandon) {
      await input.setInputFiles({
        name: "again.png",
        mimeType: "image/png",
        buffer: png,
      });
      await page.waitForTimeout(150);
      releasePut();
      await page.waitForFunction(
        () =>
          JSON.parse(
            document.querySelector("[data-testid=sprite-json]").textContent,
          ).frames.default.url === "/qa/accepted.png",
      );
      assert.equal(completed, 1);
      const after = JSON.parse(
        await page.getByTestId("sprite-json").textContent(),
      );
      assert.deepEqual(
        after.frames.default.self,
        JSON.parse(before).frames.default.self,
      );
      assert.deepEqual(
        after.frames.default.opponent,
        JSON.parse(before).frames.default.opponent,
      );
      results.push({ uploadRetrySucceeds: true, preservesAlignment: true });
    }
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
