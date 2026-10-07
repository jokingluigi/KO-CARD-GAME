import assert from 'node:assert/strict';import test from 'node:test';
import { createInitialGameState } from '../engine/create-initial-game-state';import { startGame } from '../engine/turn-system';import { resolveChampionGameStartAbility } from '../engine/champion-system';
import { TEST_CHAMPIONS } from './test-champions';import { isAutomaticChampionStartConfig } from '../../../../../lib/game-engine/src/champion-game-start';
import { championRecordToDefinition } from './published-champions';import { readFileSync } from 'node:fs';
for(const index of [0,1])test('champion start ability fires once before opening draws side='+index,()=>{
 const champions=structuredClone(TEST_CHAMPIONS);const champion=champions[index];champion.gameStartAbility={id:'initial-effect',name:'시작 압박',description:'상대 챔피언에게 2 피해',cost:0,effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'CHARACTER',owner:'ENEMY',selection:'ALL',count:1},values:{amount:2}}]};
 const s=startGame(createInitialGameState([champions[0].id,champions[1].id],undefined,champions),()=>.5);
 assert.equal(s.players[1-index].health,18);assert.ok(s.players[index].champion?.gameStartAbilityResolved);assert.equal(s.players[index].championAbilityUsedThisTurn,false);
 const start=s.events.findIndex(e=>e.type==='CHAMPION_GAME_START_ABILITY');const draw=s.events.findIndex(e=>e.type==='CARD_DRAWN');assert.ok(start>=0&&draw>start);
 const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(resolveChampionGameStartAbility(restored,s.players[index].id),restored);
});
test('published start effect is separate from regular and upgraded abilities',()=>{const records=JSON.parse(readFileSync(new URL('../qa/fixtures/champions-2026-10-07-public.json',import.meta.url),'utf8'));const base=records[0];const c=championRecordToDefinition({...base,gameStartAbilityName:'전투 준비',gameStartAbilityText:'내 챔피언 체력을 2 회복',gameStartAbilityEffects:{effects:[{action:'HEAL',target:{zone:'CHARACTER',owner:'SELF',selection:'ALL',count:1},values:{amount:2}}]}});assert.equal(c.gameStartAbility?.name,'전투 준비');assert.equal(c.gameStartAbility?.cost,0);assert.equal(c.ability.id,base.id+'-ability');assert.equal(championRecordToDefinition(base).gameStartAbility,null);});
test('start config disallows manual selection even in nested script branches',()=>{assert.ok(isAutomaticChampionStartConfig({effects:[{action:'DRAW',values:{amount:1}}]}));assert.ok(!isAutomaticChampionStartConfig({scripts:[{steps:[{type:'IF',then:[{target:{selection:'PLAYER_CHOICE'}}]}]}]}));assert.ok(!isAutomaticChampionStartConfig([]));});
