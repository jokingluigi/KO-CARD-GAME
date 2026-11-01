/** Real home and pack routes; server selection and inventory are isolated fixtures. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/home-twelve";
await mkdir(out, { recursive: true });
const data = JSON.parse(
  await readFile("artifacts/ko-game/qa/art-direction-data.json", "utf8"),
);
const content = JSON.parse(
    await readFile("/tmp/home-menu-public-content.json", "utf8").catch(() =>
      JSON.stringify(data["main-content"]),
    ),
  ),
  background = await readFile("/tmp/home-menu-live-background.png").catch(() =>
    readFile(
      "artifacts/ko-game/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
    ),
  );
const artA =
    "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
  artB = await readFile(
    "artifacts/ko-game/qa/retro-font/assets/champion-0db142af-750e-4929-a464-5daf1bc75452.png",
  );
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [740, 360],
    [1440, 900],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
      }),
      errors = [],
      writes = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const champA = {
        ...data.champions.champions[0],
        id: "hero-a",
        imageUrl: artA,
      },
      champB = {
        ...data.champions.champions[0],
        id: "hero-b",
        imageUrl: "/api/qa-home-b-base.png",
      };
    const unit = {
        id: "unit",
        name: "검증 선수",
        cardType: "WRESTLER",
        cost: 2,
        attack: 2,
        health: 3,
        text: "",
        rarity: "NORMAL",
        imageUrl: artA,
      },
      spell = {
        ...unit,
        id: "spell",
        name: "검증 주문",
        cardType: "TECHNIQUE",
        cost: 4,
      };
    const makeDeck = (id, champion, isSelected) => ({
      id,
      name: "전술 " + id.toUpperCase(),
      isSelected,
      isValid: true,
      championDefinitionId: champion.id,
      champion,
      cards: [unit, spell],
      cardDefinitionIds: [...Array(20).fill("unit"), ...Array(5).fill("spell")],
      invalidReasons: [],
      validationReasons: [],
      missingCardDefinitionIds: [],
    });
    let decks = [
        makeDeck("a", champA, true),
        makeDeck("b", champB, false),
        {
          ...makeDeck("c", champA, false),
          isValid: false,
          invalidReasons: ["카드 2장 부족"],
        },
      ],
      holdSelection = true,
      holdArt = true,
      releaseSelection,
      releaseArt,
      artWaiting,
      selectionWaiting,
      rejectSelection = false,
      failArt = false,
      noBackground = false;
    const artReady = new Promise((r) => (artWaiting = r)),
      selectReady = new Promise((r) => (selectionWaiting = r));
    const skin = {
      id: "b-skin",
      type: "CHAMPION_SKIN",
      name: "검증 스킨",
      targetId: "hero-b",
      imageAssets: { art: "/api/qa-home-b-skin.png" },
      isActive: true,
      sortOrder: 0,
    };
    const pack = {
      id: "owned-pack",
      name: "검증 팩",
      quantity: 3,
      cardsPerPack: 1,
      normalRate: 100,
      epicRate: 0,
      legendaryRate: 0,
      championRate: 0,
      skinChance: 0,
      imageUrl: null,
    };
    await p.route("**/api/**", async (r) => {
      const req = r.request(),
        path = new URL(req.url()).pathname;
      let json = {};
      if (req.method() !== "GET") writes.push(path);
      if (path.startsWith("/api/qa-home-b")) {
        if (holdArt) {
          await new Promise((resolve) => {
            releaseArt = resolve;
            artWaiting();
          });
        }
        if (failArt) return r.fulfill({ status: 404, body: "" });
        return r.fulfill({ body: artB, contentType: "image/png" });
      }
      if (path.includes("/storage/"))
        return r.fulfill({ body: background, contentType: "image/png" });
      if (path.endsWith("/auth/me"))
        json = {
          authenticated: true,
          user: {
            id: "twelve-user",
            nickname: "홈 패치 검증",
            role: "USER",
            currencyBalance: 580,
            prismBalance: 300,
            championPrismBalance: 0,
          },
        };
      else if (path.endsWith("/server-status"))
        json = { enabled: false, allowed: true };
      else if (path.endsWith("/availability")) json = { enabled: true };
      else if (path === "/api/main-content")
        json = {
          ...content,
          background: noBackground ? null : content.background,
          battleMenuArtwork: null,
          notices: [
            {
              id: "one",
              title: "홈 메뉴 업데이트",
              body: "검증 공지",
              createdAt: "2026-11-02",
              updatedAt: "2026-11-02",
              displayOrder: 0,
            },
          ],
        };
      else if (path === "/api/decks") json = { decks };
      else if (path === "/api/decks/options")
        json = {
          cards: [unit, spell],
          champions: [champA, champB],
          isTestAccount: false,
        };
      else if (path.match(/^\/api\/decks\/[^/]+\/select$/)) {
        if (holdSelection)
          await new Promise((resolve) => {
            releaseSelection = resolve;
            selectionWaiting();
          });
        if (rejectSelection)
          return r.fulfill({
            status: 400,
            json: { message: "선택 검증 실패" },
          });
        const id = path.split("/").at(-2);
        decks = decks.map((d) => ({ ...d, isSelected: d.id === id }));
        json = { deck: decks.find((d) => d.id === id) };
      } else if (path === "/api/cosmetics")
        json = {
          owned: [{ item: skin }],
          loadout: {
            version: 1,
            skins: { "champion:hero-b": skin },
            emotes: [],
            cardBack: null,
          },
          cards: [],
          champions: [champA, champB],
        };
      else if (path === "/api/packs") json = { packs: [pack] };
      else if (path === "/api/daily-quests") json = { assignments: [] };
      else if (path === "/api/attendance")
        json = { definitions: [], claims: [] };
      else if (path.endsWith("/cards")) json = { cards: [unit, spell] };
      else if (path.endsWith("/champions"))
        json = { champions: [champA, champB] };
      else if (path.endsWith("/card-frames")) json = { frames: [] };
      else if (path.endsWith("/active")) json = { match: null };
      await r.fulfill({ json });
    });
    const home = async () => {
      await p.goto("http://127.0.0.1:5186/");
      await p.getByTestId("button-battle-modes").waitFor();
    };
    const banner = p.getByTestId("launch-deck-banner"),
      quick = p.locator(".ko-home-mode-shortcuts button").nth(0),
      ai = p.locator(".ko-home-mode-shortcuts button").nth(1);
    await home();
    await banner
      .getByRole("heading", { name: "전술 A", exact: true })
      .waitFor();
    assert.match(await banner.textContent(), /평균 2.4 · 선수 20 \/ 주문 5/);
    await banner.getByRole("button", { name: "덱 변경", exact: true }).click();
    const picker = p.getByRole("dialog", { name: "출전 덱 선택" });
    await picker.waitFor();
    const invalid = picker.locator("article").filter({ hasText: "전술 C" });
    assert.equal(
      await invalid
        .getByRole("button", { name: "이 덱 사용", exact: true })
        .isDisabled(),
      true,
    );
    await picker.getByLabel("출전 덱 검색").fill("없는덱");
    await picker.getByText("검색 결과가 없어요.", { exact: false }).waitFor();
    await picker.getByLabel("출전 덱 검색").fill("");
    await p.screenshot({ path: `${out}/picker-${width}.png` });
    const optionB = picker
      .locator("article")
      .filter({ hasText: "전술 B" })
      .getByRole("button", { name: "이 덱 사용", exact: true });
    await optionB.evaluate((n) => {
      n.click();
      n.click();
    });
    await selectReady;
    assert.equal(writes.filter((x) => x.endsWith("/select")).length, 1);
    holdSelection = false;
    releaseSelection();
    await artReady;
    assert.equal(await banner.getByRole("heading").innerText(), "전술 A");
    assert.ok(
      (await banner.locator("img").getAttribute("src")).includes(
        "champion-5e4a",
      ),
    );
    assert.equal(
      await p.locator(".ko-game-shell").count(),
      0,
      "selection remains on home",
    );
    holdArt = false;
    releaseArt();
    await banner
      .getByRole("heading", { name: "전술 B", exact: true })
      .waitFor();
    assert.equal(
      await banner.locator("img").getAttribute("src"),
      "/api/qa-home-b-skin.png",
    );
    assert.equal(await quick.isDisabled(), false);
    assert.equal(await ai.isDisabled(), false);
    assert.equal(
      await p.getByRole("list", { name: "대전 시작 안내" }).count(),
      0,
    );
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `${out}/home-${width}.png` });
    await p.reload();
    await banner
      .getByRole("heading", { name: "전술 B", exact: true })
      .waitFor();
    await banner.getByRole("button", { name: "덱 변경", exact: true }).click();
    rejectSelection = true;
    await picker
      .locator("article")
      .filter({ hasText: "전술 A" })
      .getByRole("button", { name: "이 덱 사용", exact: true })
      .click();
    await picker
      .getByRole("alert")
      .filter({ hasText: "선택 검증 실패" })
      .waitFor();
    assert.equal(decks.find((d) => d.isSelected).id, "b");
    rejectSelection = false;
    await p.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
    await p
      .getByRole("button", { name: "보상 · 상점 · 전체 메뉴 ▸", exact: true })
      .click();
    const stock = p.getByRole("complementary", { name: "보유 팩" });
    await stock.getByText("3개", { exact: true }).waitFor();
    await stock.getByRole("button", { name: "개봉 화면 열기 ▸" }).click();
    await p.waitForURL("**/packs");
    assert.equal(writes.filter((x) => x.includes("/open")).length, 0);
    decks = decks.map((d) => ({ ...d, isSelected: d.id === "c" }));
    await home();
    await banner
      .locator("[role=status]")
      .filter({ hasText: "카드 2장 부족" })
      .waitFor();
    assert.equal(await quick.isDisabled(), true);
    assert.equal(await ai.isDisabled(), true);
    await banner.getByRole("button", { name: "덱 수정", exact: true }).click();
    await p.waitForURL("**/decks?edit=c");
    decks = decks.map((d) => ({ ...d, isSelected: false }));
    await home();
    await p.getByRole("list", { name: "대전 시작 안내" }).waitFor();
    assert.equal(
      await p.locator(".ko-home-start-guide [data-current=true]").innerText(),
      "2 출전 지정",
    );
    assert.equal(await quick.isDisabled(), true);
    decks = [];
    noBackground = true;
    await p.reload();
    await p.getByRole("list", { name: "대전 시작 안내" }).waitFor();
    assert.equal(
      await p.locator(".ko-home-start-guide [data-current=true]").innerText(),
      "1 덱 만들기",
    );
    assert.equal(await p.locator(".ko-home-plain-backdrop").count(), 1);
    await banner
      .getByRole("button", { name: "출전 덱 고르기", exact: true })
      .click();
    await picker.getByText("저장된 덱이 없어요.", { exact: false }).waitFor();
    await picker
      .getByRole("button", { name: "새 덱 만들기", exact: true })
      .click();
    await p.waitForURL("**/decks");
    champB.imageUrl = "/api/qa-home-b-base-failed.png";
    skin.imageAssets.art = "/api/qa-home-b-skin-failed.png";
    failArt = true;
    decks = [makeDeck("b", champB, true)];
    await home();
    await banner
      .getByRole("heading", { name: "전술 B", exact: true })
      .waitFor();
    await banner
      .getByText("그림을 불러오지 못했어요.", { exact: false })
      .waitFor();
    assert.equal(await quick.isDisabled(), false);
    assert.equal(await banner.locator("img").count(), 0);
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      homePicker: true,
      invalidSelectionDisabled: true,
      singleSelectionPost: true,
      serverSelectionPersists: true,
      delayedSkinArtworkKeepsOldPoster: true,
      skinAndTitleCommitTogether: true,
      failedSelectionPreservesCanonicalDeck: true,
      actualCompositionSummary: true,
      invalidDeckReasonAndEdit: true,
      onboardingBuildAndSelect: true,
      packStockDistinctNoOpenWrite: true,
      missingBackgroundAndFailedArtworkFallback: true,
      noRuntimeErrors: true,
    });
    await p.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
