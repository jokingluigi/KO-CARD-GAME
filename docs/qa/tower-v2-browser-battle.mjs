import { readFile, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.KO_QA_PLAYWRIGHT ??
    "file:///C:/Users/com/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs"
);
const fixture = JSON.parse(
  await readFile("qa-results/tower-v2/fixture.json", "utf8"),
);
const browser = await chromium.launch({
  channel: process.env.KO_QA_CHROME_CHANNEL ?? "chrome",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route("**/api/**", async (route) => {
    const u = new URL(route.request().url());
    const r = await route.fetch({
      url: fixture.origin + u.pathname + u.search,
      headers: {
        ...route.request().headers(),
        cookie: fixture.cookies["user-a"],
      },
    });
    await route.fulfill({ response: r });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:17998") + "/tower",
  );
  await page.getByRole("button", { name: "도전", exact: true }).waitFor();
  if (await page.getByRole("button", { name: "도전", exact: true }).count())
    await page.getByRole("button", { name: "도전", exact: true }).click();
  await page
    .getByRole("button", { name: "그대로 시작", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "그대로 시작", exact: true }).click();
  await page.locator(".ko-hand-card").first().click();
  await page
    .getByRole("button", { name: "1구역에 카드 배치", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector(".ko-player-board-row")
      ?.textContent?.includes("공격 가능"),
  );
  await page.locator(".ko-player-board-row .ko-board-slot").first().click();
  console.log(
    "Attack buttons",
    await page.getByRole("button").allTextContents(),
  );
  await page.screenshot({
    path: "qa-results/tower-v2/mobile-attack-debug.png",
    fullPage: true,
  });
  await page.locator(".ko-opponent-champion").click();
  await page.getByRole("heading", { name: "승리 · 카드 1장 선택" }).waitFor();
  await page.screenshot({
    path: "qa-results/tower-v2/mobile-card-reward.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "선택", exact: true }).first().click();
  await page.getByRole("button", { name: /^1\. Tower Card/ }).click();
  await page.screenshot({
    path: "qa-results/tower-v2/mobile-card-swap.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "선택한 카드 교체 확정", exact: true })
    .click();
  await page.getByRole("button", { name: "도전", exact: true }).waitFor();
  await writeFile(
    "qa-results/tower-v2/battle-inspect.json",
    JSON.stringify(
      {
        text: await page.locator("body").innerText(),
        buttons: await page.getByRole("button").allTextContents(),
        errors,
        width: await page.evaluate(() => ({
          viewport: innerWidth,
          document: document.documentElement.scrollWidth,
        })),
      },
      null,
      2,
    ),
  );
  console.log(await page.getByRole("button").allTextContents());
} finally {
  await browser.close();
}
