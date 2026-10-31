import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const imageCache = new Map();
async function publicImage(path) {
  if (!imageCache.has(path))
    imageCache.set(
      path,
      promisify(execFile)(
        "python",
        [
          "-c",
          "import urllib.request,sys;sys.stdout.buffer.write(urllib.request.urlopen(sys.argv[1],timeout=20).read())",
          "https://ko-card-game.onrender.com" + path,
        ],
        { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 },
      ).then((r) => r.stdout),
    );
  return imageCache.get(path);
}
const before = process.env.PHASE === "before",
  out = "qa-results/card-reference-" + (before ? "before" : "after");
await mkdir(out, { recursive: true });
const records = JSON.parse(
  await readFile("docs/qa/snapshots/20261030-admin/cards.json", "utf8"),
);
const browser = await chromium.launch(),
  results = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 800 },
        hasTouch: mobile,
        isMobile: mobile,
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let requests = 0;
    await page.route("**/api/**", async (r) => {
      const p = new URL(r.request().url()).pathname;
      if (p.startsWith("/api/storage/"))
        return r.fulfill({
          contentType: "image/png",
          body: await publicImage(p),
        });
      if (p === "/api/cards") {
        requests++;
        await new Promise((resolve) => setTimeout(resolve, 150));
        return r.fulfill({ json: { cards: records } });
      }
      if (p.includes("/related")) return r.fulfill({ json: { cards: [] } });
      return r.fulfill({ json: { cards: [], frames: [] } });
    });
    await page.goto(
      "http://127.0.0.1:5186/qa/card-rules.html?public-catalog=1",
    );
    const direct = page.getByTestId("direct");
    await direct.waitFor();
    await page.waitForTimeout(400);
    const link = direct.getByRole("button", {
      name: "좀비 정보 보기",
      exact: true,
    });
    if (before) {
      results.push({
        mobile,
        linkCount: await link.count(),
        catalogRequests: requests,
      });
      await page.screenshot({
        path: out + `/before-${mobile ? "mobile" : "desktop"}.png`,
      });
      await page.close();
      continue;
    }
    await link.waitFor();
    assert.equal(
      await direct
        .getByRole("button", { name: "좀비 데헌 정보 보기", exact: true })
        .count(),
      1,
    );
    assert.equal(
      requests,
      1,
      "catalog loader must share the existing cached request",
    );
    const open = async (n) => (mobile ? n.tap() : n.click());
    await open(link);
    const dialog = page.locator("[data-card-rules-dialog]");
    await dialog.waitFor();
    assert.equal(
      await dialog.getByRole("heading", { name: "좀비", exact: true }).count(),
      1,
    );
    assert.match(await dialog.innerText(), /비용 1/);
    assert.match(await dialog.innerText(), /다른 아군 선수가 리타이어/);
    await dialog.locator("img").evaluate((n) => n.decode());
    await page.waitForFunction(() => {
      const r = document
        .querySelector("[data-card-rules-dialog]")
        ?.getBoundingClientRect();
      return (
        r &&
        r.x >= 0 &&
        r.y >= 0 &&
        r.right <= innerWidth + 1 &&
        r.bottom <= innerHeight + 1
      );
    });
    await page.screenshot({
      path: out + `/popup-${mobile ? "mobile" : "desktop"}.png`,
      animations: "disabled",
    });
    await open(
      dialog.getByRole("button", { name: "닫기", exact: true }).last(),
    );
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.getByTestId("actions").textContent(), "0");
    await page.getByTestId("details").click();
    const detail = page.getByRole("dialog");
    await detail
      .getByRole("heading", { name: "상세 검사", exact: true })
      .waitFor();
    await open(
      detail
        .getByRole("button", { name: "좀비 데헌 정보 보기", exact: true })
        .last(),
    );
    await dialog.waitFor();
    assert.equal(
      await dialog
        .getByRole("heading", { name: "좀비 데헌", exact: true })
        .count(),
      1,
    );
    await open(
      dialog.getByRole("button", { name: "닫기", exact: true }).last(),
    );
    await dialog.waitFor({ state: "detached" });
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("heading", { name: "상세 검사", exact: true })
        .count(),
      1,
    );
    await page.keyboard.press("Escape");
    if (!mobile) {
      await link.focus();
      await link.press("Enter");
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(
        await link.evaluate((n) => n === document.activeElement),
        true,
      );
    }
    assert.deepEqual(errors, []);
    results.push({
      mobile,
      publicCardLink: true,
      longestNameMatch: true,
      realPublishedDetails: true,
      nestedDetail: true,
      clickDoesNotPlayCard: true,
      sharedCatalogRequest: true,
      totalRequestsIncludingExistingRelated: requests,
      errors,
    });
    await page.close();
  }
  if (!before) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (r) =>
      new URL(r.request().url()).pathname === "/api/cards"
        ? r.fulfill({ status: 503, json: { message: "unavailable" } })
        : r.fulfill({ json: { frames: [] } }),
    );
    await page.goto("http://127.0.0.1:5186/qa/card-rules.html");
    const link = page
      .getByTestId("direct")
      .getByRole("button", { name: "정보 확인 선수 정보 보기", exact: true });
    await link.click();
    const dialog = page.locator("[data-card-rules-dialog]");
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /도발/);
    await dialog
      .getByRole("button", { name: "닫기", exact: true })
      .last()
      .click();
    await dialog.waitFor({ state: "detached" });
    await page
      .getByTestId("direct")
      .getByRole("button", { name: "아머 정보 보기", exact: true })
      .click();
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /피해를 2/);
    assert.deepEqual(errors, []);
    results.push({
      catalog503: true,
      runtimeReferenceAndKeywordStillWork: true,
      errors,
    });
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
