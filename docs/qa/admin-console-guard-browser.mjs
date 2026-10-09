// Mutating browser checks must target the isolated HTTP fixture, never production.
import { mkdir } from "node:fs/promises";
await mkdir("qa-results/admin-renewal", { recursive: true });
import { readFile, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const f = JSON.parse(
    await readFile(
      process.env.KO_ADMIN_QA_FIXTURE ?? "qa-results/tower-v2/fixture.json",
      "utf8",
    ),
  ),
  b = await chromium.launch({
    channel: process.env.KO_QA_CHROME_CHANNEL ?? "chrome",
  }),
  c = await b.newContext({ viewport: { width: 1440, height: 900 } }),
  report = {};
if (!["127.0.0.1", "localhost"].includes(new URL(f.origin).hostname))
  throw Error("Admin QA requires a local isolated fixture");
await c.route("**/api/**", async (r) => {
  const u = new URL(r.request().url());
  await r.fulfill({
    response: await r.fetch({
      url: f.origin + u.pathname + u.search,
      headers: { ...r.request().headers(), cookie: f.cookies.admin },
    }),
  });
});
const p = await c.newPage();
p.setDefaultTimeout(10000);
try {
  await p.goto(
    "" +
      (process.env.KO_ADMIN_QA_ORIGIN ?? "http://127.0.0.1:17998") +
      "/admin",
  );
  await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "보상 및 경제", exact: true }).click();
  await p.getByRole("link", { name: "카드팩", exact: true }).click();
  await p.getByLabel("이름", { exact: true }).fill("KEEP ON BACK");
  await p.getByText("저장되지 않은 변경사항", { exact: true }).waitFor();
  p.once("dialog", (d) => d.dismiss());
  await p.evaluate(() => history.back());
  await p.getByLabel("이름", { exact: true }).waitFor();
  await p.waitForURL("**/admin/packs");
  if (
    (await p.getByLabel("이름", { exact: true }).inputValue()) !==
    "KEEP ON BACK"
  )
    throw Error(
      "back lost draft " +
        (await p.getByLabel("이름", { exact: true }).inputValue()),
    );
  report.backCancel = true;
  p.once("dialog", (d) => d.dismiss());
  await p.getByRole("button", { name: "정상 운영", exact: true }).click();
  if (
    (await p.getByLabel("이름", { exact: true }).inputValue()) !==
    "KEEP ON BACK"
  )
    throw Error("menu lost draft");
  report.menuCancel = true;
  p.once("dialog", (d) => d.accept());
  await p.evaluate(() => history.back());
  await p
    .getByRole("heading", { name: "운영 개요", level: 1, exact: true })
    .waitFor();
  report.backAccept = true;
  await p.getByRole("button", { name: "메뉴 검색 열기", exact: false }).count();
  await p
    .getByRole("button", { name: "관리 메뉴 검색 열기", exact: true })
    .click();
  await p.getByLabel("관리 메뉴 검색", { exact: true }).fill("퀘스트");
  await p
    .locator(".admin-search-results")
    .getByRole("button", { name: /일일/ })
    .click();
  await p
    .getByRole("heading", { name: "일일 · 시즌 퀘스트", level: 1, exact: true })
    .waitFor();
  report.search = true;
} catch (e) {
  report.failure = e.message;
} finally {
  await writeFile(
    "qa-results/admin-renewal/guard-result.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  await b.close();
}
if (report.failure) process.exitCode = 1;
