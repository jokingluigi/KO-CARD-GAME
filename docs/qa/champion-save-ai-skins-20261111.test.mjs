/** Real authenticated routes with an isolated PostgreSQL-compatible DB. No production mutations. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
let f, deckId;
const frame = (name) => ({
  url: "/api/storage/objects/uploads/cosmetics/" + name + ".png",
  self: { scale: 1, x: 50, y: 35, flip: false, crop: true },
  opponent: { scale: 1, x: 50, y: 35, flip: true, crop: true },
});
const request = async (path, body, method = "PATCH", headers = {}) => {
  const r = await fetch(f.origin + "/api" + path, {
    method,
    headers: {
      Cookie: f.cookie,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
before(async () => {
  f = await startTutorialFixture();
  await f.db
    .insert(f.schema.cardsTable)
    .values({
      id: "ai-draft-unit",
      name: "미공개 선수",
      cardType: "WRESTLER",
      rarity: "NORMAL",
      status: "DRAFT",
      cost: 1,
      attack: 1,
      health: 2,
      text: "",
    });
  await f.db.insert(f.schema.cosmeticItemsTable).values([
    {
      id: "ai-card-native",
      type: "CARD_SKIN",
      targetId: "reward-unit",
      name: "선수 스킨",
      imageAssets: { art: "https://example.invalid/card.png" },
    },
    {
      id: "ai-champ-native",
      type: "CHAMPION_SKIN",
      targetId: "reward-champion",
      name: "챔피언 스킨",
      imageAssets: { art: "https://example.invalid/champ.png" },
    },
  ]);
  await f.db
    .insert(f.schema.cardSkinDefinitionsTable)
    .values({
      id: "ai-draft-legacy",
      cardDefinitionId: "ai-draft-unit",
      name: "카드팩 선수 스킨",
      status: "PUBLISHED",
      imageUrl: "https://example.invalid/legacy.png",
    });
});
after(async () => await f.close());
test("unchanged registered sprite URLs are not downloaded during a champion text save; stale versions reject before image verification", async () => {
  const { CosmeticImageStorage } =
    await import("../../artifacts/api-server/src/lib/object-storage.ts");
  const original = CosmeticImageStorage.prototype.verifyImage;
  let calls = 0;
  CosmeticImageStorage.prototype.verifyImage = async () => {
    calls++;
    return false;
  };
  try {
    const config = {
      version: 1,
      frames: { default: frame("registered"), hurt: frame("registered-hurt") },
      reactions: { HIT: "hurt" },
    };
    await f.db
      .update(f.schema.championsTable)
      .set({ presentationLines: { BATTLE_SPRITE: config } })
      .where(eq(f.schema.championsTable.id, "reward-champion"));
    let result = await request("/admin/champions/reward-champion", {
      description: "빠르게 저장되는 설명",
      version: 1,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(calls, 0);
    assert.equal(result.body.champion.version, 2);
    const changed = structuredClone(config);
    changed.frames.default.url =
      "/api/storage/objects/uploads/cosmetics/new-image.png";
    result = await request("/admin/champions/reward-champion", {
      presentationLines: { BATTLE_SPRITE: changed },
      version: 1,
    });
    assert.equal(result.status, 409);
    assert.equal(calls, 0);
    result = await request("/admin/champions/reward-champion", {
      presentationLines: { BATTLE_SPRITE: changed },
      version: 2,
    });
    assert.equal(result.status, 400);
    assert.equal(calls, 1);
  } finally {
    CosmeticImageStorage.prototype.verifyImage = original;
  }
});
test("committed champion save returns success even when unused audio deletion fails", async () => {
  const { AudioStorage } =
    await import("../../artifacts/api-server/src/lib/object-storage.ts");
  const original = AudioStorage.prototype.remove;
  let called;
  const removed = new Promise((resolve) => (called = resolve));
  AudioStorage.prototype.remove = async () => {
    called();
    throw Error("isolated storage cleanup failure");
  };
  try {
    await f.db
      .update(f.schema.championsTable)
      .set({
        questCompleteAudioAssetId: "/objects/uploads/audio/old.mp3",
        questCompleteAudioUrl: "/api/storage/objects/uploads/audio/old.mp3",
      })
      .where(eq(f.schema.championsTable.id, "reward-champion"));
    const result = await request("/admin/champions/reward-champion", {
      questCompleteAudioAssetId: null,
      questCompleteAudioUrl: null,
      description: "정리 실패와 무관하게 저장됨",
      version: 2,
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.champion.version, 3);
    await removed;
    assert.equal(
      (await request("/admin/champions/reward-champion", undefined, "GET")).body
        .champion.description,
      "정리 실패와 무관하게 저장됨",
    );
  } finally {
    AudioStorage.prototype.remove = original;
  }
});
test("creation replay and concurrent retries with the same idempotency key create exactly one champion", async () => {
  const key = randomUUID(),
    payload = {
      name: "중복 방지 챔피언",
      abilityText: "",
      maxHealth: 20,
      abilityCost: 0,
    };
  const results = await Promise.all([
    request("/admin/champions", payload, "POST", { "Idempotency-Key": key }),
    request("/admin/champions", payload, "POST", { "Idempotency-Key": key }),
  ]);
  assert.ok(
    results.every((r) => [200, 201].includes(r.status)),
    JSON.stringify(results),
  );
  assert.ok(results.every((r) => r.body.champion.id === key));
  assert.equal(
    (
      await f.db
        .select()
        .from(f.schema.championsTable)
        .where(eq(f.schema.championsTable.id, key))
    ).length,
    1,
  );
  assert.equal(
    (
      await request(
        "/admin/champions",
        { ...payload, name: "다른 내용" },
        "POST",
        { "Idempotency-Key": key },
      )
    ).status,
    409,
  );
});
test("native and card-pack wrestler skins persist on an AI deck including draft base cards without publishing or granting them", async () => {
  const options = await request("/admin/ai-decks/options", undefined, "GET");
  assert.equal(options.status, 200);
  assert.ok(
    options.body.cosmetics.some((i) => i.id === "pack-skin:ai-draft-legacy"),
  );
  const payload = {
    name: "AI 외형 확인 덱",
    description: "기존 설명 보존",
    championDefinitionId: "reward-champion",
    cardDefinitionIds: [
      ...Array(22).fill("reward-unit"),
      ...Array(3).fill("ai-draft-unit"),
    ],
    difficulty: "BOSS",
    enabled: true,
    displayOrder: 0,
    cosmeticIds: [
      "ai-card-native",
      "ai-champ-native",
      "pack-skin:ai-draft-legacy",
    ],
  };
  const before = await f.db.select().from(f.schema.userCosmeticsTable);
  const created = await request("/admin/ai-decks", payload, "POST");
  assert.equal(created.status, 201, JSON.stringify(created.body));
  deckId = created.body.deck.id;
  assert.equal(
    created.body.deck.cosmetics.skins["card:reward-unit"].id,
    "ai-card-native",
  );
  assert.equal(
    created.body.deck.cosmetics.skins["card:ai-draft-unit"].id,
    "pack-skin:ai-draft-legacy",
  );
  const list = await request("/admin/ai-decks", undefined, "GET");
  assert.equal(
    list.body.decks.find((d) => d.id === deckId).cosmetics.skins[
      "card:reward-unit"
    ].imageAssets.art,
    "https://example.invalid/card.png",
  );
  const publicList = await request("/ai-decks", undefined, "GET");
  assert.equal(
    publicList.body.decks.find((d) => d.id === deckId).cosmetics.skins[
      "card:ai-draft-unit"
    ].id,
    "pack-skin:ai-draft-legacy",
  );
  assert.equal(
    (
      await f.db
        .select()
        .from(f.schema.cardsTable)
        .where(eq(f.schema.cardsTable.id, "ai-draft-unit"))
    )[0].status,
    "DRAFT",
  );
  assert.deepEqual(
    await f.db.select().from(f.schema.userCosmeticsTable),
    before,
  );
});

test("mobile champion save recovers a lost committed response; AI skin editing and shared-code import save/reopen and render in a real AI match", async () => {
  const { chromium } = await import("./black-gold-playwright.mjs");
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const { encodeDeck, deckEntityRevision } =
    await import("../../artifacts/ko-game/src/lib/deck-share-code.ts");
  const fillers = Array.from({ length: 8 }, (_, i) => ({
    id: "player-filler-" + i,
    name: "검증 선수 " + i,
    cardType: "WRESTLER",
    rarity: "NORMAL",
    status: "PUBLISHED",
    cost: 1,
    attack: 1,
    health: 2,
    text: "",
  }));
  await f.db.insert(f.schema.cardsTable).values(fillers);
  const ids = ["reward-unit", ...fillers.map((c) => c.id)].flatMap((id, i) =>
    Array(i === 8 ? 1 : 3).fill(id),
  );
  await f.db
    .insert(f.schema.decksTable)
    .values({
      id: "player-selected-deck",
      userId: "tutorial-user",
      name: "출전 검증 덱",
      championDefinitionId: "reward-champion",
      cardDefinitionIds: ids,
      isSelected: true,
    });
  await f.db
    .insert(f.schema.userCardCollectionsTable)
    .values(
      ["reward-unit", ...fillers.map((c) => c.id)].map((cardDefinitionId) => ({
        userId: "tutorial-user",
        cardDefinitionId,
        quantity: 3,
      })),
    );
  await f.db
    .insert(f.schema.userChampionCollectionsTable)
    .values({
      userId: "tutorial-user",
      championDefinitionId: "reward-champion",
      owned: true,
    });
  const allCards = await f.db.select().from(f.schema.cardsTable),
    champion = (
      await f.db
        .select()
        .from(f.schema.championsTable)
        .where(eq(f.schema.championsTable.id, "reward-champion"))
    )[0];
  const code = encodeDeck({
    name: "공유받은 덱",
    championId: champion.id,
    championRevision: deckEntityRevision(champion),
    cards: [...new Set(ids)].map((id) => ({
      id,
      count: ids.filter((x) => x === id).length,
      revision: deckEntityRevision(allCards.find((c) => c.id === id)),
    })),
  });
  const browser = await chromium.launch(),
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
  const origin = "http://127.0.0.1:5186";
  const [cookieName, ...cookieValue] = f.cookie.split("=");
  await context.addCookies([
    { name: cookieName, value: cookieValue.join("="), url: origin },
  ]);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  const out = "docs/qa/20261111-champion-save-ai-skins";
  await mkdir(out, { recursive: true });
  const png = await readFile(
    "artifacts/ko-game/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
  );
  let loseResponse = true,
    committed = false,
    patches = 0,
    extraLists = 0;
  await context.route("https://example.invalid/**", (r) =>
    r.fulfill({ contentType: "image/png", body: png }),
  );
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    if (url.pathname.startsWith("/api/storage/")) {
      await route.fulfill({ contentType: "image/png", body: png });
      return;
    }
    if (
      committed &&
      url.pathname === "/api/admin/champions" &&
      method === "GET"
    ) {
      extraLists++;
      await route.fulfill({
        status: 503,
        json: { message: "isolated list refresh failure" },
      });
      return;
    }
    const response = await route.fetch({
      url: f.origin + url.pathname + url.search,
    });
    if (
      loseResponse &&
      url.pathname === "/api/admin/champions/reward-champion" &&
      method === "PATCH"
    ) {
      patches++;
      assert.equal(response.status(), 200);
      loseResponse = false;
      committed = true;
      await route.fulfill({
        status: 504,
        json: { message: "isolated lost response" },
      });
      return;
    }
    await route.fulfill({ response });
  });
  try {
    await page.goto(origin + "/admin/champions");
    const card = page
      .getByTestId("button-delete-champion-reward-champion")
      .locator("..")
      .locator("..");
    await card.getByRole("button", { name: "수정", exact: true }).click();
    await page
      .locator('[data-admin-panel="admin-champion-manager-0"] textarea')
      .fill("응답이 유실되어도 저장 확인");
    await page.getByRole("button", { name: "수정 저장", exact: true }).click();
    await page.getByText("챔피언을 수정했습니다.", { exact: true }).waitFor();
    assert.equal(patches, 1);
    assert.equal(extraLists, 0);
    assert.equal(
      (await request("/admin/champions/reward-champion", undefined, "GET")).body
        .champion.description,
      "응답이 유실되어도 저장 확인",
    );
    await page.screenshot({ path: out + "/champion-saved-mobile.png" });
    committed = false;
    await page.goto(origin + "/admin/ai-decks");
    await page
      .getByRole("button")
      .filter({ hasText: "AI 외형 확인 덱" })
      .first()
      .click();
    await page.getByRole("tab", { name: /스킨 · 외형/ }).click();
    await page
      .getByLabel("격리 보상 선수 스킨", { exact: true })
      .selectOption("ai-card-native");
    await page
      .getByLabel("미공개 선수 스킨", { exact: true })
      .selectOption("pack-skin:ai-draft-legacy");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByText("AI 덱을 저장했습니다.", { exact: true }).waitFor();
    await page.getByRole("tab", { name: /덱 구성/ }).click();
    await page
      .getByLabel("덱 코드 또는 공유 링크", { exact: true })
      .fill("KO1.invalid");
    await page
      .getByRole("button", { name: "덱 코드 적용", exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    await page
      .getByLabel("덱 코드 또는 공유 링크", { exact: true })
      .fill("https://example.invalid/decks#deck=" + code);
    await page
      .getByRole("button", { name: "덱 코드 적용", exact: true })
      .click();
    await page.getByText(/25장을 편집기에 적용했습니다/).waitFor();
    await page.screenshot({ path: out + "/shared-code-mobile.png" });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByText("AI 덱을 저장했습니다.", { exact: true }).waitFor();
    await page.reload();
    await page
      .getByRole("button")
      .filter({ hasText: "AI 외형 확인 덱" })
      .first()
      .click();
    await page.getByRole("tab", { name: /스킨 · 외형/ }).click();
    assert.equal(
      await page
        .getByLabel("격리 보상 선수 스킨", { exact: true })
        .inputValue(),
      "ai-card-native",
    );
    assert.equal(
      await page.getByLabel("미공개 선수 스킨", { exact: true }).count(),
      0,
    );
    const saved = (
      await request("/admin/ai-decks", undefined, "GET")
    ).body.decks.find((d) => d.id === deckId);
    assert.deepEqual([...saved.cardDefinitionIds].sort(), [...ids].sort());
    assert.equal(saved.name, "AI 외형 확인 덱");
    await page.screenshot({ path: out + "/ai-skins-mobile.png" });
    for (const [width, height] of [
      [844, 390],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      await page.screenshot({ path: out + "/ai-skins-" + width + ".png" });
    }
    // Fixed ordinary opponent cards make the assigned wrestler skin observable quickly.
    await request("/admin/ai-decks/" + deckId, {
      ...saved,
      cardDefinitionIds: Array(25).fill("reward-unit"),
      cosmeticIds: ["ai-card-native", "ai-champ-native"],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/ai-match?source=admin&aiDeckId=" + deckId);
    await page.getByRole("button", { name: "매치 시작", exact: true }).click();
    const skip = page.getByRole("button", { name: /건너뛰기/ });
    await skip.waitFor({ timeout: 15000 }).catch(() => {});
    if (await skip.isVisible().catch(() => false)) await skip.click();
    const mulligan = page.getByRole("button", {
      name: "0장 교체",
      exact: true,
    });
    await mulligan.waitFor({ timeout: 10000 }).catch(() => {});
    if (await mulligan.isVisible().catch(() => false)) await mulligan.click();
    const skinImage = page.locator(
      '.ko-opponent-board-row img[src="https://example.invalid/card.png"]',
    );
    for (let i = 0; i < 8 && !(await skinImage.count()); i++) {
      const end = page.getByRole("button", { name: /^턴 종료/ }).first();
      if (await end.isVisible().catch(() => false)) await end.click();
      const confirm = page.getByRole("button", {
        name: /남은 행동이 있지만 턴 종료 확정/,
      });
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await page.waitForTimeout(1300);
    }
    await skinImage.first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: out + "/actual-ai-wrestler-skin.png" });
    assert.deepEqual(errors, []);
    await writeFile(
      out + "/browser-results.json",
      JSON.stringify(
        {
          lostCommittedResponseRecovered: true,
          championWriteCount: patches,
          postSaveListReads: extraLists,
          aiCardSkinsPersist: true,
          legacyDraftBaseSkin: true,
          sharedCodeImportPersist: true,
          actualAIMatchWrestlerSkin: true,
          viewports: [
            [390, 844],
            [844, 390],
            [1440, 900],
          ],
          placeholderArt: true,
          productionWrites: 0,
          errors,
        },
        null,
        2,
      ),
    );
  } catch(error){console.log("BROWSER_FAILURE",page.url(),(await page.locator("body").innerText()).slice(-6000));await page.screenshot({path:out+"/failure.png"});throw error;} finally {
    await browser.close();
  }
});
