import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(
    process.env.KO_QA_PLAYWRIGHT ??
      "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
  ).href
);
const fixture = JSON.parse(
  await readFile("qa-results/shop-decks/fixture.json", "utf8"),
);
const origin = process.env.KO_SHOP_DECKS_FRONTEND ?? "http://127.0.0.1:5178";
for (const address of [origin, fixture.origin])
  if (!["127.0.0.1", "localhost"].includes(new URL(address).hostname))
    throw new Error("Only loopback fixtures allowed");
const out = "qa-results/shop-decks";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.KO_QA_CHROMIUM_EXECUTABLE ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
const results = [],
  errors = [];
async function context(user, width = 390, height = 844) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 600,
    hasTouch: width < 600,
  });
  const [name, ...value] = fixture.cookies[user].split("=");
  await ctx.addCookies([{ name, value: value.join("="), url: origin }]);
  await ctx.addInitScript(() =>
    localStorage.setItem("ko-match-coach-v1", "done"),
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR", e.message);
  });
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}
async function api(page, path, method = "GET", body) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch("/api" + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, method, body },
  );
}
async function check(name, task) {
  await task();
  results.push({ name, status: "PASS" });
  console.log("PASS " + name);
}
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
const admin = await context("admin", 1440, 1000),
  a = await context("browser-buyer"),
  b = await context("browser-opponent");
let productId, deckId;
try {
  await check(
    "administrator builds, uploads and persists a real valid 25-card product through the editor",
    async () => {
      const p = admin.page;
      await p.goto(origin + "/admin/shop-decks");
      await p
        .getByRole("button", { name: "새 판매용 덱", exact: true })
        .waitFor();
      await p
        .getByLabel("판매 덱 이름", { exact: true })
        .fill("모바일 판매 완성 덱");
      await p.getByLabel("판매 가격", { exact: true }).fill("300");
      await p
        .getByLabel("덱 대표 이미지 업로드", { exact: true })
        .setInputFiles(out + "/upload.png");
      await p.getByText("대표 이미지 검증 완료", { exact: true }).waitFor();
      for (let i = 0; i < 9; i++)
        for (let j = 0; j < (i === 8 ? 1 : 3); j++)
          await p
            .getByRole("button", {
              name: `상점 검증 선수 ${i} 추가`,
              exact: true,
            })
            .click();
      await p
        .getByLabel("추천 챔피언", { exact: true })
        .selectOption("included-hero");
      await p.getByLabel("판매 활성화", { exact: true }).check();
      const saved = p.waitForResponse(
        (r) =>
          r.url().endsWith("/api/admin/shop-decks") &&
          r.request().method() === "POST",
      );
      await p
        .getByRole("button", { name: "판매 덱 저장", exact: true })
        .click();
      const response = await saved;
      assert.equal(response.status(), 201);
      productId = (await response.json()).item.id;
      await p.reload();
      await p
        .getByRole("button", { name: "모바일 판매 완성 덱", exact: true })
        .click();
      assert.equal(
        await p.getByLabel("판매 덱 이름", { exact: true }).inputValue(),
        "모바일 판매 완성 덱",
      );
      await shot(p, "admin-desktop");
    },
  );
  await check(
    "shop recipe and existing card detail show exact quantities and champion exclusion",
    async () => {
      const p = a.page;
      await p.goto(origin + "/shop");
      await p.getByRole("button", { name: "완성 덱", exact: true }).click();
      const item = p.locator("article").filter({
        has: p.getByRole("heading", {
          name: "모바일 판매 완성 덱",
          exact: true,
        }),
      });
      await item.waitFor();
      assert.ok((await item.innerText()).includes("챔피언 미포함"));
      await item.getByRole("button", { name: "덱 구성 보기" }).click();
      const dialog = p.getByRole("dialog").filter({
        has: p.getByRole("heading", {
          name: "모바일 판매 완성 덱",
          exact: true,
        }),
      });
      await dialog.waitFor();
      assert.equal(
        await dialog.locator("button").filter({ hasText: "×" }).count(),
        9,
      );
      await shot(p, "deck-detail");
      await dialog.getByRole("button", { name: /상점 검증 선수 0/ }).click();
      await p
        .getByRole("dialog")
        .filter({
          has: p.getByRole("heading", {
            name: "상점 검증 선수 0",
            exact: true,
          }),
        })
        .waitFor();
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
      assert.ok(
        await p
          .getByRole("heading", { name: "모바일 판매 완성 덱", exact: true })
          .count(),
      );
    },
  );
  await check(
    "mobile purchase deducts once, grants shortages and auto-registers an editable persistent deck",
    async () => {
      const p = a.page;
      const item = p.locator("article").filter({
        has: p.getByRole("heading", {
          name: "모바일 판매 완성 덱",
          exact: true,
        }),
      });
      await item
        .getByRole("button", { name: "완성 덱 구매", exact: true })
        .click();
      await item.getByText("구매 완료", { exact: true }).waitFor();
      await item.screenshot({ path: out + "/shop-mobile.png" });
      const decks = await api(p, "/decks");
      const d = decks.body.decks.find((d) => d.name === "모바일 판매 완성 덱");
      assert.ok(d);
      deckId = d.id;
      assert.equal(d.isValid, true);
      assert.deepEqual(d.cardDefinitionIds, fixture.deck);
      assert.equal(d.championDefinitionId, "deck-hero");
      assert.equal((await api(p, "/shop")).body.currencyBalance, 700);
      await p.reload();
      await p.getByRole("button", { name: "완성 덱", exact: true }).click();
      await p
        .getByRole("button", { name: "덱 편집으로 이동", exact: true })
        .click();
      await p.locator("#deck-name").waitFor();
      await p
        .getByRole("button", { name: "덱 정보 펼치기 ▲", exact: true })
        .click();
      await p.locator("#deck-name").fill("구매 덱 자유 편집");
      await p.getByRole("button", { name: "전략 저장", exact: true }).click();
      await p.getByText("전략을 저장했습니다.", { exact: true }).waitFor();
      await p
        .getByRole("button", { name: "대표 덱 선택", exact: true })
        .click();
      await p.getByText("대표 덱을 변경했습니다.", { exact: true }).waitFor();
      await shot(p, "deck-editor");
      await p.reload();
      assert.equal(
        await p.locator("#deck-name").inputValue(),
        "구매 덱 자유 편집",
      );
      assert.equal(
        (await api(p, "/decks")).body.decks.find((d) => d.id === deckId)
          .isSelected,
        true,
      );
    },
  );
  await check(
    "mobile layouts at 360, 375, 390 and 412 pixels preserve scroll and usable controls",
    async () => {
      for (const [width, height] of [
        [360, 740],
        [375, 812],
        [390, 844],
        [412, 915],
      ]) {
        await a.page.setViewportSize({ width, height });
        await a.page.goto(origin + "/shop");
        await a.page
          .getByRole("button", { name: "완성 덱", exact: true })
          .click();
        await a.page
          .getByRole("heading", { name: "모바일 판매 완성 덱", exact: true })
          .waitFor();
        assert.ok(
          await a.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await admin.page.setViewportSize({ width, height });
        await admin.page.goto(origin + "/admin/shop-decks");
        await admin.page
          .getByRole("button", { name: "새 판매용 덱", exact: true })
          .waitFor();
        assert.ok(
          await admin.page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
      await admin.page
        .getByRole("button", { name: "모바일 판매 완성 덱", exact: true })
        .click();
      await shot(admin.page, "admin-mobile");
    },
  );
  await check(
    "purchased and selected deck enters actual AI intro and battle",
    async () => {
      const p = a.page;
      await p.goto(origin + "/ai-match");
      await p.getByRole("button", { name: "매치 시작", exact: true }).waitFor();
      await p.getByRole("button", { name: "매치 시작", exact: true }).click();
      await p
        .getByRole("button", { name: "이미지 이모티콘", exact: true })
        .waitFor({ timeout: 30000 });
      const skip = p.getByRole("button", { name: /건너뛰기/ });
      if (await skip.count()) await skip.first().click();
      await p.locator(".ko-player-champion").waitFor();
      await p.waitForTimeout(4800);
      await shot(p, "ai-battle");
      assert.ok((await p.locator(".ko-player-hand .ko-hand-card").count()) > 0);
    },
  );
  await check(
    "both authenticated PvP browsers enter with independently purchased ordinary decks",
    async () => {
      await a.page.goto(origin + "/shop");
      await b.page.goto(origin + "/shop");
      const purchase = await api(
        b.page,
        "/shop/decks/" + productId + "/purchase",
        "POST",
        {},
      );
      assert.equal(purchase.status, 200);
      const waiting = await api(a.page, "/online-matches", "POST", { deckId });
      assert.equal(waiting.status, 201);
      const matchId = waiting.body.match.id;
      assert.equal(
        (
          await api(b.page, "/online-matches/" + matchId + "/join", "POST", {
            deckId: purchase.body.deckId,
          })
        ).status,
        201,
      );
      await Promise.all([
        a.page.goto(origin + "/online/match/" + matchId),
        b.page.goto(origin + "/online/match/" + matchId),
      ]);
      for (const p of [a.page, b.page]) {
        await p
          .getByRole("button", { name: "이미지 이모티콘", exact: true })
          .waitFor({ timeout: 30000 });
        const skip = p.getByRole("button", { name: /건너뛰기/ });
        if (await skip.count()) await skip.first().click();
        await p.locator(".ko-player-champion").waitFor();
      }
      await a.page.waitForTimeout(5000);
      await shot(a.page, "pvp-a");
      await shot(b.page, "pvp-b");
      assert.equal(
        (await api(a.page, "/online-matches/" + matchId + "/abandon", "POST"))
          .status,
        200,
      );
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/browser-results.json",
    JSON.stringify(
      {
        results,
        pageErrors: errors,
        viewports: [
          [360, 740],
          [375, 812],
          [390, 844],
          [412, 915],
          [1440, 1000],
        ],
        kind: "Chromium mobile emulation, not a physical smartphone",
      },
      null,
      2,
    ),
  );
} catch (error) {
  await shot(a.page, "failure-player");
  await shot(admin.page, "failure-admin");
  console.error("Player page:", await a.page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
