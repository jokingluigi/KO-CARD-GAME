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
    process.env.FINISHER_QA_OUTPUT ?? "docs/qa/20261111-balance-content/branch-battle",
  origin = process.env.KO_BALANCE_QA_ORIGIN ?? "http://127.0.0.1:5186";
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
  await seed.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
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
  const { cardRecordToDefinition } =
    await import("../../artifacts/ko-game/src/game/cards/published-cards.ts");
  const { championRecordToDefinition } =
    await import("../../artifacts/ko-game/src/game/champions/published-champions.ts");
  const { generateCardInstance } =
    await import("../../artifacts/ko-game/src/game/cards/generation.ts");
  const records = JSON.parse(
    await readFile("docs/qa/snapshots/20261111-admin/cards.json", "utf8"),
  );
  const champs = JSON.parse(
    await readFile("docs/qa/snapshots/20261111-admin/champions.json", "utf8"),
  );
  const definitions = records.map(cardRecordToDefinition);
  // Existing local art stands in for images; effects and text are the real latest catalog.
  const localArt = base.players[0].board[0].imageUrl;
  base.cardPool = definitions.map((d) => ({ ...d, imageUrl: localArt }));
  const pandora = championRecordToDefinition(
    champs.find((c) => c.name === "챔피언 판도라"),
  );
  base.players[0].champion = {
    ...pandora,
    imageUrl: base.players[0].champion.imageUrl,
    health: 10,
    questProgress: 0,
    questCompleted: false,
  };
  base.players[0].health = 10;
  base.players[0].maxHealth = 20;
  base.players[0].currentGold = 6;
  base.players[0].hand = [
    generateCardInstance(
      base.cardPool.find((c) => c.name === "흉내내기"),
      { instanceId: "mimic" },
    ),
  ];
  base.players[0].board = [null, null, null, null];
  const body = {
    ...base.cardPool.find((c) => c.cardType === "WRESTLER"),
    id: "qa-enemy-body",
    name: "검증 상대 선수",
    attack: 1,
    health: 1,
    keywords: [],
    abilities: [],
    rulesText: "",
    isToken: false,
    isChampionToken: false,
  };
  base.cardPool.push(body);
  base.players[1].board = [0, 1]
    .map((i) => ({
      ...generateCardInstance(body, { instanceId: "enemy-" + i }),
      boardSlot: i,
    }))
    .concat([null, null]);
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
      await p.route('**/api/storage/objects/uploads/cosmetics/branch-*.png',async route=>route.fulfill({contentType:'image/png',body:await readFile('artifacts/ko-game/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png')}));
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
    await own.locator(".ko-champion-ability").click();
    const dialog = own.getByRole("dialog");
    await dialog.waitFor();
    await dialog
      .getByRole("button", { name: /검증 상대 선수/ })
      .nth(0)
      .click();
    await dialog
      .getByRole("button", { name: /검증 상대 선수/ })
      .nth(1)
      .click();
    assert.equal(runtime.state.targetingState.selectedTargetIds.length, 2);
    await opponent
      .getByText("상대가 피니셔 효과의 대상을 선택하고 있어요.")
      .waitFor();
    await own.screenshot({ path: `${out}/multi-${width}.png` });
    await own.reload();
    await own.getByRole("dialog").waitFor();
    assert.equal(
      await own.getByRole("dialog").locator("[aria-pressed=true]").count(),
      2,
    );
    await own
      .getByRole("button", { name: "선택한 선수에게 효과 발동" })
      .click();
    await own.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(runtime.state.players[0].health, 14);
    assert.equal(runtime.state.players[1].graveyard.length, 2);
    await own.waitForTimeout(2200);
    await own
      .locator(
        '.ko-player-hand [data-card-definition="52528873-0704-4569-9bd8-2c4ff227ce51"]',
      )
      .click({ position: { x: 25, y: 60 } });
    await own.screenshot({ path: `${out}/hand-selected-${width}.png` });
    await own.getByRole("button", { name: "사용", exact: true }).click();
    await own.getByRole("dialog").waitFor();
    assert.equal(
      runtime.state.targetingState.catalogChoice.definitionIds.length,
      3,
    );
    await own.screenshot({ path: `${out}/discovery-${width}.png` });
    await own.getByRole("dialog").locator("[aria-pressed]").first().click();
    await own.getByRole("button", { name: "선택한 카드 받기" }).click();
    await own.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(runtime.state.players[0].hand.length, 1);
    assert.equal(runtime.state.targetingState, undefined);
    await own.screenshot({ path: `${out}/resolved-${width}.png` });
    // Restore a legitimate completed-branch snapshot through the real DB/service.
    const completed=structuredClone(runtime.state),owner=completed.players[0];
    const place={scale:1,x:50,y:35,flip:false,crop:false},frame=name=>({url:'/api/storage/objects/uploads/cosmetics/branch-'+name+'.png',self:place,opponent:{...place,flip:true}});
    owner.health=3;owner.champion.health=3;owner.champion.questCompleted=true;owner.champion.selectedFinisherId='option-2';
    owner.champion.presentationLines={...owner.champion.presentationLines,BATTLE_SPRITE:{version:1,frames:{default:frame('base'),low:frame('low')},reactions:{},finishers:{'option-1':{sprite:{version:1,frames:{default:frame('a')},reactions:{}}},'option-2':{sprite:{version:1,frames:{default:frame('b'),low:frame('b-low')},reactions:{}},portrait:frame('b-profile')}}}};
    const {eq}=await import('../../lib/db/node_modules/drizzle-orm/index.js');
    await f.db.update(f.schema.onlineMatchesTable).set({serializedGameState:completed}).where(eq(f.schema.onlineMatchesTable.id,id));
    service.cleanupMatchRuntime(id);runtime=await service.getRuntime(id);
    await own.reload();await opponent.reload();
    for(const page of [own,opponent]){
      const actor=page.locator('[data-sprite-skin*="finisher:option-2"]');await actor.locator('img').waitFor();
      await page.waitForFunction(()=>document.querySelector('[data-sprite-skin*="finisher:option-2"] img')?.getAttribute('src')?.endsWith('branch-b.png'));
      assert.equal(await actor.getAttribute('data-sprite-set'),'awakened');
    }
    await own.screenshot({path:`${out}/branch-low-restored-${width}.png`});
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      actualOnlinePages: true,
      authoritativeServiceAndIsolatedDB: true,
      multiTargetTouch: true,
      persistedSelectionAfterReload: true,
      catalogDiscovery: true,
      opponentWait: true,
      exactZeroRetireAndHeal: true,
      placeholderArt: true,
      completedBranchLowHealthBothClientsRestored:true,
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
