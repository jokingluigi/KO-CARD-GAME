/** Actual admin routes, HTTP validation, durable isolated DB writes and re-entry. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { chromium } from "./black-gold-playwright.mjs";
import { championRecordToDefinition } from "../../artifacts/ko-game/src/game/champions/published-champions.ts";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
const out = "docs/qa/20261111-finisher-delivery/admin";
await mkdir(out, { recursive: true });
const f = await startTutorialFixture(),
  browser = await chromium.launch(),
  results = [];
const condition = {
  event: "CARD_PLAYED",
  required: 2,
  cardType: "WRESTLER",
  customMetadata: { keep: true },
};
const options = ["a", "b"].map((id, i) => ({
  id,
  name: "선택지 " + id,
  description: "검증",
  condition: { type: "TURN", turn: i + 5 },
  cardDefinitionId: "link-" + id,
}));
try {
  await f.db
    .insert(f.schema.cardsTable)
    .values(
      ["a", "b"].map((id) => ({
        id: "link-" + id,
        name: "피니셔 " + id,
        cardType: "TECHNIQUE",
        rarity: "CHAMPION",
        cost: 6,
        attack: 0,
        health: 0,
        text: "격리 검증 주문",
        status: "DRAFT",
        isToken: true,
        isChampionToken: true,
      })),
    );
  await f.db.insert(f.schema.championsTable).values([
    {
      id: "link-single",
      name: "연결 검증 챔피언",
      status: "DRAFT",
      abilityName: "기존 능력",
      abilityCost: 1,
      abilityEffects: { effects: [] },
      hasQuest: true,
      questName: "기존 준비",
      questText: "선수 2장 사용",
      questCondition: condition,
      questProgressRequired: 2,
      questRewardEffects: { effects: [] },
    },
    {
      id: "link-options",
      name: "선택지 검증 챔피언",
      status: "DRAFT",
      abilityName: "기본",
      abilityEffects: { effects: [] },
      hasQuest: true,
      questName: "선택지 준비",
      questText: "검증",
      questProgressRequired: 1,
      questCondition: {
        event: "CARD_PLAYED",
        required: 1,
        finisherChoices: options,
      },
    },
  ]);
  const read = async (id) =>
    (
      await f.db
        .select()
        .from(f.schema.championsTable)
        .where(eq(f.schema.championsTable.id, id))
    )[0];
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width < 1000,
        isMobile: width < 1000,
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const q = route.request(),
        u = new URL(q.url());
      const res = await fetch(f.origin + u.pathname + u.search, {
        method: q.method(),
        headers: {
          Cookie: f.cookie,
          ...(q.headers()["content-type"]
            ? { "Content-Type": q.headers()["content-type"] }
            : {}),
        },
        ...(q.postDataBuffer() ? { body: q.postDataBuffer() } : {}),
      });
      await route.fulfill({
        status: res.status,
        body: await res.text(),
        contentType: res.headers.get("content-type") ?? "application/json",
      });
    });
    const open = async (name) => {
      await page.goto("http://127.0.0.1:5186/admin/champions");
      await page
        .locator("article")
        .filter({ has: page.getByRole("heading", { name, exact: true }) })
        .getByRole("button", { name: "수정", exact: true })
        .click();
      await page.locator("[data-admin-workbench]").waitFor();
    };
    const editor = page.locator("[data-admin-workbench]");
    const tab = () =>
      editor.getByRole("tab", { name: "피니셔 연결", exact: true }).click();
    const save = async () => {
      await editor
        .getByRole("button", { name: "수정 저장", exact: true })
        .click();
      await editor.waitFor({ state: "detached" });
    };
    await open("연결 검증 챔피언");
    await tab();
    await editor
      .getByLabel("연결할 피니셔", { exact: true })
      .selectOption("link-a");
    await editor.getByLabel("준비 완료 시 피니셔 처리").selectOption("HAND");
    await save();
    let row = await read("link-single");
    assert.deepEqual(row.questCondition.finisher, {
      cardDefinitionId: "link-a",
      delivery: "HAND",
    });
    assert.equal(row.questCondition.event, condition.event);
    assert.deepEqual(
      row.questCondition.customMetadata,
      condition.customMetadata,
    );
    assert.equal(row.abilityName, "기존 능력");
    assert.equal(row.questProgressRequired, 2);
    assert.equal(championRecordToDefinition(row).quest.reward.type, "FINISHER");
    await open("연결 검증 챔피언");
    await tab();
    assert.equal(
      await editor.getByLabel("준비 완료 시 피니셔 처리").inputValue(),
      "HAND",
    );
    await editor.getByLabel("준비 완료 시 피니셔 처리").selectOption("CAST");
    await page.screenshot({ path: `${out}/single-${width}.png` });
    await save();
    await open("연결 검증 챔피언");
    await tab();
    assert.equal(
      await editor.getByLabel("준비 완료 시 피니셔 처리").inputValue(),
      "CAST",
    );
    await editor.getByLabel("연결할 피니셔", { exact: true }).selectOption("");
    await save();
    row = await read("link-single");
    assert.equal(row.questCondition.finisher, undefined);
    assert.equal(
      championRecordToDefinition(row).quest.reward.type === "FINISHER",
      false,
    );
    await open("선택지 검증 챔피언");
    await editor.getByRole("tab", { name: "피니셔 준비", exact: true }).click();
    await editor
      .getByLabel("피니셔 1 카드", { exact: true })
      .selectOption("link-a");
    await editor.getByLabel("피니셔 1 완료 처리").selectOption("HAND");
    await editor.locator(".admin-finisher-option-title").nth(1).click();
    await editor
      .getByLabel("피니셔 2 카드", { exact: true })
      .selectOption("link-b");
    await editor.getByLabel("피니셔 2 완료 처리").selectOption("CAST");
    await page.screenshot({ path: `${out}/options-${width}.png` });
    await save();
    row = await read("link-options");
    assert.deepEqual(
      row.questCondition.finisherChoices.map((o) => [
        o.cardDefinitionId,
        o.delivery,
      ]),
      [
        ["link-a", "HAND"],
        ["link-b", "CAST"],
      ],
    );
    assert.deepEqual(
      row.questCondition.finisherChoices.map((o) => o.condition),
      options.map((o) => o.condition),
    );
    await open("선택지 검증 챔피언");
    await tab();
    await editor.getByText("피니셔 a · 손패에 추가", { exact: true }).waitFor();
    await editor.getByText("피니셔 b · 즉시 발동", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      saveReenter: true,
      handAndCast: true,
      unlinkLegacyRestored: true,
      independentOptions: true,
      preservedConditions: true,
      errors,
    });
    await context.close();
  }
  const before = await read("link-single");
  for (const finisher of [
    { cardDefinitionId: "reward-unit", delivery: "HAND" },
    { cardDefinitionId: "link-a", delivery: "WRONG" },
    { cardDefinitionId: "missing-card", delivery: "CAST" },
  ]) {
    const res = await fetch(f.origin + "/api/admin/champions/link-single", {
      method: "PATCH",
      headers: { Cookie: f.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        version: before.version,
        questCondition: { ...condition, finisher },
      }),
    });
    assert.equal(res.status, 400, await res.text());
  }
  assert.equal((await read("link-single")).version, before.version);
  await writeFile(
    out + "/results.json",
    JSON.stringify(
      { viewports: results, invalidConfigRejections: 3, productionWrites: 0 },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await f.close();
}
