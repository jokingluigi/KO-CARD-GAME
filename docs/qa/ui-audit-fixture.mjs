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
    } else if (path.endsWith("/ai-decks"))
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
export { setup, cards, champions, makeDeck };
export async function auditSetup(
  p,
  { empty = false, fail = false, delayClaims = 0 } = {},
) {
  const base = await setup(p);
  await p.route("**/qa/retro-font/assets/*", async (r) => {
    const name = new URL(r.request().url()).pathname.split("/").pop();
    if (!/^[a-zA-Z0-9_-]+\.png$/.test(name)) return r.continue();
    try {
      await r.fulfill({
        contentType: "image/png",
        body: await readFile("artifacts/ko-game/qa/retro-font/assets/" + name),
      });
    } catch {
      await r.abort();
    }
  });
  const requests = [],
    counts = {};
  const packs = [
    {
      id: "audit-pack",
      name: "KO 카드팩",
      description: "새로운 선수와 챔피언으로 나만의 덱을 완성하세요.",
      cardsPerPack: 5,
      normalRate: 60,
      epicRate: 20,
      legendaryRate: 12,
      championRate: 5,
      skinChance: 2,
      emoteRate: 1,
      imageUrl: null,
      quantity: 8,
    },
    {
      id: "audit-premium",
      name: "챔피언 컬렉션",
      description: "선수와 챔피언을 만나는 또 하나의 선택.",
      cardsPerPack: 5,
      normalRate: 60,
      epicRate: 20,
      legendaryRate: 12,
      championRate: 5,
      skinChance: 2,
      emoteRate: 1,
      imageUrl: null,
      quantity: 3,
    },
  ];
  let attendance = {
    today: "2026-11-02",
    nextDayIndex: 3,
    claims: [],
    definitions: Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i + 1,
      rewardType: i === 6 ? "PACK" : "CURRENCY",
      rewardAmount: i === 6 ? 1 : (i + 1) * 100,
      rewardTargetId: i === 6 ? "audit-pack" : null,
      enabled: true,
      state: i < 2 ? "CLAIMED" : i === 2 ? "AVAILABLE" : "LOCKED",
    })),
  };
  let quests = [
    {
      id: "q-ready",
      definitionId: "q1",
      assignmentDate: "2026-11-02",
      slot: 0,
      title: "링 위의 첫 승리",
      description: "대전에서 한 번 승리하세요.",
      objectiveType: "WIN_MATCH",
      cardType: null,
      targetValue: 1,
      rewardType: "CURRENCY",
      rewardAmount: 200,
      rewardTargetId: null,
      progress: 1,
      status: "COMPLETED",
      claimedAt: null,
    },
    {
      id: "q-progress",
      definitionId: "q2",
      assignmentDate: "2026-11-02",
      slot: 1,
      title: "카드를 내 손으로",
      description: "카드를 10장 사용하세요.",
      objectiveType: "CARD_PLAYED",
      cardType: null,
      targetValue: 10,
      rewardType: "PACK",
      rewardAmount: 1,
      rewardTargetId: "audit-pack",
      progress: 6,
      status: "IN_PROGRESS",
      claimedAt: null,
    },
    {
      id: "q-done",
      definitionId: "q3",
      assignmentDate: "2026-11-02",
      slot: 2,
      title: "챔피언의 지휘",
      description: "챔피언 고유 능력을 3회 사용하세요.",
      objectiveType: "CHAMPION_ABILITY_USED",
      cardType: null,
      targetValue: 3,
      rewardType: "CURRENCY",
      rewardAmount: 100,
      rewardTargetId: null,
      progress: 3,
      status: "CLAIMED",
      claimedAt: "2026-11-02",
    },
  ];
  let balance = 2400,
    bonus = {
      date: "2026-11-02",
      targetValue: 3,
      progress: 2,
      enabled: true,
      rewardType: "CURRENCY",
      rewardAmount: 300,
      rewardTargetId: null,
      status: "IN_PROGRESS",
      claimedAt: null,
    };
  await p.addInitScript(
    ({ empty, art }) => {
      const key = "ko-player-shelf:launch-user";
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            matches: empty
              ? []
              : Array.from({ length: 8 }, (_, i) => ({
                  id: "m" + i,
                  deckId: i < 5 ? "selected" : "other",
                  deckName: i < 5 ? "출전 검증 덱" : "두 번째 덱",
                  mode: i % 2 ? "AI" : "QUICK",
                  opponent: i % 2 ? "연습 상대" : "플레이어",
                  result: i % 3 ? "승리" : "패배",
                  at: Date.UTC(2026, 10, 2, 12 - i),
                })),
            wishes: empty
              ? []
              : [
                  {
                    id: "wish1",
                    kind: "card",
                    name: "수집 목표 카드",
                    image: art,
                  },
                  {
                    id: "wish2",
                    kind: "skin",
                    name: "수집 목표 스킨",
                    image: art,
                    acquired: true,
                  },
                ],
          }),
        );
    },
    {
      empty,
      art: "/qa/retro-font/assets/card-bcf2ac9b-1afd-41a3-a653-5f9af1e033bf.png",
    },
  );
  await p.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname,
      method = r.request().method();
    let json;
    if (method === "GET") counts[path] = (counts[path] ?? 0) + 1;
    if (
      [
        "/api/shop",
        "/api/packs",
        "/api/attendance",
        "/api/daily-quests",
      ].includes(path) &&
      method === "GET" &&
      fail
    )
      return r.fulfill({
        status: 503,
        json: { message: "화면을 불러오지 못했어요. 다시 시도해 주세요." },
      });
    if (path === "/api/packs" && method === "GET")
      json = { packs: empty ? [] : packs };
    else if (path === "/api/shop")
      json = {
        currencyBalance: balance,
        isTestAccount: false,
        currencyDisplayName: "크레딧",
        listings: empty
          ? []
          : packs.map((pack, i) => ({
              id: "listing-" + i,
              name: pack.name,
              description: pack.description,
              imageAssetId: null,
              imageUrl: null,
              packDefinitionId: pack.id,
              price: 300 + 200 * i,
              packQuantity: 1,
              ownedQuantity: pack.quantity,
              isActive: 1,
              pack,
            })),
      };
    else if (path === "/api/shop/decks") json = { items: [], champions: [] };
    else if (path === "/api/attendance" && method === "GET")
      json = empty ? { ...attendance, definitions: [] } : attendance;
    else if (path === "/api/daily-quests" && method === "GET")
      json = {
        assignments: empty ? [] : quests,
        completionBonus: bonus,
        seasons: [],
        timezone: "Asia/Seoul",
      };
    else if (path === "/api/attendance/claim") {
      requests.push({ path, method });
      if (delayClaims)
        await new Promise((resolve) => setTimeout(resolve, delayClaims));
      attendance = {
        ...attendance,
        claims: [
          ...attendance.claims,
          {
            id: "qa-claim",
            claimDate: attendance.today,
            dayIndex: 3,
            rewardType: "CURRENCY",
            rewardAmount: 300,
            rewardTargetId: null,
            claimedAt: attendance.today,
          },
        ],
        definitions: attendance.definitions.map((d) =>
          d.state === "AVAILABLE" ? { ...d, state: "CLAIMED" } : d,
        ),
      };
      json = {
        attendance,
        reward: { amount: 300, balanceAfter: (balance += 300) },
        alreadyClaimed: false,
      };
    } else if (path === "/api/daily-quests/q-ready/claim") {
      requests.push({ path, method });
      if (delayClaims)
        await new Promise((resolve) => setTimeout(resolve, delayClaims));
      quests = quests.map((q) =>
        q.id === "q-ready" ? { ...q, status: "CLAIMED" } : q,
      );
      json = {
        assignment: quests[0],
        reward: { amount: 200, balanceAfter: (balance += 200) },
        alreadyClaimed: false,
      };
    } else if (path === "/api/daily-quests/completion-bonus/claim") {
      requests.push({ path, method });
      bonus = { ...bonus, status: "CLAIMED", claimedAt: "2026-11-02" };
      json = { bonus, alreadyClaimed: false };
    } else if (path === "/api/shop/listing-0/purchase") {
      const body = r.request().postDataJSON(),
        quantity = body?.quantity ?? 1;
      requests.push({ path, method, body });
      packs[0].quantity += quantity;
      balance -= 300 * quantity;
      json = {
        currencyBalance: balance,
        ownedQuantity: packs[0].quantity,
        packQuantity: quantity,
        pack: packs[0],
      };
    } else if (
      path === "/api/packs/audit-pack/open" ||
      path === "/api/packs/audit-pack/open-bulk"
    ) {
      const body = r.request().postData() ? r.request().postDataJSON() : {},
        quantity = body?.quantity ?? 1;
      requests.push({
        path,
        method,
        body,
        key: r.request().headers()["idempotency-key"],
      });
      packs[0].quantity -= quantity;
      const rewards = [
        {
          rewardType: "NORMAL_CARD",
          cardDefinitionId: cards[0].id,
          card: { ...cards[0], quantity: 1 },
          quantity: 1,
        },
      ];
      json =
        quantity === 1
          ? { rewards }
          : {
              quantity,
              openings: Array.from({ length: quantity }, () => ({ rewards })),
            };
    } else if (path === "/api/draft")
      json = {
        enabled: true,
        config: {},
        cards: [],
        champions: [],
        poolError: null,
        currentId: null,
      };
    else if (path === "/api/collection")
      json = {
        cards: cards.slice(0, 12).map((c, i) => ({
          ...c,
          quantity: i % 4,
          craftCost: 100,
          disenchantReward: 20,
        })),
        craftableCards: cards.slice(0, 12).map((c, i) => ({
          ...c,
          quantity: i % 4,
          craftCost: 100,
          disenchantReward: 20,
        })),
        champions: champions.slice(0, 2).map((c) => ({ ...c, owned: true })),
        prismBalance: 1000,
        championPrismBalance: 100,
        championPrismSetting: {
          configured: true,
          craftCost: 200,
          duplicateReward: 50,
        },
        prismSettings: [],
        isTestAccount: false,
      };
    else if (path === "/api/online-matches/active") json = { match: null };
    else if (path.endsWith("/details") && path.startsWith("/api/packs/"))
      json = {
        details: {
          valid: true,
          invalidReasons: [],
          pack: packs[0],
          normal: [],
          epic: [],
          legendary: [],
          champions: [],
          skins: [],
          emotes: [],
          normalCards: [],
          epicCards: [],
          legendaryCards: [],
          championCards: [],
          skinCards: [],
        },
      };
    else return r.fallback();
    return r.fulfill({ json });
  });
  return {
    ...base,
    packs,
    requests,
    counts,
    recover() {
      fail = false;
    },
    completeBonus() {
      bonus = { ...bonus, progress: 3, status: "COMPLETED" };
    },
  };
}
