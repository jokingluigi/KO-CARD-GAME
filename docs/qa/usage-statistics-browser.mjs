import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const fixture = JSON.parse(
  await readFile("qa-results/usage-statistics/fixture.json", "utf8"),
);
const origin = process.env.KO_STATS_QA_ORIGIN ?? "http://127.0.0.1:5175";
for (const address of [origin, fixture.origin])
  assert.ok(
    ["127.0.0.1", "localhost"].includes(new URL(address).hostname),
    "isolated fixture only",
  );
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  channel: process.env.KO_QA_CHROME_CHANNEL ?? "chromium",
});
const output = "qa-results/usage-statistics/screenshots";
await mkdir(output, { recursive: true });
const report = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 600,
      hasTouch: viewport.width < 600,
      deviceScaleFactor: viewport.width < 600 ? 2 : 1,
    });
    await context.route("**/api/**", async (route) => {
      const u = new URL(route.request().url());
      const response = await route.fetch({
        url: fixture.origin + u.pathname + u.search,
        headers: { ...route.request().headers(), cookie: fixture.cookie },
      });
      await route.fulfill({ response });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(20000);
    let releaseFault;
    const held = new Promise((resolve) => {
      releaseFault = resolve;
    });
    let faultUsed = false;
    const fault = async (route) => {
      if (faultUsed) return route.fallback();
      faultUsed = true;
      await held;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "격리 검증용 통계 조회 오류" }),
      });
    };
    const faultPattern = "**/api/admin/usage-statistics/cards?**";
    await context.route(faultPattern, fault);
    await page.goto(origin + "/admin/card-statistics", {
      waitUntil: "domcontentloaded",
    });
    const faultRoot = page.getByRole("region", { name: "카드 사용 통계" });
    await faultRoot.getByRole("status").waitFor();
    releaseFault();
    await faultRoot.getByRole("alert").waitFor();
    assert.match(
      await faultRoot.getByRole("alert").innerText(),
      /격리 검증용 통계 조회 오류/,
    );
    await faultRoot.getByRole("button", { name: "다시 시도" }).click();
    await faultRoot.locator("tbody tr").first().waitFor();
    await context.unroute(faultPattern, fault);
    for (const kind of ["card", "champion"]) {
      await page.goto(origin + "/admin/" + kind + "-statistics");
      const root = page.getByRole("region", {
        name: kind === "card" ? "카드 사용 통계" : "챔피언 사용 통계",
      });
      await root.locator("tbody tr").first().waitFor();
      assert.equal(
        await root.getByLabel("기간", { exact: true }).inputValue(),
        "30",
      );
      assert.equal(
        await root.getByRole("combobox").count(),
        1,
        "no game-mode selector",
      );
      assert.ok((await root.locator("tbody tr").count()) > 0);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "no page overflow; table has its own scroll",
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".usage-statistics img")].every(
          (img) => img.complete && img.naturalWidth > 0,
        ),
      );
      if (viewport.width !== 320)
        await page.screenshot({
          path: output + "/" + kind + "-list-" + viewport.width + ".png",
          fullPage: true,
        });
      await root
        .getByRole("button", {
          name: kind === "card" ? "이름 변경 선수" : "통계 검증 챔피언",
          exact: true,
        })
        .click();
      await root.getByRole("button", { name: "← 목록으로" }).waitFor();
      await root
        .getByRole("img", { name: /일별.*추이/ })
        .first()
        .waitFor();
      assert.ok((await root.getByText("표본", { exact: false }).count()) > 0);
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".usage-statistics img")].every(
          (img) => img.complete && img.naturalWidth > 0,
        ),
      );
      if (viewport.width !== 320)
        await page.screenshot({
          path: output + "/" + kind + "-detail-" + viewport.width + ".png",
          fullPage: true,
        });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await root.getByRole("button", { name: "← 목록으로" }).click();
      await root.locator("tbody tr").first().waitFor();
      await root.getByLabel("기간", { exact: true }).selectOption("7");
      await root.locator("tbody tr").first().waitFor();
      await root
        .getByPlaceholder(kind === "card" ? "카드 검색" : "챔피언 검색")
        .fill("no-such-statistical-content");
      await page.waitForTimeout(400);
      await root.getByText("검색 결과가 없습니다.").waitFor();
    }
    assert.deepEqual(errors, []);
    report.push({
      viewport,
      result: "PASS",
      tested: [
        "real admin list/detail",
        "actual database API",
        "30/7-day filters",
        "empty search",
        "mobile independent table scroll",
        "no mode filter",
        "console errors",
        "loading / injected 503 / retry recovery",
      ],
    });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "qa-results/usage-statistics/browser-results.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
