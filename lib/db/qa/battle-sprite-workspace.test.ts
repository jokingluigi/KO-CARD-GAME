import assert from "node:assert/strict";
import { test } from "node:test";
import { database, api, registered, uploaded } from "./cosmetics.test";
import { championsTable, cosmeticItemsTable } from "../src/schema";
import { eq } from "drizzle-orm";
import { defaultSpritePlacement as p } from "../../cosmetics/src/index";
const root = "/admin/battle-sprites";
const sprite = () => ({
  version: 1,
  frames: {
    default: {
      url: uploaded,
      self: { ...p, scale: 1.4 },
      opponent: { ...p, flip: true },
    },
  },
  reactions: { HIT: "default" },
});
test("sprite workspace requires administrator access", async () => {
  assert.equal((await api(root, "anonymous")).status, 401);
  assert.equal((await api(root, "player-a")).status, 403);
  assert.equal((await api(root)).status, 200);
});
test("default-only update preserves champion rules, unrelated dialogue and detects stale saves", async () => {
  const [before] = await database
    .select()
    .from(championsTable)
    .where(eq(championsTable.id, "cosmetic-hero"));
  const target = (await api(root)).body.targets.find(
    (t: any) => t.key === "default:cosmetic-hero",
  );
  await database
    .update(championsTable)
    .set({
      presentationLines: {
        ...before.presentationLines,
        QUEST_COMPLETE: "preserve concurrent dialogue",
      },
    })
    .where(eq(championsTable.id, before.id));
  const result = await api(root + "/default/" + before.id, "admin", "PATCH", {
    sprite: sprite(),
    revision: target.revision,
    health: 999,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const [after] = await database
    .select()
    .from(championsTable)
    .where(eq(championsTable.id, before.id));
  assert.equal(after.maxHealth, before.maxHealth);
  assert.deepEqual(after.abilityEffects, before.abilityEffects);
  assert.equal(
    after.presentationLines.QUEST_COMPLETE,
    "preserve concurrent dialogue",
  );
  assert.deepEqual(after.presentationLines.BATTLE_SPRITE, result.body.config);
  assert.equal(
    (
      await api(root + "/default/" + before.id, "admin", "PATCH", {
        sprite: null,
        revision: target.revision,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(root + "/default/" + before.id, "admin", "PATCH", {
        sprite: null,
        revision: result.body.revision,
      })
    ).status,
    200,
  );
});
test("skin-only sprite save does not replace artwork, target, equipment or default appearance", async () => {
  const id = registered.CHAMPION_SKIN.id;
  const [before] = await database
    .select()
    .from(cosmeticItemsTable)
    .where(eq(cosmeticItemsTable.id, id));
  const target = (await api(root)).body.targets.find(
    (t: any) => t.key === "skin:" + id,
  );
  const result = await api(root + "/skin/" + id, "admin", "PATCH", {
    sprite: sprite(),
    revision: target.revision,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const [after] = await database
    .select()
    .from(cosmeticItemsTable)
    .where(eq(cosmeticItemsTable.id, id));
  assert.equal(after.targetId, before.targetId);
  assert.equal(after.imageAssets.art, before.imageAssets.art);
  assert.equal(after.isActive, before.isActive);
  assert.equal(after.name, before.name);
  assert.deepEqual(JSON.parse(after.imageAssets.__battle), result.body.config);
  assert.equal(
    (
      await api(root + "/skin/" + id, "admin", "PATCH", {
        sprite: { ...sprite(), awakening: "REPLACE" },
        revision: result.body.revision,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(root + "/skin/" + id, "admin", "PATCH", {
        sprite: {
          ...sprite(),
          frames: {
            default: {
              ...sprite().frames.default,
              url: "https://invalid.example/not-uploaded.png",
            },
          },
        },
        revision: result.body.revision,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(root + "/skin/" + id, "admin", "PATCH", {
        sprite: null,
        revision: result.body.revision,
      })
    ).status,
    200,
  );
});

test("all ten expressions and independent awakened framing survive workspace save/re-entry", async () => {
  const { SPRITE_EXPRESSIONS, selectSpriteFrame } =
    await import("../../cosmetics/src/index");
  const targets = (await api(root)).body.targets;
  const target = targets.find(
    (t: any) => t.key === "skin:" + registered.CHAMPION_SKIN.id,
  );
  const frames = Object.fromEntries(
    Object.keys(SPRITE_EXPRESSIONS).map((key, index) => [
      key,
      {
        url: uploaded,
        self: { ...p, scale: 1 + index / 20 },
        opponent: { ...p, x: 40 + index, flip: index % 2 === 0 },
      },
    ]),
  );
  const config = {
    version: 1,
    frames,
    reactions: {},
    awakening: "REPLACE",
    awakened: {
      version: 1,
      frames: {
        default: {
          url: uploaded,
          self: { ...p, scale: 2 },
          opponent: { ...p, scale: 0.7 },
        },
      },
      reactions: {},
    },
  };
  const beforeDefault = targets.find(
    (t: any) => t.kind === "default" && t.championId === target.championId,
  ).config;
  const response = await api(root + "/skin/" + target.id, "admin", "PATCH", {
    sprite: config,
    revision: target.revision,
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const reloaded = (await api(root)).body.targets;
  const stored = reloaded.find((t: any) => t.key === target.key).config;
  assert.deepEqual(stored, config);
  assert.equal(Object.keys(stored.frames).length, 10);
  assert.equal(
    selectSpriteFrame(stored, { awakened: false, low: true, reaction: "IDLE" })
      ?.self.scale,
    1.2,
  );
  assert.equal(
    selectSpriteFrame(stored, {
      awakened: true,
      low: true,
      reaction: "HEAVY_HIT",
    })?.self.scale,
    2,
  );
  assert.deepEqual(
    reloaded.find(
      (t: any) => t.kind === "default" && t.championId === target.championId,
    ).config,
    beforeDefault,
  );
});

test('both PvP views and recovered runtime retain distinct selected champion sprite sets', async () => {
  const { userCardCollectionsTable, userChampionCollectionsTable } = await import('../src/schema');
  const { championSpriteSkin, selectSpriteFrame } = await import('../../cosmetics/src/index');
  const { startOnlineMatch, snapshotMessage, cleanupMatchRuntime, getRuntime } = await import('../../../artifacts/api-server/src/online/service');
  const configs = [
    { ...sprite(), awakening:'KEEP' },
    { ...sprite(), awakening:'REPLACE', awakened:{ version:1, frames:{ default:{ url:uploaded, self:{...p,scale:1.8}, opponent:{...p,scale:0.7,flip:false} } }, reactions:{} } },
  ];
  const ids:string[]=[];
  for(const [index,userId] of ['player-a','player-b'].entries()) {
    const created=await api('/admin/cosmetics/items','admin','POST',{
      ...registered.CHAMPION_SKIN,
      name:'Sprite snapshot '+userId,
      imageAssets:{art:uploaded,__battle:JSON.stringify(configs[index])},
    });
    assert.equal(created.status,201,JSON.stringify(created.body));
    ids.push(created.body.item.id);
    assert.equal((await api('/admin/cosmetics/users/'+userId+'/grants','admin','POST',{cosmeticId:ids[index],action:'GRANT'})).status,200);
    assert.equal((await api('/cosmetics/equipment',userId,'PUT',{slot:'champion:cosmetic-hero',cosmeticId:ids[index]})).status,200);
    // Restore only this isolated fixture's prerequisites after earlier inventory-policy tests.
    await database.update(userCardCollectionsTable).set({quantity:3}).where(eq(userCardCollectionsTable.userId,userId));
    await database.update(userChampionCollectionsTable).set({owned:true}).where(eq(userChampionCollectionsTable.userId,userId));
  }
  let runtime=await startOnlineMatch('player-a','deck-player-a','player-b','deck-player-b');
  try {
    const validate=(r:typeof runtime)=>{
      for(const viewer of ['player-a','player-b']) {
        const snapshot:any=snapshotMessage(r,viewer);
        for(const [index,seat] of ['PLAYER_ONE','PLAYER_TWO'].entries()) {
          const appearance=championSpriteSkin({championId:'cosmetic-hero',loadout:snapshot.cosmetics[seat],base:null,awakened:true});
          assert.equal(appearance.id,ids[index]);
          assert.deepEqual(appearance.config,configs[index]);
          assert.equal(selectSpriteFrame(appearance.config!,{awakened:true,low:true,reaction:'HEAVY_HIT'})!.self.scale,index?1.8:1.4);
        }
      }
    };
    validate(runtime);
    const state=JSON.stringify(runtime.state),id=runtime.matchId;
    cleanupMatchRuntime(id);runtime.state.status='FINISHED';
    const recovered=await getRuntime(id);assert.ok(recovered);runtime=recovered;
    assert.equal(JSON.stringify(runtime.state),state);
    validate(runtime);
  } finally {runtime.state.status='FINISHED';cleanupMatchRuntime(runtime.matchId);}
});

test('skin motion origins/accent and emote maps round-trip independently for normal and awakened sets',async()=>{
  const target=(await api(root)).body.targets.find((t:any)=>t.key==='skin:'+registered.CHAMPION_SKIN.id);
  const config={...sprite(),effects:{accent:'#c9a467',origin:{self:{x:73,y:58},opponent:{x:27,y:62}}},emotes:{THANKS:'default',OOPS:null},awakening:'REPLACE',awakened:{...sprite(),effects:{accent:'#8d79b0',origin:{self:{x:68,y:52}}},emotes:{THANKS:null,THREATEN:'default'}}};
  const response=await api(root+'/skin/'+target.id,'admin','PATCH',{sprite:config,revision:target.revision});
  assert.equal(response.status,200,JSON.stringify(response.body));
  const stored=(await api(root)).body.targets.find((t:any)=>t.key===target.key);
  assert.deepEqual(stored.config,config);
  for(const bad of [{...config,effects:{accent:'url(evil)'}},{...config,emotes:{THANKS:'not-registered'}},{...config,effects:{origin:{self:{x:101,y:50}}}}])assert.equal((await api(root+'/skin/'+target.id,'admin','PATCH',{sprite:bad,revision:stored.revision})).status,400);
});

test('motion presets and per-set controls persist and invalid overrides are rejected', async()=>{
  const target=(await api(root)).body.targets.find((t:any)=>t.key==='skin:'+registered.CHAMPION_SKIN.id);
  const config={...sprite(),motion:{preset:'HEAVY',movement:.8,rotation:1.1,speed:.75,rebound:.3,pivotX:45,pivotY:92},awakening:'REPLACE',awakened:{...sprite(),motion:{preset:'AGGRESSIVE',movement:1.2,scale:.8}}};
  const saved=await api(root+'/skin/'+target.id,'admin','PATCH',{sprite:config,revision:target.revision});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  const stored=(await api(root)).body.targets.find((t:any)=>t.key===target.key);
  assert.deepEqual(stored.config,config);
  for(const motion of [{preset:'FAKE'},{speed:0},{movement:500},{pivotY:101},{rebound:-1},{script:'alert(1)'}]) {
    assert.equal((await api(root+'/skin/'+target.id,'admin','PATCH',{sprite:{...config,motion},revision:stored.revision})).status,400);
  }
});
