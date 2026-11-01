import assert from "node:assert/strict";
import { chromium } from "./black-gold-playwright.mjs";
const b = await chromium.launch();
try {
  const seed = await b.newPage();
  await seed.route("**/api/**", (r) =>
    r.fulfill({ json: { cards: [], frames: [] } }),
  );
  await seed.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
  await seed.locator(".ko-game-shell").waitFor();
  const state = await seed.evaluate(async () => {
    const { boardFixture } = await import("/qa/black-gold-fixture.ts");
    const s = boardFixture();
    s.events = [];
    s.gameId = "quality-online";
    s.players[0].board[0].entranceAudioEnabled = true;
    s.players[0].board[0].entranceAudioUrl = "/qa/history-entrance.wav";
    s.events = [
      {
        type: "ENTER_FIELD",
        playerId: "player-1",
        cardInstanceId: s.players[0].board[0].instanceId,
        boardSlot: 0,
      },
    ];
    return JSON.parse(
      JSON.stringify(s)
        .replaceAll("player-1", "PLAYER_ONE")
        .replaceAll("player-2", "PLAYER_TWO"),
    );
  });
  await seed.close();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [],
    messages = [];
  let server;
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/api/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    let json = {};
    if (path.endsWith("/server-status"))
      json = { enabled: false, allowed: true };
    else if (path.endsWith("/auth/me"))
      json = {
        authenticated: true,
        user: { id: "queue-qa", nickname: "QA", role: "USER" },
      };
    else if (path.endsWith("/ws-ticket")) json = { ticket: "qa" };
    else if (path.endsWith("/decks"))
      json = {
        decks: [
          {
            id: "deck-qa",
            name: "QA 출전 덱",
            isSelected: true,
            isValid: true,
            championDefinitionId: state.players[0].champion.id,
            champion: { name: state.players[0].champion.name },
            cards: [],
            cardDefinitionIds: [],
          },
        ],
      };
    else if (path.endsWith("/cards")) json = { cards: [] };
    else if (path.endsWith("/champions")) json = { champions: [] };
    else if (path.endsWith("/card-frames")) json = { frames: [] };
    return r.fulfill({ json });
  });
  await p.routeWebSocket("**/api/online-matches/ws**", (ws) => {
    server = ws;
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      messages.push(m);
      if (m.type === "PING") ws.send(JSON.stringify({ type: "PONG" }));
      if (m.type === "SUBSCRIBE" || m.type === "RESYNC")
        ws.send(
          JSON.stringify({
            type: "MATCH_SNAPSHOT",
            seat: "PLAYER_ONE",
            matchId: m.matchId,
            version: 1,
            state: { ...state, gameId: m.matchId, events: [] },
            events: [],
            serverTime: Date.now(),
            turnStartedAt: Date.now(),
            turnDeadlineAt: Date.now() + 90000,
            gameplayStartsAt: Date.now() + 4500,
            publicPlayers: state.players.map((q, i) => ({
              seat: q.id,
              displayName: "QA " + i,
              championDefinitionId: q.champion.id,
              championName: q.champion.name,
              portraitUrl: null,
              dialogueLine: null,
            })),
            introFirstSpeaker: "PLAYER_ONE",
            connectionStates: {
              PLAYER_ONE: "CONNECTED",
              PLAYER_TWO: "CONNECTED",
            },
          }),
        );
    });
  });
  await p.goto("http://127.0.0.1:5186/online/quick");
  await p.locator('[data-queue-phase="joining"]').waitFor();
  assert.equal(messages.filter((m) => m.type === "JOIN_QUICK_QUEUE").length, 1);
  server.send(
    JSON.stringify({
      type: "QUICK_QUEUE_JOINED",
      deck: { deckId: "deck-qa", deckName: "QA 출전 덱", championName: "QA" },
    }),
  );
  await p.locator('[data-queue-phase="searching"]').waitFor();
  await p.screenshot({ path: "qa-results/home-twelve/queue-searching.png" });
  server.send(
    JSON.stringify({
      type: "MATCH_FOUND",
      matchId: "quality-online",
      opponent: { nickname: "QA 상대" },
    }),
  );
  await p.getByTestId("match-intro-overlay").waitFor();
  await p.screenshot({ path: "qa-results/home-twelve/queue-vs.png" });
  await p
    .getByTestId("match-intro-overlay")
    .waitFor({ state: "detached", timeout: 12000 });
  await p.locator(".ko-champion-ability").waitFor();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      joining: true,
      searching: true,
      joinSentOnce: true,
      confirmedMatchToVs: true,
      vsToBattle: true,
      errors,
    }),
  );
} finally {
  await b.close();
}
