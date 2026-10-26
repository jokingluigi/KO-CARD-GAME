import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseCosmeticDisplay,cosmeticAssetDisplay,cosmeticImageSettings,emptyCosmetics,type CosmeticItem} from '../../../../lib/cosmetics/src/index';
const settings={imageDisplayMode:'CONTAIN' as const,imageScale:1.4,imagePositionX:22,imagePositionY:76};
const item:CosmeticItem={id:'skin',type:'CHAMPION_SKIN',targetId:'hero',name:'skin',description:'',isActive:true,sortOrder:0,imageAssets:{art:'https://example.invalid/art.png',awakened:'https://example.invalid/awake.png','token:t':'https://example.invalid/token.png',__display:JSON.stringify({art:settings,awakened:{...settings,imageScale:.8},'token:t':{...settings,imageScale:1.2}})}};
test('common art framing is shared by collection/HUD/intro; awakening and token framing stay separate',()=>{
 const loadout={...emptyCosmetics(),skins:{'champion:hero':item}};
 for(const context of ['art','portrait','intro'] as const)assert.deepEqual(cosmeticImageSettings(loadout,'CHAMPION_SKIN','hero',context),settings);
 assert.equal(cosmeticImageSettings(loadout,'CHAMPION_SKIN','hero','awakened')!.imageScale,.8);
 assert.equal(cosmeticImageSettings(loadout,'CARD_SKIN','t','art')!.imageScale,1.2);
 assert.equal(cosmeticImageSettings(loadout,'CARD_SKIN','unknown','art'),undefined);
 const regular={...item,imageAssets:{art:item.imageAssets.art,__display:item.imageAssets.__display}};
 assert.equal(cosmeticImageSettings({...loadout,skins:{'champion:hero':regular}},'CHAMPION_SKIN','hero','awakened'),undefined);
});
test('legacy portrait-only cosmetics retain framing and unconfigured originals have no override',()=>{
 const legacy={...item,imageAssets:{portrait:'https://example.invalid/old.png',__display:JSON.stringify({portrait:settings})}};
 assert.deepEqual(cosmeticImageSettings({...emptyCosmetics(),skins:{'champion:hero':legacy}},'CHAMPION_SKIN','hero','intro'),settings);
 assert.equal(cosmeticAssetDisplay({art:'https://example.invalid/default.png'},'art'),undefined);
 assert.equal(cosmeticImageSettings(undefined,'CHAMPION_SKIN','hero','portrait'),undefined);
});
test('display metadata rejects malformed, oversized, unsupported and out-of-range values',()=>{
 for(const value of ['[]','null','bad','x'.repeat(8193),JSON.stringify({evil:settings}),JSON.stringify({art:{...settings,imageScale:'1'}}),JSON.stringify({art:{...settings,imageScale:2.01}}),JSON.stringify({art:{...settings,imagePositionY:101}}),JSON.stringify({art:{...settings,imageDisplayMode:'INVALID'}})])assert.equal(parseCosmeticDisplay(value),null);
 assert.deepEqual(parseCosmeticDisplay(undefined),{});
});
