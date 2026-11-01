import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await import("./checkpoints/20261006/qa-loader.mjs");
const { chromium } = await import("./black-gold-playwright.mjs");
const {
  createInitialGameState,
  startGame,
  cardRecordToDefinition,
  championRecordToDefinition,
} = await import("../../lib/game-engine/src/index.ts");
const data = JSON.parse(
  await readFile("artifacts/ko-game/qa/art-direction-data.json", "utf8"),
);
const cards = data.cards.cards.map((c) => ({
    ...c,
    status: "PUBLISHED",
    quantity: 99,
  })),
  champions = data.champions.champions.map((c) => ({
    ...c,
    status: "PUBLISHED",
  }));
const selected = cards
    .filter((c) => c.rarity === "NORMAL" && !c.isToken && !c.isChampionToken)
    .flatMap((c) => [c, c, c])
    .slice(0, 25),
  champion = champions[0];
assert.equal(selected.length, 25);
const makeDeck = (id, name, isSelected) => ({
  id,
  name,
  isSelected,
  championDefinitionId: champion.id,
  cardDefinitionIds: selected.map((c) => c.id),
  champion,
  cards: selected,
  isValid: true,
  invalidReasons: [],
  validationReasons: [],
  missingCardDefinitionIds: [],
  createdAt: "2026-11-01",
  updatedAt: "2026-11-01",
});
const art =
    "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
  skin = {
    id: "qa-skin",
    type: "CHAMPION_SKIN",
    name: "검증 스킨",
    targetId: champion.id,
    imageAssets: { art },
    isActive: true,
    sortOrder: 0,
  };
const b = await chromium.launch(),
  out = "qa-results/home-lobby-flow",
  results = [];
await mkdir(out, { recursive: true });
async function setup(p, { missing = false, invalid = false } = {}) {
  let decks = [
      makeDeck("other", "첫 번째 덱", false),
      makeDeck("selected", "출전 검증 덱", !missing),
    ],
    writes = [],
    starts = [],
    messages = [];
  if (invalid) {
    decks[1].isValid = false;
    decks[1].invalidReasons = ["카드 수가 부족합니다."];
  }
  const ai = {
    ...decks[1],
    id: "ai",
    enabled: true,
    difficulty: "NORMAL",
    isValid: true,
  };
  await p.addInitScript(() => {
    localStorage.setItem("ko-match-coach-v1", "done");
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
  });
  await p.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname,
      q = r.request();
    let json = {};
    if (path.endsWith("/auth/me"))
      json = {
        authenticated: true,
        user: {
          id: "launch-user",
          nickname: "출전 테스트",
          role: "USER",
          currencyBalance: 100,
          prismBalance: 20,
          championPrismBalance: 0,
        },
      };
    else if (path.endsWith("/server-status"))
      json = { enabled: false, allowed: true };
    else if (path.endsWith("/ws-ticket")) json = { ticket: "qa" };
    else if (path.endsWith("/availability")) json = { enabled: true };
    else if (path.endsWith("/minion-a/cards")) json = { definitions: [] };
    else if (path.endsWith("/cards")) json = { cards };
    else if (path.endsWith("/champions")) json = { champions };
    else if (path.endsWith("/cosmetics"))
      json = {
        owned: [{ item: skin }],
        loadout: {
          version: 1,
          skins: { ["champion:" + champion.id]: skin },
          cardBack: null,
          emotes: [],
        },
      };
    else if (path.endsWith("/card-frames")) json = data["card-frames"];
    else if (path.endsWith("/decks/options"))
      json = { cards, champions, isTestAccount: true };
    else if (path.endsWith("/decks")) json = { decks };
    else if (path.endsWith("/select")) {
      writes.push(path);
      const id = decodeURIComponent(path.split("/").at(-2));
      decks = decks.map((d) => ({ ...d, isSelected: d.id === id }));
      json = { deck: decks.find((d) => d.id === id) };
    } else if (path.startsWith("/api/decks/") && q.method() === "PATCH") {
      writes.push(q.postDataJSON());
      const id = decodeURIComponent(path.split("/").at(-1));
      decks = decks.map((d) =>
        d.id === id ? { ...d, ...q.postDataJSON() } : d,
      );
      json = { deck: decks.find((d) => d.id === id) };
    } else if (path.endsWith("/ai-decks"))
      json = { decks: [ai], extraCards: [], extraChampions: [] };
    else if (path.endsWith("/game-media")) json = { backgrounds: [], bgms: [] };
    else if (path.endsWith("/main-content")) json = data["main-content"];
    else if (path.endsWith("/ai-match-start")) {
      const body = q.postDataJSON();
      starts.push(body);
      const state = startGame(
        createInitialGameState(
          [champion.id, champion.id],
          cards.map(cardRecordToDefinition),
          champions.map(championRecordToDefinition),
          [
            decks.find((d) => d.id === body.deckId).cardDefinitionIds,
            ai.cardDefinitionIds,
          ],
          { gameId: body.matchId, randomSeed: 19 },
        ),
        () => 0.5,
      );
      state.players.forEach((p) => (p.mulliganUsed = true));
      json = { state, difficulty: "NORMAL" };
    }
    return r.fulfill({ json });
  });
  await p.routeWebSocket("**/api/online-matches/ws**", (ws) =>
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      messages.push(m);
      if (m.type === "PING") ws.send(JSON.stringify({ type: "PONG" }));
      if (m.type === "JOIN_QUICK_QUEUE")
        ws.send(
          JSON.stringify({
            type: "QUICK_QUEUE_JOINED",
            deck: {
              deckId: m.deckId,
              deckName: decks.find((d) => d.id === m.deckId)?.name,
              championName: champion.name,
            },
          }),
        );
    }),
  );
  return {
    get decks() {
      return decks;
    },
    writes,
    starts,
    messages,
  };
}
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const p = await b.newPage({ viewport: { width, height } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const x = await setup(p);
    await p.goto("http://127.0.0.1:5186/");
    const banner = p.getByTestId("launch-deck-banner");
    await banner.getByText("출전 검증 덱", { exact: true }).waitFor();
    await banner.locator("img").evaluate((n) => n.decode());
    assert.ok(
      (await banner.locator("img").getAttribute("src")).includes(
        "champion-5e4a5a52",
      ),
    );
    await p.screenshot({ path: `${out}/home-${width}.png` });
    await p.goto("http://127.0.0.1:5186/decks?edit=other");
    const name = p.getByTestId("input-deck-name");
    await name.waitFor({ state: "attached" });
    const expand = p.getByRole("button", {
      name: "덱 정보 펼치기 ▲",
      exact: true,
    });
    if (await expand.count()) await expand.click();
    await p.getByTestId("button-select-deck").click();
    await p.getByTestId("status-selected-deck").waitFor();
    assert.equal(x.decks.find((d) => d.isSelected).id, "other");
    await name.fill("저장 후 출전 덱");
    assert.equal(await p.getByTestId("button-select-deck").isDisabled(), true);
    await p.getByTestId("button-save-deck").click();
    await p.getByText("전략을 저장했습니다.", { exact: true }).waitFor();
    await p.goto("http://127.0.0.1:5186/");
    await p
      .getByTestId("launch-deck-banner")
      .getByText("저장 후 출전 덱", { exact: true })
      .waitFor();
    await p.goto("http://127.0.0.1:5186/online/quick");
    await p.getByTestId("status-quick-searching").waitFor();
    assert.equal(
      x.messages.filter((m) => m.type === "JOIN_QUICK_QUEUE").length,
      1,
    );
    assert.equal(
      x.messages.find((m) => m.type === "JOIN_QUICK_QUEUE").deckId,
      "other",
    );
    assert.equal(
      await p.getByRole("region", { name: "온라인 덱 선택" }).count(),
      0,
    );
    await p.screenshot({ path: `${out}/quick-${width}.png` });
    await p.getByRole("button", { name: "검색 취소", exact: true }).click();
    await p.waitForTimeout(250);
    assert.equal(
      x.messages.filter((m) => m.type === "JOIN_QUICK_QUEUE").length,
      1,
    );
    assert.equal(
      x.messages.filter((m) => m.type === "LEAVE_QUICK_QUEUE").length,
      1,
    );
    await p.goto("http://127.0.0.1:5186/");
    await p.getByTestId('button-battle-modes').click();
    await p.getByRole('button',{name:'AI 대전 시작 출전 덱으로 바로 시작'}).click();
    await p
      .getByRole("button", { name: "설정 열기", exact: true })
      .waitFor({ timeout: 20000 });
    assert.equal(x.starts.length, 1);
    assert.equal(x.starts[0].deckId, "other");
    assert.equal(
      await p.getByRole("button", { name: "매치 시작", exact: true }).count(),
      0,
    );
    await p.screenshot({ path: `${out}/ai-${width}.png` });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      homeUsesDeckChampionAndSkin: true,
      editorSelectionAndSavePersist: true,
      quickAutoStartsOnce: true,
      cancelDoesNotRequeue: true,
      aiAutoStartsSelectedDeck: true,
      errors,
    });
    await p.close();
  }
  for (const mode of ["missing", "invalid"]) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } }),
      x = await setup(p, { [mode]: true });
    await p.goto("http://127.0.0.1:5186/online/quick");
    await p
      .getByRole("button", { name: "덱 편집기에서 출전 덱 변경" })
      .waitFor();
    assert.equal(
      x.messages.filter((m) => m.type === "JOIN_QUICK_QUEUE").length,
      0,
    );
    await p.goto("http://127.0.0.1:5186/ai-match");
    await p.getByRole("button", { name: "덱 편집기", exact: true }).waitFor();
    await p.waitForTimeout(150);
    assert.equal(x.starts.length, 0);
    results.push({ mode, noSilentFallback: true, noMatchStarted: true });
    await p.close();
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
