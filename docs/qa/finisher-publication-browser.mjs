/** Published champions + fresh draft finishers, actual admin HTTP against disposable DB. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { chromium } from "./black-gold-playwright.mjs";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
const out = "docs/qa/20261111-finisher-save-fix";
await mkdir(out, { recursive: true });
const f = await startTutorialFixture(),
  browser = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const ids = [`live-single-${width}`, `live-options-${width}`],
      spellIds = Array.from(
        { length: 3 },
        (_, i) => `live-finisher-${width}-${i}`,
      );
    await f.db
      .insert(f.schema.cardsTable)
      .values(
        spellIds.map((id, i) => ({
          id,
          name: `신규 피니셔 ${width}-${i}`,
          cardType: "TECHNIQUE",
          rarity: "CHAMPION",
          isToken: true,
          isChampionToken: true,
          cost: 6,
          attack: 0,
          health: 0,
          text: "격리 피니셔",
          status: "DRAFT",
          effectConfig: { effects: [] },
        })),
      );
    const base = {
      status: "PUBLISHED",
      abilityName: "기존 기본",
      abilityCost: 1,
      abilityEffects: { effects: [] },
      hasQuest: true,
      questName: "기존 준비",
      questText: "카드 2회 사용",
      questProgressRequired: 2,
    };
    await f.db.insert(f.schema.championsTable).values([
      {
        ...base,
        id: ids[0],
        name: "기존 챔피언 " + width,
        questCondition: { event: "CARD_PLAYED", required: 2 },
      },
      {
        ...base,
        id: ids[1],
        name: "선택지 챔피언 " + width,
        questCondition: {
          event: "CARD_PLAYED",
          required: 2,
          finisherChoices: spellIds
            .slice(1)
            .map((id, i) => ({
              id: "option-" + i,
              name: "피니셔 " + i,
              description: "검증",
              cardDefinitionId: id,
              delivery: i ? "CAST" : "HAND",
              condition: { type: "TURN", turn: i + 3 },
            })),
        },
      },
    ]);
    const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width < 1000,
        isMobile: width < 1000,
      }),
      page = await context.newPage(),
      errors = [],
      writes = [];
    let failConfirmation = width === 390;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        body = req.postDataBuffer();
      if (req.method() === "PATCH")
        writes.push({ path: url.pathname, body: req.postDataJSON() });
      if (
        failConfirmation &&
        req.method() === "PATCH" &&
        req.postDataJSON()?.publishFinisherCards
      ) {
        failConfirmation = false;
        return route.fulfill({
          status: 503,
          json: { message: "격리 저장 실패" },
        });
      }
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
    const save = () =>
      editor.getByRole("button", { name: "수정 저장", exact: true }).click();
    const review = () =>
      page.getByRole("alertdialog", { name: "피니셔 공개 후 연결 저장" });
    const confirm = () =>
      review()
        .getByRole("button", { name: "피니셔 공개하고 저장", exact: true })
        .click();
    const card = async (id) =>
      (
        await f.db
          .select()
          .from(f.schema.cardsTable)
          .where(eq(f.schema.cardsTable.id, id))
      )[0];
    const champion = async (id) =>
      (
        await f.db
          .select()
          .from(f.schema.championsTable)
          .where(eq(f.schema.championsTable.id, id))
      )[0];
    await open("기존 챔피언 " + width);
    await editor.getByRole("tab", { name: "피니셔 연결", exact: true }).click();
    await editor
      .getByLabel("연결할 피니셔", { exact: true })
      .selectOption(spellIds[0]);
    await editor.getByRole("note").waitFor();
    await save();
    await review().waitFor();
    assert.ok(
      await review()
        .getByText(`신규 피니셔 ${width}-0`, { exact: true })
        .isVisible(),
    );
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/publication-review-${width}.png` });
    await review()
      .getByRole("button", { name: "편집으로 돌아가기", exact: true })
      .click();
    await review().waitFor({ state: "hidden" });
    assert.equal(
      await editor.getByLabel("연결할 피니셔", { exact: true }).inputValue(),
      spellIds[0],
    );
    assert.equal((await card(spellIds[0])).status, "DRAFT");
    assert.equal((await champion(ids[0])).version, 1);
    await save();
    await review().waitFor();
    await confirm();
    if (width === 390) {
      await editor.getByRole("alert").waitFor();
      assert.equal((await card(spellIds[0])).status, "DRAFT");
      assert.equal((await champion(ids[0])).version, 1);
      assert.equal(
        await editor.getByLabel("연결할 피니셔", { exact: true }).inputValue(),
        spellIds[0],
      );
      await save();
      await review().waitFor();
      await confirm();
    }
    await editor.waitFor({ state: "detached" });
    assert.equal((await card(spellIds[0])).status, "PUBLISHED");
    assert.equal((await card(spellIds[0])).version, 2);
    assert.equal((await champion(ids[0])).version, 2);
    assert.equal(
      (await champion(ids[0])).questCondition.finisher.cardDefinitionId,
      spellIds[0],
    );
    await open("기존 챔피언 " + width);
    await editor.getByRole("tab", { name: "피니셔 연결", exact: true }).click();
    assert.equal(
      await editor.getByLabel("연결할 피니셔", { exact: true }).inputValue(),
      spellIds[0],
    );
    await editor.getByLabel("준비 완료 시 피니셔 처리").selectOption("CAST");
    await save();
    await editor.waitFor({ state: "detached" });
    assert.equal(
      (await champion(ids[0])).questCondition.finisher.delivery,
      "CAST",
    );
    assert.equal((await card(spellIds[0])).version, 2);
    await open("선택지 챔피언 " + width);
    await save();
    await review().waitFor();
    assert.equal(await review().locator("li").count(), 2);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/multiple-review-${width}.png` });
    await confirm();
    await editor.waitFor({ state: "detached" });
    for (const id of spellIds.slice(1))
      assert.equal((await card(id)).status, "PUBLISHED");
    assert.deepEqual(
      (await champion(ids[1])).questCondition.finisherChoices.map(
        (o) => o.delivery,
      ),
      ["HAND", "CAST"],
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      publishedChampionWithNewDraftFinisher: true,
      reviewBeforePublication: true,
      cancelKeepsDraft: true,
      atomicPublicationAndSave: true,
      saveReentry: true,
      multipleAlternatives: true,
      failedRequestPreservesDraft: width === 390,
      errors,
    });
    await context.close();
  }
  await writeFile(
    out + "/browser-results.json",
    JSON.stringify({ results, productionWrites: 0 }, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await f.close();
}
