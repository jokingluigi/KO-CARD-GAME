// Mutating browser checks must target the isolated HTTP fixture, never production.
import { mkdir } from "node:fs/promises";
await mkdir("qa-results/admin-renewal", { recursive: true });
import { readFile, writeFile } from "node:fs/promises";
import { ADMIN_PAGES } from "../../artifacts/ko-game/src/lib/admin-navigation";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const f = JSON.parse(
  await readFile(
    process.env.KO_ADMIN_QA_FIXTURE ?? "qa-results/tower-v2/fixture.json",
    "utf8",
  ),
);
if (!["127.0.0.1", "localhost"].includes(new URL(f.origin).hostname))
  throw Error("Admin QA requires a local isolated fixture");
const b = await chromium.launch({
    channel: process.env.KO_QA_CHROME_CHANNEL ?? "chrome",
  }),
  c = await b.newContext({ viewport: { width: 390, height: 844 } });
const report = { mobile: [], operations: [], errors: [] };
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
p.on("pageerror", (e) => report.errors.push(e.message));
p.on("dialog", (d) => d.accept());
async function visit(id) {
  await p.goto(
    "" +
      (process.env.KO_ADMIN_QA_ORIGIN ?? "http://127.0.0.1:17998") +
      "/admin" +
      (id ? "/" + id : ""),
  );
  await p.waitForLoadState("networkidle");
  if (await p.getByText("Something went wrong", { exact: true }).count())
    throw Error(id + " crashed");
}
async function save(button, path) {
  const response = p.waitForResponse(
    (r) =>
      r.url().includes(path) &&
      !["GET", "OPTIONS"].includes(r.request().method()),
  );
  await button.click();
  const r = await response;
  if (!r.ok())
    throw Error(path + " status " + r.status() + " " + (await r.text()));
  await p.waitForLoadState("networkidle");
  report.operations.push(path + " " + r.status());
}
try {
  for (const width of process.env.SKIP_MOBILE ? [] : [390, 320]) {
    await p.setViewportSize({ width, height: 844 });
    for (const x of ADMIN_PAGES) {
      await p.goto(
        "" +
          (process.env.KO_ADMIN_QA_ORIGIN ?? "http://127.0.0.1:17998") +
          "" +
          x.path,
      );
      await p
        .getByRole("heading", { name: x.label, level: 1, exact: true })
        .waitFor();
      await p.waitForLoadState("networkidle");
      if (await p.getByText("Something went wrong", { exact: true }).count())
        throw Error(x.id + " crashed");
      const w = await p.evaluate(() => document.documentElement.scrollWidth);
      report.mobile.push({ id: x.id, viewport: width, width: w });
      if (w > width + 1) throw Error(x.id + " overflow " + w + "/" + width);
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await visit("packs");
  await p.getByLabel("이름", { exact: true }).fill("QA renewal pack");
  await p.getByRole("tab", { name: "확률 · 카드 풀" }).click();
  await p.getByRole("tab", { name: "기본 · 신규 지급" }).click();
  await save(
    p.getByRole("button", { name: "저장", exact: true }),
    "admin/packs",
  );
  await visit("shop");
  await p.getByRole("tab", { name: "상품 편집", exact: true }).click();
  await p.getByLabel("상품명", { exact: true }).fill("QA renewal listing");
  await p.getByLabel("연결 Pack", { exact: false }).selectOption({ index: 1 });
  await p.getByLabel("가격 (크레딧)", { exact: true }).fill("10");
  await save(
    p.getByRole("button", { name: "상품 저장", exact: true }),
    "admin/shop",
  );
  await visit("ai-decks");
  await p.getByLabel("이름", { exact: true }).fill("QA renewal AI");
  await p
    .locator("main select")
    .filter({ visible: true })
    .filter({ has: p.locator('option[value="hero"]') })
    .selectOption("hero");
  await p.getByRole("tab", { name: "25장 덱 구성", exact: true }).click();
  for (let i = 0; i < 25; i++)
    await p
      .getByRole("button", { name: "+", exact: true })
      .and(p.locator("button:not(:disabled)"))
      .first()
      .click();
  await save(
    p.getByRole("button", { name: "저장", exact: true }),
    "admin/ai-decks",
  );
  await visit("quests");
  await p.getByLabel("이름", { exact: true }).fill("QA renewal daily");
  await p.getByRole("tab", { name: "보상", exact: true }).click();
  await p.getByRole("tab", { name: "기본 정보", exact: true }).click();
  await save(
    p.getByRole("button", { name: "저장", exact: true }),
    "admin/quests/definitions",
  );
  await visit("system");
  await save(
    p.getByRole("switch", { name: "서버 점검", exact: true }),
    "server-maintenance",
  );
  await p.getByRole("button", { name: "점검 중", exact: true }).waitFor();
  await save(
    p.getByRole("switch", { name: "서버 점검", exact: true }),
    "server-maintenance",
  );
  await p.getByRole("button", { name: "정상 운영", exact: true }).waitFor();
  // A rejected server write must preserve the form. Only this response is injected.
  await visit("cards");
  await p.getByTestId("button-create-card").click();
  await p.getByTestId("input-card-name").fill("KEEP FAILED DRAFT");
  await c.route("**/api/admin/cards", async (r) => {
    if (r.request().method() === "POST")
      await r.fulfill({
        status: 503,
        json: { message: "QA temporary failure" },
      });
    else await r.fallback();
  });
  await p.getByTestId("button-save-card").click();
  await p.getByText("QA temporary failure", { exact: true }).first().waitFor();
  if (
    (await p.getByTestId("input-card-name").inputValue()) !==
    "KEEP FAILED DRAFT"
  )
    throw Error("failed save lost draft");
  report.operations.push("failed save retains draft");
  await c.unroute("**/api/admin/cards");
  p.removeAllListeners("dialog");
  p.once("dialog", (d) => d.dismiss());
  await p.getByRole("button", { name: "취소", exact: true }).click();
  await p.getByTestId("input-card-name").waitFor();
  report.operations.push("cancel discard retains modal");
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "취소", exact: true }).click();
  await p.getByTestId("input-card-name").waitFor({ state: "hidden" });
  report.operations.push("confirm discard closes modal");
  await p.screenshot({
    path: "qa-results/admin-renewal/cards-desktop.png",
    fullPage: true,
  });
} catch (e) {
  report.failure = e.message;
} finally {
  console.log(JSON.stringify(report));
  await writeFile(
    "qa-results/admin-renewal/extended-result.json",
    JSON.stringify(report, null, 2),
  );
  await b.close();
}
if (report.failure || report.errors.length) process.exitCode = 1;
