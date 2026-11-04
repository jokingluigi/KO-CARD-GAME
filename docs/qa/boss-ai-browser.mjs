/** Real Home AI flow + actual worker + pure server transcript validation, isolated API fixtures. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
import { createInitialGameState } from "../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts";
import { cardRecordToDefinition } from "../../artifacts/ko-game/src/game/cards/published-cards.ts";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";
import { executeAction } from "../../artifacts/ko-game/src/game/actions/engine-actions.ts";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
const { replayAIMatch } =
  await import("../../artifacts/api-server/src/lib/ai-match-quest-service.ts");
const origin = process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5186",
  out = process.env.KO_AI_BROWSER_OUT ?? "qa-results/boss-ai/browser";
await mkdir(out, { recursive: true });
const defs = JSON.parse(
  await readFile("docs/qa/fixtures/20261104-ninja-pain-collector.json", "utf8"),
).map(cardRecordToDefinition);
const browser = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    let initial = createInitialGameState();
    Object.assign(initial, {
      status: "IN_PROGRESS",
      activePlayerId: "player-2",
      turn: 5,
      events: [],
      cardPool: defs,
      gameId: "boss-browser-" + width,
    });
    for (const p of initial.players) {
      p.board = [null, null, null, null];
      p.hand = [];
      p.graveyard = [];
      p.deck = [];
      p.mulliganUsed = true;
      p.personalTurn = 3;
      p.currentGold = 99;
      p.champion.quest = null;
    }
    for (const [name, id, slot] of [
      ["고통 수집가", "collector", 0],
      ["헬뻑", "hell", 1],
    ]) {
      initial.players[1].hand = [
        generateCardInstance(
          defs.find((d) => d.name === name),
          { instanceId: id },
        ),
      ];
      const r = executeAction(initial, {
        type: "PLAY_WRESTLER",
        playerId: "player-2",
        cardInstanceId: id,
        boardSlot: slot,
      });
      assert.ok(r.success);
      initial = r.state;
    }
    initial.players[1].board[0].enteredThisTurn = false;
    initial.players[1].board[0].enteredOnTurn = 0;
    initial.players[1].currentGold = 1;
    initial.players[1].hand = [
      generateCardInstance(
        defs.find((d) => d.name === "닌자"),
        { instanceId: "ninja" },
      ),
    ];
    initial.players[0].health = 3;
    initial.players[0].champion.health = 3;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 500,
      ignoreHTTPSErrors: true,
      reducedMotion: "reduce",
      recordVideo:
        width === 390
          ? { dir: out + "/raw", size: { width, height } }
          : undefined,
    });
    await context.routeWebSocket("**",ws=>ws.close());
    const page = await context.newPage(),
      errors = [],
      workers = [];
    let transcript, final;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("worker", (w) => workers.push(w.url()));
    await auditSetup(page);
    await page.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          authenticated: true,
          user: {
            id: "qa-boss",
            nickname: "전술 검증",
            role: "USER",
            currencyBalance: 0,
          },
        },
      }),
    );
    await page.route("**/api/online-matches/quick-ai/*", (r) =>
      r.fulfill({
        json: {
          matchId: initial.gameId,
          deckId: "qa-deck",
          aiDeckId: "qa-ai",
          difficulty: "NORMAL",
          state: initial,
          opponentName: "최고 난이도 검증",
          selfChampion: {
            name: initial.players[0].champion.name,
            imageUrl: null,
            introLineOne: null,
          },
          opponentChampion: {
            name: initial.players[1].champion.name,
            imageUrl: null,
            introLineOne: null,
          },
        },
      }),
    );
    await page.route("**/api/daily-quests/ai-match-progress", (r) => {
      transcript = r.request().postDataJSON();
      final = replayAIMatch(
        initial,
        transcript.actions,
        "player-1",
        "player-2",
        "NORMAL",
      );
      return r.fulfill({
        json: {
          completed: true,
          reward: { amount: 0, sourceType: "MATCH_AI_RESULT" },
        },
      });
    });
    await page.goto(origin + "/ai-match?quickMatch=" + initial.gameId);
    await page.locator(".ko-game-shell").waitFor();
    const skip = page.getByRole("button", { name: /건너뛰기/ });
    if (await skip.count()) await skip.first().click();
    await page.getByTestId("match-result-overlay").waitFor({ timeout: 45000 });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="match-reward"]') !== null,
      { timeout: 10000 },
    );
    assert.ok(transcript);
    assert.equal(final.winnerId, "player-2");
    assert.equal(final.players[1].board[0].currentAttack, 3);
    assert.equal(final.players[1].graveyard.length, 2);
    assert.ok(
      transcript.actions.some(
        (a) =>
          a.type === "PLAY_WRESTLER" &&
          a.cardInstanceId === "ninja" &&
          a.actor === "AI",
      ),
    );
    assert.ok(
      transcript.actions.some(
        (a) =>
          a.type === "ATTACK" &&
          a.attackerInstanceId === "collector" &&
          a.actor === "AI",
      ),
    );
    assert.ok(workers.some((u) => u.includes("ai-decision.worker")));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: out + "/result-" + width + ".png" });
    results.push({
      width,
      height,
      realHome: true,
      workerStarted: true,
      legacyNormalHandoffUsesHighest: true,
      realNinjaCombination: true,
      serverReplayAgrees: true,
      errors,
    });
    if (width === 390) {
      await context.close();
      await page.video().saveAs(out + "/mobile.webm");
    } else await context.close();
  }
  // Worker/synchronous parity on recorded real match positions, with a main-thread heartbeat.
  const p = await browser.newPage();
  await auditSetup(p);
  await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
  await p.locator(".ko-game-shell").waitFor();
  const samples = JSON.parse(
    await readFile("qa-results/boss-ai/worker-samples.json", "utf8"),
  ).slice(0, 8);
  const worker = await p.evaluate(async (samples) => {
    const { createAIDecisionClient } =
      await import("/src/lib/ai-decision-client.ts");
    const client = createAIDecisionClient();
    let ticks = 0;
    const timer = setInterval(() => ticks++, 8),
      ms = [];
    try {
      for (const s of samples) {
        const at = performance.now();
        const action = await client.choose(s.state, s.actions, s.playerId);
        ms.push(performance.now() - at);
        if (JSON.stringify(action) !== JSON.stringify(s.expected))
          throw Error("Worker decision differs");
      }
    } finally {
      client.dispose();
      clearInterval(timer);
    }
    const cancel = createAIDecisionClient();
    const pending = cancel.choose(
      samples[0].state,
      samples[0].actions,
      samples[0].playerId,
    );
    cancel.dispose();
    await pending;
    return {
      positions: samples.length,
      workerParity: true,
      heartbeatTicks: ticks,
      decisionMs: ms,
      disposeResolvesPending: true,
    };
  }, samples);
  assert.ok(worker.heartbeatTicks > 0);
  results.push(worker);
  await p.close();
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
