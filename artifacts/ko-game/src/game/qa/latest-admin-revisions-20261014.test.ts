import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { cardRecordToDefinition, type PublishedCardRecord } from '../cards/published-cards';
import { reviewedCurrentAdminAbilities } from '../cards/reviewed-admin-content-20261014';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { generateCardInstance } from '../cards/generation';
import { executeAction } from '../actions/engine-actions';
import { applyEffect } from '../effects/effect-engine';
import type { GameState } from '../types/game-state';
import type { CardDefinition } from '../cards/types';
const records: PublishedCardRecord[] = JSON.parse(readFileSync('docs/qa/snapshots/20261014-admin/cards.json', 'utf8'));
const definitions = records.map(cardRecordToDefinition);
const unit: CardDefinition = {id:'reviewed-target',name:'표적',cardType:'WRESTLER',cost:1,attack:5,health:10,rulesText:'',status:'PUBLISHED',isToken:false,isChampionToken:false,keywords:[],abilities:[]};
function setup(name: string, id?:string) {
 const definition = definitions.find(d=>id?d.id===id:d.name===name)!; assert.ok(definition,name);
 const state = createInitialGameState(undefined, [...definitions, unit]);
 if(process.env.KO_QA_TOWER_MODE==='1')state.tower={playerId:'player-1',relics:[]};
 state.status='IN_PROGRESS';state.turn=3;state.activePlayerId='player-1';state.randomSeed=321;
 for(const p of state.players){p.hand=[];p.board=[null,null,null,null];p.currentGold=100;p.health=25;p.maxHealth=25;p.champion!.quest=null;p.deck=[generateCardInstance(unit,{instanceId:p.id+'-draw'})];}
 state.players[0].board[1]={...generateCardInstance(unit,{instanceId:'ally'}),boardSlot:1,enteredThisTurn:false};
 state.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),boardSlot:0,enteredThisTurn:false};
 state.players[0].hand=[generateCardInstance(definition,{instanceId:'source'})];
 return {state,definition};
}
function settle(state:GameState, preferred='enemy') {
 for(let i=0;state.targetingState?.active;i++) {
  assert.ok(i<20,'finite target resolution');const pending=state.targetingState;
  const id=pending.validTargetIds.includes(preferred)?preferred:pending.validTargetIds.find(id=>!pending.selectedTargetIds.includes(id));assert.ok(id,'target exists');
  const result=executeAction(JSON.parse(JSON.stringify(state)),{type:pending.phase==='PRE_COMMIT'?'CONFIRM_PRECOMMIT_TARGET':'SELECT_EFFECT_TARGET',playerId:pending.playerId,targetId:id});assert.ok(result.success);state=result.state;
 }
 return state;
}
function play(state:GameState, preferred='enemy') {
 const result=executeAction(state,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'source',boardSlot:0});assert.ok(result.success,JSON.stringify(result));return settle(result.state,preferred);
}
function end(state:GameState) {const result=executeAction(state,{type:'END_TURN',playerId:state.activePlayerId!});assert.ok(result.success);return settle(result.state);}
const source=(state:GameState)=>state.players[0].board.find(c=>c?.instanceId==='source')!;
const ally=(state:GameState)=>state.players[0].board.find(c=>c?.instanceId==='ally')!;
for(const [name,attack,health] of [['대장장이',1,0],['약초꾼',0,2],['미숙한 연금술사',1,1]] as const) {
 test(`current ${name}: actual hand play, exact ally buff and unrelated enemy preserved`,()=>{const {state}=setup(name);if(name==='미숙한 연금술사')state.players[0].board[1]=null;const n=play(state,'ally');const target=name==='미숙한 연금술사'?source(n):ally(n);const base=name==='미숙한 연금술사'?definitions.find(d=>d.name===name)!:unit;assert.deepEqual([target.currentAttack,target.maxHealth],[base.attack+attack,base.health+health]);assert.equal(n.players[1].board[0]!.currentAttack,5);});
}
test('current MPG steals no extra: enemy -2, source +3 after actual play',()=>{const {state,definition}=setup('MPG');const n=play(state);assert.equal(n.players[1].board[0]!.currentAttack,3);assert.equal(source(n).currentAttack,definition.attack+3);});
for(const [name,damage,bonus] of [['광기의 헌혈 조무사',3,1],['배은망덕한 용병',2,0],['고통 연주자',2,0]] as const) test(`current ${name}: own champion damage ${damage}, next-turn bonus ${bonus}`,()=>{let {state}=setup(name);state.players[0].board[1]=null;state=play(state);if(name==='고통 연주자')state=end(state);assert.equal(state.players[0].health,25-damage);assert.equal(state.players[1].health,25);if(bonus)assert.equal(state.players[0].nextTurnGoldBonus,bonus);});
test('effect-summoned Ninja never retriggers entry; one child even with empty slots',()=>{const {state}=setup('닌자');state.players[0].board[1]=null;const n=play(state);assert.equal(n.players[0].board.filter(Boolean).length,2);assert.equal(n.events.filter(e=>e.type==='ENTER_FIELD').length,2);assert.equal(n.targetingState?.active??false,false);});
test('effect-summoned Ninja with full field does not overfill or block the turn',()=>{const {state}=setup('닌자');state.players[0].board[2]={...generateCardInstance(unit,{instanceId:'two'}),boardSlot:2};state.players[0].board[3]={...generateCardInstance(unit,{instanceId:'three'}),boardSlot:3};const n=play(state);assert.equal(n.players[0].board.filter(Boolean).length,4);assert.equal(end(n).activePlayerId,'player-2');});
test('current Scout damages only opposing champion',()=>{const {state}=setup('숲의 정찰병');const n=play(state);assert.equal(n.players[1].health,24);assert.equal(n.players[0].health,25);});
for(const [name,action,maxCost] of [['묘지 도굴꾼','hand',3],['초보 네크로멘서','board',1],['수녀원장','deck',6]] as const) test(`current ${name} moves the actual selected grave wrestler to ${action}`,()=>{const {state}=setup(name);state.players[0].graveyard=[{...generateCardInstance({...unit,cost:maxCost},{instanceId:'grave'}),boardSlot:null}];const n=play(state);assert.equal(n.players[0].graveyard.length,0);assert.ok((action==='board'?n.players[0].board:action==='hand'?n.players[0].hand:n.players[0].deck).some(c=>c?.instanceId==='grave'));});
test('current Necromancer cannot revive cost-two and continues normally without a target',()=>{const {state}=setup('초보 네크로멘서');state.players[0].graveyard=[generateCardInstance({...unit,cost:2},{instanceId:'grave'})];const n=play(state);assert.equal(n.players[0].graveyard.length,1);assert.equal(n.players[0].board.filter(Boolean).length,2);assert.equal(end(n).activePlayerId,'player-2');});
test('current Fireworks distributes exactly three real damage points without a target loop',()=>{const {state}=setup('폭죽광');const n=play(state);assert.equal(n.players[1].board[0]!.currentHealth,7);assert.equal(n.players[1].health,25);});
test('current Mushrooms lower all enemy attack on actual end-turn, never allied attack',()=>{const {state}=setup('독버섯 채집꾼');const n=end(play(state));assert.equal(n.players[1].board[0]!.currentAttack,4);assert.equal(ally(n).currentAttack,5);});
test('current Druid increases allied current and maximum health on actual end-turn',()=>{const {state}=setup('드루이드');const n=end(play(state));assert.deepEqual([ally(n).currentHealth,ally(n).maxHealth],[11,11]);assert.equal(n.players[1].board[0]!.currentHealth,10);});
test('current Rube only buffs itself +2/+2 and gains Taunt while alone',()=>{const {state,definition}=setup('루브');state.players[0].board[1]=null;const n=end(play(state));assert.equal(source(n).currentAttack,definition.attack+2);assert.equal(source(n).maxHealth,definition.health+2);assert.ok(source(n).keywords.includes('TAUNT'));const notAlone=setup('루브');assert.equal(source(end(play(notAlone.state))).currentAttack,notAlone.definition.attack);});
test('current Boastful Mercenary counts its own field, including itself, at entry',()=>{const {state,definition}=setup('허풍쟁이 용병');const n=play(state);assert.equal(source(n).currentAttack,definition.attack+2);});
for(const [name,stat] of [['만드릴쿤','ATTACK'],['프랑켄슈타인 만드릴쿤','HEALTH']] as const) test(`current ${name}: one +2 bonus for real ${stat} increase, no self-recursion`,()=>{const {state}=setup(name);let n=play(state);const before=source(n);n=applyEffect(n,'player-1',before,{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:stat==='ATTACK'?{attack:1,health:0}:{attack:0,health:1}});assert.equal(stat==='ATTACK'?source(n).currentAttack:source(n).maxHealth,(stat==='ATTACK'?before.currentAttack:before.maxHealth)+3);});
test('current Frankenstein health gain works in hand but never deck',()=>{const {state,definition}=setup('프랑켄슈타인 만드릴쿤');state.players[0].hand=[generateCardInstance(definition,{instanceId:'hand'})];state.players[0].deck=[generateCardInstance(definition,{instanceId:'deck'})];const n=applyEffect(state,'player-1',state.players[0].hand[0]!,{type:'STRUCTURED',action:'BUFF',target:{zones:['HAND','DECK'],owner:'SELF',selection:'ALL',count:20},values:{attack:0,health:1}});assert.equal(n.players[0].hand[0]!.maxHealth,definition.health+3);assert.equal(n.players[0].deck[0]!.maxHealth,definition.health+1);});
test('future unreviewed text or authored DSL never inherits current literal bindings',()=>{const record=records.find(c=>c.name==='MPG')!;assert.equal(reviewedCurrentAdminAbilities({...record,text:'새 효과'}),null);assert.equal(reviewedCurrentAdminAbilities({...record,effectId:'SCRIPT_V1'}),null);});
for(const attack of [0,1,5]) test(`current Thief steals only available attack from ${attack}`,()=>{const {state,definition}=setup('도둑');state.players[1].board[0]!.currentAttack=attack;const n=play(state);assert.equal(n.players[1].board[0]!.currentAttack,Math.max(0,attack-1));assert.equal(source(n).currentAttack,definition.attack+Math.min(1,attack));});
for(const direction of ['ATTACK','DEFEND'] as const) test(`current Nebrah ${direction}: opponent five becomes two, granted ally gains three before damage`,()=>{const {state}=setup('네브라, 어둠의 천사');state.players[0].board[1]!.currentHealth=30;state.players[0].board[1]!.maxHealth=30;state.players[1].board[0]!.currentHealth=30;state.players[1].board[0]!.maxHealth=30;let n=play(state,'ally');n=end(end(n));if(direction==='DEFEND')n=end(n);const result=executeAction(n,{type:'ATTACK',playerId:direction==='ATTACK'?'player-1':'player-2',attackerInstanceId:direction==='ATTACK'?'ally':'enemy',target:{type:'WRESTLER',playerId:direction==='ATTACK'?'player-2':'player-1',cardInstanceId:direction==='ATTACK'?'enemy':'ally'}});assert.ok(result.success);n=settle(result.state);assert.equal(n.players[1].board[0]!.currentAttack,2);assert.equal(ally(n).currentAttack,8);});
for(const attack of [0,1,2]) test(`current Arbiter strictly checks enemy attack ${attack} against its live attack two`,()=>{const {state}=setup('아비터');state.players[0].hand[0]!.currentAttack=2;state.players[1].board[0]!.currentAttack=attack;const n=play(state);assert.equal(n.players[1].board[0]!.isSilenced??false,attack<2);assert.equal(n.targetingState?.active??false,false);});
for(const name of ['길드 접수원','사막 행상인']) test(`current ${name}: creation pool is published ordinary cards only`,()=>{const {state,definition}=setup(name);state.cardPool=[{...unit,id:'public'}, {...unit,id:'draft',status:'DRAFT'}, {...unit,id:'token',isToken:true}, {...unit,id:'champ-token',isToken:true,isChampionToken:true},definition];const n=play(state);assert.equal(n.players[0].hand.length,1);assert.equal(n.players[0].hand[0]!.definitionId,'public');});
test('current Desert Merchant does not generate at four remaining hand cards',()=>{const {state}=setup('사막 행상인');state.players[0].hand.push(...Array.from({length:4},(_,i)=>generateCardInstance(unit,{instanceId:'extra-'+i})));const n=play(state);assert.equal(n.players[0].hand.length,4);});
test('current Innkeeper moves the selected hand card and performs exactly one draw',()=>{const {state}=setup('여관 주인');state.players[0].hand.push(generateCardInstance(unit,{instanceId:'returned'}));const n=play(state,'returned');assert.equal(n.players[0].hand.length,1);assert.equal(n.events.filter(e=>e.type==='CARD_DRAWN').length,1);assert.equal(n.players[0].deck.length,1);});
test('current Little Devil chooses own champion, deals one and buffs its actual field body +1/+1',()=>{const {state,definition}=setup('작고 조그마한 악마');const n=play(state,'player-1');assert.equal(n.players[0].health,24);assert.equal(source(n).currentAttack,definition.attack+1);assert.equal(source(n).maxHealth,definition.health+1);});
test('current Sleepy Barbarian removes cannot-attack and gains four attack on its next countdown',()=>{const {state,definition}=setup('잠많은 야만 전사');let n=play(state);assert.ok(source(n).keywords.includes('CANNOT_ATTACK'));n=end(end(n));assert.equal(source(n).currentAttack,definition.attack+4);assert.equal(source(n).keywords.includes('CANNOT_ATTACK'),false);});
test('current innocent child retires into the actual administrator Rabbit Knight without entry recursion',()=>{const {state}=setup('순진하고 무고한 어린아이');const n=play(state);const r=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});assert.equal(r.players[0].board[0]?.definitionId,definitions.find(c=>c.name==='토끼 기사')!.id);});
for(const [name,attack,health] of [['초보 검투사',1,0],['데헌',1,1],['리온',2,0]] as const) test(`current ${name}: actual opponent retirement yields exact ${attack}/${health} bonus`,()=>{const {state}=setup(name);state.players[1].board[0]!.currentHealth=1;state.players[1].board[0]!.currentAttack=0;let n=end(end(play(state)));const before=source(n);const result=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});assert.ok(result.success);n=settle(result.state);assert.equal(source(n).currentAttack,before.currentAttack+attack);assert.equal(source(n).maxHealth,before.maxHealth+health);assert.equal(n.players[1].board[0],null);});
test('current Flame Sorcerer deals one total point to an enemy field card or champion on end-turn',()=>{const {state}=setup('화염술사');const n=end(play(state));assert.equal(n.players[1].health+n.players[1].board[0]!.currentHealth,34);assert.equal(n.players[0].health,25);});
test('current Cook creates actual Feast with one cost reduction and preserves its definition',()=>{const {state}=setup('휴먼쿠커');const n=play(state);const feast=definitions.find(d=>d.name==='만찬')!;assert.equal(n.players[0].hand[0]!.definitionId,feast.id);assert.equal(n.players[0].hand[0]!.currentCost,Math.max(0,feast.cost-1));});
test('actual attack debuff stops at zero and cannot heal a champion above maximum health',()=>{const {state}=setup('도둑');state.players[1].board[0]!.currentAttack=0;let n=end(end(play(state)));n=applyEffect(n,'player-2',n.players[1].board[0]!,{type:'STRUCTURED',action:'MODIFY_STAT',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{stat:'ATTACK',amount:-3}},['source']);assert.equal(source(n).currentAttack,0);const result=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'PLAYER',playerId:'player-2'}});assert.ok(result.success);assert.equal(result.state.players[1].health,n.players[1].health);assert.ok(result.state.events.filter(e=>e.type==='DAMAGE_DEALT').every(e=>(e.amount??0)>=0));});

test('Mandang copies live odd stats with ceilings into one random adjacent slot, deterministically without entry recursion',()=>{
 const seen=new Set<number>();
 for(let seed=1;seed<=24;seed++){
  const {state,definition}=setup('만당');state.randomSeed=seed;state.players[0].board=[null,null,null,null];
  state.players[0].hand[0]!.currentAttack=3;state.players[0].hand[0]!.currentHealth=5;state.players[0].hand[0]!.maxHealth=7;
  const input=JSON.parse(JSON.stringify(state));
  const result=executeAction(state,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'source',boardSlot:1});assert.ok(result.success);
  const replay=executeAction(input,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'source',boardSlot:1});assert.deepEqual(JSON.parse(JSON.stringify(result.state)),JSON.parse(JSON.stringify(replay.state)));
  const cards=result.state.players[0].board.filter(c=>c?.instanceId!=='source'&&c!==null);assert.equal(cards.length,1);
  const copy=cards[0]!;assert.equal(copy.definitionId,definition.id);assert.deepEqual([copy.currentAttack,copy.currentHealth,copy.maxHealth],[2,3,3]);assert.ok([0,2].includes(copy.boardSlot!));seen.add(copy.boardSlot!);
  assert.equal(result.state.players[0].board[1]!.currentAttack,3);assert.equal(result.state.players[0].board[1]!.currentHealth,5);assert.equal(result.state.targetingState?.active??false,false);
 }
 assert.deepEqual([...seen].sort(),[0,2]);
});
for(const blocked of [[0],[0,2]] as const)test(`Mandang respects occupied adjacent slots ${blocked}`,()=>{
 const {state}=setup('만당');state.players[0].board=[null,null,null,null];for(const slot of blocked)state.players[0].board[slot]={...generateCardInstance(unit,{instanceId:'block-'+slot}),boardSlot:slot};
 const result=executeAction(state,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'source',boardSlot:1});assert.ok(result.success);assert.equal(result.state.players[0].board.filter(Boolean).length,blocked.length===1?3:3);if(blocked.length===1)assert.equal(result.state.players[0].board[2]!.definitionId,state.players[0].hand[0]!.definitionId);assert.equal(end(result.state).activePlayerId,'player-2');
});
test('Bodva summons one randomly selected existing opponent-hand wrestler, including private tokens; no entry effect or payment',()=>{
 const selected=new Set<string>();
 for(let seed=1;seed<=24;seed++){
  const {state}=setup('보드바');state.randomSeed=seed;const ninja=definitions.find(d=>d.name==='닌자')!;
  state.players[1].hand=[generateCardInstance({...ninja,status:'DRAFT',isToken:true},{instanceId:'private-token'}),generateCardInstance(unit,{instanceId:'ordinary'}),generateCardInstance({...unit,cardType:'TECHNIQUE'},{instanceId:'spell'})];
  const gold=state.players[1].currentGold;const input=JSON.parse(JSON.stringify(state));const n=play(state);assert.deepEqual(JSON.parse(JSON.stringify(n)),JSON.parse(JSON.stringify(play(input))));
  const summoned=n.players[1].board.filter(c=>c&&c.instanceId!=='enemy');assert.equal(summoned.length,1);selected.add(summoned[0]!.instanceId);assert.equal(n.players[1].hand.length,2);assert.ok(n.players[1].hand.some(c=>c.instanceId==='spell'));assert.equal(n.players[1].currentGold,gold);assert.equal(n.players[0].board.filter(Boolean).length,2);assert.equal(n.targetingState?.active??false,false);
 }
 assert.deepEqual([...selected].sort(),['ordinary','private-token']);
});
for(const full of [false,true])test(`Bodva handles ${full?'full enemy field':'no wrestler in enemy hand'} without consuming cards or blocking`,()=>{
 const {state}=setup('보드바');state.players[1].hand=[generateCardInstance({...unit,cardType:full?'WRESTLER':'TECHNIQUE'},{instanceId:'kept'})];if(full)for(let slot=1;slot<4;slot++)state.players[1].board[slot]={...generateCardInstance(unit,{instanceId:'enemy-'+slot}),boardSlot:slot as 0|1|2|3};const n=play(state);assert.equal(n.players[1].hand[0]!.instanceId,'kept');assert.equal(n.players[1].board.filter(Boolean).length,full?4:1);assert.equal(end(n).activePlayerId,'player-2');
});

test('Mad Pumpkin returns the chosen allied wrestler without the historical discount or entry loop',()=>{
 const {state}=setup('매드 펌킨');const returned={...unit,id:'cost-three',cost:3};state.cardPool!.push(returned);state.players[0].board[1]={...generateCardInstance(returned,{instanceId:'ally'}),boardSlot:1};const n=play(state,'ally');assert.equal(n.players[0].board[1],null);assert.equal(n.players[0].hand[0]!.instanceId,'ally');assert.equal(n.players[0].hand[0]!.currentCost,3);assert.equal(n.players[1].board[0]!.instanceId,'enemy');
});
for(const attack of [0,5])test(`Milk Maid reduces direct attacker ${attack} before combat, but never unrelated effect sources`,()=>{
 const {state}=setup('밀크 메이드');state.players[0].hand[0]!.currentHealth=20;state.players[0].hand[0]!.maxHealth=20;let n=end(play(state));n.players[1].board[0]!.currentAttack=attack;const result=executeAction(n,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'source'}});assert.ok(result.success);assert.equal(result.state.players[1].board[0]!.currentAttack,Math.max(0,attack-1));assert.equal(source(result.state).currentHealth,20-Math.max(0,attack-1));
 const untouched=play(setup('밀크 메이드').state);const damaged=applyEffect(untouched,'player-2',untouched.players[1].board[0]!,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:1}},['source']);assert.equal(damaged.players[1].board[0]!.currentAttack,5);
});
for(const damage of [0,1,2])test(`Luna gains one cumulative armor per actual effect hit (${damage}), not per point or zero hit`,()=>{
 const {state}=setup('루나');state.players[0].hand[0]!.currentHealth=20;state.players[0].hand[0]!.maxHealth=20;const n=play(state);
 const effect={type:'STRUCTURED' as const,action:'DAMAGE' as const,target:{zone:'BOARD' as const,owner:'ENEMY' as const,selection:'PLAYER_CHOICE' as const,count:1},values:{amount:damage}};
 const first=applyEffect(n,'player-2',n.players[1].board[0]!,effect,['source']);assert.equal(source(first).currentHealth,20-damage);assert.equal(source(first).keywords.includes('ARMOR'),damage>0);assert.equal(source(first).armor,1);
 const second=applyEffect(first,'player-2',first.players[1].board[0]!,effect,['source']);assert.equal(source(second).currentHealth,20-2*damage);assert.equal(source(second).armor,damage>0?2:1);
 if(damage>0){let combat=end(second);combat.players[1].board[0]!.currentAttack=2;const result=executeAction(combat,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'source'}});assert.ok(result.success);assert.equal(source(result.state).currentHealth,20-2*damage);assert.equal(source(result.state).armor,2);}
});
for(const ownTurn of [true,false])test(`Raven retirement ${ownTurn?'on own turn goes to deck':'on enemy turn stays retired'}`,()=>{
 const {state}=setup('레이븐');let n=play(state);if(!ownTurn)n=end(n);n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});assert.equal(n.players[0].board[0],null);assert.equal(n.players[0].deck.some(c=>c.instanceId==='source'),ownTurn);assert.equal(n.players[0].graveyard.some(c=>c.instanceId==='source'),!ownTurn);
});
test('Red Range pinfall after exactly retiring its attacked opponent returns itself and schedules next-turn gold',()=>{
 const {state}=setup('레드 렌지');let n=end(end(play(state)));n.players[1].board[0]!.currentHealth=source(n).currentAttack;n.players[1].board[0]!.currentAttack=0;
 const result=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});assert.ok(result.success);const after=result.state;assert.equal(after.players[0].board[0],null);assert.ok(after.players[0].hand.some(c=>c.instanceId==='source'));assert.equal(after.players[0].nextTurnGoldBonus,1);assert.equal(after.players[0].graveyard.some(c=>c.instanceId==='source'),false);assert.ok(after.players[1].graveyard.some(c=>c.instanceId==='enemy'));
});
test('Question buffs cost at most one in hand, deck and board, granting Surprise and excluding graveyard/cost two',()=>{
 const {state}=setup('퀘스쳔');state.players[0].hand.push(generateCardInstance({...unit,cost:1},{instanceId:'low-hand'}));state.players[0].deck=[generateCardInstance({...unit,cost:1},{instanceId:'low-deck'}),generateCardInstance({...unit,cost:2},{instanceId:'high'})];state.players[0].graveyard=[generateCardInstance({...unit,cost:1},{instanceId:'grave'})];const n=play(state);for(const c of [ally(n),n.players[0].hand[0]!,n.players[0].deck[0]!]){assert.equal(c.currentAttack,6);assert.equal(c.maxHealth,11);assert.ok(c.keywords.includes('SURPRISE'));}for(const c of [n.players[0].deck[1]!,n.players[0].graveyard[0]!]){assert.equal(c.currentAttack,5);assert.equal(c.keywords.includes('SURPRISE'),false);}
});
test('King Marble generation excludes itself, private cards, tokens and wrong tags, discounting actual selected card by one',()=>{
 const {state,definition}=setup('킹구슬 마스터');state.cardPool=[definition,{...unit,id:'eligible',cost:2,tags:['구슬마스터']},{...unit,id:'private',status:'DRAFT',tags:['구슬마스터']},{...unit,id:'token',isToken:true,tags:['구슬마스터']},unit];const n=play(state);assert.equal(n.players[0].hand.length,1);assert.equal(n.players[0].hand[0]!.definitionId,'eligible');assert.equal(n.players[0].hand[0]!.currentCost,1);
});

test('Hasiy earns one new dodge charge per personally retired opponent, rather than for unrelated retirements',()=>{
 const {state}=setup('하스이');let n=end(end(play(state)));n.players[1].board[0]!.currentHealth=1;n.players[1].board[0]!.currentAttack=0;const before=source(n).dodgeCharges??0;const result=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});assert.ok(result.success);assert.equal(source(result.state).dodgeCharges,before+1);assert.ok(source(result.state).keywords.includes('DODGE'));
});
for(const damage of [0,1,3])test(`Bellona reflects one real point on actual damage event ${damage}, not one per point`,()=>{
 const {state}=setup('벨로나');state.players[0].hand[0]!.currentHealth=20;state.players[0].hand[0]!.maxHealth=20;const n=play(state);const after=applyEffect(n,'player-2',n.players[1].board[0]!,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:damage}},['source']);assert.equal(after.players[1].board[0]!.currentHealth,damage>0?9:10);assert.equal(source(after).currentHealth,20-damage);
});
for(const own of [true,false])test(`Gravekeeper buffs only other allies after ${own?'allied':'enemy'} retirement, not itself`,()=>{
 const {state,definition}=setup('묘지지기');const n=play(state);const target=own?'ally':'enemy';const after=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:own?'SELF':'ENEMY',selection:'PLAYER_CHOICE',count:1}},[target]);assert.equal(source(after).currentAttack,definition.attack);assert.equal(source(after).maxHealth,definition.health);
 if(!own)assert.equal(ally(after).currentAttack,5);
});
test('Gravekeeper grants surviving other allied wrestlers +1/+1 once per retirement and stops after silencing',()=>{
 const {state}=setup('묘지지기');let n=play(state);n.players[0].board[2]={...generateCardInstance(unit,{instanceId:'other'}),boardSlot:2};const kill=()=>{n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1}},['other']);};kill();assert.equal(ally(n).currentAttack,6);assert.equal(ally(n).maxHealth,11);n.players[0].board[2]={...generateCardInstance(unit,{instanceId:'other'}),boardSlot:2};n.players[0].board[0]!.isSilenced=true;kill();assert.equal(ally(n).currentAttack,6);
});
for(const summon of [true,false])test(`Helbbug damages the actual enemy ${summon?'effect-summoned':'normally played'} wrestler once, while preserving allies`,()=>{
 const {state}=setup('헬뻑');let n=play(state);n=end(n);const entry={...unit,id:'new-enemy',health:10};n.cardPool!.push(entry);
 if(summon)n=applyEffect(n,'player-2',n.players[1].board[0]!,{type:'STRUCTURED',action:'SUMMON',values:{definitionRef:{id:entry.id},count:1}});
 else{n.players[1].hand=[generateCardInstance(entry,{instanceId:'played-enemy'})];const result=executeAction(n,{type:'PLAY_WRESTLER',playerId:'player-2',cardInstanceId:'played-enemy',boardSlot:1});assert.ok(result.success);n=result.state;}
 assert.equal(n.players[1].board[1]!.currentHealth,9);assert.equal(n.players[1].board[0]!.currentHealth,10);assert.equal(ally(n).currentHealth,10);assert.equal(n.events.filter(e=>e.type==='DAMAGE_DEALT'&&e.source?.type==='CARD'&&e.source.cardInstanceId==='source').length,1);
});
test('Ruina generates from the ordinary tagged catalog then counts only actual tagged field/hand cards for +1/+1',()=>{
 const {state,definition}=setup('루이나');const tagged={...unit,id:'tagged',tags:['디 어쏘리티']};state.cardPool=[definition,tagged];state.players[0].board[1]={...generateCardInstance(tagged,{instanceId:'ally'}),boardSlot:1};state.players[0].hand.push(generateCardInstance(tagged,{instanceId:'tagged-hand'}));state.players[0].deck=[generateCardInstance(tagged,{instanceId:'tagged-deck'})];const n=play(state);assert.equal(n.players[0].hand.length,2);const count=[...n.players[0].hand,...n.players[0].board.filter(c=>c!==null)].filter(c=>c.tags?.includes('디 어쏘리티')).length;assert.equal(source(n).currentAttack,definition.attack+count);assert.equal(source(n).maxHealth,definition.health+count);assert.equal(source(n).keywords.includes('LIFESTEAL'),definition.keywords.includes('LIFESTEAL'));
});

for(const name of ['고통 수집가','광신도'])for(const target of ['ally','player-1','enemy','player-2'])test(`${name} responds once to actual damage at ${target}, with correct allied champion/wrestler scope`,()=>{
 const {state,definition}=setup(name);let n=play(state);const targetOwner=target==='ally'||target==='player-1'?'SELF':'ENEMY';const playerTarget=target.startsWith('player-');const effect={type:'STRUCTURED' as const,action:'DAMAGE' as const,target:{zone:playerTarget?'PLAYER' as const:'BOARD' as const,owner:targetOwner as 'SELF'|'ENEMY',selection:playerTarget?'SELF' as const:'PLAYER_CHOICE' as const,count:1},values:{amount:1}};
 n=applyEffect(n,'player-1',source(n),effect,playerTarget?undefined:[target]);const expected=name==='광신도'?target==='player-1':target==='ally'||target==='player-1';assert.equal(source(n).currentAttack,definition.attack+(expected?1:0));assert.equal(source(n).maxHealth,definition.health+(name==='광신도'&&expected?1:0));
});
for(const name of ['고통 수집가','광신도'])test(`${name} ignores zero damage, and silencing disables the aura`,()=>{
 const {state,definition}=setup(name);let n=play(state);const effect={type:'STRUCTURED' as const,action:'DAMAGE' as const,target:{zone:'PLAYER' as const,owner:'SELF' as const,selection:'SELF' as const,count:1},values:{amount:0}};n=applyEffect(n,'player-1',source(n),effect);assert.equal(source(n).currentAttack,definition.attack);source(n).isSilenced=true;n=applyEffect(n,'player-1',source(n),{...effect,values:{amount:1}});assert.equal(source(n).currentAttack,definition.attack);
});
test('Pain Collector sees allied attacker taking real counterattack damage once on the actual combat path',()=>{
 const {state,definition}=setup('고통 수집가');let n=end(end(play(state)));n.players[1].board[0]!.currentHealth=30;const result=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'ally',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});assert.ok(result.success);assert.equal(source(result.state).currentAttack,definition.attack+1);
});

test('Town Guard has temporary +2 current/max health only during opponent turn and never stacks across turns',()=>{
 const {state,definition}=setup('마을 경비병');let n=play(state);assert.equal(source(n).maxHealth,definition.health);for(let i=0;i<2;i++){n=end(n);assert.equal(source(n).currentHealth,definition.health+2);assert.equal(source(n).maxHealth,definition.health+2);n=end(n);assert.equal(source(n).currentHealth,definition.health);assert.equal(source(n).maxHealth,definition.health);}
});
test('Town Guard loses temporary health at opponent end and retires normally when its remaining health reaches zero',()=>{
 const {state}=setup('마을 경비병');let n=end(play(state));const damage=source(n).currentHealth-1;n=applyEffect(n,'player-2',n.players[1].board[0]!,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:damage}},['source']);assert.equal(source(n).currentHealth,1);n=end(n);assert.equal(n.players[0].board[0],null);assert.ok(n.players[0].graveyard.some(c=>c.instanceId==='source'));
});
test('Town Guard effect-summoned on opponent turn immediately gets temporary +2 without firing an entry effect',()=>{
 const {state,definition}=setup('마을 경비병');state.players[0].hand=[];let n=end(state);n=applyEffect(n,'player-1',ally(n),{type:'STRUCTURED',action:'SUMMON',values:{definitionRef:{id:definition.id},count:1}});const card=n.players[0].board.find(c=>c?.definitionId===definition.id)!;assert.equal(card.currentHealth,definition.health+2);assert.equal(card.maxHealth,definition.health+2);n=end(n);assert.equal(n.players[0].board.find(c=>c?.instanceId===card.instanceId)!.currentHealth,definition.health);
});
test('Cleanup randomly discounts one actual Milk Maid or Kamisator in hand, excluding other cards, and ignores zero hits',()=>{
 const {state}=setup('뒷정리맨');state.players[0].hand[0]!.currentHealth=20;state.players[0].hand[0]!.maxHealth=20;let n=play(state);const milk=definitions.find(c=>c.name==='밀크 메이드')!,kami=definitions.find(c=>c.name==='카미사토르')!;n.players[0].hand=[generateCardInstance(milk,{instanceId:'milk'}),generateCardInstance(kami,{instanceId:'kami'}),generateCardInstance(unit,{instanceId:'other'})];const initial=n.players[0].hand.map(c=>c.currentCost);const hit=(amount:number)=>{n=applyEffect(n,'player-2',n.players[1].board[0]!,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount}},['source']);};hit(0);assert.deepEqual(n.players[0].hand.map(c=>c.currentCost),initial);hit(1);assert.equal(n.players[0].hand[2]!.currentCost,initial[2]);assert.equal(initial[0]!+initial[1]!-(n.players[0].hand[0]!.currentCost+n.players[0].hand[1]!.currentCost),1);
});

for(const name of ['고통 수집가','광신도'])test(`${name} also sees actual owner fatigue damage exactly once`,()=>{
 const {state,definition}=setup(name);let n=play(state);n.players[0].deck=[];n=end(end(n));assert.equal(n.players[0].fatigueCount,1);assert.equal(source(n).currentAttack,definition.attack+1);
});
test('Bull Grandpa takes at most three actual total damage per turn from effects and combat, resetting next turn',()=>{
 const {state}=setup('황소할배');state.players[0].hand[0]!.currentHealth=20;state.players[0].hand[0]!.maxHealth=20;let n=play(state);const hit=(amount:number)=>{n=applyEffect(n,'player-2',n.players[1].board[0]!,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'ALL',count:4},values:{amount}},['source']);};hit(1);hit(10);hit(10);assert.equal(source(n).currentHealth,17);assert.deepEqual(n.events.filter(e=>e.type==='DAMAGE_DEALT'&&e.target?.type==='CARD'&&e.target.cardInstanceId==='source').map(e=>e.amount),[1,2,0]);n=end(n);const attacked=executeAction(n,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'source'}});assert.ok(attacked.success);n=attacked.state;assert.equal(source(n).currentHealth,14);hit(10);assert.equal(source(n).currentHealth,14);
});
test('Bull Grandpa rejects granted Taunt and loses its damage limit while silenced',()=>{
 const {state}=setup('황소할배');state.players[0].hand[0]!.currentHealth=20;state.players[0].hand[0]!.maxHealth=20;let n=play(state);n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'ADD_KEYWORD',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{keyword:'TAUNT'}});assert.equal(source(n).keywords.includes('TAUNT'),false);source(n).isSilenced=true;n=applyEffect(n,'player-2',n.players[1].board[0]!,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:5}},['source']);assert.equal(source(n).currentHealth,15);
});

test('Arcana Joker actually returning from field to own hand deals exactly five random split points; no retirement or target loop',()=>{
 const {state}=setup('아르카나 조커');const n=play(state);const after=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'MOVE_TO_HAND',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});assert.equal(after.players[0].board[0],null);assert.ok(after.players[0].hand.some(c=>c.instanceId==='source'));assert.equal(after.players[1].board[0]!.currentHealth,5);assert.equal(after.events.filter(e=>e.type==='DAMAGE_DEALT'&&e.source?.type==='CARD'&&e.source.cardInstanceId==='source').length,5);
});
test('Arcana Joker has no reflection upon retirement, grave recovery or return with no enemies',()=>{
 for(const kind of ['RETIRE','GRAVE','EMPTY'] as const){const {state}=setup('아르카나 조커');let n=play(state);if(kind==='EMPTY')n.players[1].board=[null,null,null,null];if(kind==='GRAVE'){n.players[0].graveyard=[source(n)];n.players[0].board[0]=null;}n=applyEffect(n,'player-1',kind==='GRAVE'?n.players[0].graveyard[0]!:source(n),{type:'STRUCTURED',action:kind==='RETIRE'?'RETIRE':'MOVE_TO_HAND',target:{zone:kind==='GRAVE'?'GRAVEYARD':'BOARD',owner:'SELF',selection:'SELF',count:1}});assert.equal(n.events.filter(e=>e.type==='DAMAGE_DEALT').length,0);assert.equal(n.targetingState?.active??false,false);}
});
test('River Dunk draws its exact deck instance after real mulligan, preserving buffs and order; hand copy stays put',()=>{
 const {state,definition}=setup('리버덩크');state.openingMulligan=true;const river={...generateCardInstance(definition,{instanceId:'deck-river'}),currentAttack:definition.attack+2};const first=generateCardInstance(unit,{instanceId:'first'}),last=generateCardInstance(unit,{instanceId:'last'});state.players[0].deck=[first,river,last];const result=executeAction(state,{type:'MULLIGAN',playerId:'player-1',cardInstanceIds:[]});assert.ok(result.success);assert.equal(result.state.players[0].hand.length,2);assert.equal(result.state.players[0].hand[1]!.instanceId,'deck-river');assert.equal(result.state.players[0].hand[1]!.currentAttack,definition.attack+2);assert.deepEqual(result.state.players[0].deck.map(c=>c.instanceId),['first','last']);assert.deepEqual(result.state.events.filter(e=>e.type==='CARD_DRAWN').map(e=>e.cardInstanceId),['deck-river']);assert.equal(executeAction(result.state,{type:'MULLIGAN',playerId:'player-1',cardInstanceIds:[]}).success,false);
});
test('Black Market Merchant deletes actual deck top without graveyard, replacing it with ordinary random content at exact reduced minimums',()=>{
 const {state,definition}=setup('암시장 상인');const original=state.players[0].deck[0]!.instanceId;state.cardPool=[{...unit,id:'replacement',cost:0,attack:0,health:1}, {...unit,id:'excluded',isToken:true}, {...definition,status:'DRAFT'}];const n=play(state);assert.equal(n.players[0].deck.length,1);assert.equal(n.players[0].deck[0]!.definitionId,'replacement');assert.deepEqual([n.players[0].deck[0]!.currentCost,n.players[0].deck[0]!.currentAttack,n.players[0].deck[0]!.currentHealth],[0,0,1]);assert.equal(n.players[0].graveyard.some(c=>c.instanceId===original),false);assert.equal(n.events.filter(e=>e.type==='CARD_DESTROYED'&&e.cardInstanceId===original).length,1);assert.equal(n.players[0].hand.length,0);
});
for(const healed of ['BOTH','HERO','WRESTLER','OVERHEAL','OPPONENT_TURN'] as const)test(`Helper next own turn checks genuine previous-own-turn healing: ${healed}`,()=>{
 const {state}=setup('헬퍼');let n=play(state);const cat=definitions.find(d=>d.name==='냥냥 펀치')!;assert.equal(n.players[0].hand.filter(c=>c.definitionId===cat.id).length,1);if(healed==='OPPONENT_TURN')n=end(n);if(healed!=='OVERHEAL'){n.players[0].health=20;n.players[0].champion!.health=20;ally(n).currentHealth=8;}
 const heal=(zone:'PLAYER'|'BOARD')=>{n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'HEAL',target:{zone,owner:'SELF',selection:zone==='PLAYER'?'SELF':'PLAYER_CHOICE',count:1},values:{amount:1}},zone==='BOARD'?['ally']:undefined);};if(healed!=='WRESTLER')heal('PLAYER');if(healed!=='HERO')heal('BOARD');if(healed==='OPPONENT_TURN')n=end(n);else n=end(end(n));assert.equal(n.players[0].hand.filter(c=>c.definitionId===cat.id).length,healed==='BOTH'?2:1);
});

for(const alreadyAttacked of [true,false])test(`Skad grants Surprise plus one wrestler-only extra attack (${alreadyAttacked?'already attacked':'unused normal attack'})`,()=>{
 const {state}=setup('스카드');state.players[0].board[1]!.attacksUsedThisTurn=alreadyAttacked?1:0;state.players[1].board[0]!.currentHealth=30;state.players[1].board[0]!.maxHealth=30;state.players[1].board[0]!.currentAttack=0;let n=play(state,'ally');assert.ok(ally(n).keywords.includes('SURPRISE'));assert.equal(ally(n).extraWrestlerAttacksThisTurn,1);const act={type:'ATTACK' as const,playerId:'player-1',attackerInstanceId:'ally',target:{type:'WRESTLER' as const,playerId:'player-2',cardInstanceId:'enemy'}};
 if(!alreadyAttacked){const first=executeAction(n,act);assert.ok(first.success);n=first.state;assert.equal(ally(n).extraWrestlerAttacksThisTurn,1);}
 const hero=executeAction(n,{...act,target:{type:'PLAYER',playerId:'player-2'}});assert.equal(hero.success,false);const extra=executeAction(n,act);assert.ok(extra.success);n=extra.state;assert.equal(ally(n).extraWrestlerAttacksThisTurn,0);assert.equal(executeAction(n,act).success,false);assert.equal(n.players[1].board[0]!.currentHealth,alreadyAttacked?25:20);
});
test('Skad bonus expires before the next own turn and never bypasses stunned/cannot-attack restrictions',()=>{
 const {state}=setup('스카드');let n=play(state,'ally');ally(n).isStunned=true;assert.equal(executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'ally',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}}).success,false);n=end(end(n));assert.equal(ally(n).extraWrestlerAttacksThisTurn,0);
});
test('Lord returns the chosen live-cost ally to deck and summons one lower-cost ordinary wrestler in exactly its slot',()=>{
 const {state,definition}=setup('로드');state.players[0].board[1]=null;const returned={...unit,id:'returned',cost:3},child={...definitions.find(d=>d.name==='닌자')!,id:'eligible',cost:1,status:'PUBLISHED' as const,isToken:false,isChampionToken:false};state.cardPool=[definition,returned,child,{...unit,id:'private',status:'DRAFT',cost:0},{...unit,id:'token',isToken:true,cost:0},{...unit,id:'not-lower',cost:2}];state.players[0].board[2]={...generateCardInstance(returned,{instanceId:'ally'}),currentCost:2,boardSlot:2};const n=play(state,'ally');assert.equal(n.players[0].board[1],null);assert.equal(n.players[0].board[2]!.definitionId,'eligible');assert.equal(n.players[0].board.filter(Boolean).length,2);assert.ok(n.players[0].deck.some(c=>c.instanceId==='ally'&&c.currentCost===3));assert.equal(n.targetingState?.active??false,false);
});
test('Lord with no cheaper catalog target returns the chosen zero-cost ally and continues without summoning or waiting',()=>{
 const {state,definition}=setup('로드');state.players[0].board[1]!.currentCost=0;state.cardPool=[definition,unit];const n=play(state,'ally');assert.equal(n.players[0].board[1],null);assert.ok(n.players[0].deck.some(c=>c.instanceId==='ally'));assert.equal(n.players[0].board.filter(Boolean).length,1);assert.equal(end(n).activePlayerId,'player-2');
});
test('Guide reveals exactly the actual deck top, without drawing, reordering or exposing another card',()=>{
 const {state}=setup('초보 길잡이');state.players[0].deck.push(generateCardInstance({...unit,id:'other-secret'},{instanceId:'other-secret'}));const n=play(state);const events=n.events.filter(e=>e.type==='CARD_REVEALED');assert.equal(events.length,1);assert.equal(events[0]!.revealedCard!.definitionId,unit.id);assert.equal(events[0]!.revealedCard!.name,unit.name);assert.deepEqual(n.players[0].deck.map(c=>c.instanceId),state.players[0].deck.map(c=>c.instanceId));assert.equal(JSON.stringify(events).includes('other-secret'),false);
});
test('Guide with empty deck neither discloses a fabricated card nor blocks the game',()=>{const {state}=setup('초보 길잡이');state.players[0].deck=[];const n=play(state);assert.equal(n.events.filter(e=>e.type==='CARD_REVEALED').length,0);assert.equal(n.targetingState?.active??false,false);});
test('WarThunder gains per wrestler arrival from creation/board/grave, excluding spells and own deck draw/movement',()=>{
 const {state,definition}=setup('워썬더');state.cardPool=[definition,unit];let n=play(state);assert.equal(source(n).currentAttack,definition.attack+1);const generate=(card:CardDefinition)=>{n.cardPool!.push(card);n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'GENERATE',values:{definitionRef:{id:card.id},destination:'HAND',count:1}});};generate({...unit,id:'created'});assert.equal(source(n).currentAttack,definition.attack+2);generate({...unit,id:'spell',cardType:'TECHNIQUE'});assert.equal(source(n).currentAttack,definition.attack+2);
 n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'DRAW',values:{amount:1}});assert.equal(source(n).currentAttack,definition.attack+2);n.players[0].deck=[generateCardInstance(unit,{instanceId:'deck-recovery'})];n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'MOVE_TO_HAND',target:{zone:'DECK',owner:'SELF',selection:'TOP',count:1}});assert.equal(source(n).currentAttack,definition.attack+2);
 n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'MOVE_TO_HAND',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1}},['ally']);assert.equal(source(n).currentAttack,definition.attack+3);n.players[0].graveyard=[generateCardInstance(unit,{instanceId:'grave-recovery'})];n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'MOVE_TO_HAND',target:{zone:'GRAVEYARD',owner:'SELF',selection:'TOP',count:1}});assert.equal(source(n).currentAttack,definition.attack+4);
});

for(const ownCause of [true,false])test(`Karzael grants a personal Destruction Messenger; ${ownCause?'its own kill is destruction':'another ally kill stays retirement'}`,()=>{
 const {state}=setup('카르자엘, 파괴의 천사');state.players[1].board[0]!.currentHealth=1;state.players[1].board[0]!.currentAttack=0;state.players[0].board[2]={...generateCardInstance(unit,{instanceId:'other'}),boardSlot:2,enteredThisTurn:false};let n=play(state,'ally');assert.ok(ally(n).grantedText);assert.equal(n.players[1].board[0]!.currentHealth,1);assert.equal(n.players[1].health,25);n=end(end(n));const before=ally(n);const result=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:ownCause?'ally':'other',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});assert.ok(result.success);const after=result.state;assert.equal(after.events.filter(e=>e.type==='CARD_DESTROYED'&&e.cardInstanceId==='enemy').length,ownCause?1:0);assert.equal(after.players[1].graveyard.some(c=>c.instanceId==='enemy'),!ownCause);assert.equal(ally(after).currentAttack,before.currentAttack+(ownCause?2:0));assert.equal(ally(after).maxHealth,before.maxHealth+(ownCause?2:0));assert.equal(after.players[1].health,25);
});
test('Karzael Messenger gains +2/+2 for another actual field destruction, including an allied card, and preserves unrelated cards',()=>{
 const {state}=setup('카르자엘, 파괴의 천사');let n=play(state,'ally');n.players[0].board[2]={...generateCardInstance(unit,{instanceId:'other'}),boardSlot:2};const before=ally(n);n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'DESTROY',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1}},['other']);assert.equal(ally(n).currentAttack,before.currentAttack+2);assert.equal(ally(n).maxHealth,before.maxHealth+2);
});
test('Hilbil fully heals only the wrestler itself after its own actual retirement, without the obsolete champion heal or overheal',()=>{
 const {state}=setup('힐빌');state.players[0].health=10;state.players[0].hand[0]!.currentHealth=2;state.players[0].hand[0]!.maxHealth=20;state.players[1].board[0]!.currentHealth=1;state.players[1].board[0]!.currentAttack=0;let n=end(end(play(state)));const result=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});assert.ok(result.success);assert.equal(source(result.state).currentHealth,20);assert.equal(result.state.players[0].health,10);assert.equal(result.state.overhealByTurn?.[`${result.state.turn}:player-1`]??0,0);
});
test('Latest Yeager has printed Dodge and buffs exactly the allied Soldier entering through play or effect summon',()=>{
 for(const summon of [true,false]){const {state,definition}=setup('예거');let n=play(state);assert.ok(source(n).keywords.includes('DODGE'));const soldier={...unit,id:'soldier',tags:['솔져']};n.cardPool!.push(soldier);if(summon)n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'SUMMON',values:{definitionRef:{id:soldier.id},count:1}});else{n.players[0].hand=[generateCardInstance(soldier,{instanceId:'played'})];const result=executeAction(n,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'played',boardSlot:2});assert.ok(result.success);n=result.state;}const actual=n.players[0].board.find(c=>c?.definitionId===soldier.id)!;assert.equal(actual.currentAttack,6);assert.equal(actual.maxHealth,11);assert.equal(source(n).currentAttack,definition.attack);}
});

// Catalog-wide smoke is reported separately; it is not an effect-correctness verdict.
const catalogPlayResults:Array<{id:string;name:string;result:string;effectCorrectness:string}>=[];
for(const record of records)test(`latest catalog actual play path ${record.id}: ${record.name}`,()=>{
 const {state,definition}=setup(record.name,record.id);
 const before=JSON.stringify(record);
 state.players[0].hand.push(generateCardInstance(unit,{instanceId:'spare-hand'}));
 state.players[0].graveyard=[generateCardInstance(unit,{instanceId:'grave'})];
 const result=executeAction(state,definition.cardType==='TECHNIQUE'
   ? {type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'source'}
   : {type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'source',boardSlot:0});
 if(result.success){
  const settled=settle(result.state);assert.ok(JSON.stringify(settled));
  assert.ok(settled.events.some(event=>event.type==='CARD_PLAYED'&&event.cardInstanceId==='source'));
  for(const player of settled.players)assert.equal(player.board.length,4);
  assert.equal(JSON.stringify(record),before);
  catalogPlayResults.push({id:record.id,name:record.name,result:'PLAYED',effectCorrectness:'NOT_ESTABLISHED_BY_SMOKE'});
 }else{
  assert.ok(['NO_VALID_TARGET','CARD_NOT_IN_HAND'].includes(result.errorCode),result.errorCode+': '+result.message);
  assert.equal(JSON.stringify(result.state),JSON.stringify(state));
  catalogPlayResults.push({id:record.id,name:record.name,result:'CONDITION_REJECTED',effectCorrectness:'NOT_ESTABLISHED_BY_SMOKE'});
 }
 if(catalogPlayResults.length===records.length){
  const output=process.env.KO_QA_CATALOG_REPORT??'qa-results/latest-admin-catalog-play-20261014.json';mkdirSync(output.slice(0,output.lastIndexOf('/')),{recursive:true});
  writeFileSync(output,JSON.stringify({snapshot:'docs/qa/snapshots/20261014-admin',towerContext:process.env.KO_QA_TOWER_MODE==='1',cardCount:records.length,scope:'Play path only; effect correctness requires the independent card-specific scenarios',rows:catalogPlayResults},null,2)+'\n');
 }
});

for(const record of records.filter(card=>card.cardType==='WRESTLER' && card.text.trim()==='' && card.keywords.length===0))test(`latest vanilla semantics ${record.id}: exact cost/body, ordinary attack and continued match`,()=>{
 const {state}=setup(record.name,record.id);state.players[1].board[0]!.currentAttack=0;state.players[1].board[0]!.currentHealth=30;state.players[1].board[0]!.maxHealth=30;
 let n=play(state);assert.equal(n.players[0].currentGold,100-record.cost);assert.deepEqual([source(n).currentAttack,source(n).currentHealth,source(n).maxHealth],[record.attack,record.health,record.health]);n=end(end(n));const result=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});assert.ok(result.success);assert.equal(result.state.players[1].board[0]!.currentHealth,30-record.attack);assert.equal(source(result.state).currentHealth,record.health);assert.equal(result.state.status,'IN_PROGRESS');assert.equal(executeAction(result.state,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}}).success,false);
});

for (const name of ['리온','영웅 탄생']) for (const topIsSpell of [true,false]) test(`confirmed ${name}: physical top ${topIsSpell?'spell gives no effect':'wrestler receives exact attack'}`,()=>{
 let {state}=setup(name); const top=generateCardInstance(topIsSpell?definitions.find(d=>d.name==='영웅 탄생')!:unit,{instanceId:'top'});
 state.players[0].deck=[top,generateCardInstance(unit,{instanceId:'under-top'})];
 if(name==='리온') state=end(play(state));
 else {const r=executeAction(state,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'source'});assert.ok(r.success);state=settle(r.state,'ally');}
 assert.equal(state.players[0].deck[1].currentAttack,unit.attack);
 const power=name==='리온'?source(state).currentAttack:unit.attack;
 assert.equal(state.players[0].deck[0].currentAttack,top.currentAttack+(topIsSpell?0:power));
 assert.equal(state.targetingState?.active??false,false);
});

for(const zone of ['HAND','DECK','GRAVEYARD','BOARD'] as const) for(const id of ['6cc900a9-b1b6-4b83-b777-353d5c985b8f','4ee42a6a-6187-4edc-9a45-e7084f7bfc26']) test(`confirmed Bellmort ${id}: destruction buff only while on field, source in ${zone}`,()=>{
 const {state,definition}=setup('마왕 벨모르트',id);const card=state.players[0].hand[0];state.players[0].hand=[];
 if(zone==='BOARD')state.players[0].board[0]={...card,boardSlot:0};
 else state.players[0][zone==='HAND'?'hand':zone==='DECK'?'deck':'graveyard'].push(card);
 const n=applyEffect(state,'player-1',ally(state),{type:'STRUCTURED',action:'DESTROY',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1}},['enemy']);
 const observed=zone==='BOARD'?source(n):n.players[0][zone==='HAND'?'hand':zone==='DECK'?'deck':'graveyard'].find(c=>c.instanceId==='source')!;
 assert.deepEqual([observed.currentAttack,observed.maxHealth],[definition.attack+(zone==='BOARD'?2:0),definition.health+(zone==='BOARD'?2:0)]);
 assert.equal(n.players[1].board[0],null);
});

test('confirmed Assemble counts each Zombie merge as one attempt, leaving open slots and terminating',()=>{
 const {state}=setup('어셈블!!!');const zombie=definitions.find(d=>d.name==='좀비')!;assert.ok(zombie);state.cardPool=[zombie];state.minionACardPool=[zombie];
 state.players[0].board=[{...generateCardInstance(zombie,{instanceId:'existing-zombie'}),boardSlot:0},null,null,null];
 const r=executeAction(state,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'source'});assert.ok(r.success);const n=settle(r.state);
 assert.equal(n.players[0].board.filter(Boolean).length,1);assert.equal(n.players[0].board[0]!.currentAttack,5);assert.equal(n.players[0].board[0]!.maxHealth,5);
 assert.equal(n.targetingState?.active??false,false);assert.equal(end(n).activePlayerId,'player-2');
});

for(const action of ['MODIFY_STAT','BUFF','SET_STAT'] as const)test(`confirmed minimum attack zero for ${action}, later buff starts from zero`,()=>{
 const {state}=setup('도둑');let n=play(state);n=applyEffect(n,'player-2',n.players[1].board[0]!,{type:'STRUCTURED',action,target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:action==='BUFF'?{attack:-99,health:0}:{stat:'ATTACK',amount:-99}},['source']);
 assert.equal(source(n).currentAttack,0);assert.ok(source(n).statHistory?.every(e=>e.stat!=='attack'||e.after>=0));
 n=applyEffect(n,'player-1',source(n),{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{attack:1,health:0}});assert.equal(source(n).currentAttack,1);
});

for(const direction of ['ATTACK','DEFEND'] as const)test(`confirmed Nebra ${direction}: zero attack drains nothing`,()=>{
 const {state}=setup('네브라, 어둠의 천사');state.players[0].board[1]!.currentHealth=30;state.players[0].board[1]!.maxHealth=30;state.players[1].board[0]!.currentHealth=30;state.players[1].board[0]!.maxHealth=30;state.players[1].board[0]!.currentAttack=0;
 let n=end(end(play(state,'ally')));if(direction==='DEFEND')n=end(n);
 const r=executeAction(n,{type:'ATTACK',playerId:direction==='ATTACK'?'player-1':'player-2',attackerInstanceId:direction==='ATTACK'?'ally':'enemy',target:{type:'WRESTLER',playerId:direction==='ATTACK'?'player-2':'player-1',cardInstanceId:direction==='ATTACK'?'enemy':'ally'}});assert.ok(r.success);
 assert.equal(r.state.players[1].board[0]!.currentAttack,0);assert.equal(ally(r.state).currentAttack,unit.attack);
});

test('temporary attack debuff records the actual clamped change and restores it once',()=>{
 const {state}=setup('도둑');let n=play(state);const before=source(n).currentAttack;
 n=applyEffect(n,'player-2',n.players[1].board[0]!,{type:'STRUCTURED',action:'MODIFY_STAT',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{stat:'ATTACK',amount:-99,duration:'THIS_TURN'}},['source']);assert.equal(source(n).currentAttack,0);
 assert.equal(source(n).temporaryStatModifiers!.find(m=>m.stat==='attack')!.amount,-before);
 n=end(n);assert.equal(source(n).currentAttack,before);n=end(n);assert.equal(source(n).currentAttack,before);
});
