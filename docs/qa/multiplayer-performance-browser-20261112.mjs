import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
const out = "/tmp/ko-performance-browser";
await mkdir(out, { recursive: true });
const f = await startTutorialFixture(),
  browser = await chromium.launch();
const results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await auditSetup(page);
    await page.route("**/api/admin/session", (r) =>
      r.fulfill({
        json: {
          authenticated: true,
          user: {
            id: "tutorial-user",
            role: "ADMIN",
            nickname: "검증 관리자",
            email: "qa@example.invalid",
          },
        },
      }),
    );
    await page.route("**/api/admin/multiplayer-performance", async (r) => {
      const resp = await fetch(
        f.origin + "/api/admin/multiplayer-performance",
        { headers: { Cookie: f.cookie } },
      );
      await r.fulfill({
        status: resp.status,
        body: await resp.text(),
        contentType: "application/json",
      });
    });
    await page.goto("http://127.0.0.1:5186/admin/multiplayer-performance");
    await page
      .getByRole("heading", { name: "멀티플레이 성능", exact: true, level: 2 })
      .waitFor();
    await page.getByText(/서버 힙 .*MB/).waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    await page.screenshot({ path: `${out}/performance-${width}.png` });
    results.push({
      width,
      realAuthenticatedRoute: true,
      metricsRendered: true,
    });
    await page.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await f.close();
}
