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
const out = "qa-results/finisher-foundation",
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
  const base = await seed.evaluate(async (art) => {
    const { boardFixture, definitions } =
      await import("/qa/black-gold-fixture.ts");
    const { generateCardInstance } =
      await import("/src/game/cards/generation.ts");
    const state = boardFixture();
    for (const d of definitions) {
      const a = art.cards.find((c) => c.id === d.id);
      if (a)
        Object.assign(d, {
          imageUrl: a.testImageUrl,
          imageScale: a.imageScale ?? 1,
          imageDisplayMode: a.imageDisplayMode ?? "CONTAIN",
          imagePositionX: a.imagePositionX ?? 50,
          imagePositionY: a.imagePositionY ?? 50,
        });
    }
    for (const p of state.players) {
      const a = art.champions.find((c) => c.id === p.champion.id);
      if (a) p.champion.imageUrl = a.testImageUrl;
    }
    state.events = [];
    state.turn = 3;
    state.openingMulligan = false;
    state.cardPool = [...definitions];
    const unit = definitions.find(
      (d) =>
        d.cardType === "WRESTLER" &&
        !d.isToken &&
        !d.isChampionToken &&
        (!art.cards.length || art.cards.some((c) => c.id === d.id)),
    );
    if (!unit) throw Error("Missing fixture unit");
    const spell = {
      ...unit,
      id: "qa-replace-spell",
      name: "교체 검증 주문",
      cardType: "TECHNIQUE",
      rarity: "CHAMPION",
      cost: 0,
      attack: 0,
      health: 0,
      rulesText: "검증용 능력 교체",
      isToken: true,
      isChampionToken: true,
      keywords: [],
      abilities: [
        {
          trigger: "ACTIVE",
          effects: [
            {
              type: "STRUCTURED",
              action: "REPLACE_CHAMPION_ABILITY",
              values: { abilityReplacement: { variant: "UPGRADED" } },
            },
          ],
        },
      ],
    };
    state.cardPool.push(spell);
    state.players.forEach((p, i) => {
      p.currentGold = 6;
      p.hand = Array.from({ length: 7 }, (_, n) =>
        generateCardInstance(unit, { instanceId: `old-${i}-${n}` }),
      );
      p.deck = Array.from({ length: 8 }, (_, n) =>
        generateCardInstance(unit, { instanceId: `deck-${i}-${n}` }),
      );
      p.board = [null, null, null, null];
      p.graveyard = [];
      p.removedFromGame = [];
      p.champion.championTokenDefinitionId = null;
      p.champion.questCompleted = false;
      if (p.champion.quest) {
        p.champion.quest.requiredProgress = 100;
        p.champion.questProgress = 0;
      }
      p.champion.ability = {
        id: "qa-ability-" + i,
        name: i ? "검증 드로우" : "검증 생성",
        cost: 1,
        description: "기반 기능 검증",
        effects: i
          ? [{ type: "STRUCTURED", action: "DRAW", values: { amount: 2 } }]
          : [
              {
                type: "STRUCTURED",
                action: "GENERATE",
                values: { definitionRef: { id: unit.id }, count: 2 },
              },
              { type: "STRUCTURED", action: "ADD_GOLD", values: { amount: 2 } },
            ],
      };
    });
    state.players[0].hand[0] = generateCardInstance(spell, {
      instanceId: "replacement",
    });
    state.players[0].champion.upgradedAbility = {
      id: "qa-upgrade",
      name: "변경 검증 능력",
      cost: 2,
      description: "상대 선수에게 2 피해",
      effects: [
        {
          type: "STRUCTURED",
          action: "DAMAGE",
          target: {
            zone: "BOARD",
            owner: "ENEMY",
            selection: "PLAYER_CHOICE",
            cardType: "WRESTLER",
            count: 1,
          },
          values: { amount: 2 },
        },
      ],
    };
    return JSON.parse(
      JSON.stringify(state)
        .replaceAll("player-1", "PLAYER_ONE")
        .replaceAll("player-2", "PLAYER_TWO"),
    );
  }, artRecords);
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
      hasTouch: width < 500,
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
    await own.locator(".ko-champion-ability").click();
    const title = own.getByRole("heading", { name: "손패가 가득 찼어요" });
    await title.waitFor();
    await opponent
      .getByText("상대가 손패에서 버릴 카드를 선택하고 있어요.")
      .waitFor();
    assert.equal(
      await own
        .getByRole("button", { name: "선택한 카드 버리고 받기" })
        .isDisabled(),
      true,
    );
    await own.screenshot({ path: `${out}/discard-${width}.png` });
    await opponent.screenshot({ path: `${out}/waiting-${width}.png` });
    await own
      .getByRole("button", { name: "확대·상세", exact: true })
      .nth(1)
      .click();
    await own.getByRole("button", { name: "닫기", exact: true }).last().click();
    const choose = async () => {
      const buttons = own.locator(
        '[aria-label="버릴 손패 선택"] button[aria-pressed]',
      );
      const count = await buttons.count();
      for (let n = count - 1; n >= 0; n--) {
        if (
          !(await buttons.nth(n).getAttribute("aria-label")).includes(
            "교체 검증 주문",
          )
        ) {
          await buttons.nth(n).click();
          break;
        }
      }
      await own
        .getByRole("button", { name: "선택한 카드 버리고 받기" })
        .click();
    };
    await choose();
    await own.waitForFunction(
      () =>
        document.querySelector('[aria-label="버릴 손패 선택"]') &&
        !document.querySelector(
          '[aria-label="버릴 손패 선택"] button[aria-pressed=true]',
        ),
    );
    assert.equal(runtime.state.players[0].graveyard.length, 1);
    assert.equal(runtime.state.players[0].currentGold, 5);
    await own.reload();
    await title.waitFor();
    await choose();
    await title.waitFor({ state: "hidden" });
    assert.equal(runtime.state.players[0].graveyard.length, 2);
    assert.equal(runtime.state.players[0].currentGold, 7);
    assert.equal(runtime.state.players[0].hand.length, 7);
    await opponent
      .getByText("상대가 손패에서 버릴 카드를 선택하고 있어요.")
      .waitFor({ state: "hidden" });
    await own
      .locator('.ko-player-hand [data-card-definition="qa-replace-spell"]')
      .click({ position: { x: 30, y: 35 } });
    await own.getByRole("button", { name: "사용", exact: true }).click();
    await own.waitForFunction(() =>
      document
        .querySelector(".ko-champion-ability")
        ?.textContent.includes("비용 2 골드"),
    );
    assert.equal(
      runtime.state.players[0].champion.abilityOverride.id,
      "qa-upgrade",
    );
    assert.equal(runtime.state.players[0].championAbilityUsedThisTurn, true);
    await own.reload();
    await own.waitForFunction(() =>
      document
        .querySelector(".ko-champion-ability")
        ?.textContent.includes("비용 2 골드"),
    );
    await own.screenshot({ path: `${out}/changed-ability-${width}.png` });
    const next = await service.applyMatchAction(
      id,
      "tutorial-user",
      "next-turn-" + width,
      runtime.version,
      { type: "END_TURN" },
      runtime.primaryConnections.get("tutorial-user"),
    );
    assert.ok(next.ok, next.message ?? next.code);
    for (const c of runtime.connections)
      c.send(service.messageForViewer(next, c.userId));
    await opponent
      .getByText("손패 초과 · 공개 후 제외", { exact: true })
      .waitFor();
    await opponent.screenshot({ path: `${out}/overdraw-${width}.png` });
    await opponent.waitForFunction(
      () =>
        document
          .querySelector(".ko-champion-ability")
          ?.getAttribute("aria-disabled") === "false",
    );
    await opponent.locator(".ko-champion-ability").click();
    for (
      let n = 0;
      n < 60 && runtime.state.players[1].removedFromGame.length < 3;
      n++
    )
      await own.waitForTimeout(50);
    assert.equal(runtime.state.players[1].removedFromGame.length, 3);
    assert.equal(runtime.state.players[1].hand.length, 7);
    assert.equal(runtime.state.players[1].graveyard.length, 0);
    assert.equal(runtime.state.targetingState, undefined);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      realOnlinePages: true,
      authoritativeServiceAndIsolatedDB: true,
      twoPlayerPrivateChoice: true,
      confirmAndDetail: true,
      pendingReload: true,
      continuationOnce: true,
      spellReplacesAbility: true,
      usedFlagPreserved: true,
      publicOverdrawBothSides: true,
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
