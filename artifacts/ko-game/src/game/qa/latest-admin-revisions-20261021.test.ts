/** Authenticated 2026-10-21 snapshot; engine actions, never production writes. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {cardRecordToDefinition,championRecordToDefinition,createInitialGameState,generateCardInstance,executeAction,applyEffect,resolveTriggeredAbilities,type GameState,type GameAction,type CardDefinition} from '../index';
const records=JSON.parse(readFileSync('docs/qa/snapshots/20261021-admin/cards.json','utf8'));
const champions=JSON.parse(readFileSync('docs/qa/snapshots/20261021-admin/champions.json','utf8')).map(championRecordToDefinition);
const definitions:CardDefinition[]=records.map(cardRecordToDefinition);const def=(name:string)=>{const d=definitions.find(c=>c.name===name);assert.ok(d,name);return d;};
const unit:CardDefinition={id:'oct21-unit',name:'검증 선수',cardType:'WRESTLER',cost:1,attack:1,health:10,rulesText:'',rarity:'NORMAL',isToken:false,isChampionToken:false,keywords:[],abilities:[]};
function setup(championId?:string){const s=createInitialGameState(championId?[championId,championId]:undefined,[...definitions,unit],championId?champions:undefined);s.cardPool=[...definitions,unit];s.minionACardPool=s.cardPool;s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';for(const p of s.players){p.hand=[];p.deck=Array.from({length:8},(_,i)=>generateCardInstance(unit,{instanceId:p.id+'-deck-'+i}));p.board=[null,null,null,null];p.graveyard=[];p.currentGold=20;p.mulliganUsed=true;p.personalTurn=1;}return s;}
function board(s:GameState,player:number,slot:number,d:CardDefinition=unit,id=player+'-'+slot){const card={...generateCardInstance(d,{instanceId:id}),boardSlot:slot as 0,enteredThisTurn:false};s.players[player]!.board[slot as 0]=card;return card;}
function run(s:GameState,a:GameAction){const r=executeAction(s,a);assert.ok(r.success,r.message);return r.state;}
function play(s:GameState,d:CardDefinition,slot:number,id='played'){s.players[0].hand.push(generateCardInstance(d,{instanceId:id}));return run(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:id,boardSlot:slot as 0});}
function target(s:GameState,id:string){assert.ok(s.targetingState?.active);return run(s,{type:s.targetingState.phase==='PRE_COMMIT'?'CONFIRM_PRECOMMIT_TARGET':'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:id});}
test('all 163 current card records preserve actual administrator text/stats and new keyword/armor settings',()=>{
 assert.equal(records.length,163);for(const r of records){const d=definitions.find(c=>c.id===r.id)!;assert.equal(d.rulesText,r.text,r.name);assert.deepEqual([d.cost,d.attack,d.health],[r.cost,r.attack,r.health],r.name);}
 for(const name of ['도적','험악한 도적']){assert.ok(def(name).keywords.includes('RUSH'));assert.ok(!def(name).keywords.includes('SURPRISE'));}
 const dealer=generateCardInstance(def('리온(각성)'),{instanceId:'dealer'});assert.equal(dealer.dodgeCharges,2);assert.equal(def('하늘을 떨구는 자(각성)').health,5);
});
test('Briganda entrance reserves wanted count once; turn end buffs from total reservations without another wanted grant',()=>{
 let s=setup();board(s,0,0,{...unit,keywords:['WANTED']});board(s,0,1,{...unit,keywords:['WANTED']});s.players[0].nextTurnGoldBonus=2;
 s=play(s,def('도적왕 브리간다'),2);const wanted=s.players[0].board.filter(c=>c?.keywords.includes('WANTED')).length;
 assert.equal(s.players[0].nextTurnGoldBonus,2+wanted);const source=s.players[0].board[2]!;
 s=run(s,{type:'END_TURN',playerId:'player-1'});assert.equal(s.players[0].nextTurnGoldBonus,2+wanted);assert.equal(s.players[0].board[2]!.currentAttack,source.currentAttack+2+wanted);
});
test('two Brigandas intercept immediate +3 exactly once, reserve +3 and both buff only at own turn end',()=>{
 let s=setup();const a=board(s,0,0,def('도적왕 브리간다')),b=board(s,0,1,def('도적왕 브리간다'));const source=board(s,1,0);
 s=applyEffect(s,'player-2',source,{type:'GAIN_GOLD',amount:3});assert.equal(s.players[1].currentGold,20);assert.equal(s.players[0].nextTurnGoldBonus,3);assert.equal(s.players[0].board[0]!.currentAttack,a.currentAttack);
 s=run(s,{type:'END_TURN',playerId:'player-1'});assert.equal(s.players[0].board[0]!.currentAttack,a.currentAttack+3);assert.equal(s.players[0].board[1]!.currentAttack,b.currentAttack+3);
});
test('turn-start extra gold is stolen once; base gold remains; silence/removal disables interception',()=>{
 for(const disabled of [false,true]){let s=setup();const briganda=board(s,0,0,def('도적왕 브리간다'));briganda.isSilenced=disabled;s.players[1].nextTurnGoldBonus=3;
 s=run(s,{type:'END_TURN',playerId:'player-1'});assert.equal(s.players[1].currentGold,disabled?5:2);assert.equal(s.players[1].turnGoldBonus,disabled?3:0);assert.equal(s.players[0].nextTurnGoldBonus,disabled?0:3);}
});
test('Yeoul reserves both players at turn end, not immediate or turn start',()=>{
 let s=setup();board(s,0,0,def('여울'));s=run(s,{type:'END_TURN',playerId:'player-1'});assert.equal(s.players[0].nextTurnGoldBonus,1);assert.equal(s.players[1].turnGoldBonus,1);assert.equal(s.players[1].currentGold,3);
 s=run(s,{type:'END_TURN',playerId:'player-2'});assert.equal(s.players[0].turnGoldBonus,1);assert.equal(s.players[0].nextTurnGoldBonus,0);
});
test('Zombies played from hand coexist; effect summons merge into an existing zombie even on a full field',()=>{
 let s=setup();s=play(s,def('좀비'),0,'z1');s=play(s,def('좀비'),1,'z2');assert.equal(s.players[0].board.filter(Boolean).length,2);
 board(s,0,2);board(s,0,3);const source=s.players[0].board[2]!;const events=s.events.length;
 s=applyEffect(s,'player-1',source,{type:'STRUCTURED',action:'SUMMON',values:{definitionRef:{id:def('좀비').id},count:1}});
 assert.equal(s.players[0].board.filter(Boolean).length,4);assert.equal(s.players[0].board[0]!.currentAttack,2);assert.equal(s.players[0].board[1]!.currentAttack,1);assert.equal(s.events.slice(events).filter(e=>e.type==='ENTER_FIELD').length,0);
 const before=s.players[0].board[0]!.currentAttack;const enemy=board(s,1,0,{...unit,health:1});s=applyEffect(s,'player-1',source,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:1}},[enemy.instanceId]);assert.equal(s.players[0].board[0]!.currentAttack,before);
});
test('Belmort base power can target either side and destroys lethal ally; upgraded wording still targets enemies only',()=>{
 const champion=champions.find(c=>c.id==='f7b087d8-3148-43d5-a634-a81d15c81721')!;
 for(const own of [true,false]){let s=setup(champion.id);board(s,0,0,{...unit,health:1},'ally');board(s,1,0,{...unit,health:1},'enemy');
 s=run(s,{type:'USE_CHAMPION_ABILITY',playerId:'player-1'});s=target(s,own?'ally':'enemy');assert.equal(s.players[own?0:1].board[0],null);assert.ok(s.events.some(e=>e.type==='CARD_DESTROYED'&&e.cardInstanceId===(own?'ally':'enemy')));assert.equal(s.players[0].champion!.questProgress,1);}
 const upgrade=champion.upgradedAbility!.effects.find(e=>e.type==='STRUCTURED') as any;assert.equal(upgrade.target.owner,'ENEMY');
});
test('administrator Dodge(2) actually avoids two attacks and permits the third hit',()=>{
 let s=setup();const dealer=board(s,0,0,def('리온(각성)'),'dealer-live');s.activePlayerId='player-2';
 for(let i=0;i<3;i++)board(s,1,i,{...unit,attack:1,health:20},'attacker-'+i);
 for(let i=0;i<3;i++){s=run(s,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'attacker-'+i,target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'dealer-live'}});if(i===2)assert.equal(s.players[0].board[0],null,'third hit retires the 1-HP dealer');else{assert.equal(s.players[0].board[0]!.currentHealth,dealer.currentHealth);assert.equal(s.players[0].board[0]!.dodgeCharges,1-i);}}
});
