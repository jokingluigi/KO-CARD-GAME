/** Real admin routes and real HTTP writes against disposable PGlite only. */
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { chromium } from "./black-gold-playwright.mjs";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
const out = process.env.ADMIN_QA_OUTPUT ?? "docs/qa/20261110-admin-workspace";
await mkdir(out, { recursive: true });
const f = await startTutorialFixture(),
  browser = await chromium.launch({ headless: true }),
  results = [];
const originalCondition = {
  event: "CARD_PLAYED",
  progress: 2,
  required: 7,
  cardType: "WRESTLER",
  strictEventCount: true,
  sourceActionType: "CARD_EFFECT",
  causedByOwner: true,
  customMetadata: { keep: true },
};
const optionData = [
  {
    id: "a",
    name: "소환 피니셔",
    description: "선수 등장",
    cardDefinitionId: "workspace-finisher-a",
    condition: {
      type: "EVENT",
      event: "ENTER_FIELD",
      owner: "SELF",
      required: 2,
    },
  },
  {
    id: "b",
    name: "턴 피니셔",
    description: "다섯 턴",
    cardDefinitionId: "workspace-finisher-b",
    condition: { type: "TURN", turn: 5 },
  },
];
try {
  await f.db.insert(f.schema.cardsTable).values([
    {
      id: "workspace-card",
      name: "업무 카드",
      text: "기존 효과 설명",
      cardType: "WRESTLER",
      rarity: "NORMAL",
      cost: 2,
      attack: 3,
      health: 4,
      status: "DRAFT",
      imageAssetId: "/objects/uploads/card-images/workspace.png",
      imageUrl: "/api/storage/objects/uploads/card-images/workspace.png",
    },
    {
      id: "workspace-finisher-a",
      name: "검증 피니셔 A",
      text: "검증용",
      cardType: "TECHNIQUE",
      rarity: "CHAMPION",
      cost: 1,
      attack: 0,
      health: 0,
      status: "DRAFT",
      isToken: true,
      isChampionToken: true,
    },
    {
      id: "workspace-finisher-b",
      name: "검증 피니셔 B",
      text: "검증용",
      cardType: "TECHNIQUE",
      rarity: "CHAMPION",
      cost: 1,
      attack: 0,
      health: 0,
      status: "DRAFT",
      isToken: true,
      isChampionToken: true,
    },
  ]);
  await f.db.insert(f.schema.championsTable).values([
    {
      id: "workspace-champion",
      name: "조건 검증 챔피언",
      description: "편집 보존 검증",
      status: "DRAFT",
      maxHealth: 22,
      abilityName: "기본 능력",
      abilityCost: 1,
      abilityText: "기존 능력 설명",
      abilityEffects: { effects: [] },
      hasQuest: true,
      questName: "기존 준비",
      questText: "기존 준비 조건 설명",
      questCondition: originalCondition,
      questProgressRequired: 7,
      questRewardText: "기존 완료 효과",
      questRewardEffects: { effects: [] },
      upgradedAbilityName: "기존 강화",
      upgradedAbilityCost: 2,
      upgradedAbilityText: "강화 설명",
      upgradedAbilityEffects: { effects: [] },
      imageUrl:
        "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
    },
    {
      id: "workspace-options",
      name: "선택지 검증 챔피언",
      status: "DRAFT",
      abilityName: "기본",
      abilityEffects: { effects: [] },
      hasQuest: true,
      questName: "선택지 준비",
      questText: "선택지 테스트",
      questProgressRequired: 1,
      questCondition: {
        event: "CARD_PLAYED",
        required: 1,
        finisherChoices: optionData,
        customMetadata: { keep: true },
      },
    },
    {
      id: "workspace-noquest",
      name: "준비 없음 검증",
      status: "DRAFT",
      abilityName: "기본",
      abilityEffects: { effects: [] },
      hasQuest: false,
      questCondition: null,
    },
  ]);
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
      page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [],
      writes = [];
    let failCard = false;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      if (path === "/api/storage/objects/uploads/card-images/workspace.png")
        return route.fulfill({
          contentType: "image/png",
          body: await readFile(
            "artifacts/ko-game/qa/retro-font/assets/card-102e8061-c3b8-44a5-a11c-56379996fee7.png",
          ),
        });
      if (req.method() !== "GET") writes.push({ path, method: req.method() });
      if (
        failCard &&
        path === "/api/admin/cards/workspace-card" &&
        req.method() === "PATCH"
      ) {
        failCard = false;
        return route.fulfill({
          status: 503,
          json: { message: "격리 검증: 일시 저장 실패" },
        });
      }
      if (req.method() === "PATCH")
        await new Promise((r) => setTimeout(r, 120));
      const response = await fetch(f.origin + path + url.search, {
        method: req.method(),
        headers: {
          Cookie: f.cookie,
          ...(req.headers()["content-type"]
            ? { "Content-Type": req.headers()["content-type"] }
            : {}),
        },
        ...(req.postDataBuffer() ? { body: req.postDataBuffer() } : {}),
      });
      return route.fulfill({
        status: response.status,
        body: await response.text(),
        headers: {
          "Content-Type":
            response.headers.get("content-type") ?? "application/json",
        },
      });
    });
    await page.goto("http://127.0.0.1:5186/admin");
    await page
      .getByRole("heading", { name: "오늘은 무엇을 편집할까요?" })
      .waitFor();
    await page.screenshot({
      path: `${out}/dashboard-${width}x${height}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Control+k");
    await page.getByLabel("관리 메뉴 검색", { exact: true }).fill("태그");
    await page.getByRole("button", { name: /^태그 관리/ }).click();
    await page.getByTestId("admin-tag-manager").waitFor();
    await page.goto("http://127.0.0.1:5186/admin/cards");
    await page.getByTestId("row-card-workspace-card").waitFor();
    await page.getByTestId("input-card-search").fill("업무 카드");
    await page.getByTestId("row-card-workspace-card").click();
    const editor = page.locator("[data-admin-workbench]");
    await editor.waitFor();
    assert.equal(await editor.getAttribute("role"), "dialog");
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await editor.evaluate((n) => n.contains(document.activeElement)),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await editor.evaluate((n) => n.contains(document.activeElement)),
      true,
    );
    await editor.getByTestId("input-card-name").fill("업무 카드 " + width);
    assert.match(
      await editor.locator('[role="status"]').textContent(),
      /저장하지 않은/,
    );
    const dismiss = page.waitForEvent("dialog").then((d) => d.dismiss());
    await editor.getByRole("button", { name: "편집을 닫고 목록으로" }).click();
    await dismiss;
    assert.equal(await editor.count(), 1);
    assert.equal(
      await editor.getByTestId("input-card-name").inputValue(),
      "업무 카드 " + width,
    );
    await editor.getByRole("tab", { name: "이미지", exact: true }).click();
    const chooserPromise = page.waitForEvent("filechooser");
    await editor.getByTestId("button-change-card-image").click();
    await chooserPromise;
    if (width < 901) {
      await editor
        .getByRole("button", { name: "미리보기", exact: true })
        .click();
      await editor
        .getByRole("complementary", { name: "카드 미리보기" })
        .waitFor({ state: "visible" });
      await editor
        .getByRole("button", { name: "설정 편집", exact: true })
        .click();
    }
    await editor.getByRole("tab", { name: "기본 정보", exact: true }).click();
    await editor.getByTestId("input-card-name").fill("");
    await editor.getByRole("tab", { name: "이미지", exact: true }).click();
    await editor.getByTestId("button-save-card").click();
    await editor.getByRole("tab", { name: "기본 정보", exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("data-testid") ===
        "input-card-name",
    );
    await editor.getByTestId("input-card-name").fill("업무 카드 " + width);
    failCard = true;
    await editor.getByTestId("button-save-card").click();
    await editor.getByRole("alert").waitFor();
    assert.equal(
      await editor.getByTestId("input-card-name").inputValue(),
      "업무 카드 " + width,
    );
    assert.equal(await editor.count(), 1);
    // A failing request does not erase data; repeated shortcut presses still produce one retry.
    const before = writes.filter(
      (w) => w.path === "/api/admin/cards/workspace-card",
    ).length;
    await page.keyboard.press("Control+s");
    await page.keyboard.press("Control+s");
    await editor.waitFor({ state: "detached" });
    assert.equal(
      writes.filter((w) => w.path === "/api/admin/cards/workspace-card").length,
      before + 1,
    );
    assert.equal(
      await page.getByTestId("input-card-search").inputValue(),
      "업무 카드",
    );
    await page.goto("http://127.0.0.1:5186/admin/champions");
    const row = page.locator("article").filter({
      has: page.getByRole("heading", {
        name: "조건 검증 챔피언",
        exact: true,
      }),
    });
    await row.getByRole("button", { name: "수정", exact: true }).click();
    await editor.waitFor();
    await editor.getByRole("tab", { name: "피니셔 준비", exact: true }).click();
    if (process.env.ASSERT_ABILITY_LABELS) {
      assert.equal(
        await editor.getByLabel("고유 능력 이름", { exact: true }).count(),
        0,
      );
      assert.equal(
        await editor.getByLabel("강화 능력 이름", { exact: true }).count(),
        0,
      );
      assert.equal(
        await editor.getByLabel("완료 후 강화 고유 능력 사용").isChecked(),
        true,
      );
      assert.equal(
        await editor
          .getByRole("complementary", { name: "챔피언 미리보기" })
          .getByText("기본 능력", { exact: true })
          .count(),
        0,
      );
    }
    const prep = editor.getByTestId("champion-preparation-editor");
    await prep.waitFor();
    assert.equal(
      await prep
        .getByRole("button", { name: /단일 준비 조건/ })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await prep.getByLabel("준비 완료 필요 진행도").inputValue(),
      "7",
    );
    assert.equal(
      await prep.getByLabel("집계할 행동").inputValue(),
      "CARD_PLAYED",
    );
    assert.equal(
      await prep.getByLabel("플레이어에게 보여줄 조건 설명").inputValue(),
      "기존 준비 조건 설명",
    );
    await prep.getByRole("button", { name: /피니셔 선택지/ }).click();
    await prep.getByRole("button", { name: /단일 준비 조건/ }).click();
    assert.equal(
      await prep.getByLabel("준비 완료 필요 진행도").inputValue(),
      "7",
    );
    if (width < 901) {
      await editor
        .getByRole("button", { name: "미리보기", exact: true })
        .click();
      await editor
        .getByRole("complementary", { name: "챔피언 미리보기" })
        .waitFor({ state: "visible" });
      await editor
        .getByRole("button", { name: "설정 편집", exact: true })
        .click();
    }
    const save = editor.getByRole("button", { name: "수정 저장", exact: true }),
      bounds = await save.boundingBox();
    assert.ok(
      bounds.height >= 44 &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= height + 1,
      JSON.stringify(bounds),
    );
    assert.equal(
      await editor.evaluate((n) => n.scrollWidth > n.clientWidth + 1),
      false,
    );
    await page.screenshot({
      path: `${out}/preparation-${width}x${height}.png`,
    });
    await save.click();
    await editor.waitFor({ state: "detached" });
    const [saved] = await f.db
      .select()
      .from(f.schema.championsTable)
      .where(eq(f.schema.championsTable.id, "workspace-champion"));
    assert.deepEqual(saved.questCondition, originalCondition);
    assert.equal(saved.questProgressRequired, 7);
    assert.equal(saved.upgradedAbilityName, "기존 강화");
    assert.equal(saved.abilityName, "기본 능력");
    const optionRow = page.locator("article").filter({
      has: page.getByRole("heading", {
        name: "선택지 검증 챔피언",
        exact: true,
      }),
    });
    await optionRow.getByRole("button", { name: "수정", exact: true }).click();
    await editor.getByRole("tab", { name: "피니셔 준비", exact: true }).click();
    assert.equal(
      await prep
        .getByRole("button", { name: /피니셔 선택지/ })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await prep.getByLabel("준비 완료 필요 진행도").count(), 0);
    await prep.getByRole("button", { name: /단일 준비 조건/ }).click();
    await prep.getByRole("button", { name: /피니셔 선택지/ }).click();
    await editor
      .getByRole("button", { name: "수정 저장", exact: true })
      .click();
    await editor.waitFor({ state: "detached" });
    const [options] = await f.db
      .select()
      .from(f.schema.championsTable)
      .where(eq(f.schema.championsTable.id, "workspace-options"));
    assert.deepEqual(options.questCondition.finisherChoices, optionData);
    assert.deepEqual(options.questCondition.customMetadata, { keep: true });
    const noRow = page.locator("article").filter({
      has: page.getByRole("heading", { name: "준비 없음 검증", exact: true }),
    });
    await noRow.getByRole("button", { name: "수정", exact: true }).click();
    await editor.getByRole("tab", { name: "피니셔 준비", exact: true }).click();
    assert.equal(await prep.getByLabel("피니셔 준비 사용").isChecked(), false);
    await editor
      .getByRole("button", { name: "수정 저장", exact: true })
      .click();
    await editor.waitFor({ state: "detached" });
    const [none] = await f.db
      .select()
      .from(f.schema.championsTable)
      .where(eq(f.schema.championsTable.id, "workspace-noquest"));
    assert.equal(none.hasQuest, false);
    assert.equal(none.questCondition, null);
    if (width === 1440) {
      await row.getByRole("button", { name: "수정", exact: true }).click();
      await editor
        .getByRole("tab", { name: "피니셔 준비", exact: true })
        .click();
      await prep.getByLabel("준비 완료 필요 진행도").fill("9");
      await prep.getByLabel("집계할 행동").selectOption("ENTER_FIELD");
      await editor
        .getByRole("button", { name: "수정 저장", exact: true })
        .click();
      await editor.waitFor({ state: "detached" });
      let [edited] = await f.db
        .select()
        .from(f.schema.championsTable)
        .where(eq(f.schema.championsTable.id, "workspace-champion"));
      assert.equal(edited.questProgressRequired, 9);
      assert.equal(edited.questCondition.required, 9);
      assert.equal(edited.questCondition.event, "ENTER_FIELD");
      assert.deepEqual(edited.questCondition.customMetadata, { keep: true });
      await row.getByRole("button", { name: "수정", exact: true }).click();
      await editor
        .getByRole("tab", { name: "피니셔 준비", exact: true })
        .click();
      assert.equal(
        await prep.getByLabel("준비 완료 필요 진행도").inputValue(),
        "9",
      );
      assert.equal(
        await prep.getByLabel("집계할 행동").inputValue(),
        "ENTER_FIELD",
      );
      await prep
        .locator("summary")
        .filter({ hasText: "특수 각성 템플릿" })
        .click();
      await prep
        .getByRole("button", {
          name: "위기 각성 · 3단계 연쇄 소환 적용",
          exact: true,
        })
        .click();
      await editor
        .getByRole("button", { name: "수정 저장", exact: true })
        .click();
      await editor.waitFor({ state: "detached" });
      [edited] = await f.db
        .select()
        .from(f.schema.championsTable)
        .where(eq(f.schema.championsTable.id, "workspace-champion"));
      assert.equal(edited.questCondition.event, "STATE_CONDITION");
      assert.ok(edited.questCondition.awakening);
      assert.equal(edited.questName, "위기 각성");
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      focusContainment: true,
      editedConditionAndReentry: width === 1440,
      awakeningPresetSaved: width === 1440,
      realAdminPages: true,
      realHTTP: true,
      keyboardMenu: true,
      focusError: true,
      dirtyCloseGuard: true,
      failedSavePreservesInput: true,
      singleSaveShortcut: true,
      fileChooser: true,
      preview: true,
      footerVisible: true,
      legacyConditionPreserved: true,
      choicesPreserved: true,
      noQuestPreserved: true,
      errors,
    });
    await context.close();
  }
  await writeFile(
    out + "/browser-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await f.close();
}
