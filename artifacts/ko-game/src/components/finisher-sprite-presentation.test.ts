import { test } from "node:test";
import assert from "node:assert/strict";
import {
  championSpriteSkin,
  championSpriteCandidates,
  parseBattleSprite,
  spriteFrames,
  defaultSpritePlacement as p,
  skinKey,
  type BattleSprite,
} from "@workspace/cosmetics";
const f = (name: string) => ({
  url: "https://example.invalid/" + name + ".png",
  self: p,
  opponent: { ...p, flip: true },
});
const root: BattleSprite = {
  version: 1,
  frames: { default: f("base"), low: f("base-low"), awaken: f("transition") },
  reactions: {},
  finishers: {
    a: {
      sprite: {
        version: 1,
        frames: { default: f("a"), low: f("a-low") },
        reactions: {},
      },
      portrait: f("a-profile"),
      music: {
        name: "A",
        assetUrl: "https://example.invalid/a.mp3",
        volume: 40,
      },
    },
    b: {
      sprite: {
        version: 1,
        frames: { default: f("b"), hurt: f("b-hit"), defeat: f("b-defeat") },
        reactions: { HIT: "hurt" },
        states: { DEFEAT: "defeat" },
      },
    },
  },
};
const resolve = (finisherId: string, awakened = true, loadout?: any) =>
  championSpriteSkin({
    championId: "champion",
    base: root,
    normal: "https://example.invalid/art.png",
    awakened,
    finisherId,
    loadout,
  });
test("choice sets persist as JSON and preload their own frames and profile", () => {
  const restored = parseBattleSprite(JSON.stringify(root));
  assert.ok(restored);
  assert.ok(spriteFrames(restored).some((x) => x.url === f("b-hit").url));
  assert.ok(spriteFrames(restored).some((x) => x.url === f("a-profile").url));
  assert.equal(
    parseBattleSprite({
      ...root,
      finishers: { a: { ...root.finishers!.a, sprite: root } },
    }),
    null,
  );
});
test("low health does not replace awakened choice idle and absent reaction stays within that choice set", () => {
  for (const reaction of ["IDLE", "HIT", "HEAVY_HIT"] as const) {
    const list = championSpriteCandidates(resolve("a"), {
      awakened: true,
      low: true,
      reaction,
    });
    assert.equal(list[0].url, f("a").url);
  }
  assert.equal(
    championSpriteCandidates(resolve("b"), {
      awakened: true,
      low: true,
      reaction: "HIT",
    })[0].url,
    f("b-hit").url,
  );
  assert.equal(
    championSpriteCandidates(resolve("b"), {
      awakened: true,
      low: true,
      reaction: "IDLE",
      outcome: "DEFEAT",
    })[0].url,
    f("b-defeat").url,
  );
});
test("before awakening use the normal set; branch id alone does not awaken the champion", () => {
  assert.equal(
    championSpriteCandidates(resolve("a", false), {
      awakened: false,
      low: true,
      reaction: "IDLE",
    })[0].url,
    f("base-low").url,
  );
});
test("selected skin never borrows a different skin or default champion branch sprite", () => {
  const own: BattleSprite = {
    version: 1,
    frames: { default: f("skin") },
    reactions: {},
    finishers: {
      b: {
        sprite: { version: 1, frames: { default: f("skin-b") }, reactions: {} },
      },
    },
  };
  const skin = {
    id: "skin",
    type: "CHAMPION_SKIN",
    targetId: "champion",
    name: "선택 스킨",
    imageAssets: {
      art: "https://example.invalid/skin-art.png",
      __battle: JSON.stringify(own),
    },
  };
  const loadout = { skins: { [skinKey("CHAMPION_SKIN", "champion")]: skin } };
  assert.equal(
    championSpriteCandidates(resolve("a", true, loadout), {
      awakened: true,
      low: true,
      reaction: "IDLE",
    })[0].url,
    f("skin").url,
  );
  assert.equal(
    championSpriteCandidates(resolve("b", true, loadout), {
      awakened: true,
      low: true,
      reaction: "HIT",
    })[0].url,
    f("skin-b").url,
  );
});

import {readFileSync}from'node:fs';
for(const name of ['챔피언 미니언 A','챔피언 퍼플레인'])test('latest registered awakening artwork overrides low HP: '+name,()=>{
 const records=JSON.parse(readFileSync('docs/qa/snapshots/20261111-admin/champions.json','utf8'));
 const record=records.find((r:any)=>r.name===name);const config=parseBattleSprite(record.presentationLines.BATTLE_SPRITE);assert.ok(config?.frames.awaken);
 const appearance=championSpriteSkin({championId:record.id,base:config,normal:record.imageUrl,awakened:true});
 assert.equal(championSpriteCandidates(appearance,{awakened:true,low:true,reaction:'IDLE'})[0].url,config.frames.awaken.url);
});
