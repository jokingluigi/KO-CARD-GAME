import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const data = JSON.parse(
  readFileSync(
    new URL(
      "../../artifacts/ko-game/qa/art-direction-data.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const origin = process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.KO_QA_CHROME_CHANNEL === "chromium"
    ? {}
    : { channel: "chrome" }),
});
const complex = {
  schemaVersion: "QUEST_CONDITION_V2",
  condition: {
    anyOf: [
      { event: "CARD_PLAYED", filters: { tagsAny: ["zombie"] } },
      { event: "ENTER_FIELD", filters: { entryCause: "REVIVE" } },
    ],
  },
  progress: { mode: "COUNT" },
  required: 2,
};
for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
]) {
  const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const definitions = [
    {
      id: "complex",
      title: "복합 조건",
      description: "",
      objectiveType: "CARD_PLAYED",
      cardType: null,
      targetValue: 2,
      rewardType: "CURRENCY",
      rewardAmount: 100,
      rewardTargetId: null,
      enabled: true,
      schemaVersion: "QUEST_CONDITION_V2",
      condition: complex,
    },
  ];
  let saved;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json = {};
    if (path === "/api/admin/rewards")
      json = { settings: [], dailyQuests: definitions, attendance: [] };
    else if (path.includes("/admin/rewards/daily-quests")) {
      saved = route.request().postDataJSON();
      if (route.request().method() === "POST")
        definitions.push({ ...saved, id: "new-quest" });
      else
        Object.assign(
          definitions.find((d) => d.id === path.split("/").pop()),
          saved,
        );
      json = { definition: saved };
    } else if (path.endsWith("/cards")) json = data.cards;
    else if (path.endsWith("/champions")) json = data.champions;
    else if (path.endsWith("/packs")) json = { packs: [] };
    await route.fulfill({ json });
  });
  await page.goto(origin + "/qa/daily-quests.html");
  const editor = page.getByTestId("daily-quest-editor");
  await editor.waitFor();
  await editor.getByLabel("퀘스트 제목", { exact: true }).fill("피해 퀘스트");
  await editor.getByLabel("달성 조건").selectOption("DAMAGE_DEALT");
  await editor.getByLabel("목표 수치", { exact: true }).fill("20");
  await editor.getByLabel("보상 수량").fill("200");
  await editor
    .getByRole("button", { name: "퀘스트 추가", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("[role=status]")
      ?.textContent?.includes("저장했습니다"),
  );
  assert.equal(saved.objectiveType, "DAMAGE_DEALT");
  assert.equal(saved.targetValue, 20);
  assert.equal(saved.rewardAmount, 200);
  assert.equal(saved.schemaVersion, "QUEST_CONDITION_V1");
  assert.equal(saved.description, "피해량 누적 20 피해");
  const complexRow = editor.locator("li").filter({ hasText: "복합 조건" });
  await complexRow.getByRole("button", { name: "수정", exact: true }).click();
  await editor
    .getByRole("button", { name: "퀘스트 수정", exact: true })
    .click();
  await page.waitForTimeout(250);
  assert.deepEqual(
    saved.condition,
    complex,
    "editing must preserve composite condition",
  );
  await complexRow
    .getByRole("button", { name: "배정 중지", exact: true })
    .click();
  await complexRow
    .getByRole("button", { name: "배정 활성화", exact: true })
    .waitFor();
  assert.equal(saved.enabled, false);
  assert.deepEqual(saved.condition, complex);
  await complexRow.getByRole("button", { name: "복사", exact: true }).click();
  assert.equal(
    await editor.getByLabel("퀘스트 제목", { exact: true }).inputValue(),
    "복합 조건 (복사)",
  );
  await editor.getByRole("button", { name: "새로 작성" }).click();
  await editor.getByLabel("퀘스트 검색").fill("NO_QUEST");
  assert.equal(await editor.locator("li").count(), 0);
  await editor.getByLabel("퀘스트 검색").fill("");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(name + ": admin presets/save/composite/disable/copy/search PASS");
  await context.close();
}
const cards = data.cards.cards.filter((c) => !c.isToken && !c.isChampionToken);
const selected = cards
  .flatMap((c) =>
    Array(c.rarity === "NORMAL" ? 3 : c.rarity === "EPIC" ? 2 : 1).fill(c),
  )
  .slice(0, 25);
const champion = data.champions.champions[0],
  deck = {
    id: "daily-browser-deck",
    name: "Daily deck",
    championDefinitionId: champion.id,
    cardDefinitionIds: selected.map((c) => c.id),
    cards: selected,
    champion,
    isValid: true,
  };
const ai = {
  ...deck,
  id: "daily-browser-ai",
  enabled: true,
  displayOrder: 0,
  difficulty: "NORMAL",
  name: "Daily AI",
};
for (const mode of ["success", "quest-failure", "start-failure"]) {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let startCalls = 0,
    completions = 0,
    submitted;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json = {};
    if (path.includes("/storage/"))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    if (path.endsWith("/server-status"))
      json = { enabled: false, allowed: true };
    else if (path.endsWith("/auth/me"))
      json = {
        authenticated: true,
        user: {
          id: "daily-browser-user",
          nickname: "Daily",
          role: "USER",
          currencyBalance: 100,
        },
      };
    else if (path.endsWith("/minion-a/cards")) json = { definitions: [] };
    else if (path.endsWith("/cards")) json = data.cards;
    else if (path.endsWith("/champions")) json = data.champions;
    else if (path.endsWith("/card-frames")) json = data["card-frames"];
    else if (path.endsWith("/decks")) json = { decks: [deck] };
    else if (path.endsWith("/ai-decks"))
      json = { decks: [ai], extraCards: [], extraChampions: [] };
    else if (path.endsWith("/game-media")) json = { backgrounds: [], bgms: [] };
    else if (path.endsWith("/main-content")) json = data["main-content"];
    else if (path.endsWith("/ai-match-start")) {
      startCalls++;
      const body = route.request().postDataJSON();
      assert.equal(body.deckId, deck.id);
      assert.equal(body.aiDeckId, ai.id);
      if (mode === "start-failure")
        return route.fulfill({
          status: 422,
          json: { message: "준비 실패 테스트" },
        });
      json = await page.evaluate(
        async ({ data, selected, champion, matchId }) => {
          const g = await import("/src/game/index.ts"),
            selection = await import("/src/lib/ai-match-selection.ts");
          const defs = data.cards.cards.map(g.cardRecordToDefinition),
            champs = data.champions.champions.map(g.championRecordToDefinition);
          const s = g.startGame(
            g.createInitialGameState(
              [champion.id, champion.id],
              g.canonicalCardCatalog(defs),
              champs,
              [selected.map((c) => c.id), selected.map((c) => c.id)],
              {
                gameId: matchId,
                randomSeed: selection.seedForAIMatch(matchId),
              },
            ),
            g.createDeterministicRandom(matchId),
            undefined,
            { flexibleDeckPlayerId: "player-2" },
          );
          for (const p of s.players) {
            p.mulliganUsed = true;
            p.personalTurn = 3;
          }
          return { state: s, difficulty: "NORMAL" };
        },
        { data, selected, champion, matchId: body.matchId },
      );
    } else if (path.endsWith("/ai-match-progress")) {
      completions++;
      submitted = route.request().postDataJSON();
      json = {
        completed: mode !== "quest-failure" || completions > 1,
        message: "퀘스트 저장 테스트",
        reward: { amount: 200, sourceType: "MATCH_AI_RESULT" },
      };
    }
    await route.fulfill({ json });
  });
  await page.goto(origin + "/ai-match");
  try { await page.getByRole("button", { name: /매치 시작/ }).click(); } catch (error) { console.error({pageErrors:errors,screen:await page.locator("body").innerText()}); throw error; }
  if (mode === "start-failure") {
    await page.getByText("준비 실패 테스트").waitFor();
    assert.equal(await page.locator(".ko-game-shell").count(), 0);
    assert.equal(completions, 0);
  } else {
    await page
      .getByRole("button", { name: "설정 열기", exact: true })
      .click({ timeout: 30000 });
    await page.getByRole("button", { name: "항복", exact: true }).click();
    await page.getByRole("button", { name: "항복하기", exact: true }).click();
    await page.getByTestId("match-result-overlay").waitFor();
    await page.getByText("+200 크레딧 지급").waitFor();
    assert.ok(submitted.actions.some((a) => a.type === "SURRENDER"));
    assert.equal(submitted.outcome, "LOSS");
    if (mode === "quest-failure") {
      await page.getByTestId("quest-progress-error").waitFor();
      await page.getByRole("button", { name: "퀘스트 다시 저장" }).click();
      await page
        .getByTestId("quest-progress-error")
        .waitFor({ state: "hidden" });
      assert.equal(completions, 2);
    } else
      assert.equal(await page.getByTestId("quest-progress-error").count(), 0);
  }
  assert.equal(startCalls, 1);
  assert.deepEqual(errors, []);
  console.log("AI " + mode + ": actual start/result/retry PASS");
  await context.close();
}

for (const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]) {
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage();let claims=0;
 const assignment={id:'claim-me',definitionId:'claim-definition',assignmentDate:'2026-10-07',slot:0,title:'일반 퀘스트 수령',description:'경기를 완료하세요.',objectiveType:'PLAY_MATCH',cardType:null,targetValue:1,rewardType:'CURRENCY',rewardAmount:77,rewardTargetId:null,progress:1,status:'COMPLETED',claimedAt:null};
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;
 if(path.endsWith('/packs'))return route.fulfill({status:503,json:{message:'Catalog temporarily unavailable'}});
 let json={};if(path.endsWith('/server-status'))json={enabled:false,allowed:true};else if(path.endsWith('/daily-quests'))json={assignments:[assignment]};else if(path.endsWith('/claim')){claims++;assignment.status='CLAIMED';json={assignment,reward:{amount:77},alreadyClaimed:false};}else if(path.endsWith('/cards'))json=data.cards;else if(path.endsWith('/champions'))json=data.champions;
 await route.fulfill({json});});
 await page.goto(origin+'/daily-quests');await page.getByRole('heading',{name:'일반 퀘스트 수령'}).waitFor();await page.getByRole('button',{name:'보상 받기',exact:true}).click();await page.getByRole('button',{name:'수령 완료',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'수령 완료',exact:true}).isDisabled(),true);assert.equal(claims,1);console.log(name+': quest view/claim despite catalog failure PASS');await context.close();
}

await browser.close();
