import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBattleSprite,
  defaultSpritePlacement as p,
  reactSprite,
  selectSpriteFrame,
  SPRITE_EXPRESSIONS,
} from "@workspace/cosmetics";
import {
  championSpriteEvents,
  spriteEventCursor,
} from "./champion-sprite-events";
import {
  createInitialGameState,
  generateCardInstance,
  applyEffect,
  executeAction,
  type CardDefinition,
} from "../game";
import {
  motionFrames,
  resolveMotion,
  expressionLead,
  motionDuration,
  explicitSingleDamageTarget,
  type ChampionMotionCue,
} from "./champion-sprite-motion";
const normal: CardDefinition = {
  id: "unit",
  name: "Unit",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 1,
  health: 2,
  rulesText: "",
  abilities: [],
  keywords: [],
};
const legendary = {
  ...normal,
  id: "legend",
  rarity: "LEGENDARY",
} as CardDefinition;
const frame = (name: string) => ({
  url: `https://example.invalid/${name}.png`,
  self: { ...p },
  opponent: { ...p },
});
function setup() {
  const s = createInitialGameState(undefined, [normal, legendary]);
  s.gameId = "motion";
  s.status = "IN_PROGRESS";
  s.events = [];
  s.turn = 3;
  s.activePlayerId = s.players[0].id;
  s.cardPool = [normal, legendary];
  for (const p of s.players) {
    p.board = [null, null, null, null];
    p.hand = [];
    p.health = 20;
    p.currentGold = 10;
    p.champion!.quest = null;
  }
  return s;
}
test("finite motion profiles end exactly at origin and separate the damage bands", () => {
  for (const kind of [
    "HIT",
    "HEAVY_HIT",
    "SPELL",
    "ABILITY",
    "SUMMON",
    "LEGENDARY_SUMMON",
    "TURN",
    "SURPRISED",
    "HEAL",
    "AWAKEN",
    "EMOTE",
  ] as const) {
    const frames = motionFrames({ id: "x", event: "IDLE", kind }, true);
    assert.match(
      String(frames.at(-1)!.transform),
      /translate\(0px,0px\).*rotate\(0deg\).*scale\(1\)/,
    );
    assert.equal(frames.at(-1)!.filter, "brightness(1)");
    assert.ok(motionDuration(kind) <= 700);
  }
  assert.equal(motionDuration("HIT"), 220);
  assert.equal(motionDuration("HEAVY_HIT"), 320);
  const heavy: ChampionMotionCue = {
    id: "x",
    event: "HEAVY_HIT",
    kind: "HEAVY_HIT",
  };
  assert.notDeepEqual(
    motionFrames(heavy, true),
    motionFrames({ ...heavy, selfDamage: true }, true),
  );
  for (const f of motionFrames(heavy, true, 1, 1, true))
    assert.equal(f.transform, "translate(0px,0px) rotate(0deg) scale(1)");
});
test("effect settings and emote mappings validate without adding an artwork slot", () => {
  const c = {
    version: 1,
    frames: { default: frame("default"), relief: frame("relief") },
    reactions: {},
    effects: {
      accent: "#a1b2c3",
      origin: { self: { x: 74, y: 58 }, opponent: { x: 26, y: 58 } },
    },
    emotes: { THANKS: "relief", OOPS: null },
  };
  assert.ok(parseBattleSprite(c));
  assert.equal(Object.keys(SPRITE_EXPRESSIONS).length, 10);
  for (const effects of [
    { accent: "url(evil)" },
    { origin: { self: { x: 101, y: 50 } } },
    { origin: { opponent: { x: 5, y: NaN } } },
  ])
    assert.equal(parseBattleSprite({ ...c, effects }), null);
  assert.equal(
    parseBattleSprite({ ...c, emotes: { THANKS: "missing" } }),
    null,
  );
});
test("emotes expire instead of becoming a victory outcome and never interrupt combat", () => {
  const c = {
    version: 1 as const,
    frames: {
      default: frame("default"),
      low: frame("low"),
      victory: frame("victory"),
    },
    reactions: {},
  };
  assert.equal(
    selectSpriteFrame(c, {
      awakened: false,
      low: true,
      reaction: "EMOTE",
      emote: "WELL_PLAYED",
    })!.url,
    c.frames.victory.url,
  );
  assert.equal(
    reactSprite({ event: "IDLE", until: 0 }, "EMOTE", 10).until,
    1010,
  );
  const hit = reactSprite({ event: "IDLE", until: 0 }, "HIT", 10);
  assert.equal(reactSprite(hit, "EMOTE", 50), hit);
  assert.equal(
    selectSpriteFrame(c, { awakened: false, low: true, reaction: "IDLE" })!.url,
    c.frames.low.url,
  );
});
test("turn/emote cues observe accepted events once and do not replay a reconnect snapshot", () => {
  const s = setup(),
    n = {
      ...s,
      events: [
        { type: "TURN_STARTED" as const, playerId: "player-1" },
        {
          type: "CHAMPION_EMOTE" as const,
          playerId: "player-1",
          reason: "THANKS",
        },
      ],
    };
  const cursor = spriteEventCursor(s),
    cues: ChampionMotionCue[] = [];
  assert.deepEqual(championSpriteEvents(s, n, "player-1", cursor, cues), [
    "EMOTE",
  ]);
  assert.deepEqual(
    cues.map((c) => c.kind),
    ["TURN", "EMOTE"],
  );
  const resumed: ChampionMotionCue[] = [];
  assert.deepEqual(
    championSpriteEvents(n, n, "player-1", spriteEventCursor(n), resumed),
    [],
  );
  assert.equal(resumed.length, 0);
});
test("self damage source and attacker slot come from actual result attribution", () => {
  const s = setup(),
    source = generateCardInstance(normal, { instanceId: "source" });
  s.players[0].board[1] = { ...source, boardSlot: 1 };
  const n = applyEffect(s, "player-1", source, {
    type: "STRUCTURED",
    action: "DAMAGE",
    target: { zone: "PLAYER", owner: "SELF", selection: "ALL" },
    values: { amount: 5 },
  });
  const cues: ChampionMotionCue[] = [];
  championSpriteEvents(s, n, "player-1", spriteEventCursor(s), cues);
  assert.equal(cues[0].kind, "HEAVY_HIT");
  assert.equal(cues[0].selfDamage, true);
  assert.equal(cues[0].sourceSlot, 1);
});
test("legendary multi-summon upgrades one cue, and a bulk legendary exit surprises once", () => {
  const s = setup(),
    source = generateCardInstance(normal, { instanceId: "source" });
  const n = applyEffect(s, "player-1", source, {
    type: "STRUCTURED",
    action: "SUMMON",
    target: { zone: "BOARD", owner: "SELF", selection: "ALL", count: 2 },
    values: { definition: legendary, count: 2 },
  });
  const cues: ChampionMotionCue[] = [];
  assert.deepEqual(
    championSpriteEvents(s, n, "player-1", spriteEventCursor(s), cues),
    ["SUMMON"],
  );
  assert.equal(cues.length, 1);
  assert.equal(cues[0].kind, "LEGENDARY_SUMMON");
  const after = applyEffect(n, "player-1", source, {
    type: "STRUCTURED",
    action: "DESTROY",
    target: { zone: "BOARD", owner: "SELF", selection: "ALL" },
  });
  const exits: ChampionMotionCue[] = [];
  assert.deepEqual(
    championSpriteEvents(n, after, "player-1", spriteEventCursor(n), exits),
    ["ALLY_RETIRED"],
  );
  assert.equal(exits.length, 1);
});
test("support, scripts and all-target damage do not invent single-target projectiles", () => {
  assert.equal(
    explicitSingleDamageTarget({ type: "GAIN_GOLD", amount: 2 }),
    false,
  );
  assert.equal(
    explicitSingleDamageTarget({ type: "SCRIPT", script: "damage target" }),
    false,
  );
  assert.equal(
    explicitSingleDamageTarget({
      action: "DAMAGE",
      target: { selection: "ALL", count: 1 },
    }),
    false,
  );
  assert.equal(
    explicitSingleDamageTarget({ type: "DAMAGE_OPPONENT_CHAMPION", amount: 1 }),
    true,
  );
  assert.equal(
    explicitSingleDamageTarget({
      action: "DAMAGE",
      target: { selection: "CHOOSE", count: 1 },
    }),
    true,
  );
});

test("emote mapping stays in the active skin set and explicit OFF preserves low state", () => {
  const config = {
    version: 1 as const,
    frames: {
      default: frame("normal"),
      hurt: frame("normal-hurt"),
      low: frame("normal-low"),
    },
    reactions: {},
    emotes: { THANKS: "hurt", OOPS: null },
    awakening: "REPLACE" as const,
    awakened: {
      version: 1 as const,
      frames: { default: frame("awake") },
      reactions: {},
      emotes: { THANKS: "default" },
    },
  };
  assert.equal(
    selectSpriteFrame(config, {
      awakened: false,
      low: true,
      reaction: "EMOTE",
      emote: "THANKS",
    })!.url,
    config.frames.hurt.url,
  );
  assert.equal(
    selectSpriteFrame(config, {
      awakened: false,
      low: true,
      reaction: "EMOTE",
      emote: "OOPS",
    })!.url,
    config.frames.low.url,
  );
  assert.equal(
    selectSpriteFrame(config, {
      awakened: true,
      low: true,
      reaction: "EMOTE",
      emote: "THANKS",
    })!.url,
    config.awakened.frames.default.url,
  );
  assert.equal(
    selectSpriteFrame(config, {
      awakened: true,
      low: true,
      reaction: "EMOTE",
      emote: "THREATEN",
    })!.url,
    config.awakened.frames.default.url,
  );
});

test("gesture stages separate anticipation, lagging tilt, brace, and recovery", () => {
  const cue = (kind: ChampionMotionCue["kind"]) => ({
    id: kind,
    kind,
    event: "IDLE" as const,
  });
  const spell = motionFrames(cue("SPELL"), true);
  assert.match(String(spell[1].transform), /translate\(-2.7px/);
  assert.match(String(spell[2].transform), /translate\(7.2px/);
  const heal = motionFrames(cue("HEAL"), true);
  assert.match(String(heal[1].transform), /translate\(0px,4.5px\)/);
  const hit = motionFrames(cue("HIT"), true),
    heavy = motionFrames(cue("HEAVY_HIT"), true);
  assert.notDeepEqual(hit, heavy);
  assert.equal(heavy[3].offset, 0.43);
  assert.ok(expressionLead("ABILITY") > expressionLead("SUMMON"));
  assert.equal(expressionLead("HIT"), 0);
});
test("six presets inherit independently, remain bounded, and mechanically remove overshoot", () => {
  assert.equal(
    resolveMotion({ preset: "HEAVY" }, { rotation: 0.4 }).preset,
    "HEAVY",
  );
  assert.equal(resolveMotion({ preset: "AGILE" }).speed, 1.25);
  assert.equal(resolveMotion({ preset: "MECHANICAL" }).rebound, 0);
  for (const preset of [
    "BALANCED",
    "HEAVY",
    "AGILE",
    "RESTRAINED",
    "AGGRESSIVE",
    "MECHANICAL",
  ] as const) {
    const settings = {
      preset,
      movement: 1.5,
      rotation: 1.5,
      scale: 1.5,
      speed: 0.5,
      rebound: 1,
    };
    for (const kind of [
      "HIT",
      "HEAVY_HIT",
      "SPELL",
      "ABILITY",
      "SUMMON",
      "SURPRISED",
      "HEAL",
    ] as const) {
      const frames = motionFrames(
        { id: "x", kind, event: "IDLE" },
        true,
        3,
        5,
        false,
        undefined,
        settings,
      );
      for (const f of frames) {
        const match = String(f.transform).match(
          /translate\(([-.\d]+)px,([-.\d]+)px\) rotate\(([-.\d]+)deg\) scale\(([-.\d]+)\)/,
        )!;
        assert.ok(Math.abs(Number(match[1])) <= (["HIT", "HEAVY_HIT"].includes(kind) ? 52 : 28));
        assert.ok(Math.abs(Number(match[2])) <= (["HIT", "HEAVY_HIT"].includes(kind) ? 48 : 26));
        assert.ok(Math.abs(Number(match[3])) <= (["HIT", "HEAVY_HIT"].includes(kind) ? 10 : 5));
        assert.ok(Math.abs(Number(match[4]) - 1) <= 0.075001);
      }
      assert.match(
        String(frames.at(-1)!.transform),
        /translate\(0px,0px\).*rotate\(0deg\).*scale\(1\)/,
      );
    }
  }
  assert.equal(
    parseBattleSprite({
      version: 1,
      frames: { default: frame("x") },
      reactions: {},
      motion: { preset: "HEAVY", speed: 0 },
    }),
    null,
  );
});

test("centred mobile commanders exert vertically toward the field while hit direction stays authoritative", () => {
  for (const [self, sign] of [
    [true, -1],
    [false, 1],
  ] as const) {
    const f = motionFrames(
      { id: "mobile", kind: "SPELL", event: "ATTACK" },
      self,
      0.8,
      1,
      false,
      undefined,
      undefined,
      true,
    );
    const peak = String(f[2].transform).match(
      /translate\(([-.\d]+)px,([-.\d]+)px\)/,
    )!;
    assert.equal(Number(peak[1]), 0);
    assert.ok(Number(peak[2]) * sign > 0);
    const hit = { id: "hit", kind: "HIT" as const, event: "HIT" as const };
    assert.deepEqual(
      motionFrames(hit, self, 0.8, 1, false, { x: 1, y: 0 }, undefined, true),
      motionFrames(hit, self, 0.8, 1, false, { x: 1, y: 0 }),
    );
  }
});

test('damage-driven torso recoil is monotonic and heavy hits double the previous base force',()=>{
 const peak=(damage:number)=>Math.max(...motionFrames({id:'damage',kind:damage>=5?'HEAVY_HIT':'HIT',event:damage>=5?'HEAVY_HIT':'HIT',damage},true,.8,1,false,{x:0,y:1}).map(f=>Math.abs(Number(String(f.transform).match(/translate\([^,]+,([-.\d]+)px/)! [1]))));
 const values=[1,2,3,4,5,6,7,8].map(peak);
 for(let i=1;i<values.length;i++)assert.ok(values[i]>=values[i-1]);
 assert.ok(peak(1)>=17);assert.ok(peak(5)>=40);assert.ok(peak(5)>peak(4));
 assert.equal(peak(999),48);
});
