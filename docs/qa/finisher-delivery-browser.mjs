/** Two real online pages; intercepted WebSocket transport invokes the real online service and isolated DB. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
const f = await startTutorialFixture(),
  service = await import("../../artifacts/api-server/src/online/service.ts"),
  browser = await chromium.launch();
const out =
    process.env.FINISHER_QA_OUTPUT ??
    "docs/qa/20261111-finisher-delivery/battle",
  origin = "http://127.0.0.1:5186";
await mkdir(out, { recursive: true });
const results = [],
  ids = [];
const artRecords = process.env.KO_FINISHER_ART_DATA
  ? JSON.parse(await readFile(process.env.KO_FINISHER_ART_DATA, "utf8"))
  : { cards: [], champions: [] };
const cachedArt = new Map();
for (const record of [...artRecords.cards, ...artRecords.champions]) {
  const url = "/qa/finisher-art/" + record.id + ".png";
  const body = execFileSync(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--max-time",
      "30",
      new URL(record.imageUrl, "https://ko-card-game-vr69.onrender.com").href,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  cachedArt.set(url, { body, contentType: "image/png" });
  record.testImageUrl = url;
}

try {
  await f.db.insert(f.schema.usersTable).values({
    id: "finisher-opponent",
    email: "visual-opponent@example.invalid",
    nickname: "검증 상대",
    role: "USER",
    passwordHash: "unusable",
  });
  await f.db.insert(f.schema.decksTable).values([
    { id: "foundation-one", userId: "tutorial-user", name: "검증 덱" },
    { id: "foundation-two", userId: "finisher-opponent", name: "검증 덱" },
  ]);
  const seed = await browser.newPage();
  await seed.route("**/api/**", (r) =>
    r.fulfill({ json: { cards: [], frames: [] } }),
  );
  await seed.goto(origin + "/qa/black-gold-board.html");
  await seed.locator(".ko-game-shell").waitFor();
  const base = await seed.evaluate(async () => {
    const { boardFixture, definitions } =
      await import("/qa/black-gold-fixture.ts");
    const { generateCardInstance } =
      await import("/src/game/cards/generation.ts");
    const state = boardFixture();
    const art = definitions.find(
      (d) => d.cardType === "WRESTLER" && d.imageUrl,
    );
    const ally = {
      ...art,
      id: "qa-upgrade-ally",
      name: "검증 좀비",
      cardType: "WRESTLER",
      cost: 1,
      attack: 2,
      health: 3,
      rulesText: "",
      keywords: [],
      abilities: [],
    };
    const unit = {
      ...ally,
      id: "qa-upgrade-source",
      name: "피니셔 검증 선수",
      cost: 2,
      keywords: [],
      rulesText: "",
      abilities: [],
    };
    const spell = {
      ...ally,
      id: "qa-finisher",
      name: "검증 피니셔 주문",
      cardType: "TECHNIQUE",
      rarity: "CHAMPION",
      cost: 6,
      isToken: true,
      isChampionToken: true,
      rulesText: "아군 선수 하나에게 +2/+2를 부여합니다.",
      abilities: [
        {
          trigger: "ACTIVE",
          effects: [
            {
              type: "STRUCTURED",
              action: "BUFF",
              target: {
                zone: "BOARD",
                owner: "SELF",
                selection: "PLAYER_CHOICE",
                count: 1,
              },
              values: { attack: 2, health: 2 },
            },
          ],
        },
      ],
    };
    state.events = [];
    state.turn = 3;
    state.openingMulligan = false;
    state.cardPool = [unit, ally, spell];
    state.players.forEach((p, i) => {
      p.currentGold = 4;
      p.deck = [];
      p.hand = i
        ? []
        : [generateCardInstance(unit, { instanceId: "upgrade-source" })];
      p.board = [null, null, null, null];
      p.graveyard = [];
      p.removedFromGame = [];
      p.champion.quest = null;
      p.champion.championTokenDefinitionId = null;
    });
    state.players[0].champion.quest = {
      id: "qa-delivery",
      name: "피니셔 준비",
      description: "선수 카드 1장 사용",
      trackedEvent: "CARD_PLAYED",
      requiredProgress: 1,
      finisher: { cardDefinitionId: spell.id, delivery: "CAST" },
      reward: { type: "GAIN_GOLD", amount: 0 },
    };
    state.players[0].champion.questCompleted = false;
    state.players[0].champion.questProgress = 0;
    state.players[0].board[0] = {
      ...generateCardInstance(ally, { instanceId: "upgrade-ally" }),
      boardSlot: 0,
      enteredThisTurn: false,
    };
    return JSON.parse(
      JSON.stringify(state)
        .replaceAll("player-1", "PLAYER_ONE")
        .replaceAll("player-2", "PLAYER_TWO"),
    );
  });
  await seed.close();
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const id = `finisher-ui-${width}`;
    ids.push(id);
    const state = structuredClone(base);
    state.gameId = id;
    const publicPlayers = state.players.map((p, i) => ({
      seat: i ? "PLAYER_TWO" : "PLAYER_ONE",
      userId: i ? "finisher-opponent" : "tutorial-user",
      nickname: i ? "검증 상대" : "검증 플레이어",
      championName: p.champion.name,
      portraitUrl: p.champion.imageUrl,
      dialogueLine: null,
    }));
    await f.db.insert(f.schema.onlineMatchesTable).values({
      id,
      status: "ACTIVE",
      player1UserId: "tutorial-user",
      player2UserId: "finisher-opponent",
      player1DeckId: "foundation-one",
      player2DeckId: "foundation-two",
      serializedGameState: state,
      serializedSnapshot: {
        player1UserId: "tutorial-user",
        player2UserId: "finisher-opponent",
        player1DeckId: "foundation-one",
        player2DeckId: "foundation-two",
        cardDefinitions: state.cardPool,
        championDefinitions: [],
        publicPlayers,
        introFirstSpeaker: null,
      },
    });
    let runtime = await service.getRuntime(id);
    assert.ok(runtime);
    const errors = [],
      connections = [];
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 1000,
      recordVideo:
        width === 390
          ? { dir: out + "/video", size: { width, height } }
          : undefined,
    });
    const makePage = async (user) => {
      const p = await context.newPage();
      await p.route("**/qa/finisher-art/**", (r) =>
        r.fulfill(
          cachedArt.get(new URL(r.request().url()).pathname) ?? {
            status: 404,
            body: "",
          },
        ),
      );
      p.on("pageerror", (e) => errors.push(e.message));
      await auditSetup(p);
      await p.route("**/api/auth/me", (r) =>
        r.fulfill({
          json: {
            authenticated: true,
            user: {
              id: user,
              role: "USER",
              nickname:
                user === "tutorial-user" ? "검증 플레이어" : "검증 상대",
              currencyBalance: 0,
            },
          },
        }),
      );
      await p.route("**/api/online-matches/ws-ticket", (r) =>
        r.fulfill({ json: { ticket: "isolated-test" } }),
      );
      await p.routeWebSocket("**/api/online-matches/ws**", (ws) => {
        const connection = {
          userId: user,
          send: (m) => ws.send(JSON.stringify(m)),
        };
        connections.push(connection);
        ws.onMessage(async (raw) => {
          try {
            const m = JSON.parse(String(raw));
            if (m.type === "SUBSCRIBE" || m.type === "RESYNC") {
              service.attachConnection(runtime, connection);
              connection.send(service.snapshotMessage(runtime, user));
            }
            if (m.type === "PING") ws.send(JSON.stringify({ type: "PONG" }));
            if (m.type === "MATCH_ACTION") {
              const execution = await service.applyMatchAction(
                id,
                user,
                m.requestId,
                m.expectedVersion,
                m.action,
                connection,
              );
              if (execution.ok)
                for (const c of runtime.connections)
                  c.send(service.messageForViewer(execution, c.userId));
              else
                connection.send(
                  service.rejectionMessage(
                    runtime,
                    m.requestId,
                    execution.code,
                    execution.message,
                  ),
                );
            }
          } catch (e) {
            errors.push(e.stack ?? e.message);
          }
        });
        ws.onClose(() => service.detachConnection(runtime, connection));
      });
      await p.goto(origin + "/online/match/" + id);
      await p.locator(".ko-champion-ability").waitFor();
      return p;
    };
    let own = await makePage("tutorial-user");
    const opponent = await makePage("finisher-opponent");
    await own.waitForFunction(
      () =>
        document
          .querySelector(".ko-champion-ability")
          ?.getAttribute("aria-disabled") === "false",
    );
    await own.screenshot({ path: `${out}/before-${width}.png` });
    await own
      .locator('.ko-player-hand [data-card-definition="qa-upgrade-source"]')
      .click({ position: { x: 25, y: 75 } });
    await own.waitForFunction(() =>
      document.querySelector("[data-hand-selection=true]"),
    );
    await own
      .getByRole("button", { name: "2구역에 카드 배치", exact: true })
      .click();
    await opponent
      .getByText("상대가 피니셔 효과의 대상을 선택하고 있어요.")
      .waitFor();
    assert.equal(runtime.state.players[0].currentGold, 2);
    assert.ok(runtime.state.targetingState);
    assert.equal(runtime.state.players[0].hand.length, 0);
    assert.equal(
      await own.getByRole("button", { name: /^(취소|선택 취소)$/ }).count(),
      0,
    );
    await own.waitForTimeout(2200);
    await own.screenshot({ path: `${out}/target-${width}.png` });
    await opponent.screenshot({ path: `${out}/opponent-wait-${width}.png` });
    await own.reload();
    await own.locator('[data-card-instance-id="upgrade-ally"]').waitFor();
    await own.waitForFunction(() =>
      document.querySelector("[data-effect-targeting=true]"),
    );
    await own
      .locator('[data-card-instance-id="upgrade-ally"] [data-card-definition]')
      .click({ position: { x: 30, y: 40 } });
    await opponent
      .getByText("상대가 피니셔 효과의 대상을 선택하고 있어요.")
      .waitFor({ state: "hidden" });
    assert.equal(runtime.state.players[0].board[0].currentAttack, 4);
    assert.equal(runtime.state.players[0].board[0].currentHealth, 5);
    assert.equal(runtime.state.players[0].currentGold, 2);
    assert.equal(
      runtime.state.events.filter((e) => e.reason === "FINISHER_AUTO_CAST")
        .length,
      1,
    );
    assert.equal(runtime.state.targetingState, undefined);
    await own.waitForTimeout(700);
    await own.screenshot({ path: `${out}/resolved-${width}.png` });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      actualOnlinePages: true,
      authoritativeServiceAndIsolatedDB: true,
      base2ThenFreeFinisher: true,
      mobileTargetTouch: width < 1000,
      opponentWait: true,
      reloadChoice: true,
      exactlyOnceBuff: true,
      productionWrites: 0,
      errors,
    });
    const video = width === 390 ? own.video() : null;
    await context.close();
    if (video) await copyFile(await video.path(), out + "/mobile.webm");
    service.cleanupMatchRuntime(id);
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  for (const id of ids) service.cleanupMatchRuntime(id);
  await browser.close();
  await f.close();
}
