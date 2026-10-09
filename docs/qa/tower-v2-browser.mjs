import { readFile, mkdir, writeFile } from "node:fs/promises";
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
await mkdir("qa-results/tower-v2", { recursive: true });
const current = await fetch(fixture.origin + "/api/tower/runs/current", {
  headers: { cookie: fixture.cookies["user-a"] },
}).then((r) => r.json());
if (current.run)
  await fetch(
    fixture.origin + "/api/tower/runs/" + current.run.id + "/command",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: fixture.cookies["user-a"],
      },
      body: JSON.stringify({
        version: current.run.version,
        command: { type: "ABANDON" },
      }),
    },
  );
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await context.route("**/api/**", async (route) => {
  const path =
    new URL(route.request().url()).pathname +
    new URL(route.request().url()).search;
  try {
    const response = await route.fetch({
      url: fixture.origin + path,
      headers: {
        ...route.request().headers(),
        cookie: fixture.cookies["user-a"],
      },
    });
    await route.fulfill({ response });
  } catch (e) {
    await route.abort();
  }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(
  (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:17998") + "/tower",
);
await page.getByRole("button", { name: "새 도전", exact: true }).waitFor();
await page.screenshot({
  path: "qa-results/tower-v2/mobile-selection.png",
  fullPage: true,
});
await page.getByRole("button", { name: "새 도전", exact: true }).click();
await page
  .getByRole("button", { name: "25장으로 도전 시작", exact: true })
  .click();
await page.getByRole("button", { name: "건너뛰기", exact: true }).waitFor();
await page.screenshot({
  path: "qa-results/tower-v2/mobile-opening.png",
  fullPage: true,
});
await page.getByRole("button", { name: "건너뛰기", exact: true }).click();
await page
  .getByRole("button", { name: /전투 시작|도전/ })
  .first()
  .waitFor();
await writeFile(
  "qa-results/tower-v2/browser-inspect.json",
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
await browser.close();
