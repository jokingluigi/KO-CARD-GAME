import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cardRecordToDefinition,type PublishedCardRecord} from '../cards/published-cards';
import {championRecordToDefinition,type PublishedChampionRecord} from '../champions/published-champions';
import {createInitialGameState} from '../engine/create-initial-game-state';
import {generateCardInstance} from '../cards/generation';
import {executeAction} from '../actions/engine-actions';
import {resolveTriggeredAbilities,resolveBoardListeners} from '../effects/effect-engine';
import {fieldInvulnerable} from '../engine/balance-effects';
import {evaluateChampionQuestCondition} from '../../../../../lib/game-engine/src/champion-quest-conditions';
import {MAX_HAND_SIZE} from '../rules/constants';
import type {GameState} from '../types/game-state';
import type {CardDefinition} from '../cards/types';
const records:PublishedCardRecord[]=JSON.parse(readFileSync('docs/qa/snapshots/20261118-admin/cards.json','utf8'));
const champions:PublishedChampionRecord[]=JSON.parse(readFileSync('docs/qa/snapshots/20261118-admin/champions.json','utf8'));
const defs=records.map(cardRecordToDefinition);
const def=(name:string)=>{const d=defs.find(d=>d.name===name);assert.ok(d,name);return d;};
const body:CardDefinition={id:'test-body',name:'검증 선수',cardType:'WRESTLER',cost:1,attack:3,health:7,keywords:[],abilities:[],tags:[],rulesText:'',isToken:false,isChampionToken:false};
function setup(){const s=createInitialGameState();s.status='IN_PROGRESS';s.turn=5;s.activePlayerId='player-1';s.openingMulligan=undefined;s.events=[];s.cardPool=[...defs,body];s.minionACardPool=s.cardPool;for(const p of s.players){p.board=[null,null,null,null];p.hand=[];p.deck=[];p.graveyard=[];p.currentGold=6;p.health=15;p.maxHealth=25;p.champion!.quest=null;}return s;}
function put(s:GameState,d:CardDefinition,slot:0|1|2|3=0,owner=0){const c={...generateCardInstance(d,{instanceId:`${owner}:${d.id}:${slot}`}),boardSlot:slot,enteredThisTurn:false};s.players[owner].board[slot]=c;return c;}
function act(s:GameState,a:Parameters<typeof executeAction>[1]){const r=executeAction(s,a);assert.ok(r.success,r.message);return r.state;}
function useChampion(s:GameState,name:string){const d=championRecordToDefinition(champions.find(c=>c.name===name)!);s.players[0].champion={...s.players[0].champion!,...d,health:s.players[0].health,questProgress:0,questCompleted:false};return s;}
test('latest Joker summons Surprise allies, excludes self and champion tokens, and only tagged attacks buff the pair',()=>{
 let s=setup();const source=def('조킹루이지');const ally={...body,id:'authority',tags:['디 어쏘리티']};s.cardPool=[source,ally,{...ally,id:'forbidden-champion',isChampionToken:true}];s.minionACardPool=s.cardPool;s.players[0].hand=[generateCardInstance(source,{instanceId:'joker-hand'})];
 s=act(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'joker-hand',boardSlot:1});
 for(const slot of [0,2]){const c=s.players[0].board[slot]!;assert.equal(c.definitionId,ally.id);assert.ok(c.keywords.includes('SURPRISE'));assert.ok(!c.keywords.includes('TAUNT'));assert.equal(c.currentAttack,3);}
 const joker=s.players[0].board[1]!;assert.ok(fieldInvulnerable(s,joker));
 let n=resolveBoardListeners(s,'player-1','OTHER_ALLY_ATTACK',{attackerInstanceId:s.players[0].board[0]!.instanceId});assert.equal(n.players[0].board[1]!.currentAttack,joker.currentAttack+1);assert.equal(n.players[0].board[0]!.currentAttack,4);
 put(s,body,3);n=resolveBoardListeners(s,'player-1','OTHER_ALLY_ATTACK',{attackerInstanceId:s.players[0].board[3]!.instanceId});assert.equal(n.players[0].board[1]!.currentAttack,joker.currentAttack);
 s.players[0].board[0]=s.players[0].board[2]=null;assert.equal(fieldInvulnerable(s,joker),false);
});
test('Mafia Joker has conditional invulnerability rather than permanently inherited IMMUNE',()=>{const s=setup();const joker=put(s,def('조킹루이지(로마니 마피아)'));assert.ok(!joker.keywords.includes('IMMUNE'));assert.equal(fieldInvulnerable(s,joker),false);put(s,{...body,tags:['마피아']},1);assert.equal(fieldInvulnerable(s,joker),true);});
test('Rosie wrestler returns old hand to deck then fills FULL catalog cards with all three stat penalties and cost floor',()=>{
 let s=setup();const rosie=def('로지양');const token={...body,id:'full-only',cost:0,attack:2,health:2,isToken:true,rarity:'TOKEN' as const};s.cardPool=[token];s.minionACardPool=[token];s.players[0].hand=[generateCardInstance(rosie,{instanceId:'rosie'}),generateCardInstance(body,{instanceId:'old-hand'})];
 s=act(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'rosie',boardSlot:0});assert.equal(s.players[0].deck[0].instanceId,'old-hand');assert.equal(s.players[0].hand.length,MAX_HAND_SIZE);
 for(const c of s.players[0].hand){assert.equal(c.definitionId,token.id);assert.deepEqual([c.currentCost,c.currentAttack,c.currentHealth,c.maxHealth],[1,1,1,1]);}
});
test('Rosie champion uses FULL pool, applies -1 to all stats and shows the corrected minimum wording',()=>{
 let s=useChampion(setup(),'로지양');const low={...body,id:'low',cost:0,attack:0,health:1,isToken:true,rarity:'TOKEN' as const};s.cardPool=[];s.minionACardPool=[low];s=act(s,{type:'USE_CHAMPION_ABILITY',playerId:'player-1'});const c=s.players[0].hand[0];assert.ok(c);assert.deepEqual([c.currentCost,c.currentAttack,c.currentHealth],[1,0,1]);assert.match(s.players[0].champion!.ability.description!,/최소치/);
});
test('werewolf Pandora absorbs at turn end, not turn start, then gains a dodge charge',()=>{
 let s=setup();const wolf=put(s,def('늑대인간 판도라'));const victim=put(s,body,1);const before=[wolf.currentAttack,wolf.currentHealth];assert.equal(resolveTriggeredAbilities(s,'player-1',wolf,'TURN_START').targetingState?.active,undefined);
 s=resolveTriggeredAbilities(s,'player-1',wolf,'TURN_END');assert.ok(s.targetingState?.validTargetIds.includes(victim.instanceId));assert.ok(!s.targetingState?.validTargetIds.includes(wolf.instanceId));s=act(s,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:victim.instanceId});assert.equal(s.players[0].board[1],null);assert.deepEqual([s.players[0].board[0]!.currentAttack,s.players[0].board[0]!.currentHealth],[before[0]+3,before[1]+7]);assert.ok(s.players[0].board[0]!.dodgeAvailable);
});
test('maid Pandora has no entry damage and transforms on a real combat pinfall',()=>{
 let s=setup();const maid=put(s,def('하녀 판도라'));put(s,{...body,health:1,attack:0},0,1);assert.ok(!maid.abilities.some(a=>a.trigger==='ENTER_FIELD'));s=act(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:maid.instanceId,target:{type:'CARD',playerId:'player-2',cardInstanceId:s.players[1].board[0]!.instanceId}});assert.equal(s.players[0].board[0]!.definitionId,def('늑대인간 판도라').id);
});
test('Blackmacaron uses two damage and summons only after actual retirement; quest requires five ability kills',()=>{
 let s=useChampion(setup(),'블랙마카롱');const recruit={...body,id:'recruit',name:'로마니 마피아 신입'};s.cardPool!.push(recruit);put(s,{...body,health:2},0,1);s=act(s,{type:'USE_CHAMPION_ABILITY',playerId:'player-1'});assert.ok(s.targetingState?.active);s=act(s,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:s.players[1].board[0]!.instanceId});assert.equal(s.players[1].board[0],null);assert.ok(s.players[0].board.some(c=>c?.definitionId===recruit.id));assert.equal(s.players[0].champion!.quest!.condition!.type,'EVENT');assert.equal(s.players[0].champion!.quest!.requiredProgress,5);
 let noKill=useChampion(setup(),'블랙마카롱');noKill.cardPool!.push(recruit);put(noKill,body,0,1);noKill=act(noKill,{type:'USE_CHAMPION_ABILITY',playerId:'player-1'});noKill=act(noKill,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:noKill.players[1].board[0]!.instanceId});assert.equal(noKill.players[1].board[0]!.currentHealth,5);assert.equal(noKill.players[0].board.filter(Boolean).length,0);
});
test('Crusaders heal two and buff an ally, with awakening eligibility at three health and not four',()=>{
 let s=useChampion(setup(),'크루세이더즈');put(s,body);s=act(s,{type:'USE_CHAMPION_ABILITY',playerId:'player-1'});assert.equal(s.players[0].health,17);assert.equal(s.players[0].board[0]!.currentAttack,4);const condition=s.players[0].champion!.quest!.condition!;
 s.players[0].health=4;assert.equal(evaluateChampionQuestCondition(condition,s,'player-1',[]).completed,false);
 s.players[0].health=3;assert.equal(evaluateChampionQuestCondition(condition,s,'player-1',[]).completed,true);
});
test('unchanged saved Sovereign and Mafia Macaron effects keep their reviewed retirement and entry mechanics',()=>{assert.ok(def('소버린').abilities.some(a=>a.trigger==='SELF_RETIRE'));const s=setup();const c=put(s,def('블랙 마카롱(로마니 마피아)'));put(s,{...body,tags:['마피아']},1);const n=resolveTriggeredAbilities(s,'player-1',c,'ENTER_FIELD');assert.equal(n.players[0].board[0]!.currentAttack,4);});
test('future administrator wording is not silently replaced by this reviewed revision',()=>{const r=records.find(r=>r.name==='조킹루이지')!;const d=cardRecordToDefinition({...r,text:'효과 없음'});assert.ok(!d.abilities.some(a=>'invulnerableWhileOtherAllyTag' in a));});
