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
const liveContent = process.env.KO_QA_HOME_MAIN_CONTENT
  ? JSON.parse(await readFile(process.env.KO_QA_HOME_MAIN_CONTENT, "utf8"))
  : null;
const qaOrigin = process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5186";
assert.ok(
  ["http://127.0.0.1:5186", "https://ko-card-game-vr69.onrender.com"].includes(
    qaOrigin,
  ),
);
const b = await chromium.launch(),
  out = process.env.KO_QA_OUT ?? "qa-results/wardrobe-ai-emote",
  results = [];
await mkdir(out, { recursive: true });
async function setup(
  p,
  { missing = false, invalid = false, scenario = "normal" } = {},
) {
  let blocked = scenario === "failure",
    deckReads = 0,
    selectedReads = 0;
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
    if (
      liveContent &&
      process.env.KO_QA_HOME_BACKGROUND &&
      path === liveContent.background?.assetUrl
    ) {
      return r.fulfill({
        contentType: "image/png",
        body: await readFile(process.env.KO_QA_HOME_BACKGROUND),
      });
    }
    if (
      q.method() === "GET" &&
      (path.endsWith("/decks") || path.endsWith("/decks/selected"))
    ) {
      deckReads++;
      if (path.endsWith("/selected")) selectedReads++;
      if (blocked)
        return r.fulfill({
          status: 503,
          json: { message: "덱 서버 연결이 지연되고 있어요." },
        });
      if (
        scenario === "slow" &&
        selectedReads === 1 &&
        path.endsWith("/selected")
      )
        await new Promise((r) => setTimeout(r, 12500));
    }
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
        owned: [
          { item: skin },
          {
            item: {
              id: "local-owned",
              type: "IMAGE_EMOTE",
              name: "보유만 한 이모티콘",
              imageAssets: { art },
              isActive: true,
              sortOrder: 1,
            },
          },
        ],
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
    else if (path.endsWith("/decks/selected"))
      json = { decks: decks.filter((d) => d.isSelected) };
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
    } else if (path.endsWith("/draft"))
      json = {
        enabled: true,
        config: {},
        cards: [],
        champions: [],
        poolError: null,
        currentId: null,
      };
    else if (path.endsWith("/ai-decks"))
      json = { decks: [ai], extraCards: [], extraChampions: [] };
    else if (path.endsWith("/game-media")) json = { backgrounds: [], bgms: [] };
    else if (path.endsWith("/main-content"))
      json = liveContent ?? data["main-content"];
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
    return r.fulfill({ json }).catch(() => {});
  });
  await p.routeWebSocket("**/api/online-matches/ws**", (ws) =>
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      messages.push(m);
      if (m.type === "PING") ws.send(JSON.stringify({ type: "PONG" }));
      if (m.type === "CREATE_PRIVATE_ROOM")
        ws.send(
          JSON.stringify({
            type: "PRIVATE_ROOM_CREATED",
            room: {
              roomId: "recovered-room",
              roomCode: "RECOVER",
              host: {
                userId: "launch-user",
                nickname: "QA",
                deckId: m.deckId,
                deckName: "출전 검증 덱",
                championName: champion.name,
              },
              guest: null,
              youAreHost: true,
              canStart: false,
            },
          }),
        );
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
    recover() {
      blocked = false;
    },
    get deckReads() {
      return deckReads;
    },
    get selectedReads() {
      return selectedReads;
    },
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
    const p = await b.newPage({
        viewport: { width, height },
        ignoreHTTPSErrors: qaOrigin.startsWith("https:"),
        reducedMotion: "reduce",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await setup(p, { scenario: "normal" });
    await p.route("**/qa/retro-font/assets/*", async (r) => {
      const name = new URL(r.request().url()).pathname.split("/").pop();
      assert.ok(/^champion-[a-z0-9-]+\.png$/.test(name));
      await r.fulfill({
        contentType: "image/png",
        body: await readFile("artifacts/ko-game/qa/retro-font/assets/" + name),
      });
    });
    await p.goto(qaOrigin + "/ai-match");
    await p.getByTestId("match-intro-overlay").waitFor();
    await p
      .getByTestId("match-intro-overlay")
      .waitFor({ state: "hidden", timeout: 10000 });
    await p.locator(".ko-game-shell").waitFor();
    await p
      .getByRole("button", { name: "이미지 이모티콘", exact: true })
      .click();
    await p
      .getByRole("button", { name: "보유만 한 이모티콘", exact: true })
      .click();
    const bubble = p.locator(".cosmetic-emote-bubble[data-ready=true]");
    await bubble.waitFor();
    await p.screenshot({ path: `${out}/ai-${width}.png` });
    await bubble.waitFor({ state: "detached", timeout: 3500 });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      actualAiRouteAndEngine: true,
      apiResponsesIsolated: true,
      ownedEmoteBubble: true,
      expiry: true,
    });
    await p.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
