import { readFile, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.KO_QA_PLAYWRIGHT ??
    "file:///C:/Users/com/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"
);
const f = JSON.parse(
  await readFile("qa-results/tower-v2/fixture.json", "utf8"),
);
const browser = await chromium.launch({
  channel: process.env.KO_QA_CHROME_CHANNEL ?? "chrome",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.route("**/api/**", async (route) => {
    const u = new URL(route.request().url());
    const r = await route.fetch({
      url: f.origin + u.pathname + u.search,
      headers: { ...route.request().headers(), cookie: f.cookies.admin },
    });
    await route.fulfill({ response: r });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:17998") + "/admin",
  );
  await page.getByRole("button", { name: "타워 관리", exact: true }).click();
  await page.getByLabel("V2 타워 선택").waitFor();
  const options = await page
    .getByLabel("V2 타워 선택")
    .locator("option")
    .evaluateAll((os) =>
      os.map((o) => ({ value: o.value, text: o.textContent })),
    );
  console.log(options);
  await page
    .getByLabel("V2 타워 선택")
    .selectOption(options.find((o) => o.value).value);
  await page.getByRole("button", { name: "보스", exact: true }).click();
  await page.screenshot({
    path: "qa-results/tower-v2/admin-boss-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "공개·테스트", exact: true }).click();
  await page
    .getByRole("button", { name: "저장 후 공개 전 검증", exact: true })
    .click();
  await page.getByText("공개 전 검증 PASS", { exact: true }).waitFor();
  await page.screenshot({
    path: "qa-results/tower-v2/admin-validation-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "기본", exact: true }).click();
  await page.screenshot({
    path: "qa-results/tower-v2/admin-mobile-320.png",
    fullPage: true,
  });
  await writeFile(
    "qa-results/tower-v2/admin-browser.json",
    JSON.stringify(
      {
        errors,
        width: await page.evaluate(() => ({
          viewport: innerWidth,
          document: document.documentElement.scrollWidth,
        })),
        options,
      },
      null,
      2,
    ),
  );
  console.log("admin validated", errors);
} finally {
  await browser.close();
}
