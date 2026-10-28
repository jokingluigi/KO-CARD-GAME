import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createInitialGameState,
  generateCardInstance,
  applyEffect,
  executeAction,
  type GameState,
  type GameEvent,
  type CardDefinition,
} from "../game";
import { healNewCardAware } from "../game/engine/new-card-rules";
import { vanishCard } from "../game/engine/fusion";
import {
  championSpriteEvents,
  spriteEventCursor,
  spriteIsLow,
} from "./champion-sprite-events";
import {
  SPRITE_EXPRESSIONS,
  reactSprite,
  selectSpriteFrame,
  defaultSpritePlacement as p,
  finalSpriteSet,
  parseBattleSprite,
  type SpriteEvent,
} from "@workspace/cosmetics";
const legendary: CardDefinition = {
  id: "legend",
  name: "Legend",
  cardType: "WRESTLER",
  rarity: "LEGENDARY",
  cost: 1,
  attack: 2,
  health: 3,
  rulesText: "",
  keywords: [],
  abilities: [],
};
const normal = {
  ...legendary,
  id: "normal",
  rarity: "NORMAL",
} as CardDefinition;
function setup() {
  const s = createInitialGameState(undefined, [legendary, normal]);
  s.gameId = "sprite-test";
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  s.turn = 3;
  s.events = [];
  s.cardPool = [legendary, normal];
  for (const p of s.players) {
    p.health = 10;
    p.maxHealth = 20;
    p.board = [null, null, null, null];
    p.hand = [];
    p.currentGold = 10;
    if (p.champion) {
      p.champion.quest = null;
      p.champion.questCompleted = false;
    }
  }
  return s;
}
function append(s: GameState, ...events: GameEvent[]) {
  return { ...s, events: [...s.events, ...events] };
}
function collect(before: GameState, after: GameState, id = "player-1") {
  return championSpriteEvents(before, after, id, spriteEventCursor(before));
}
for (const amount of [0, 1, 4, 5, 9])
  test(`actual damage ${amount} selects exactly one expression, including self damage`, () => {
    const s = setup();
    const e: GameEvent = {
      type: "DAMAGE_DEALT",
      amount,
      target: { type: "PLAYER", playerId: "player-1" },
      sourceContext: {
        sourcePlayerId: "player-1",
        sourceActionType: "CARD_EFFECT",
      },
    };
    assert.deepEqual(
      collect(s, append(s, e)),
      amount === 0 ? [] : [amount < 5 ? "HIT" : "HEAVY_HIT"],
    );
  });
test("max health/current health stat changes are not damage or healing", () => {
  const s = setup();
  const n = structuredClone(s);
  n.players[0].health += 2;
  n.players[0].maxHealth += 2;
  n.events.push({
    type: "STAT_CHANGED",
    playerId: "player-1",
    target: { type: "PLAYER", playerId: "player-1" },
    stat: "currentHealth",
    delta: 2,
  });
  assert.deepEqual(collect(s, n), []);
});
test("real healing is recorded once, overhealing zero does not react, simultaneous damage cannot hide healing", () => {
  const s = setup();
  s.players[0].health = 2;
  const healed = healNewCardAware(s, "player-1", 2);
  assert.equal(healed.players[0].health, 4);
  assert.deepEqual(collect(s, healed), ["HEAL"]);
  const same = healNewCardAware(
    { ...s, players: s.players.map((p) => ({ ...p, health: p.maxHealth })) },
    "player-1",
    2,
  );
  assert.deepEqual(
    collect(
      { ...s, players: s.players.map((p) => ({ ...p, health: p.maxHealth })) },
      same,
    ),
    [],
  );
  const n = append(healed, {
    type: "DAMAGE_DEALT",
    target: { type: "PLAYER", playerId: "player-1" },
    amount: 2,
  });
  n.players = n.players.map((p) =>
    p.id === "player-1" ? { ...p, health: 2 } : p,
  );
  assert.deepEqual(collect(s, n), ["HEAL", "HIT"]);
  assert.equal(spriteIsLow(5), true);
  assert.equal(spriteIsLow(6), false);
  assert.equal(spriteIsLow(0), false);
});
test("one real effect summoning multiple players has one stable reaction, independent effects have different ids", () => {
  const s = setup(),
    source = generateCardInstance(normal, { instanceId: "source" });
  const effect = {
    type: "STRUCTURED",
    action: "SUMMON",
    target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 2 },
    values: { definition: normal, count: 2 },
  } as Parameters<typeof applyEffect>[3];
  const n = applyEffect(s, "player-1", source, effect);
  assert.equal(n.events.filter((e) => e.type === "ENTER_FIELD").length, 2);
  assert.deepEqual(collect(s, n), ["SUMMON"]);
  const cursor = spriteEventCursor(s);
  const first = {
    ...n,
    events: n.events.slice(
      0,
      n.events.findIndex((e) => e.type === "ENTER_FIELD") + 1,
    ),
  };
  assert.deepEqual(championSpriteEvents(s, first, "player-1", cursor), [
    "SUMMON",
  ]);
  assert.deepEqual(championSpriteEvents(first, n, "player-1", cursor), []);
  const last = applyEffect(n, "player-1", source, effect);
  assert.deepEqual(collect(n, last), ["SUMMON"]);
  assert.notEqual(
    n.events.find((e) => e.type === "ENTER_FIELD")!.presentationResolutionId,
    last.events.slice(n.events.length).find((e) => e.type === "ENTER_FIELD")!
      .presentationResolutionId,
  );
});
for (const type of [
  "CARD_RETIRED",
  "CARD_DESTROYED",
  "CARD_VANISHED",
  "CARD_REMOVED",
] as const)
  test(`only own field legendary exit ${type} surprises; duplicate result is ignored`, () => {
    for (const own of [true, false])
      for (const isLegend of [true, false]) {
        const s = setup(),
          index = own ? 0 : 1;
        const d = isLegend ? legendary : normal;
        const card = {
          ...generateCardInstance(d, { instanceId: "exit" }),
          boardSlot: 0 as const,
        };
        s.players[index].board[0] = card;
        const e: GameEvent = {
          type,
          playerId: s.players[index].id,
          cardInstanceId: "exit",
          cardDefinitionId: d.id,
          boardSlot: 0,
          reason: type === "CARD_REMOVED" ? "REMOVE_FROM_GAME" : undefined,
        };
        const n = append(s, e, { ...e });
        n.players = n.players.map((p, i) =>
          i === index ? { ...p, board: [null, null, null, null] } : p,
        );
        assert.deepEqual(
          collect(s, n),
          own && isLegend ? ["ALLY_RETIRED"] : [],
        );
      }
  });
test("real hidden-zone vanish, return and transform do not surprise", () => {
  const s = setup();
  s.players[0].hand = [
    generateCardInstance(legendary, { instanceId: "hidden" }),
  ];
  const n = vanishCard(s, "hidden");
  assert.deepEqual(collect(s, n), []);
  s.players[0].board[0] = {
    ...generateCardInstance(legendary, { instanceId: "field" }),
    boardSlot: 0,
  };
  for (const e of [
    { type: "CARD_REMOVED", reason: "CHAMPION_REWARD_RETURN_HAND" },
    { type: "CARD_TRANSFORMED" },
  ] as const)
    assert.deepEqual(
      collect(
        s,
        append(s, {
          ...e,
          playerId: "player-1",
          cardInstanceId: "field",
          boardSlot: 0,
        }),
      ),
      [],
    );
});
test("ordinary wrestler attack is not a spell/ability reaction; confirmed uses are, failed play is not", () => {
  const s = setup();
  assert.deepEqual(
    collect(s, append(s, { type: "ATTACK_DECLARED", playerId: "player-1" })),
    [],
  );
  assert.deepEqual(
    collect(
      s,
      append(
        s,
        { type: "CARD_PLAYED", playerId: "player-1", cardType: "TECHNIQUE" },
        { type: "CHAMPION_ABILITY_USED", playerId: "player-1" },
      ),
    ),
    ["ATTACK", "ATTACK"],
  );
  const failed = executeAction(s, {
    type: "PLAY_TECHNIQUE",
    playerId: "player-1",
    cardInstanceId: "missing",
  });
  assert.equal(failed.success, false);
  assert.deepEqual(collect(s, failed.state), []);
});
test("cancellable spell preview is revisited only after confirmed; cancellation and reconnect do not replay", () => {
  const s = setup(),
    n = append(s, {
      type: "CARD_PLAYED",
      playerId: "player-1",
      cardType: "TECHNIQUE",
    });
  n.targetingState = {
    active: true,
    phase: "PRE_COMMIT",
    playerId: "player-1",
    sourceInstanceId: "spell",
    effects: [],
    effectIndex: 0,
    selectedTargetIds: [],
    lastTargetIds: [],
    validTargetIds: ["x"],
    minTargets: 1,
    maxTargets: 1,
    mandatory: false,
    cancelable: true,
    playRollback: s,
  };
  const c = spriteEventCursor(s);
  assert.deepEqual(championSpriteEvents(s, n, "player-1", c), []);
  assert.deepEqual(
    championSpriteEvents(n, { ...n, targetingState: undefined }, "player-1", c),
    ["ATTACK"],
  );
  assert.deepEqual(
    championSpriteEvents(n, n, "player-1", spriteEventCursor(n)),
    [],
  );
  const cancelCursor = spriteEventCursor(n);
  assert.deepEqual(championSpriteEvents(n, s, "player-1", cancelCursor), []);
  const fresh = { ...s, gameId: "new" };
  assert.deepEqual(championSpriteEvents(n, fresh, "player-1", c), []);
});
const frame = (name: string) => ({
  url: `https://example.invalid/${name}.png`,
  self: p,
  opponent: p,
});
const frames = Object.fromEntries(
  Object.keys(SPRITE_EXPRESSIONS).map((k) => [k, frame(k)]),
);
test("ten slots, fixed damage/HP thresholds, same-set default and healing return are deterministic", () => {
  assert.equal(Object.keys(SPRITE_EXPRESSIONS).length, 10);
  const config = { version: 1 as const, frames, reactions: {} };
  for (const [hp, expected] of [
    [4, "low"],
    [7, "default"],
    [5, "low"],
  ] as const) {
    assert.equal(
      selectSpriteFrame(config, {
        awakened: false,
        low: spriteIsLow(hp),
        reaction: "HEAL",
      })!.url,
      frames.relief.url,
    );
    assert.equal(
      selectSpriteFrame(config, {
        awakened: false,
        low: spriteIsLow(hp),
        reaction: "IDLE",
      })!.url,
      frames[expected].url,
    );
  }
  const awake = {
    ...config,
    awakening: "REPLACE" as const,
    awakened: {
      version: 1 as const,
      frames: { default: frame("awake") },
      reactions: {},
    },
  };
  for (const reaction of [
    "HIT",
    "HEAVY_HIT",
    "HEAL",
    "SUMMON",
    "AWAKEN",
  ] as const)
    assert.equal(
      selectSpriteFrame(awake, { awakened: true, low: true, reaction })!.url,
      awake.awakened.frames.default.url,
    );
  assert.equal(
    selectSpriteFrame(
      { ...awake, awakening: "KEEP" },
      { awakened: true, low: true, reaction: "HIT" },
    )!.url,
    frames.hurt.url,
  );
  assert.ok(parseBattleSprite(finalSpriteSet(config)));
  assert.equal(parseBattleSprite({ ...awake, awakened: undefined }), null);
});
test("priorities, consecutive damage coalescing, result persistence and exact default durations", () => {
  const order: SpriteEvent[] = [
    "SUMMON",
    "HEAL",
    "ATTACK",
    "HIT",
    "ALLY_RETIRED",
    "HEAVY_HIT",
    "AWAKEN",
    "VICTORY",
  ];
  for (let i = 1; i < order.length; i++) {
    const major = reactSprite({ event: "IDLE", until: 0 }, order[i], 100);
    assert.equal(reactSprite(major, order[i - 1], 200), major);
  }
  const hit = reactSprite({ event: "IDLE", until: 0 }, "HEAVY_HIT", 100);
  assert.equal(hit.until, 1000);
  assert.equal(reactSprite(hit, "HIT", 300), hit);
  assert.equal(reactSprite(hit, "HEAVY_HIT", 400), hit);
  assert.equal(
    reactSprite({ event: "IDLE", until: 0 }, "SUMMON", 100).until,
    700,
  );
  const lose = reactSprite({ event: "IDLE", until: 0 }, "DEFEAT", 100);
  assert.equal(reactSprite(lose, "AWAKEN", 1000000), lose);
});

test("serialized effect unit deduplicates summons across target-choice suspension", async () => {
  const { resolveActiveAbility, selectEffectTarget, appendEffectContinuation } =
    await import("../game/effects/effect-engine");
  const s = setup();
  const summon = {
    type: "STRUCTURED",
    action: "SUMMON",
    target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 1 },
    values: { definition: normal, count: 1 },
  } as Parameters<typeof applyEffect>[3];
  const source = {
    ...generateCardInstance(
      {
        ...normal,
        abilities: [
          {
            trigger: "ACTIVE",
            effects: [
              summon,
              {
                type: "STRUCTURED",
                action: "BUFF",
                target: {
                  zone: "BOARD",
                  owner: "SELF",
                  selection: "PLAYER_CHOICE",
                  count: 1,
                },
                values: { attack: 1 },
              },
              summon,
            ],
          },
        ],
      },
      { instanceId: "active-source" },
    ),
    boardSlot: 0 as const,
  };
  s.players[0].board[0] = source;
  const first = resolveActiveAbility(s, "player-1", source);
  assert.ok(first.targetingState);
  const cursor = spriteEventCursor(s);
  assert.deepEqual(championSpriteEvents(s, first, "player-1", cursor), [
    "SUMMON",
  ]);
  const continued = selectEffectTarget(
    JSON.parse(JSON.stringify(first)),
    first.targetingState!.validTargetIds[0],
  );
  assert.equal(continued.players[0].board.filter(Boolean).length, 3);
  assert.deepEqual(
    championSpriteEvents(first, continued, "player-1", cursor),
    [],
  );
  const extra = {
    ...first.targetingState!,
    presentationResolutionId: undefined,
    continuation: undefined,
  };
  const queued1 = appendEffectContinuation(first, extra),
    queued2 = appendEffectContinuation(queued1, extra);
  assert.notEqual(
    queued2.targetingState!.continuation!.presentationResolutionId,
    queued2.targetingState!.continuation!.continuation!
      .presentationResolutionId,
  );
  const ids = continued.events
    .filter((e) => e.type === "ENTER_FIELD")
    .map((e) => e.presentationResolutionId);
  assert.equal(new Set(ids).size, 1);
});

test("real spell cast confirms attack expression; real precommit target cancel does not", () => {
  const s = setup();
  const spell: CardDefinition = {
    ...normal,
    id: "sprite-spell",
    cardType: "TECHNIQUE",
    cost: 0,
    attack: 0,
    health: 0,
    abilities: [
      {
        trigger: "ACTIVE",
        effects: [
          {
            type: "STRUCTURED",
            action: "DAMAGE",
            target: {
              zone: "BOARD",
              owner: "ENEMY",
              selection: "PLAYER_CHOICE",
              count: 1,
            },
            values: { amount: 1 },
          },
        ],
      },
    ],
  };
  s.cardPool!.push(spell);
  s.players[0].hand = [generateCardInstance(spell, { instanceId: "spell" })];
  s.players[1].board[0] = {
    ...generateCardInstance(normal, { instanceId: "enemy" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  const action = {
    type: "BEGIN_TARGETED_ACTION" as const,
    playerId: "player-1",
    action: { type: "PLAY_TECHNIQUE" as const, cardInstanceId: "spell" },
  };
  const pending = executeAction(s, action);
  assert.ok(pending.success);
  assert.equal(pending.state.targetingState?.phase, "PRE_COMMIT");
  assert.deepEqual(collect(s, pending.state), []);
  const cancel = executeAction(pending.state, {
    type: "CANCEL_EFFECT_TARGET",
    playerId: "player-1",
  });
  assert.ok(cancel.success);
  assert.deepEqual(collect(s, cancel.state), []);
  const confirmed = executeAction(pending.state, {
    type: "CONFIRM_PRECOMMIT_TARGET",
    playerId: "player-1",
    targetId: "enemy",
  });
  assert.ok(confirmed.success);
  assert.equal(confirmed.state.players[1].board[0]!.currentHealth, 2);
  assert.deepEqual(collect(s, confirmed.state), ["ATTACK"]);
});

test("editor normalization preserves uploaded artwork and explicit reuse without filling absent slots", async () => {
  const { withSpriteFrame } = await import("@workspace/cosmetics");
  const config = {
    version: 1 as const,
    frames: { default: frame("normal"), hurt: frame("hurt") },
    reactions: { HIT: "default" },
  };
  const normalized = finalSpriteSet(config);
  assert.equal(normalized.frames.hurt.url, config.frames.hurt.url);
  assert.equal(
    selectSpriteFrame(normalized, {
      awakened: false,
      low: false,
      reaction: "HIT",
    })?.url,
    config.frames.default.url,
  );
  assert.deepEqual(
    Object.keys(
      finalSpriteSet({ ...config, frames: { default: config.frames.default } })
        .frames,
    ),
    ["default"],
  );
  const uploaded = withSpriteFrame(normalized, "hurt", frame("new-hurt"));
  assert.equal(finalSpriteSet(uploaded).frames.hurt.url, frame("new-hurt").url);
  assert.equal(uploaded.reactions.HIT, "hurt");
});

test("all skin sets preserve automatic original-self and mirrored-opponent policy through projection and upload", async () => {
  const { withSpriteFrame } = await import("@workspace/cosmetics");
  const wrong = {
    ...frame("facing"),
    self: { ...p, flip: true },
    opponent: { ...p, flip: false },
  };
  const c = finalSpriteSet({
    version: 1,
    frames: { default: wrong, hurt: wrong },
    reactions: {},
    awakening: "REPLACE",
    awakened: { version: 1, frames: { default: wrong }, reactions: {} },
  });
  for (const set of [c, c.awakened!])
    for (const f of Object.values(set.frames)) {
      assert.equal(f.self.flip, false);
      assert.equal(f.opponent.flip, true);
    }
  const added = withSpriteFrame(c, "attack", wrong).frames.attack;
  assert.equal(added.self.flip, false);
  assert.equal(added.opponent.flip, true);
  assert.equal(c.frames.default.self.scale, wrong.self.scale);
});

for (const selfDamage of [false, true]) {
  for (const amount of [0, 1, 4, 5]) {
    test(`real effect ${selfDamage ? 'self' : 'opponent'} damage ${amount} uses confirmed result`, () => {
      const s = setup();
      const source = generateCardInstance(normal, { instanceId: 'actual-damage-source' });
      const target = selfDamage ? s.players[0] : s.players[1];
      const effect = selfDamage
        ? { type: 'STRUCTURED', action: 'DAMAGE', target: { zone: 'PLAYER', owner: 'SELF', selection: 'ALL' }, values: { amount } }
        : { type: 'DAMAGE_OPPONENT_CHAMPION', amount };
      const result = applyEffect(s, 'player-1', source, effect as Parameters<typeof applyEffect>[3]);
      assert.equal(result.players.find(p => p.id === target.id)!.health, target.health - amount);
      assert.deepEqual(collect(s, result, target.id), amount ? [amount >= 5 ? 'HEAVY_HIT' : 'HIT'] : []);
    });
  }
}
test('real protected champion absorbs an attempted strong hit without a hurt expression', () => {
  const s = setup();
  s.players[1].board[0] = { ...generateCardInstance(normal, { instanceId: 'protector' }), boardSlot: 0, isChampionToken: true };
  const result = applyEffect(s, 'player-1', generateCardInstance(normal, {instanceId:'protected-damage-source'}), { type: 'DAMAGE_OPPONENT_CHAMPION', amount: 9 });
  assert.equal(result.players[1].health, s.players[1].health);
  assert.ok(result.events.some(e => e.type === 'DAMAGE_DEALT' && e.amount === 0));
  assert.deepEqual(collect(s, result, 'player-2'), []);
});

test('real retire/destroy/vanish outputs preserve separate events and only own legendary surprises', async () => {
  const { destroyCard } = await import('../game/engine/destroy-card');
  const { resolveStateBasedDeaths } = await import('../game/effects/effect-engine');
  for (const type of ['RETIRE', 'DESTROY', 'VANISH']) {
    for (const own of [false, true]) for (const isLegendary of [false, true]) {
      const s = setup(), index = own ? 0 : 1;
      const card = { ...generateCardInstance(isLegendary ? legendary : normal, { instanceId:'real-exit' }), boardSlot:0 as const };
      s.players[index].board[0]=card;
      let after: GameState;
      if(type==='VANISH') after=vanishCard(s,card.instanceId);
      else if(type==='DESTROY') {
        const result=destroyCard(s,s.players[index].id,card.instanceId);
        assert.ok(result.success);after=result.state;
      } else {
        const damaged=structuredClone(s);damaged.players[index].board[0]!.currentHealth=0;
        after=resolveStateBasedDeaths(damaged);
      }
      assert.equal(after.players[index].board[0],null,type);
      assert.ok(after.events.some(e=>e.type===({RETIRE:'CARD_RETIRED',DESTROY:'CARD_DESTROYED',VANISH:'CARD_VANISHED'} as const)[type as 'RETIRE'|'DESTROY'|'VANISH']),type);
      assert.deepEqual(collect(s,after),own&&isLegendary?['ALLY_RETIRED']:[],`${type} own=${own} legendary=${isLegendary}`);
    }
  }
});
