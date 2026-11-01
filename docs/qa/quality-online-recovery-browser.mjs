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
    messages = [],
    errors = [];
  let server;
  await p.addInitScript(() => {
    window.__qualityAudio = [];
    HTMLMediaElement.prototype.play = function () {
      window.__qualityAudio.push(this.getAttribute("src") ?? this.src);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/api/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    let json = {};
    if (path.endsWith("/server-status"))
      json = { enabled: false, allowed: true };
    else if (path.endsWith("/auth/me"))
      json = {
        authenticated: true,
        user: {
          id: "quality-user",
          role: "USER",
          nickname: "QA",
          currencyBalance: 0,
          prismBalance: 0,
        },
      };
    else if (path.endsWith("/ws-ticket")) json = { ticket: "quality-ticket" };
    else if (path.endsWith("/cards")) json = { cards: [] };
    else if (path.endsWith("/champions")) json = { champions: [] };
    else if (path.endsWith("/card-frames")) json = { frames: [] };
    return r.fulfill({ json });
  });
  function payload(s = state, version = 1, matchId = s.gameId) {
    return {
      matchId,
      version,
      state: s,
      events: [],
      serverTime: Date.now(),
      turnStartedAt: Date.now(),
      turnDeadlineAt: Date.now() + 90000,
      gameplayStartsAt: null,
      publicPlayers: s.players.map((q, i) => ({
        seat: q.id,
        displayName: "QA " + i,
        championDefinitionId: q.champion.id,
        championName: q.champion.name,
        portraitUrl: null,
        dialogueLine: null,
      })),
      introFirstSpeaker: null,
      connectionStates: { PLAYER_ONE: "CONNECTED", PLAYER_TWO: "CONNECTED" },
    };
  }
  await p.routeWebSocket("**/api/online-matches/ws**", (ws) => {
    server = ws;
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      messages.push(m);
      if (m.type === "SUBSCRIBE" || m.type === "RESYNC") {
        const s = { ...state, gameId: m.matchId };
        ws.send(
          JSON.stringify({
            type: "MATCH_SNAPSHOT",
            seat: "PLAYER_ONE",
            ...payload(s, m.matchId === "quality-next" ? 0 : 1),
          }),
        );
      }
      if (m.type === "PING") ws.send(JSON.stringify({ type: "PONG" }));
    });
  });
  await p.goto("http://127.0.0.1:5186/online/match/quality-online");
  const ability = p.locator(".ko-champion-ability");
  await ability.waitFor();
  await p.waitForFunction(
    () =>
      document
        .querySelector(".ko-champion-ability")
        ?.getAttribute("aria-disabled") === "false",
  );
  await p.waitForTimeout(100);
  assert.equal(
    await p.evaluate(
      () =>
        window.__qualityAudio.filter((s) => s.includes("history-entrance"))
          .length,
    ),
    0,
  );
  await ability.click();
  await p
    .getByTestId("battle-command-strip")
    .getByText("행동 결과를 서버에서 확인 중이에요.")
    .waitFor();
  await ability.dispatchEvent("click");
  assert.equal(messages.filter((m) => m.type === "MATCH_ACTION").length, 1);
  await p.waitForFunction(
    () =>
      document
        .querySelector(".ko-champion-ability")
        ?.getAttribute("aria-disabled") === "false",
    {},
    { timeout: 14000 },
  );
  assert.equal(messages.filter((m) => m.type === "RESYNC").length, 1);
  assert.equal(messages.filter((m) => m.type === "MATCH_ACTION").length, 1);
  const next = structuredClone(state);
  next.players[0].board[0].currentAttack = 9;
  next.players[0].board[3] = {
    ...next.players[0].board[0],
    instanceId: "new-entrance",
    boardSlot: 3,
  };
  next.events.push({
    type: "ENTER_FIELD",
    playerId: "PLAYER_ONE",
    cardInstanceId: "new-entrance",
    boardSlot: 3,
  });
  server.send(
    JSON.stringify({
      type: "ACTION_ACCEPTED",
      requestId: "other-action",
      ...payload(next, 2),
    }),
  );
  await p.waitForFunction(
    () =>
      window.__qualityAudio.filter((s) => s.includes("history-entrance"))
        .length === 1,
  );
  const attack = p
    .locator(".ko-player-board-row .ko-board-slot")
    .first()
    .locator('[data-card-stat="attack"]');
  await p.waitForTimeout(250);
  assert.equal(await attack.textContent(), "9");
  server.send(
    JSON.stringify({
      type: "ACTION_ACCEPTED",
      requestId: "old-replay",
      ...payload(state, 1),
    }),
  );
  await p.waitForTimeout(250);
  assert.equal(await attack.textContent(), "9");
  assert.equal(
    await p.evaluate(
      () =>
        window.__qualityAudio.filter((s) => s.includes("history-entrance"))
          .length,
    ),
    1,
  );
  await p.evaluate(() => {
    history.pushState({}, "", "/online/match/quality-next");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await p.waitForFunction(
    () =>
      document
        .querySelector(".ko-champion-ability")
        ?.getAttribute("aria-disabled") === "false",
  );
  await ability.click();
  await p.waitForTimeout(100);
  const sent = messages.filter((m) => m.type === "MATCH_ACTION");
  assert.equal(sent.length, 2);
  assert.equal(sent.at(-1).matchId, "quality-next");
  assert.equal(sent.at(-1).expectedVersion, 0);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      stalledAcknowledgementRecovered: true,
      oneMutatingActionPerIntent: true,
      readOnlyResync: true,
      visiblePendingState: true,
      historicalAudioSkipped: true,
      newSummonAudioOnce: true,
      staleVersionIgnored: true,
      newMatchStartsAtVersionZero: true,
      errors,
    }),
  );
} finally {
  await b.close();
}
