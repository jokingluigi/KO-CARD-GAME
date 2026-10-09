import assert from "node:assert/strict";
import test from "node:test";
import {
  newTowerRun,
  transitionRun,
  encounterFor,
  eligibleRewardCard,
  cardRewardOptions,
} from "./domain";
import { validateTowerV2, generateTowerEnemyDeck } from "./v2";
import { parseSeason, parseTowerConfiguredEffects, parseRelic } from "./config";
import { createTowerBattle } from "./battle";
import { TEST_CHAMPIONS } from "../../../../artifacts/ko-game/src/game/champions/test-champions";
import { executeAction } from "../../../../artifacts/ko-game/src/game/actions/engine-actions";
import { resolveConfiguredTowerEffects } from "../../../../artifacts/ko-game/src/game/tower/configured-effects";
import { generateCardInstance } from "../../../../artifacts/ko-game/src/game/cards/generation";
import type { TowerCatalog, History } from "./types";
import type { TowerConfiguredEffect } from "./effects";
const history: History = {
  clearCount: 0,
  normalEnding: false,
  bossSlots: [],
  unlockedRelicIds: [],
  unlockedStarterIds: [],
};
const effect = (
  action = "ADD_GOLD",
  patch: any = {},
): TowerConfiguredEffect => ({
  id: action,
  name: action,
  enabled: true,
  event: "ENTER_FIELD",
  eventOwner: "SELF",
  action: action as any,
  values: { amount: 1 },
  priority: 0,
  duration: "BATTLE",
  limit: { scope: "TURN", count: 1 },
  ...patch,
});
function fixture() {
  const defs = Array.from({ length: 30 }, (_, i) => ({
    id: "v2-card-" + i,
    name: "Card " + i,
    cardType: i % 4 === 3 ? ("TECHNIQUE" as const) : ("WRESTLER" as const),
    cost: (i % 6) + 1,
    attack: 3,
    health: 4,
    rulesText: "",
    keywords: [],
    abilities: [],
    tags: ["Machine"],
    isToken: false,
    isChampionToken: false,
    status: i % 2 ? "DRAFT" : "PUBLISHED",
    rarity: ["NORMAL", "EPIC", "LEGENDARY"][i % 3] as any,
  }));
  const champion = TEST_CHAMPIONS[0]!;
  const catalog: TowerCatalog = {
    season: {
      id: "v2",
      name: "V2",
      description: "",
      protagonistChampionId: "",
      bosses: {} as any,
      synergyWeights: { deckTag: 2, supportTag: 3, championTag: 2 },
      v2: {
        schemaVersion: 2,
        enabled: true,
        visible: true,
        sortOrder: 0,
        recommendedDifficulty: "",
        rarityWeights: { NORMAL: 70, EPIC: 25, LEGENDARY: 5 },
        floors: Array.from({ length: 6 }, (_, i) => ({
          id: "f" + i,
          number: i + 1,
          type: i === 2 || i === 5 ? "BOSS" : "NORMAL",
          enemies: [
            {
              id: "enemy",
              name: "Enemy",
              championId: champion.id,
              difficulty: "HARD",
              weight: 100,
            },
          ],
          bossId: i === 2 ? "mid" : i === 5 ? "final" : undefined,
          relicReward: i === 2,
        })),
        bosses: ["mid", "final", "secret"].map((id) => ({
          id,
          name: id,
          championId: champion.id,
          difficulty: "NORMAL",
          cardIds: Array(25).fill(defs[0].id),
          startingHealth: 8,
          maxHealth: 12,
          firstRewards: [],
          repeatRewards: [],
        })),
      },
    },
    cards: defs.map((d) => ({ ...d, synergyTags: d.tags, supportsTags: [] })),
    preferredTags: { [champion.id]: ["Machine"] },
    presets: [],
    starters: [
      {
        id: "starter",
        name: "Starter",
        championId: "different",
        cardIds: Array(25).fill(defs[0].id),
        enabled: true,
        isDefault: true,
        initiallyUnlocked: true,
      },
    ],
    relics: [],
    scenes: [],
    characters: [],
  };
  return { catalog, defs, champion };
}
function run(catalog: TowerCatalog) {
  return newTowerRun(
    {
      id: "run",
      seed: "same-seed",
      championId: TEST_CHAMPIONS[0]!.id,
      starterId: "starter",
      ownedChampionIds: [TEST_CHAMPIONS[0]!.id],
    },
    catalog,
    history,
  );
}
test("V2 arbitrary six floors and boss positions progress to normal ending without a relic deadlock", () => {
  const { catalog } = fixture();
  validateTowerV2(catalog.season.v2!, catalog);
  let r = run(catalog);
  for (let floor = 1; floor <= 6; floor++) {
    assert.equal(r.floor, floor);
    r = transitionRun(r, { type: "CHALLENGE" }, catalog, history, r.version);
    r = transitionRun(
      r,
      { type: "BATTLE_RESULT", won: true },
      catalog,
      history,
      r.version,
    );
    if (r.phase === "CARD_REWARD")
      r = transitionRun(r, { type: "SKIP_CARD" }, catalog, history, r.version);
  }
  assert.equal(r.ended, true);
  assert.equal(r.regularClear, true);
  assert.equal(r.totalFloors, 6);
});
test("generated enemy 25-card decks reproduce seed and permit private cards without tokens", () => {
  const { catalog } = fixture();
  catalog.cards.push({ ...catalog.cards[0]!, id: "token", isToken: true });
  for (const difficulty of ["EASY", "NORMAL", "HARD"] as const) {
    const a = generateTowerEnemyDeck(
      catalog,
      TEST_CHAMPIONS[0]!.id,
      difficulty,
      "test",
    );
    assert.deepEqual(
      a,
      generateTowerEnemyDeck(
        catalog,
        TEST_CHAMPIONS[0]!.id,
        difficulty,
        "test",
      ),
    );
    assert.equal(a.length, 25);
    assert.ok(new Set(a).size > 5);
    assert.ok(!a.includes("token"));
    assert.ok(
      a.some(
        (id) => catalog.cards.find((c) => c.id === id)?.status === "DRAFT",
      ),
    );
  }
  const r = run(catalog);
  assert.deepEqual(
    JSON.parse(JSON.stringify(r.encounter)),
    JSON.parse(JSON.stringify(r)).encounter,
  );
});
test("reward rarity odds, no duplicate ids, tiny pools and private eligibility", () => {
  const { catalog } = fixture();
  catalog.season.v2!.rarityWeights = { NORMAL: 0, EPIC: 0, LEGENDARY: 100 };
  const options = cardRewardOptions(run(catalog), catalog);
  assert.equal(new Set(options).size, 3);
  assert.ok(
    options.every(
      (id) => catalog.cards.find((c) => c.id === id)?.rarity === "LEGENDARY",
    ),
  );
  catalog.cards = catalog.cards.slice(0, 2);
  assert.equal(cardRewardOptions(run(catalog), catalog).length, 2);
  assert.equal(
    eligibleRewardCard({ ...catalog.cards[0]!, status: "DRAFT" }),
    true,
  );
});
test("card replacement permits reselection, cancel, skip and changes deck only on confirm", () => {
  const { catalog } = fixture();
  let r = run(catalog);
  r = transitionRun(r, { type: "CHALLENGE" }, catalog, history, r.version);
  r = transitionRun(
    r,
    { type: "BATTLE_RESULT", won: true },
    catalog,
    history,
    r.version,
  );
  const deck = [...r.deck];
  r = transitionRun(
    r,
    { type: "SELECT_CARD", cardId: r.cardOptions[0]! },
    catalog,
    history,
    r.version,
  );
  r = transitionRun(
    r,
    { type: "SELECT_CARD", cardId: r.cardOptions[1]! },
    catalog,
    history,
    r.version,
  );
  assert.deepEqual(r.deck, deck);
  r = transitionRun(
    r,
    { type: "CANCEL_CARD_SELECTION" },
    catalog,
    history,
    r.version,
  );
  assert.equal(r.phase, "CARD_REWARD");
  r = transitionRun(
    r,
    { type: "SELECT_CARD", cardId: r.cardOptions[0]! },
    catalog,
    history,
    r.version,
  );
  const chosen = r.selectedCardId;
  r = transitionRun(
    r,
    { type: "REPLACE_CARD", deckIndex: 0 },
    catalog,
    history,
    r.version,
  );
  assert.equal(r.deck.length, 25);
  assert.equal(r.deck[0], chosen);
});
test("opening, common boss scenes, hidden branch and endings have persisted skip completion", () => {
  const { catalog } = fixture();
  catalog.scenes = ["open", "ending", "hidden-end"].map((id) => ({
    id,
    name: id,
    lines: [
      {
        speakerId: "s",
        expression: "NEUTRAL",
        side: "LEFT",
        text: "x",
        order: 0,
      },
    ],
  }));
  Object.assign(catalog.season.v2!, {
    openingSceneId: "open",
    endingSceneId: "ending",
    hiddenEndingSceneId: "hidden-end",
    hiddenBossId: "secret",
    hiddenCondition: { type: "CHAMPION", id: TEST_CHAMPIONS[0]!.id },
  });
  let r = run(catalog);
  assert.equal(r.phase, "DIALOGUE");
  r = transitionRun(r, { type: "DIALOGUE_SKIP" }, catalog, history, r.version);
  assert.equal(r.phase, "HUB");
  assert.ok(r.completedSceneIds?.includes("open"));
  r = {
    ...r,
    floor: 6,
    phase: "BATTLE",
    encounter: encounterFor({ ...r, floor: 6 }, catalog),
  };
  r = transitionRun(
    r,
    { type: "BATTLE_RESULT", won: true },
    catalog,
    history,
    r.version,
  );
  assert.equal(r.encounter.bossSlot, "hiddenBoss");
  r = transitionRun(r, { type: "CHALLENGE" }, catalog, history, r.version);
  r = transitionRun(
    r,
    { type: "BATTLE_RESULT", won: true },
    catalog,
    history,
    r.version,
  );
  assert.equal(r.phase, "DIALOGUE");
  assert.equal(r.dialogueReturn, "RESULT");
  r = transitionRun(r, { type: "DIALOGUE_SKIP" }, catalog, history, r.version);
  assert.equal(r.hiddenClear, true);
  assert.equal(r.ended, true);
});
test("published validation rejects gaps, missing enemies, boss deck and invalid odds", () => {
  const { catalog } = fixture();
  catalog.season.v2!.floors[1]!.number = 4;
  assert.throws(() => validateTowerV2(catalog.season.v2!, catalog));
  const fresh = fixture().catalog;
  fresh.season.v2!.bosses[0]!.cardIds = [];
  assert.throws(() => validateTowerV2(fresh.season.v2!, fresh));
  assert.throws(() =>
    parseSeason({
      ...catalog.season,
      v2: {
        ...catalog.season.v2,
        rarityWeights: { NORMAL: 100, EPIC: 100, LEGENDARY: 100 },
      },
    }),
  );
});
function battle(
  rules: TowerConfiguredEffect[],
  sourceType: "TOWER_RELIC" | "TOWER_BOSS" = "TOWER_RELIC",
) {
  const { catalog, defs, champion } = fixture();
  catalog.relics = [
    parseRelic({
      id: "custom",
      name: "Custom",
      effects: rules,
      enabled: true,
      initiallyUnlocked: true,
    }),
  ];
  let r = run(catalog);
  r.relicIds = ["custom"];
  r.floor = 3;
  r.encounter = encounterFor(r, catalog);
  if (sourceType === "TOWER_BOSS") {
    catalog.relics = [];
    r.relicIds = [];
    catalog.season.v2!.bosses[0]!.abilities = rules;
  }
  let s = createTowerBattle(r, {
    catalog,
    cards: defs,
    champions: [{ ...champion, quest: null }],
  });
  s.openingMulligan = false;
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  for (const p of s.players) {
    p.board = [null, null, null, null];
    p.currentGold = 5;
    p.hand = [];
    p.deck = [];
  }
  return { s, defs };
}
test("configured effects preserve normal champion, boss health and use shared engine", () => {
  const { s } = battle([effect("ADD_GOLD", { event: "BATTLE_START" })]);
  assert.equal(s.players[1].health, 8);
  assert.equal(s.players[1].maxHealth, 12);
  assert.equal(s.players[1].champion?.id, TEST_CHAMPIONS[0]!.id);
  assert.ok(s.tower?.configuredRuntime?.started);
});
test("same original event multiple priority rules fire once, derived events cannot chain relic or boss", () => {
  let { s, defs } = battle([
    effect(),
    effect("DRAW", {
      values: { amount: 1 },
      priority: 2,
      event: "ENTER_FIELD",
    }),
  ]);
  s.players[0].deck = [generateCardInstance(defs[0]!, { instanceId: "draw" })];
  const before = s;
  s = {
    ...s,
    events: [
      ...s.events,
      { type: "ENTER_FIELD", playerId: "player-1", cardInstanceId: "a" },
    ],
  };
  s = resolveConfiguredTowerEffects(before, s);
  assert.equal(s.players[0].currentGold, 6);
  assert.equal(s.players[0].hand.length, 1);
  s = resolveConfiguredTowerEffects(s, {
    ...s,
    events: [
      ...s.events,
      { type: "ENTER_FIELD", playerId: "player-1", cardInstanceId: "b" },
    ],
  });
  assert.equal(s.players[0].currentGold, 6);
  const restored = JSON.parse(JSON.stringify(s));
  assert.deepEqual(
    resolveConfiguredTowerEffects(restored, restored).tower?.configuredRuntime
      ?.uses,
    s.tower?.configuredRuntime?.uses,
  );
});
test("no valid target does not consume limits; relic self damage cannot retire or drop below one", () => {
  const heal = effect("DAMAGE", {
    target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 4 },
    values: { amount: 999 },
  });
  let { s, defs } = battle([heal]);
  let next = resolveConfiguredTowerEffects(s, {
    ...s,
    events: [
      ...s.events,
      { type: "ENTER_FIELD", playerId: "player-1", cardInstanceId: "none" },
    ],
  });
  assert.equal(Object.keys(next.tower!.configuredRuntime!.uses).length, 0);
  next.players[0].board[0] = generateCardInstance(defs[0]!, {
    instanceId: "a",
  });
  const before = next;
  next = resolveConfiguredTowerEffects(before, {
    ...next,
    events: [
      ...next.events,
      { type: "ENTER_FIELD", playerId: "player-1", cardInstanceId: "a" },
    ],
  });
  assert.equal(next.players[0].board[0]?.currentHealth, 1);
  assert.equal(next.players[0].graveyard.length, 0);
});
test("all-target relic buffs apply exactly once per card, and run modifiers record individual deck indices", () => {
  let { s, defs } = battle([
    effect("BUFF", {
      target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 4 },
      values: { attack: 1, health: 1 },
      duration: "RUN",
    }),
  ]);
  for (let i = 0; i < 2; i++)
    s.players[0].board[i] = {
      ...generateCardInstance(defs[0]!, { instanceId: "card" + i }),
      towerDeckIndex: i,
    };
  const next = resolveConfiguredTowerEffects(s, {
    ...s,
    events: [
      ...s.events,
      { type: "ENTER_FIELD", playerId: "player-1", cardInstanceId: "card0" },
    ],
  });
  assert.equal(next.players[0].board[0]?.currentAttack, 4);
  assert.equal(next.players[0].board[1]?.currentAttack, 4);
  assert.deepEqual(next.tower?.configuredRuntime?.runModifiers, {
    "0": { attack: 1, health: 1, cost: 0 },
    "1": { attack: 1, health: 1, cost: 0 },
  });
});
test("admin effect validator rejects unsupported events, manual targets, and unsafe run persistence", () => {
  assert.equal(parseTowerConfiguredEffects([effect()]).length, 1);
  assert.throws(() =>
    parseTowerConfiguredEffects([effect("REGISTER_LISTENER")]),
  );
  assert.throws(() =>
    parseTowerConfiguredEffects([effect("ADD_GOLD", { duration: "RUN" })]),
  );
  assert.throws(() =>
    parseTowerConfiguredEffects([
      effect("BUFF", {
        values: { attack: 1 },
        target: {
          zone: "BOARD",
          owner: "SELF",
          selection: "PLAYER_CHOICE",
          count: 1,
        },
      }),
    ]),
  );
  assert.ok(
    parseRelic({
      id: "r",
      name: "r",
      effects: [effect()],
      enabled: true,
      initiallyUnlocked: true,
    }).description.includes("골드"),
  );
});
test("turn limits reset on a new match turn and survive serialized restore", () => {
  let { s } = battle([
    effect("ADD_GOLD", { event: "TURN_STARTED", eventOwner: "ANY" }),
  ]);
  const initial = s.players[0].currentGold;
  s = resolveConfiguredTowerEffects(s, {
    ...s,
    events: [...s.events, { type: "TURN_STARTED", playerId: "player-2" }],
  });
  assert.equal(s.players[0].currentGold, initial + 1);
  s = JSON.parse(JSON.stringify(s));
  const next = resolveConfiguredTowerEffects(s, {
    ...s,
    events: [...s.events, { type: "TURN_STARTED", playerId: "player-1" }],
  });
  assert.equal(next.players[0].currentGold, initial + 2);
  assert.equal(
    Object.values(next.tower!.configuredRuntime!.uses)[0]!.turnCount,
    1,
  );
});
test("persistent modifiers update reset baselines and next battle only once", () => {
  let { s, defs } = battle([
    effect("BUFF", {
      target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 4 },
      values: { attack: 2, health: 3 },
      duration: "RUN",
    }),
  ]);
  s.players[0].board[0] = {
    ...generateCardInstance(defs[0]!, { instanceId: "persist" }),
    towerDeckIndex: 0,
  };
  const next = resolveConfiguredTowerEffects(s, {
    ...s,
    events: [
      ...s.events,
      { type: "ENTER_FIELD", playerId: "player-1", cardInstanceId: "persist" },
    ],
  });
  assert.equal(next.players[0].board[0]!.baseAttack, 5);
  assert.equal(next.players[0].board[0]!.baseHealth, 7);
  assert.deepEqual(next.tower!.configuredRuntime!.runModifiers["0"], {
    attack: 2,
    health: 3,
    cost: 0,
  });
  const { catalog, champion, defs: all } = fixture();
  const r = run(catalog);
  r.runStatModifiers = next.tower!.configuredRuntime!.runModifiers;
  catalog.relics = [
    parseRelic({
      id: "custom",
      name: "Custom",
      enabled: true,
      initiallyUnlocked: true,
      effects: [effect()],
    }),
  ];
  r.relicIds = ["custom"];
  const start = createTowerBattle(r, {
    catalog,
    cards: all,
    champions: [champion],
  });
  const card = start.players[0].deck
    .concat(start.players[0].hand)
    .find((c) => c.towerDeckIndex === 0)!;
  assert.equal(card.currentAttack, 5);
  assert.equal(card.baseAttack, 5);
  assert.equal(card.maxHealth, 7);
});
test("normal floor can grant configured relic after card reward or skip", () => {
  const { catalog } = fixture();
  catalog.season.v2!.floors[0]!.relicReward = true;
  catalog.relics = [
    parseRelic({
      id: "reward-relic",
      name: "Reward",
      enabled: true,
      initiallyUnlocked: true,
      effects: [effect()],
    }),
  ];
  let r = run(catalog);
  r = transitionRun(r, { type: "CHALLENGE" }, catalog, history, r.version);
  r = transitionRun(
    r,
    { type: "BATTLE_RESULT", won: true },
    catalog,
    history,
    r.version,
  );
  assert.equal(r.phase, "CARD_REWARD");
  r = transitionRun(r, { type: "SKIP_CARD" }, catalog, history, r.version);
  assert.equal(r.phase, "RELIC_REWARD");
});
test('V2 normal, intermediate, final and hidden encounters inherit the correct global OST',()=>{
 const {catalog}=fixture();const track=(name:string)=>({name,assetUrl:'https://example.invalid/'+name+'.mp3',volume:0.5});catalog.season.music={normal:track('normal'),midBoss:track('mid'),boss:track('final'),hiddenBoss:track('hidden')};const r=run(catalog);
 assert.equal(encounterFor(r,catalog).music?.name,'normal');assert.equal(encounterFor({...r,floor:3},catalog).music?.name,'mid');assert.equal(encounterFor({...r,floor:6},catalog).music?.name,'final');catalog.season.v2!.hiddenBossId=catalog.season.v2!.bosses[0]!.id;assert.equal(encounterFor({...r,floor:6},catalog,true).music?.name,'hidden');
});
