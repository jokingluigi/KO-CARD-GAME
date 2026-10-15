import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { cardRecordToDefinition, type PublishedCardRecord } from '../cards/published-cards';
import { generateCardInstance } from '../cards/generation';
import { getActiveCardKeywords } from '../cards/granted-text';
import type { CardDefinition } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { executeAction, getLegalActions } from '../actions/engine-actions';
import { applyEffect, resolveTriggeredAbilities } from '../effects/effect-engine';
const records = JSON.parse(readFileSync(new URL('../../../../../docs/qa/snapshots/20261015-wrestler-revisions/cards.json', import.meta.url), 'utf8')) as PublishedCardRecord[];
const definitions = records.map(cardRecordToDefinition);
function definition(name: string) { const d = definitions.find(d => d.name === name); assert.ok(d, name); return d; }
const vanilla: CardDefinition = { id: 'latest-qa-vanilla', name: '검증 선수', cardType: 'WRESTLER', cost: 1, attack: 2, health: 6, rulesText: '', keywords: [], abilities: [], isToken: false, isChampionToken: false, status: 'PUBLISHED' };
function setup() {
 const s = createInitialGameState(); s.status = 'IN_PROGRESS'; s.turn = 3; s.activePlayerId = 'player-1'; s.cardPool = definitions; s.minionACardPool = definitions; s.events = []; s.randomSeed = 101;
 for (const p of s.players) { p.currentGold = 99; p.health = 20; p.hand = []; p.board = [null,null,null,null]; p.graveyard = []; p.deck = Array.from({length:12},(_,i)=>generateCardInstance(vanilla,{instanceId:p.id+'-deck-'+i})); if(p.champion) {p.champion.health=20; p.champion.quest=undefined;} }
 return s;
}
function board(s: ReturnType<typeof setup>, d: CardDefinition = vanilla, owner = 1, slot: 0|1|2|3 = 0) {
 if (!s.cardPool?.some(entry=>entry.id===d.id)) s.cardPool=[...(s.cardPool??[]),d];
 const c = {...generateCardInstance(d,{instanceId:`${owner}-${slot}-${d.id}`}),boardSlot:slot,enteredThisTurn:false,entryDefenseActive:false}; s.players[owner].board[slot]=c; return c;
}
function play(s:ReturnType<typeof setup>,name:string,slot:0|1|2|3=0,target?:string) {
 const d=definition(name), card=generateCardInstance(d,{instanceId:'played'}); s.players[0].hand.unshift(card);
 const result=executeAction(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:card.instanceId,boardSlot:slot}); assert.ok(result.success,name);
 if(!target)return result.state;
 const chosen=executeAction(result.state,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:target}); assert.ok(chosen.success,name+' selection');return chosen.state;
}
test('latest pain musician deals 3 to own champion and adds exactly 2 attack at real turn end',()=>{
 const s=play(setup(),'고통 연주자');const before=s.players[0].board[0]!.currentAttack;
 const ended=executeAction(s,{type:'END_TURN',playerId:'player-1'});assert.ok(ended.success);assert.equal(ended.state.players[0].health,17);assert.equal(ended.state.players[0].board[0]!.currentAttack,before+2);
});
test('latest fanatic gains attack only, once per actual champion damage event',()=>{
 const s=play(setup(),'광신도'), before=s.players[0].board[0]!;
 const damaged=applyEffect(s,'player-2',s.players[1].deck[0],{type:'STRUCTURED',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},values:{amount:2}});
 assert.equal(damaged.players[0].board[0]!.currentAttack,before.currentAttack+1);assert.equal(damaged.players[0].board[0]!.maxHealth,before.maxHealth);assert.equal(damaged.players[0].board[0]!.currentHealth,before.currentHealth);
 const zero=applyEffect(s,'player-2',s.players[1].deck[0],{type:'STRUCTURED',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},values:{amount:0}});assert.equal(zero.players[0].board[0]!.currentAttack,before.currentAttack);
});
test('latest immature alchemist excludes itself, including empty friendly field',()=>{
 const solo=play(setup(),'미숙한 연금술사');assert.equal(solo.players[0].board[0]!.currentAttack,definition('미숙한 연금술사').attack);
 const s=setup();board(s,vanilla,0,1);const result=play(s,'미숙한 연금술사');assert.equal(result.players[0].board[1]!.currentAttack,3);assert.equal(result.players[0].board[1]!.currentHealth,7);
});
test('latest small devil deals 2 before granting itself +1/+1',()=>{
 const s=setup();const ally=board(s,vanilla,0,1);const result=play(s,'작고 조그마한 악마',0,ally.instanceId);assert.equal(result.players[0].board[1]!.currentHealth,4);assert.equal(result.players[0].board[0]!.currentAttack,definition('작고 조그마한 악마').attack+1);
});
test('latest Ruina excludes its own definition from generation and counts its tagged live zones',()=>{
 const s=setup();const tagged={...vanilla,id:'tagged',tags:['디 어쏘리티']};s.cardPool=[definition('루이나'),tagged];s.minionACardPool=s.cardPool;
 const result=play(s,'루이나');assert.equal(result.players[0].hand.length,1);assert.equal(result.players[0].hand[0].definitionId,'tagged');const count=result.players[0].hand.filter(c=>c.tags?.includes('디 어쏘리티')).length+result.players[0].board.filter(c=>c?.tags?.includes('디 어쏘리티')).length;assert.equal(result.players[0].board[0]!.currentAttack,definition('루이나').attack+count);
});
test('latest Cassandra generates another public authority wrestler and grants only that card regeneration',()=>{
 const s=setup();const tagged={...vanilla,id:'authority-candidate',tags:['디 어쏘리티']};s.cardPool=[definition('카산드라'),tagged,{...tagged,id:'draft',status:'DRAFT'},{...tagged,id:'token',isToken:true}];s.minionACardPool=s.cardPool;const original=generateCardInstance(vanilla,{instanceId:'old-hand'});s.players[0].hand=[original];
 const result=play(s,'카산드라');const generated=result.players[0].hand.find(c=>c.definitionId==='authority-candidate');assert.ok(generated);assert.ok(generated.keywords.includes('REGEN'));assert.ok(!result.players[0].hand.find(c=>c.instanceId===original.instanceId)!.keywords.includes('REGEN'));
 result.players[0].health=18;result.players[0].champion!.health=18;const ended=executeAction(result,{type:'END_TURN',playerId:'player-1'});assert.ok(ended.success);assert.equal(ended.state.players[0].health,19);
});
test('latest Pandora pinfall grants +1/+1 once to itself and other tagged allies only',()=>{
 const s=setup();const tagged=board(s,{...vanilla,id:'tagged',tags:['디 어쏘리티']},0,1);board(s,vanilla,0,2);const enemy=board(s,{...vanilla,health:1});const result=play(s,'판도라',0,enemy.instanceId);
 assert.equal(result.players[0].board[0]!.currentAttack,definition('판도라').attack+1);assert.equal(result.players[0].board[1]!.currentAttack,tagged.currentAttack+1);assert.equal(result.players[0].board[2]!.currentAttack,2);
});
test('latest destruction messenger replaces a sourced retirement and gains only +1/+1',()=>{
 const s=setup();const ally=board(s,{...vanilla,attack:10,health:20},0,1);const enemy=board(s,{...vanilla,health:3});let n=play(s,'카르자엘, 파괴의 천사',0,ally.instanceId);const before=n.players[0].board[1]!.currentAttack;
 const hit=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:ally.instanceId,target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:enemy.instanceId}});assert.ok(hit.success);n=hit.state;assert.equal(n.players[1].board[0],null);assert.equal(n.players[1].graveyard.length,0);assert.equal(n.players[0].board[1]!.currentAttack,before+1);
});
test('latest awakened dealer cannot attack champion until every opposing field slot is empty',()=>{
 const s=setup();const dealer=board(s,definition('리온(각성)'),0);board(s);const championAttack={type:'ATTACK' as const,playerId:'player-1',attackerInstanceId:dealer.instanceId,target:{type:'PLAYER' as const,playerId:'player-2'}};
 assert.equal(executeAction(s,championAttack).success,false);assert.ok(!getLegalActions(s,'player-1').some(a=>a.type==='ATTACK'&&a.target.type==='PLAYER'));
 const clear=structuredClone(s);clear.players[1].board=[null,null,null,null];assert.equal(executeAction(clear,championAttack).success,true);
});
for(const name of ['씨 몬스터','여울의 보디가드','황소할배'])test(`latest administrator keyword flags load without stat overrides: ${name}`,()=>{
 const record=records.find(c=>c.name===name)!;const d=definition(name);assert.equal(d.attack,record.attack);assert.equal(d.health,record.health);assert.deepEqual(d.keywords,record.keywords);
});

test('Cassandra with no eligible other card never grants regeneration to an existing hand card',()=>{
 const s=setup();s.cardPool=[definition('카산드라')];s.minionACardPool=s.cardPool;s.players[0].hand=[generateCardInstance(vanilla,{instanceId:'old-hand'})];const result=play(s,'카산드라');assert.equal(result.players[0].hand.length,1);assert.ok(!result.players[0].hand[0].keywords.includes('REGEN'));
});
test('Cassandra large-hand generation grants regeneration only to the generated card',()=>{
 const s=setup();const tagged={...vanilla,id:'tagged-full',tags:['디 어쏘리티']};s.cardPool=[definition('카산드라'),tagged];s.minionACardPool=s.cardPool;s.players[0].hand=Array.from({length:10},(_,i)=>generateCardInstance(vanilla,{instanceId:'full-'+i}));const result=play(s,'카산드라');assert.ok(result.players[0].hand.find(c=>c.definitionId==='tagged-full')?.keywords.includes('REGEN'));assert.ok(result.players[0].hand.filter(c=>c.instanceId.startsWith('full-')).every(c=>!c.keywords.includes('REGEN')));
});
test('Pandora overkill does not trigger pinfall or buff tagged allies',()=>{
 const s=setup();const tagged=board(s,{...vanilla,id:'pinfall-tagged',tags:['디 어쏘리티']},0,1);const enemy=board(s,{...vanilla,health:2});const result=play(s,'판도라',0,enemy.instanceId);assert.equal(result.players[0].board[0]!.currentAttack,definition('판도라').attack);assert.equal(result.players[0].board[1]!.currentAttack,tagged.currentAttack);assert.equal(result.players[1].board[0]!.currentHealth,1);
});
test('latest bandit recruitment grants 2 attack and Wanted through actual spell use',()=>{
 const s=setup();const ally=board(s,vanilla,0);const d=definition('도적단 모집');s.players[0].hand=[generateCardInstance(d,{instanceId:'recruitment'})];const result=executeAction(s,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'recruitment'});assert.ok(result.success);assert.equal(result.state.players[0].board[0]!.currentAttack,ally.currentAttack+2);assert.ok(result.state.players[0].board[0]!.keywords.includes('WANTED'));assert.equal(result.state.players[0].currentGold,99-d.cost);
});

test('latest bodyguard taunts attackers and remains immune to selected effects',()=>{
 const s=setup();const attacker=board(s,vanilla,0);const guard=board(s,definition('여울의 보디가드'));
 assert.equal(executeAction(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:attacker.instanceId,target:{type:'PLAYER',playerId:'player-2'}}).success,false);
 const effect={type:'STRUCTURED' as const,action:'DESTROY' as const,target:{zone:'BOARD' as const,owner:'ENEMY' as const,selection:'PLAYER_CHOICE' as const,count:1}};
 const blocked=applyEffect(s,'player-1',attacker,effect,[guard.instanceId]);assert.ok(blocked.players[1].board[0]);
 assert.equal(executeAction(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:attacker.instanceId,target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:guard.instanceId}}).success,true);
});
test('latest bull retains armor 1, damage cap 3 and taunt prohibition',()=>{
 const s=setup();const attacker=board(s,vanilla,0);const bull=board(s,definition('황소할배'));const result=executeAction(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:attacker.instanceId,target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:bull.instanceId}});assert.ok(result.success);assert.equal(result.state.players[1].board[0]!.currentHealth,bull.currentHealth-1);
 const damaged=applyEffect(result.state,'player-1',attacker,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:9}},[bull.instanceId]);assert.equal(damaged.players[1].board[0]!.currentHealth,bull.currentHealth-3);
 const taunted=applyEffect(s,'player-2',bull,{type:'STRUCTURED',action:'ADD_KEYWORD',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{keyword:'TAUNT'}});assert.ok(!getActiveCardKeywords(taunted.players[1].board[0]!).includes('TAUNT'));
});

test('Luna acquires persistent armor and regeneration once when allies meet their conditions',()=>{
 const s=setup();let n=play(s,'루나');let luna=n.players[0].board[0]!;const initialArmor=getActiveCardKeywords(luna).includes('ARMOR');
 const ally={...vanilla,id:'authority-ally',tags:['디 어쏘리티']};n.cardPool=[...n.cardPool!,ally];n.players[0].hand=[generateCardInstance(ally,{instanceId:'authority-ally-hand'})];const added=executeAction(n,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'authority-ally-hand',boardSlot:1});assert.ok(added.success);n=added.state;luna=n.players[0].board[0]!;assert.ok(getActiveCardKeywords(luna).includes('ARMOR'));assert.equal(luna.armor,1);
 const removed=applyEffect(n,'player-1',luna,{type:'STRUCTURED',action:'DESTROY',target:{zone:'BOARD',owner:'SELF',selection:'ALL',count:4,filter:{excludeSource:true}}});assert.ok(getActiveCardKeywords(removed.players[0].board[0]!).includes('ARMOR'));
 const jok={...vanilla,id:'named-joker',name:'조킹루이지 테스트',tags:['디 어쏘리티']};removed.cardPool=[...removed.cardPool!,jok];removed.players[0].hand=[generateCardInstance(jok,{instanceId:'joker-hand'})];const withJoker=executeAction(removed,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'joker-hand',boardSlot:1});assert.ok(withJoker.success);assert.ok(getActiveCardKeywords(withJoker.state.players[0].board[0]!).includes('REGEN'));assert.equal(withJoker.state.players[0].board[0]!.armor,1,'repeated matching condition does not stack the once-only grant');
 const final=applyEffect(withJoker.state,'player-1',withJoker.state.players[0].board[0]!,{type:'STRUCTURED',action:'DESTROY',target:{zone:'BOARD',owner:'SELF',selection:'ALL',count:4,filter:{excludeSource:true}}});assert.ok(getActiveCardKeywords(final.players[0].board[0]!).includes('REGEN'));assert.equal(final.players[0].board[0]!.armor,1);
});
test('Luna no longer gains armor every time it takes damage',()=>{
 const s=play(setup(),'루나'),luna=s.players[0].board[0]!;const before=luna.armor;
 const result=applyEffect(s,'player-2',s.players[1].deck[0],{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'ALL',count:4},values:{amount:1}});assert.equal(result.players[0].board[0]!.armor,before);
});
test('Joking Luigi summons public authority wrestlers beside itself, buffs each other entry once and skips summoned entry effects',()=>{
 const s=setup();const candidate={...vanilla,id:'authority-summon',tags:['디 어쏘리티'],abilities:[{trigger:'ENTER_FIELD' as const,effects:[{type:'DAMAGE_OPPONENT_CHAMPION' as const,amount:10}]}]};s.cardPool=[definition('조킹루이지'),candidate,{...candidate,id:'wrong-tag',tags:[]},{...candidate,id:'hidden-authority',status:'DRAFT' as const},{...candidate,id:'token-authority',isToken:true}];s.minionACardPool=s.cardPool;
 // Exclude the source definition only in this fixture's pool so the allowed candidate is deterministic.
 const sourceDef=definition('조킹루이지');s.cardPool=s.cardPool.filter(d=>d.id!==sourceDef.id);const result=play(s,'조킹루이지',1);assert.equal(result.players[0].board[1]!.currentAttack,sourceDef.attack,'source never buffs itself');for(const slot of [0,2]){const c=result.players[0].board[slot]!;assert.equal(c.definitionId,'authority-summon');assert.equal(c.currentAttack,3);assert.equal(c.currentHealth,7);assert.ok(c.keywords.includes('TAUNT'));}assert.equal(result.players[1].health,20);
});
test('Kamisator gains a dodge charge on attack when a friendly authority tag exists',()=>{
 const s=setup();const attacker=board(s,definition('카미사토르'),0);board(s,{...vanilla,id:'authority-witness',tags:['디 어쏘리티']},0,1);const enemy=board(s,{...vanilla,attack:0,health:20});const before=attacker.dodgeCharges??0;
 const result=executeAction(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:attacker.instanceId,target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:enemy.instanceId}});assert.ok(result.success);assert.equal(result.state.players[0].board[0]!.dodgeCharges,before+1);assert.equal(result.state.players[0].hand.length,1);
});
test('Human cooker uses the current friendly field tag condition for its additional feast discount',()=>{
 const s=setup();board(s,{...vanilla,id:'authority-witness-cook',tags:['디 어쏘리티']},0,1);const result=play(s,'휴먼쿠커');const feast=result.players[0].hand.find(c=>c.definitionId==='epic-spell-feast');assert.ok(feast);assert.equal(feast.currentCost,Math.max(0,definition('만찬').cost-2));assert.equal(result.players[0].hand.length,1);
});

test('Briganda buffs immediately from total reserved gold: previous 2 plus 3 Wanted becomes +5/+5',()=>{
 const s=setup();const brig=board(s,definition('도적왕 브리간다'),0);board(s,{...vanilla,id:'wanted-one',keywords:['WANTED']},0,1);board(s,{...vanilla,id:'wanted-two',keywords:['WANTED']},0,2);s.players[0].nextTurnGoldBonus=2;
 const ended=executeAction(s,{type:'END_TURN',playerId:'player-1'});assert.ok(ended.success);assert.equal(ended.state.players[0].nextTurnGoldBonus,5);assert.equal(ended.state.players[0].board[0]!.currentAttack,brig.currentAttack+5);assert.equal(ended.state.players[0].board[0]!.maxHealth,brig.maxHealth+5);
 const started=executeAction(ended.state,{type:'END_TURN',playerId:'player-2'});assert.ok(started.success);assert.equal(started.state.players[0].board[0]!.currentAttack,brig.currentAttack+5,'no duplicate old turn-start buff');
});
test('two Brigandas both gain the intercepted amount while opponent keeps only base turn gold',()=>{
 const s=setup();const first=board(s,definition('도적왕 브리간다'),0),second=board(s,definition('도적왕 브리간다'),0,1);s.players[1].nextTurnGoldBonus=3;const base=Math.min(s.players[1].personalTurn+1,6);
 const ended=executeAction(s,{type:'END_TURN',playerId:'player-1'});assert.ok(ended.success);assert.equal(ended.state.players[1].currentGold,base);assert.equal(ended.state.players[1].turnGoldBonus,0);assert.equal(ended.state.players[1].nextTurnGoldBonus,0);
 // Each own end-turn reservation runs in normal field order before the opponent starts.
 assert.equal(ended.state.players[0].board[0]!.currentAttack,first.currentAttack+2+3);assert.equal(ended.state.players[0].board[1]!.currentAttack,second.currentAttack+4+3);
});
test('silenced Briganda does not cancel opponent bonus or gain stats',()=>{
 const s=setup();const brig=board(s,definition('도적왕 브리간다'),0);s.players[0].board[0]={...brig,isSilenced:true};s.players[1].nextTurnGoldBonus=3;const base=Math.min(s.players[1].personalTurn+1,6);
 const ended=executeAction(s,{type:'END_TURN',playerId:'player-1'});assert.ok(ended.success);assert.equal(ended.state.players[1].currentGold,base+3);assert.equal(ended.state.players[0].board[0]!.currentAttack,brig.currentAttack);
});

test('nested same-source entry buffs do not skip or replay the remaining summon sequence',()=>{
 const s=setup();const candidate={...vanilla,id:'queue-candidate',tags:['디 어쏘리티']};s.cardPool=[candidate];s.minionACardPool=s.cardPool;
 const d=structuredClone(definition('조킹루이지'));d.abilities[0].effects.push({type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{attack:3,health:0}});s.players[0].hand=[generateCardInstance(d,{instanceId:'queue-source'})];
 const played=executeAction(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'queue-source',boardSlot:1});assert.ok(played.success);assert.equal(played.state.players[0].board[1]!.currentAttack,d.attack+3);for(const slot of [0,2]){const c=played.state.players[0].board[slot]!;assert.equal(c.currentAttack,3);assert.ok(c.keywords.includes('TAUNT'));}assert.equal(played.state.targetingState,undefined);
});
test('nested pinfall resolves both buffs before continuing the original manually targeted effect sequence',()=>{
 const s=setup();const ally=board(s,{...vanilla,id:'pinfall-queue-ally',tags:['디 어쏘리티']},0,1);const enemy=board(s,{...vanilla,health:1});const d=structuredClone(definition('판도라'));d.abilities[0].effects.push({type:'STRUCTURED',action:'DRAW',values:{amount:1}});s.players[0].hand=[generateCardInstance(d,{instanceId:'pinfall-source'})];const started=executeAction(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'pinfall-source',boardSlot:0});assert.ok(started.success);const selected=executeAction(started.state,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:enemy.instanceId});assert.ok(selected.success);assert.equal(selected.state.players[0].hand.length,1);assert.equal(selected.state.players[0].deck.length,s.players[0].deck.length-1);assert.equal(selected.state.players[0].board[1]!.currentAttack,ally.currentAttack+1);assert.equal(selected.state.players[0].board[0]!.currentAttack,d.attack+1);assert.equal(selected.state.targetingState,undefined);
});

test('latest Sea Monster discounts only in hand on an actual allied retirement and preserves cost minimum 1',()=>{
 for(const inHand of [true,false]) {
  const s=setup();s.activePlayerId='player-2';const sea=generateCardInstance(definition('씨 몬스터'),{instanceId:'sea'});sea.currentCost=1;
  if(inHand)s.players[0].hand=[sea];else s.players[0].board[1]={...sea,boardSlot:1,enteredThisTurn:false};
  const ally=board(s,{...vanilla,health:1},0);const enemy=board(s,vanilla);const killed=executeAction(s,{type:'ATTACK',playerId:'player-2',attackerInstanceId:enemy.instanceId,target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:ally.instanceId}});assert.ok(killed.success);assert.equal(inHand?killed.state.players[0].hand[0].currentCost:killed.state.players[0].board[1]!.currentCost,1);
 }
 const s=setup();s.activePlayerId='player-2';const sea=generateCardInstance(definition('씨 몬스터'),{instanceId:'sea-discount'});s.players[0].hand=[sea];const ally=board(s,{...vanilla,health:1},0);const enemy=board(s,vanilla);const killed=executeAction(s,{type:'ATTACK',playerId:'player-2',attackerInstanceId:enemy.instanceId,target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:ally.instanceId}});assert.ok(killed.success);assert.equal(killed.state.players[0].hand[0].currentCost,Math.max(1,sea.currentCost-1));
});
