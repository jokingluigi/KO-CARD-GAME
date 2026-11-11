/** Actual text-only champion editor roundtrips preserve executable effects/conditions. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { chromium } from "./black-gold-playwright.mjs";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
const out = "docs/qa/20261111-simple-champion-admin";
await mkdir(out, { recursive: true });
const f = await startTutorialFixture(),
  browser = await chromium.launch(),
  results = [];
const effect = {
  effects: [
    {
      action: "HEAL",
      target: { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 },
      values: { amount: 2 },
    },
  ],
  customMetadata: { keep: true },
};
const condition = {
  event: "CARD_RETIRED",
  required: 7,
  progress: 1,
  cardType: "WRESTLER",
  sourceActionType: "CARD_EFFECT",
  causedByOwner: true,
  strictEventCount: true,
  condition: {
    type: "ALL",
    conditions: [
      { type: "HEALTH", owner: "SELF", op: "LTE", value: 5 },
      { type: "TURN", turn: 3 },
    ],
  },
  customMetadata: { keep: true },
};
const choices = ["a", "b"].map((id, i) => ({
  id: "preserved-" + id,
  name: "선택지 " + id,
  description: "기존 조건 " + id,
  condition: {
    type: "ALL",
    conditions: [
      { type: "TURN", turn: i + 2 },
      { type: "HEALTH", owner: "SELF", op: "LTE", value: i + 4 },
    ],
  },
  cardDefinitionId: "simple-" + id,
  delivery: i ? "CAST" : "HAND",
}));
try {
  await f.db
    .insert(f.schema.cardsTable)
    .values(
      ["a", "b"].map((id) => ({
        id: "simple-" + id,
        name: "피니셔 " + id,
        cardType: "TECHNIQUE",
        rarity: "CHAMPION",
        cost: 6,
        attack: 0,
        health: 0,
        text: "검증 주문",
        isToken: true,
        isChampionToken: true,
        status: "DRAFT",
      })),
    );
  const base = {
    status: "DRAFT",
    abilityName: "유지할 이름",
    abilityCost: 2,
    abilityText: "기존 고유 효과",
    abilityEffects: effect,
    gameStartAbilityName: "기존 시작",
    gameStartAbilityText: "기존 시작 효과",
    gameStartAbilityEffects: effect,
    hasQuest: true,
    questName: "기존 조건 이름",
    questText: "기존 준비 설명",
    questProgressRequired: 7,
    questRewardText: "기존 완료 효과",
    questRewardEffects: effect,
    upgradedAbilityName: "기존 강화",
    upgradedAbilityCost: 1,
    upgradedAbilityText: "기존 강화 효과",
    upgradedAbilityEffects: effect,
  };
  await f.db.insert(f.schema.championsTable).values([
    {
      ...base,
      id: "simple-single",
      name: "간단한 챔피언",
      questCondition: condition,
    },
    {
      ...base,
      id: "simple-options",
      name: "간단한 선택지",
      questCondition: { ...condition, finisherChoices: choices },
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
      const req = route.request(),
        url = new URL(req.url()),
        body = req.postDataBuffer();
      const res = await fetch(f.origin + url.pathname + url.search, {
        method: req.method(),
        headers: {
          Cookie: f.cookie,
          ...(req.headers()["content-type"]
            ? { "Content-Type": req.headers()["content-type"] }
            : {}),
        },
        ...(body ? { body } : {}),
      });
      await route.fulfill({
        status: res.status,
        body: await res.text(),
        contentType: res.headers.get("content-type") ?? "application/json",
      });
    });
    const editor = page.locator("[data-admin-workbench]");
    const open = async (name) => {
      await page.goto("http://127.0.0.1:5186/admin/champions");
      await page
        .locator("article")
        .filter({ has: page.getByRole("heading", { name, exact: true }) })
        .getByRole("button", { name: "수정", exact: true })
        .click();
      await editor.waitFor();
    };
    const tab = (name) =>
      editor.getByRole("tab", { name, exact: true }).click();
    const save = async () => {
      await editor
        .getByRole("button", { name: "수정 저장", exact: true })
        .click();
      await editor.waitFor({ state: "detached" });
    };
    const noAdvanced = async () => {
      assert.equal(
        await editor.locator('textarea[spellcheck="false"]').count(),
        0,
      );
      assert.equal(
        await editor
          .getByText(
            /실제 효과 설정|선택지 ID|집계할 행동|이벤트 세부 필터|실제 판정 방식|특수 각성 템플릿/,
          )
          .count(),
        0,
      );
    };
    await open("간단한 챔피언");
    await tab("고유 · 시작 능력");
    await noAdvanced();
    await editor
      .getByLabel("고유 능력 효과", { exact: true })
      .fill("문장으로 수정한 고유 효과 " + width);
    await editor
      .getByLabel("게임 시작 능력 효과", { exact: true })
      .fill("문장으로 수정한 시작 효과 " + width);
    await page.screenshot({ path: `${out}/ability-${width}.png` });
    await tab("피니셔 준비");
    await noAdvanced();
    await editor
      .getByLabel("피니셔 준비 조건 설명", { exact: true })
      .fill("텍스트로 적은 준비 조건 " + width);
    await editor
      .getByLabel("준비 완료 효과", { exact: true })
      .fill("텍스트로 적은 완료 효과 " + width);
    await editor
      .getByLabel("강화 고유 능력", { exact: true })
      .fill("텍스트로 적은 강화 효과 " + width);
    await page.screenshot({ path: `${out}/preparation-${width}.png` });
    await save();
    let row = await read("simple-single");
    assert.deepEqual(row.questCondition, condition);
    for (const key of [
      "abilityEffects",
      "gameStartAbilityEffects",
      "questRewardEffects",
      "upgradedAbilityEffects",
    ])
      assert.deepEqual(row[key], effect);
    assert.equal(row.questProgressRequired, 7);
    assert.equal(row.abilityCost, 2);
    assert.equal(row.upgradedAbilityCost, 1);
    assert.equal(row.abilityName, "유지할 이름");
    assert.equal(row.questText, "텍스트로 적은 준비 조건 " + width);
    await open("간단한 챔피언");
    await tab("고유 · 시작 능력");
    assert.equal(
      await editor.getByLabel("고유 능력 효과", { exact: true }).inputValue(),
      "문장으로 수정한 고유 효과 " + width,
    );
    await tab("피니셔 준비");
    assert.equal(
      await editor
        .getByLabel("피니셔 준비 조건 설명", { exact: true })
        .inputValue(),
      "텍스트로 적은 준비 조건 " + width,
    );
    // Close without changing data before opening another champion.
    await editor
      .getByRole("button", { name: "편집을 닫고 목록으로", exact: true })
      .first()
      .click();
    await open("간단한 선택지");
    await tab("피니셔 준비");
    await noAdvanced();
    await editor
      .getByLabel("피니셔 1 준비 조건 설명", { exact: true })
      .fill("선택지 a 설명 " + width);
    await editor
      .getByLabel("피니셔 1 카드", { exact: true })
      .selectOption("simple-b");
    await editor
      .getByLabel("피니셔 1 완료 처리", { exact: true })
      .selectOption("CAST");
    await editor.locator(".admin-finisher-option-title").nth(1).click();
    await editor
      .getByLabel("피니셔 2 준비 조건 설명", { exact: true })
      .fill("선택지 b 설명 " + width);
    await page.screenshot({ path: `${out}/options-${width}.png` });
    await save();
    row = await read("simple-options");
    assert.deepEqual(
      row.questCondition.finisherChoices.map((o) => o.condition),
      choices.map((o) => o.condition),
    );
    assert.deepEqual(
      row.questCondition.finisherChoices.map((o) => o.id),
      choices.map((o) => o.id),
    );
    assert.equal(
      row.questCondition.finisherChoices[0].cardDefinitionId,
      "simple-b",
    );
    assert.equal(row.questCondition.finisherChoices[0].delivery, "CAST");
    assert.equal(
      row.questCondition.finisherChoices[1].description,
      "선택지 b 설명 " + width,
    );
    assert.deepEqual(row.abilityEffects, effect);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      textEditSaveReenter: true,
      advancedEditorsRemoved: true,
      allFourEffectConfigsPreserved: true,
      compoundAndEventFiltersPreserved: true,
      choiceIdsAndConditionsPreserved: true,
      cardAndDeliveryEditable: true,
      errors,
    });
    await context.close();
  }
  await writeFile(
    out + "/results.json",
    JSON.stringify({ results, productionWrites: 0 }, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await f.close();
}
