import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../src/schema";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AWAKENING_CARD_IDS,
  AWAKENING_QUEST_TEXT,
  championRecordToDefinition,
  cardRecordToDefinition,
  createInitialGameState,
  generateCardInstance,
} from "../../game-engine/src";
import { applyEffect } from "../../../artifacts/ko-game/src/game/effects/effect-engine";
import { sanitizeGameStateForViewer } from "../../../artifacts/api-server/src/online/sanitizer";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV = "development";
const pg = new PGlite(),
  database = drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
await pg.exec(
  await readFile(
    new URL("../migrations/0033_server_maintenance.sql", import.meta.url),
    "utf8",
  ),
);
await pg.exec(await readFile(new URL("../migrations/0038_ai_quest_matches.sql", import.meta.url), "utf8"));
await pg.exec(await readFile(new URL("../migrations/0038_ai_quest_matches.sql", import.meta.url), "utf8"));
const { db, pool } = await import("../src/index");
for (const method of [
  "select",
  "insert",
  "update",
  "delete",
  "transaction",
  "execute",
] as const)
  Object.assign(db, { [method]: database[method].bind(database) });
const { hashPassword } =
  await import("../../../artifacts/api-server/src/lib/auth");
await database.insert(schema.usersTable).values({
  id: "awakening-admin",
  email: "admin@awakening.invalid",
  nickname: "Awakening QA",
  passwordHash: await hashPassword("AwakeningLocalQA123"),
  role: "ADMIN",
});
const { default: app } = await import("../../../artifacts/api-server/src/app");
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.on("listening", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
let cookie = "",
  id = "",
  record: any;
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const session = response.headers.get("set-cookie");
  if (session) cookie = session.split(";")[0];
  return { status: response.status, body: await response.json() };
}
after(async () => {
  const { getRuntime, cleanupMatchRuntime } =
    await import("../../../artifacts/api-server/src/online/service");
  const runtime = await getRuntime("awakening-pvp");
  if (runtime) {
    await runtime.queue;
    runtime.state = { ...runtime.state, status: "FINISHED" };
    cleanupMatchRuntime("awakening-pvp");
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pg.close();
  await pool.end();
});
const input = {
  name: "관리자 지정 이름",
  maxHealth: 27,
  abilityName: "관리자 지정 능력",
  abilityCost: 2,
  abilityText: "",
  abilityEffects: {},
  hasQuest: true,
  questName: "위기 각성",
  questText: AWAKENING_QUEST_TEXT,
  questProgressRequired: 1,
  questRewardText: "위기 각성 연쇄 소환",
  questRewardEffects: null,
  questCondition: {
    event: "STATE_CONDITION",
    required: 1,
    condition: {
      type: "ALL",
      conditions: [
        { type: "HEALTH", owner: "SELF", op: "GTE", value: 1 },
        { type: "HEALTH", owner: "SELF", op: "LTE", value: 5 },
      ],
    },
    awakening: {
      stageCardIds: { ...AWAKENING_CARD_IDS },
      fullBoardPolicy: "WAIT_WITHOUT_INVULNERABILITY",
    },
  },
};

test('AI result credits succeed and are granted once even when optional quest replay cannot load a deck',async()=>{
 await database.insert(schema.rewardSettingsTable).values({key:'MATCH_ONLINE_WIN',enabled:true,rewardType:'CURRENCY',amount:200}).onConflictDoUpdate({target:schema.rewardSettingsTable.key,set:{enabled:true,rewardType:'CURRENCY',amount:200}});
 assert.equal((await request('/auth/login','POST',{email:'admin@awakening.invalid',password:'AwakeningLocalQA123'})).status,200);
 const before=(await pg.query<any>('SELECT currency_balance FROM users WHERE id=$1',['awakening-admin'])).rows[0].currency_balance;
 const matchId='ai-11111111-1111-4111-8111-111111111111';
 for(let retry=0;retry<2;retry++) {
  const result=await request('/daily-quests/ai-match-progress','POST',{deckId:'deleted-deck',aiDeckId:'unavailable-ai',matchId,outcome:'WIN',actions:Array.from({length:2000},(_,i)=>({type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'long-transcript-instance-'+i,boardSlot:0}))});
  assert.equal(result.status,200);assert.equal(result.body.completed,false);
  assert.equal(result.body.reward.amount,200);
 }
 const after=(await pg.query<any>('SELECT currency_balance FROM users WHERE id=$1',['awakening-admin'])).rows[0].currency_balance;
 assert.equal(after-before,200);
 assert.equal((await pg.query<any>('SELECT count(*)::int AS count FROM reward_grants WHERE source_id=$1',[matchId])).rows[0].count,1);
 const receipt=await request('/daily-quests/ai-match-progress/'+matchId+'/reward');assert.equal(receipt.status,200);assert.deepEqual(receipt.body.reward,{amount:200,sourceType:'MATCH_AI_RESULT'});
 assert.equal((await request('/daily-quests/ai-match-progress/ai-22222222-2222-4222-8222-222222222222/reward')).body.reward,null);
 assert.equal((await request('/daily-quests/ai-match-progress/invalid/reward')).status,400);
 const unauthenticated=await fetch(origin+'/api/daily-quests/ai-match-progress/'+matchId+'/reward');assert.equal(unauthenticated.status,401);
 const ownCookie=cookie;await database.insert(schema.usersTable).values({id:'receipt-other',email:'receipt-other@qa.invalid',nickname:'ReceiptOther',passwordHash:await hashPassword('ReceiptOther123'),role:'ADMIN'});assert.equal((await request('/auth/login','POST',{email:'receipt-other@qa.invalid',password:'ReceiptOther123'})).status,200);
 assert.equal((await request('/daily-quests/ai-match-progress/'+matchId+'/reward')).body.reward,null,'another user cannot recover this grant');cookie=ownCookie;

});
test("startup registers editable awakening drafts without overwriting existing owner data", async () => {
  const { ensureAwakeningContent, AWAKENING_CHAMPION_ID } = await import("../../../artifacts/api-server/src/lib/awakening-card-service");
  await ensureAwakeningContent();
  const rows = (await pg.query<any>("SELECT * FROM champions WHERE id=$1", [AWAKENING_CHAMPION_ID])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "AWAKEN_CHAMPION");
  assert.equal(rows[0].status, "DRAFT");
  assert.equal(rows[0].max_health, 20);
  assert.deepEqual(rows[0].quest_condition, input.questCondition);
  assert.equal((await pg.query<any>("SELECT * FROM cards")).rows.length, 3);
  await pg.query("UPDATE champions SET name=$1,max_health=31 WHERE id=$2", ["소유자 지정 이름", AWAKENING_CHAMPION_ID]);
  await pg.query("UPDATE cards SET name=$1 WHERE id=$2", ["소유자 지정 탱커", AWAKENING_CARD_IDS.TANK]);
  await ensureAwakeningContent();
  assert.equal((await pg.query<any>("SELECT * FROM champions WHERE id=$1", [AWAKENING_CHAMPION_ID])).rows[0].max_health, 31);
  assert.equal((await pg.query<any>("SELECT * FROM cards WHERE id=$1", [AWAKENING_CARD_IDS.TANK])).rows[0].name, "소유자 지정 탱커");
});
test("admin explicit opt-in creates champion and three exclusive draft cards atomically", async () => {
  assert.equal(
    (
      await request("/auth/login", "POST", {
        email: "admin@awakening.invalid",
        password: "AwakeningLocalQA123",
      })
    ).status,
    200,
  );
  const result = await request("/admin/champions", "POST", input);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  record = result.body.champion;
  id = record.id;
  assert.equal(record.name, input.name);
  assert.equal(record.maxHealth, 27);
  assert.equal(record.abilityCost, 2);
  const rows = (await pg.query<any>("SELECT * FROM cards")).rows;
  assert.equal(rows.length, 3);
  assert.ok(
    rows.every(
      (c) =>
        c.status === "DRAFT" &&
        c.rarity === "CHAMPION" &&
        c.is_token &&
        c.is_champion_token &&
        c.effect_config.questExclusive,
    ),
  );
});
test("saving again preserves stage artwork/name changes and creates no duplicates", async () => {
  await pg.query("UPDATE cards SET name=$1 WHERE id=$2", [
    "사용자 지정 탱커",
    AWAKENING_CARD_IDS.TANK,
  ]);
  const result = await request(`/admin/champions/${id}`, "PATCH", {
    ...input,
    version: record.version,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  record = result.body.champion;
  const rows = (await pg.query<any>("SELECT * FROM cards")).rows;
  assert.equal(rows.length, 3);
  assert.equal(
    rows.find((c) => c.id === AWAKENING_CARD_IDS.TANK).name,
    "사용자 지정 탱커",
  );
});
test("server preserves incomplete awakening drafts but does not execute unsafe configurations", async () => {
  for (const questCondition of [
    {
      ...input.questCondition,
      awakening: {
        ...input.questCondition.awakening,
        fullBoardPolicy: "RETURN_TO_HAND",
      },
    },
    {
      ...input.questCondition,
      awakening: {
        ...input.questCondition.awakening,
        stageCardIds: { ...AWAKENING_CARD_IDS, TANK: "forged" },
      },
    },
    {
      ...input.questCondition,
      condition: { type: "HEALTH", owner: "SELF", op: "LTE", value: 5 },
    },
  ]) {
    const saved = await request("/admin/champions/" + id, "PATCH", { ...input, version: record.version, questCondition });
    assert.equal(saved.status, 200, JSON.stringify(saved.body)); record = saved.body.champion;
    assert.deepEqual(record.questCondition, questCondition);
    assert.equal(championRecordToDefinition(record).quest, null);
  }
  const incomplete = await request("/admin/champions/" + id, "PATCH", { ...input, version: record.version, questProgressRequired: 2 });
  assert.equal(incomplete.status,200,JSON.stringify(incomplete.body)); record=incomplete.body.champion;
  assert.equal(championRecordToDefinition(record).quest,null);
  const restored = await request("/admin/champions/" + id, "PATCH", { ...input, version: record.version });
  assert.equal(restored.status,200);record=restored.body.champion;
});

test("exclusive cards keep quest-only rules under administrator name and metadata edits", async () => {
  const cards = (await request("/admin/cards")).body.cards;
  const tank = cards.find((c: any) => c.id === AWAKENING_CARD_IDS.TANK);
  const updated = await request(`/admin/cards/${tank.id}`, "PATCH", {
    ...tank,
    name: "루나",
    isToken: false,
    isChampionToken: false,
    effectConfig: {},
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.card.isToken, true);
  assert.equal(updated.body.card.isChampionToken, true);
  assert.equal(updated.body.card.effectConfig.awakeningStage, "TANK");
  const runtime = cardRecordToDefinition(updated.body.card);
  assert.deepEqual([runtime.cost, runtime.attack, runtime.health], [0, 3, 7]);
  assert.equal(runtime.questExclusive, true);
  assert.equal(runtime.contentRule, undefined);
  assert.deepEqual(runtime.abilities, []);
  assert.equal(
    (
      await request(`/admin/champions/${id}`, "PATCH", {
        ...input,
        version: record.version,
        championTokenDefinitionId: tank.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/admin/cards/${tank.id}`, "DELETE")).status,
    409,
  );
  const administratorCookie = cookie;
  cookie = '';
  const publicCards = await request('/cards');
  cookie = administratorCookie;
  assert.equal(publicCards.body.cards.some((c: any) => c.id === tank.id), false);
});
test("real catalog, shared engine and both PvP projections agree across all stages and reconnect", async () => {
  const catalog = await request("/minion-a/cards");
  assert.equal(catalog.status, 200);
  const champion = championRecordToDefinition(record);
  const basic = {
    id: "basic",
    name: "basic",
    cardType: "WRESTLER" as const,
    cost: 1,
    attack: 1,
    health: 1,
    rulesText: "",
    keywords: [],
    abilities: [],
    isToken: false,
    isChampionToken: false,
  };
  let state = createInitialGameState(
    [champion.id, champion.id],
    [basic],
    [champion],
    undefined,
    { randomSeed: 42, minionACardPool: catalog.body.definitions },
  );
  state.status = "IN_PROGRESS";
  state.turn = 2;
  state.activePlayerId = "player-2";
  state.players[0].health = 6;
  state.players[0].champion!.health = 6;
  const source = generateCardInstance(basic, { instanceId: "source" });
  state = applyEffect(state, "player-2", source, {
    type: "DAMAGE_OPPONENT_CHAMPION",
    amount: 4,
  });
  for (const wanted of ["TANK", "HEALER", "DEALER", "FINISHED"]) {
    assert.equal(state.players[0].champion!.awakening!.stage, wanted);
    assert.equal(state.players[0].champion!.awakening!.awakeningPower, 3);
    const a = sanitizeGameStateForViewer(state, "player-1") as any,
      b = sanitizeGameStateForViewer(state, "player-2") as any;
    assert.deepEqual(a.players[0].champion, b.players[0].champion);
    assert.deepEqual(a.players[0].board, b.players[0].board);
    state = JSON.parse(JSON.stringify(state));
    if (wanted === "FINISHED") break;
    const stage = state.players[0].board.find(
      (c) =>
        c?.instanceId ===
        state.players[0].champion!.awakening!.activeStageInstanceId,
    )!;
    state = applyEffect(state, "player-1", stage, {
      type: "STRUCTURED",
      action: "DESTROY",
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
    });
  }
  assert.equal(
    state.players[0].champion!.awakening!.championInvulnerable,
    false,
  );
});

test("authoritative PvP attack, concurrent retry, stale packet and database rehydration never duplicate stages", async () => {
  const { applyMatchAction, getRuntime, cleanupMatchRuntime } =
    await import("../../../artifacts/api-server/src/online/service");
  await database.insert(schema.usersTable).values({
    id: "awakening-opponent",
    email: "opponent@awakening.invalid",
    nickname: "Opponent QA",
    passwordHash: "unused",
    role: "USER",
  });
  await database.insert(schema.decksTable).values([
    { id: "awakening-deck-1", userId: "awakening-admin", name: "QA" },
    { id: "awakening-deck-2", userId: "awakening-opponent", name: "QA" },
  ]);
  const catalog = await request("/minion-a/cards"),
    champion = championRecordToDefinition(record);
  const basic = {
    id: "basic",
    name: "basic",
    cardType: "WRESTLER" as const,
    cost: 1,
    attack: 4,
    health: 20,
    rulesText: "",
    keywords: [],
    abilities: [],
    isToken: false,
    isChampionToken: false,
  };
  let state = createInitialGameState(
    [champion.id, champion.id],
    [basic],
    [champion],
    undefined,
    { randomSeed: 42, minionACardPool: catalog.body.definitions },
  );
  state.players[0].id = "PLAYER_ONE";
  state.players[1].id = "PLAYER_TWO";
  state.status = "IN_PROGRESS";
  state.turn = 2;
  state.activePlayerId = "PLAYER_TWO";
  state.players[0].health = 6;
  state.players[0].champion!.health = 6;
  state.players[1].board[0] = {
    ...generateCardInstance(basic, { instanceId: "pvp-attacker" }),
    boardSlot: 0,
  };
  await database.insert(schema.onlineMatchesTable).values({
    id: "awakening-pvp",
    status: "ACTIVE",
    player1UserId: "awakening-admin",
    player2UserId: "awakening-opponent",
    player1DeckId: "awakening-deck-1",
    player2DeckId: "awakening-deck-2",
    stateVersion: 0,
    serializedGameState: state,
    serializedSnapshot: {
      player1UserId: "awakening-admin",
      player2UserId: "awakening-opponent",
      player1DeckId: "awakening-deck-1",
      player2DeckId: "awakening-deck-2",
      cardDefinitions: state.cardPool,
      championDefinitions: [champion],
      publicPlayers: [
        { seat: "PLAYER_ONE", nickname: "QA1" },
        { seat: "PLAYER_TWO", nickname: "QA2" },
      ],
      introFirstSpeaker: null,
    },
  });
  const payload = {
    type: "ATTACK" as const,
    attackerInstanceId: "pvp-attacker",
    target: { type: "PLAYER" as const, playerId: "PLAYER_ONE" },
  };
  const results = await Promise.all([
    applyMatchAction(
      "awakening-pvp",
      "awakening-opponent",
      "first-attack",
      0,
      payload,
    ),
    applyMatchAction(
      "awakening-pvp",
      "awakening-opponent",
      "first-attack",
      0,
      payload,
    ),
  ]);
  assert.ok(results.every((r) => r.ok));
  assert.equal(results.filter((r) => r.ok && r.duplicate).length, 1);
  let runtime = (await getRuntime("awakening-pvp"))!;
  assert.equal(runtime.version, 1);
  assert.equal(
    runtime.state.players[0].board.filter((c) => c?.awakening).length,
    1,
  );
  const stale = await applyMatchAction(
    "awakening-pvp",
    "awakening-opponent",
    "stale-attack",
    0,
    payload,
  );
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "STALE_VERSION");
  for (const wanted of ["TANK", "HEALER", "DEALER"] as const) {
    await runtime.queue;
    state = JSON.parse(JSON.stringify(runtime.state));
    runtime.state = { ...runtime.state, status: "FINISHED" };
    cleanupMatchRuntime("awakening-pvp");
    if (wanted !== "TANK") {
      const stage = state.players[0].board.find((c) => c?.awakening)!;
      state = applyEffect(state, "PLAYER_ONE", stage, {
        type: "STRUCTURED",
        action: "DESTROY",
        target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      });
      await pg.query(
        "UPDATE online_matches SET serialized_game_state=$1::jsonb WHERE id=$2",
        [JSON.stringify(state), "awakening-pvp"],
      );
    }
    runtime = (await getRuntime("awakening-pvp"))!;
    assert.equal(runtime.state.players[0].champion!.awakening!.stage, wanted);
    assert.deepEqual(
      runtime.state.players[0].champion,
      JSON.parse(JSON.stringify(state.players[0].champion)),
    );
    assert.deepEqual(
      runtime.state.players[0].board,
      JSON.parse(JSON.stringify(state.players[0].board)),
    );
    assert.equal(
      runtime.state.players[0].champion!.awakening!.awakeningPower,
      3,
    );
    assert.equal(
      runtime.state.players[0].board.filter(
        (c) => c?.awakening?.stage === wanted,
      ).length,
      1,
    );
  }
});

test('daily quest saved AI state survives catalog edits and duplicate completion; claim grants once',async()=>{
 const {saveAIQuestStart,storedAIQuestMatch,processStoredAIQuestMatch}=await import('../../../artifacts/api-server/src/lib/ai-quest-match-storage');
 const {replayAIMatch}=await import('../../../artifacts/api-server/src/lib/ai-match-quest-service');
 const {claimDailyQuest,dailyDate}=await import('../../../artifacts/api-server/src/lib/daily-quest-service');
 const {startGame}=await import('../../game-engine/src');
 await database.insert(schema.usersTable).values({id:'daily-replay-user',email:'daily-replay@qa.invalid',nickname:'Daily Replay',passwordHash:'local-only'});
 await database.insert(schema.dailyQuestDefinitionsTable).values({id:'daily-play',title:'Play one match',description:'',objectiveType:'PLAY_MATCH',targetValue:1,rewardAmount:77,enabled:true});
 const initial=startGame(createInitialGameState(),()=>0.5);const identity={userId:'daily-replay-user',deckId:'deck-at-start',aiDeckId:'ai-at-start',matchId:'ai-33333333-3333-4333-8333-333333333333'};
 const prepared=await saveAIQuestStart(identity,initial,'NORMAL');
 const altered=JSON.parse(JSON.stringify(initial));altered.players[0].health=1;
 const retried=await saveAIQuestStart(identity,altered,'BOSS');assert.deepEqual(retried,prepared);
 await assert.rejects(storedAIQuestMatch({...identity,userId:'awakening-admin'}));
 await assert.rejects(storedAIQuestMatch({...identity,deckId:'different-deck'}));
 const input={...identity,actions:[{type:'SURRENDER',playerId:initial.players[0].id}]};
 assert.equal(await processStoredAIQuestMatch(input,replayAIMatch),true);
 assert.equal(await processStoredAIQuestMatch(input,replayAIMatch),true);
 const assignments=await database.select().from(schema.dailyQuestAssignmentsTable);const assignment=assignments.find(a=>a.userId===identity.userId&&a.definitionId==='daily-play')!;
 assert.equal(assignment.progress,1);assert.equal(assignment.status,'COMPLETED');assert.equal(assignment.assignmentDate,dailyDate());
 const events=(await pg.query<any>('SELECT count(*)::int AS n FROM daily_quest_progress_events WHERE assignment_id=$1',[assignment.id])).rows[0].n;assert.equal(events,1);
 const first=await claimDailyQuest(identity.userId,assignment.id);const again=await claimDailyQuest(identity.userId,assignment.id);
 assert.equal(first.reward?.amount,77);assert.equal(again.alreadyClaimed,true);assert.equal(again.reward,null);
});

test('AI start HTTP validates live decks and completion uses the saved snapshot after a deck is deleted',async()=>{
 const cardIds=Array.from({length:9},(_,i)=>'daily-start-card-'+i);
 await database.insert(schema.cardsTable).values(cardIds.map(cardId=>({id:cardId,name:cardId,cardType:'WRESTLER',cost:1,attack:1,health:1,text:'',status:'PUBLISHED',rarity:'NORMAL'})));
 const deckCards=cardIds.flatMap(cardId=>[cardId,cardId,cardId]).slice(0,25);
 await database.insert(schema.championsTable).values({id:'daily-start-champion',name:'Daily champion',maxHealth:20,abilityName:'Ability',abilityCost:1,abilityText:'',abilityEffects:{},status:'PUBLISHED'});
 await database.insert(schema.decksTable).values({id:'daily-start-deck',userId:'awakening-admin',name:'Start deck',championDefinitionId:'daily-start-champion',cardDefinitionIds:deckCards});
 await database.insert(schema.userCardCollectionsTable).values(cardIds.map(cardDefinitionId=>({userId:'awakening-admin',cardDefinitionId,quantity:3})));
 await database.insert(schema.userChampionCollectionsTable).values({userId:'awakening-admin',championDefinitionId:'daily-start-champion',owned:true});
 await database.insert(schema.aiDecksTable).values({id:'daily-start-ai',name:'Start AI',championDefinitionId:'daily-start-champion',cardDefinitionIds:deckCards,enabled:true});
 assert.equal((await request('/auth/login','POST',{email:'admin@awakening.invalid',password:'AwakeningLocalQA123'})).status,200);
 const matchId='ai-44444444-4444-4444-8444-444444444444';const body={deckId:'daily-start-deck',aiDeckId:'daily-start-ai',matchId};
 const start=await request('/daily-quests/ai-match-start','POST',body);assert.equal(start.status,200,JSON.stringify(start.body));assert.equal(start.body.state.gameId,matchId);
 assert.equal((await pg.query<any>('SELECT count(*)::int AS n FROM reward_grants WHERE source_id=$1',[matchId])).rows[0].n,0,'preparation must not pay');
 await pg.query('UPDATE decks SET deleted_at=now() WHERE id=$1',['daily-start-deck']);await pg.query('UPDATE ai_decks SET enabled=false WHERE id=$1',['daily-start-ai']);
 const repeated=await request('/daily-quests/ai-match-start','POST',body);assert.deepEqual(repeated.body,start.body);
 const result=await request('/daily-quests/ai-match-progress','POST',{...body,outcome:'LOSS',actions:[{type:'SURRENDER',playerId:start.body.state.players[0].id}]});
 assert.equal(result.status,200);assert.equal(result.body.completed,true,JSON.stringify(result.body));
 const repeatedCompletion=await request('/daily-quests/ai-match-progress','POST',{...body,outcome:'LOSS',actions:[{type:'SURRENDER',playerId:start.body.state.players[0].id}]});assert.equal(repeatedCompletion.body.completed,true);
});

test('daily assignments fill available slots without changing existing progress; event tags survive field removal',async()=>{
 const {ensureDailyQuestAssignments,processMatchEventsForDailyQuests}=await import('../../../artifacts/api-server/src/lib/daily-quest-service');
 const {QUEST_CONDITION_SCHEMA_VERSION}=await import('../../game-engine/src');
 await database.insert(schema.usersTable).values({id:'daily-fill-user',email:'fill@qa.invalid',nickname:'Daily Fill',passwordHash:'local-only'});
 const first=await ensureDailyQuestAssignments('daily-fill-user');assert.equal(first.length,1);
 await database.insert(schema.dailyQuestDefinitionsTable).values({id:'daily-tag',title:'Tagged cards',description:'',objectiveType:'PLAY_MATCH',targetValue:2,rewardAmount:30,enabled:true,schemaVersion:QUEST_CONDITION_SCHEMA_VERSION,condition:{schemaVersion:QUEST_CONDITION_SCHEMA_VERSION,condition:{event:'CARD_PLAYED',filters:{tagsAny:['zombie']}},progress:{mode:'COUNT'},required:2}});
 const after=await ensureDailyQuestAssignments('daily-fill-user');assert.equal(after.length,2);assert.equal(after.find(a=>a.definitionId==='daily-play')!.id,first[0].id);
 const state=createInitialGameState();state.status='FINISHED';state.winnerId=state.players[0].id;state.events=[{type:'CARD_PLAYED',playerId:state.players[0].id,cardInstanceId:'removed-card',cardType:'WRESTLER',tags:['zombie']}];
 await db.transaction(tx=>processMatchEventsForDailyQuests('daily-fill-user',state.players[0].id,'tag-match',state,0,tx));
 await db.transaction(tx=>processMatchEventsForDailyQuests('daily-fill-user',state.players[0].id,'tag-match',state,0,tx));
 const current=await ensureDailyQuestAssignments('daily-fill-user');assert.equal(current.find(a=>a.definitionId==='daily-tag')!.progress,1);
});

test('admin can repair only untouched current assignments, preserving in-progress, completed and claimed snapshots',async()=>{
 const {dailyDate}=await import('../../../artifacts/api-server/src/lib/daily-quest-service');
 const base={title:'Repair quest',description:'',objectiveType:'PLAY_MATCH',targetValue:3,rewardType:'CURRENCY',rewardAmount:10,rewardTargetId:null,enabled:true};
 const created=await request('/admin/rewards/daily-quests','POST',base);assert.equal(created.status,201);const definitionId=created.body.definition.id;
 for(const [index,status,progress] of [[0,'ASSIGNED',0],[1,'IN_PROGRESS',1],[2,'COMPLETED',3],[3,'CLAIMED',3]] as const){const userId='repair-user-'+index;await database.insert(schema.usersTable).values({id:userId,email:userId+'@qa.invalid',nickname:userId,passwordHash:'local-only'});await database.insert(schema.dailyQuestAssignmentsTable).values({...base,id:'repair-assignment-'+index,userId,definitionId,assignmentDate:dailyDate(),slot:0,status,progress});}
 const changed=await request('/admin/rewards/daily-quests/'+definitionId,'PATCH',{...base,title:'Fixed quest',targetValue:2,rewardAmount:20,applyToUnstartedAssignments:true});assert.equal(changed.status,200);assert.equal(changed.body.updatedAssignments,1);
 const rows=(await pg.query<any>('SELECT id,title,progress,status,target_value,reward_amount FROM daily_quest_assignments WHERE definition_id=$1 ORDER BY id',[definitionId])).rows;
 assert.equal(rows[0].title,'Fixed quest');assert.equal(rows[0].progress,0);assert.equal(rows[0].target_value,2);assert.equal(rows[0].reward_amount,20);
 for(const row of rows.slice(1)){assert.equal(row.title,'Repair quest');assert.equal(row.target_value,3);assert.equal(row.reward_amount,10);}
});

test('login cookie survives repeated session reads and initialized accounts do not write during authentication', async () => {
  const login = await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@awakening.invalid',password:'AwakeningLocalQA123'})});
  assert.equal(login.status,200);
  const token=login.headers.get('set-cookie')!;
  assert.match(token,/HttpOnly/); assert.match(token,/Max-Age=2592000/);
  assert.match(login.headers.get('cache-control')!,/no-store/);
  for(let i=0;i<3;i++){const me=await fetch(origin+'/api/auth/me',{headers:{Cookie:token.split(';')[0]}});assert.equal(me.status,200);assert.equal((await me.json()).user.id,'awakening-admin');assert.match(me.headers.get('cache-control')!,/no-store/);assert.match(me.headers.get('vary')!,/Cookie/);}
  const [stored]=await database.select().from(schema.usersTable).where((await import('drizzle-orm')).eq(schema.usersTable.id,'awakening-admin'));
  assert.ok(stored.shopCurrencyStarterGrantedAt);
  const original=db.transaction;let writes=0;
  Object.assign(db,{transaction:(...args:any[])=>{writes++;return (original as any)(...args);}});
  try{const publicUser=await (await import('../../../artifacts/api-server/src/lib/auth')).getPublicUser(stored);assert.equal(publicUser.id,stored.id);assert.equal(writes,0);}finally{Object.assign(db,{transaction:original});}
});
