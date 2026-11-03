/** Actual admin UI + isolated API/DB; no production authoring writes. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
import { chromium } from "./black-gold-playwright.mjs";
const f = await startTutorialFixture(),
  browser = await chromium.launch();
const origin = process.env.KO_UI_ORIGIN ?? "http://127.0.0.1:5186",
  out = process.env.KO_CHAMPION_SPELL_OUT ?? "qa-results/champion-spell";
await mkdir(out, { recursive: true });
const input = {
  name: "등급 검증 주문",
  cardType: "TECHNIQUE",
  rarity: "EPIC",
  cost: 2,
  attack: 0,
  health: 0,
  text: "카드 1장을 뽑습니다.",
  isToken: false,
  isChampionToken: false,
  keywords: [],
  tags: [],
  effectId: "STRUCTURED_EFFECTS_V1",
  effectConfig: {
    effects: [{ trigger: "ACTIVE", action: "DRAW", values: { amount: 1 } }],
  },
  status: "DRAFT",
};
const api = async (path, method = "GET", body) => {
  const r = await fetch(f.origin + "/api/" + path, {
    method,
    headers: { Cookie: f.cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.ok(r.ok, JSON.stringify(data));
  return data;
};
try {
  const { card } = await api("admin/cards", "POST", input);
  await f.db
    .insert(f.schema.userCardCollectionsTable)
    .values({
      userId: "tutorial-user",
      cardDefinitionId: card.id,
      quantity: 1,
    });
  const results = [];
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    await api("admin/cards/" + card.id, "PATCH", input);
    const p = await browser.newPage({
      viewport: { width, height },
      ignoreHTTPSErrors: true,
    });
    await auditSetup(p);
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (r) => {
      const q = r.request(),
        url = new URL(q.url()),
        path = url.pathname;
      if (path === "/api/auth/me" || path === "/api/admin/session")
        return r.fulfill({
          json: {
            authenticated: true,
            user: {
              id: "tutorial-user",
              role: "ADMIN",
              nickname: "검증 관리자",
              currencyBalance: 0,
            },
          },
        });
      if (
        path.startsWith("/api/admin/cards") ||
        path === "/api/admin/card-frames" ||
        path.startsWith("/api/admin/card-frames/") ||
        path === "/api/card-frames" ||
        path === "/api/collection"
      ) {
        const response = await fetch(f.origin + path + url.search, {
          method: q.method(),
          headers: { Cookie: f.cookie, "Content-Type": "application/json" },
          ...(q.method() !== "GET" ? { body: q.postData() } : {}),
        });
        return r.fulfill({
          status: response.status,
          contentType: "application/json",
          body: await response.text(),
        });
      }
      return r.fallback();
    });
    await p.goto(origin + "/admin/cards");
    const row = p.getByTestId("row-card-" + card.id);
    await row.waitFor();
    await row.locator("summary").click();
    await p.getByTestId("button-edit-card-" + card.id).click();
    const rarity = p.getByTestId("input-card-rarity");
    assert.deepEqual(
      await rarity.locator("option").evaluateAll((o) => o.map((x) => x.value)),
      ["EPIC", "CHAMPION", "TOKEN"],
    );
    await rarity.selectOption("CHAMPION");
    await p.getByRole("dialog").locator('[data-rarity="CHAMPION"]').waitFor();
    await p.screenshot({ path: out + "/editor-" + width + ".png" });
    const saved = p.waitForResponse(
      (r) =>
        r.url().includes("/api/admin/cards/" + card.id) &&
        r.request().method() === "PATCH",
    );
    await p.getByTestId("button-save-card").click();
    assert.equal((await saved).status(), 200);
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    const stored = (await api("admin/cards")).cards.find(
      (c) => c.id === card.id,
    );
    assert.equal(stored.rarity, "CHAMPION");
    assert.deepEqual(stored.effectConfig, input.effectConfig);
    assert.equal(stored.isToken, false);
    await p.reload();
    await row.waitFor();
    await row.locator("summary").click();
    await p.getByTestId("button-edit-card-" + card.id).click();
    assert.equal(await rarity.inputValue(), "CHAMPION");
    await p.getByTestId("button-cancel-card").click();
    await p.getByTestId("select-card-rarity").selectOption("CHAMPION");
    await p.getByTestId("select-card-type").selectOption("TECHNIQUE");
    assert.equal(
      await p.getByTestId("select-card-rarity").inputValue(),
      "CHAMPION",
    );
    await row.waitFor();
    await api("admin/card-frames/TECHNIQUE/CHAMPION", "PUT", {
      frameAssetId: null,
      enabled: true,
      frameScale: 1.1,
      frameOffsetX: 0,
      frameOffsetY: 0,
    });
    assert.ok(
      (await api("admin/card-frames")).frames.some(
        (x) => x.cardType === "TECHNIQUE" && x.rarity === "CHAMPION",
      ),
    );
    await p.goto(origin + "/collection");
    await p.locator(".ko-catalog-filter-disclosure summary").click();
    await p
      .getByRole("combobox", { name: "등급", exact: true })
      .selectOption("CHAMPION");
    await p.locator("[data-rarity=CHAMPION]").first().waitFor();
    await p.screenshot({ path: out + "/collection-" + width + ".png" });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      adminSaveAndReentry: true,
      championPreview: true,
      filterPreserved: true,
      collectionChampionFilter: true,
      spellFrameSave: true,
      effectUnchanged: true,
      productionWrites: 0,
      errors,
    });
    await p.close();
  }
  const { cardRecordToDefinition, createInitialGameState, executeAction } =
    await import("../../lib/game-engine/src/index.ts");
  const { generateCardInstance } =
    await import("../../artifacts/ko-game/src/game/cards/generation.ts");
  const saved = (await api("admin/cards")).cards.find((c) => c.id === card.id),
    spell = cardRecordToDefinition(saved);
  const unit = cardRecordToDefinition(
    (await f.db.select().from(f.schema.cardsTable)).find(
      (x) => x.id === "reward-unit",
    ),
  );
  const state = createInitialGameState();
  state.status = "IN_PROGRESS";
  state.activePlayerId = "player-1";
  state.turn = 3;
  state.cardPool = [spell, unit];
  state.players[0].currentGold = 10;
  state.players[0].hand = [
    generateCardInstance(spell, { instanceId: "champion-spell" }),
  ];
  state.players[0].deck = [
    generateCardInstance(unit, { instanceId: "draw-unit" }),
  ];
  const cast = executeAction(state, {
    type: "PLAY_TECHNIQUE",
    playerId: "player-1",
    cardInstanceId: "champion-spell",
  });
  assert.ok(cast.success, JSON.stringify(cast));
  assert.equal(cast.state.players[0].currentGold, 8);
  assert.equal(cast.state.players[0].hand[0]?.definitionId, unit.id);
  assert.equal(spell.rarity, "CHAMPION");
  results.push({
    actualSpellEngineCast: true,
    goldSpent: 2,
    drawnCards: 1,
    runtimeRarity: "CHAMPION",
  });
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await f.close();
}
