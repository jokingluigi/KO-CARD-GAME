// Mutating browser checks must target the isolated HTTP fixture, never production.
import { mkdir } from "node:fs/promises";
await mkdir("qa-results/admin-renewal", { recursive: true });
import { readFile, writeFile } from "node:fs/promises";
import {
  ADMIN_PAGES,
  ADMIN_GROUPS,
} from "../../artifacts/ko-game/src/lib/admin-navigation";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const fixture = JSON.parse(
  await readFile(
    process.env.KO_ADMIN_QA_FIXTURE ?? "qa-results/tower-v2/fixture.json",
    "utf8",
  ),
);
if (!["127.0.0.1", "localhost"].includes(new URL(fixture.origin).hostname))
  throw Error("Admin QA requires a local isolated fixture");
const browser = await chromium.launch({
  channel: process.env.KO_QA_CHROME_CHANNEL ?? "chrome",
});
const report = { menus: [], errors: [], badResponses: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.route("**/api/**", async (route) => {
    const u = new URL(route.request().url()),
      r = await route.fetch({
        url: fixture.origin + u.pathname + u.search,
        headers: {
          ...route.request().headers(),
          cookie: fixture.cookies.admin,
        },
      });
    if (r.status() >= 400)
      report.badResponses.push({ path: u.pathname, status: r.status() });
    await route.fulfill({ response: r });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.goto(
    "" +
      (process.env.KO_ADMIN_QA_ORIGIN ?? "http://127.0.0.1:17998") +
      "/admin",
  );
  await page.getByRole("heading", { name: "운영 개요", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "qa-results/admin-renewal/dashboard-desktop.png",
    fullPage: true,
  });
  for (const p of ADMIN_PAGES) {
    const heading = page
      .locator('nav[aria-label="관리 메뉴"]')
      .getByRole("button", {
        name: ADMIN_GROUPS.find((g) => g.id === p.group).label,
        exact: true,
      });
    if ((await heading.getAttribute("aria-expanded")) === "false")
      await heading.click();
    await page
      .locator('nav[aria-label="관리 메뉴"]')
      .getByRole("link", { name: p.label, exact: true })
      .click();
    await page
      .getByRole("heading", { name: p.label, exact: true, level: 1 })
      .waitFor();
    await page.waitForLoadState("networkidle");
    if (await page.getByText("Something went wrong", { exact: true }).count())
      throw Error(p.id + " crashed");
    report.menus.push({
      id: p.id,
      url: new URL(page.url()).pathname,
      width: await page.evaluate(() => document.documentElement.scrollWidth),
    });
  }
  await page.goBack();
  await page
    .getByRole("heading", { name: "타워 전투 샌드박스", exact: true, level: 1 })
    .waitFor();
  report.back = true;
  await page.goForward();
  await page
    .getByRole("heading", { name: "서버 점검", exact: true, level: 1 })
    .waitFor();
  report.forward = true;
  await page.goto(
    "" +
      (process.env.KO_ADMIN_QA_ORIGIN ?? "http://127.0.0.1:17998") +
      "/admin/cards",
  );
  await page.getByTestId("button-create-card").click();
  await page.getByTestId("input-card-name").fill("QA Admin Renewal");
  await page.getByRole("tab", { name: "효과 및 조건", exact: true }).click();
  await page.getByTestId("input-card-text").fill("검증용 카드");
  await page.getByRole("tab", { name: "기본 정보", exact: true }).click();
  if (
    (await page.getByTestId("input-card-name").inputValue()) !==
    "QA Admin Renewal"
  )
    throw Error("tab lost form");
  await page.screenshot({
    path: "qa-results/admin-renewal/card-editor-desktop.png",
    fullPage: true,
  });
  await page.getByTestId("button-save-card").click();
  await page.getByTestId("input-card-name").waitFor({ state: "hidden" });
  report.cardSave = true;
  await page.goto(
    "" +
      (process.env.KO_ADMIN_QA_ORIGIN ?? "http://127.0.0.1:17998") +
      "/admin/champions",
  );
  await page.getByRole("button", { name: "수정", exact: true }).first().click();
  await page
    .getByRole("tab", { name: "고유 · 시작 능력", exact: true })
    .click();
  await page.getByRole("tab", { name: "기본 정보", exact: true }).click();
  await page.getByRole("button", { name: "DRAFT 저장", exact: true }).click();
  await page
    .getByRole("button", { name: "DRAFT 저장", exact: true })
    .waitFor({ state: "hidden" });
  report.championSave = true;
  await page.goto(
    "" +
      (process.env.KO_ADMIN_QA_ORIGIN ?? "http://127.0.0.1:17998") +
      "/admin/tower",
  );
  await page.getByLabel("V2 타워 선택").selectOption("tower-v2");
  await page.getByRole("button", { name: "층", exact: true }).click();
  await page.getByRole("button", { name: "2층 · 보스", exact: true }).click();
  await page.getByRole("button", { name: "보스", exact: true }).click();
  await page.getByRole("tab", { name: "25장 덱", exact: true }).first().click();
  await page.screenshot({
    path: "qa-results/admin-renewal/tower-boss-desktop.png",
    fullPage: true,
  });
  report.towerWorkspace = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "관리 메뉴 열기" }).click();
  await page.screenshot({
    path: "qa-results/admin-renewal/menu-mobile.png",
    fullPage: true,
  });
  await page
    .locator('nav[aria-label="관리 메뉴"]')
    .getByRole("button", {
      name: ADMIN_GROUPS.find((g) => g.id === "home").label,
      exact: true,
    })
    .click();
  await page
    .locator('nav[aria-label="관리 메뉴"]')
    .getByRole("link", { name: "운영 개요", exact: true })
    .click();
  if (
    (await page
      .getByRole("button", { name: "관리 메뉴 열기" })
      .getAttribute("aria-expanded")) !== "false"
  )
    throw Error("drawer did not close");
  report.mobileWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  await page.screenshot({
    path: "qa-results/admin-renewal/dashboard-mobile.png",
    fullPage: true,
  });
} catch (e) {
  report.failure = e.message;
} finally {
  await writeFile(
    "qa-results/admin-renewal/browser-result.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  await browser.close();
}
if (report.failure || report.errors.length) process.exitCode = 1;
