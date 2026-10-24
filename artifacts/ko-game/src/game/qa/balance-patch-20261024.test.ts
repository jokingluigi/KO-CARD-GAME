import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {cardRecordToDefinition,type PublishedCardRecord} from '../cards/published-cards';
import {championRecordToDefinition,type PublishedChampionRecord} from '../champions/published-champions';
import {createInitialGameState,generateCardInstance,executeAction,applyEffect,type GameState,type CardDefinition} from '../index';
import {isCounterattackRetirement} from '../events/retirement-rules';
import {resolveCardRetiredListeners} from '../effects/effect-engine';
import {processChampionQuestEvents} from '../champions/quests';
const records:PublishedCardRecord[]=JSON.parse(readFileSync('docs/qa/snapshots/20261024-admin/cards.json','utf8'));
const championRecords:PublishedChampionRecord[]=JSON.parse(readFileSync('docs/qa/snapshots/20261024-admin/champions.json','utf8'));
const definitions=records.map(cardRecordToDefinition);
const champions=championRecords.map(championRecordToDefinition);
const unit:CardDefinition={id:'balance-target',name:'검증 선수',cardType:'WRESTLER',cost:1,attack:4,health:8,rulesText:'',status:'PUBLISHED',isToken:false,isChampionToken:false,keywords:[],abilities:[]};
const card=(name:string)=>{const c=definitions.find(c=>c.name===name);assert.ok(c,name);return c;};
const champion=(name:string)=>{const c=champions.find(c=>c.name===name);assert.ok(c,name);return c;};
function setup(name='챔피언 루나'){
 const c=champion(name),other=champion('챔피언 루나');
 const s=createInitialGameState([c.id,other.id],[...definitions,unit],champions);
 s.status='IN_PROGRESS';s.activePlayerId='player-1';s.turn=3;s.events=[];s.randomSeed=123;
 for(const p of s.players){p.board=[null,null,null,null];p.hand=[];p.currentGold=100;p.deck=Array.from({length:50},(_,i)=>generateCardInstance(unit,{instanceId:`${p.id}-deck-${i}`}));}
 return s;
}
function action(s:GameState,a:Parameters<typeof executeAction>[1],preferred?:string){
 let r=executeAction(s,a);assert.ok(r.success,r.message);let n=r.state;
 for(let i=0;n.targetingState?.active;i++){
  assert.ok(i<20,'targeting terminates');const pending=n.targetingState;
  const id=preferred&&pending.validTargetIds.includes(preferred)?preferred:pending.validTargetIds.find(id=>!pending.selectedTargetIds.includes(id));assert.ok(id,'valid target');
  r=executeAction(n,{type:pending.phase==='PRE_COMMIT'?'CONFIRM_PRECOMMIT_TARGET':'SELECT_EFFECT_TARGET',playerId:pending.playerId,targetId:id});assert.ok(r.success,r.message);n=r.state;
 }
 return n;
}
function play(s:GameState,name:string,slot:0|1|2|3=0){s.players[0].hand=[generateCardInstance(card(name),{instanceId:'source'})];return action(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'source',boardSlot:slot});}
function ability(s:GameState,target?:string){return action(s,{type:'USE_CHAMPION_ABILITY',playerId:'player-1'},target);}
function nextOwnTurn(s:GameState){return action(action(s,{type:'END_TURN',playerId:'player-1'}),{type:'END_TURN',playerId:'player-2'});}
function effect(s:GameState,fx:Parameters<typeof applyEffect>[3],ids?:string[]){return processChampionQuestEvents(s,applyEffect(s,'player-1',s.players[0].deck[0]!,fx,ids));}

test('RM Udyr uses administrator 3/3 and doubles to exactly 6/6 on actual play',()=>{
 const n=play(setup(),'RM우디르');assert.deepEqual([n.players[0].board[0]!.currentAttack,n.players[0].board[0]!.currentHealth,n.players[0].board[0]!.maxHealth],[6,6,6]);
});
test('Zombie Bellona uses revised 0/3 while keeping its damage summon',()=>{
 let s=play(setup(),'좀비 벨로나');assert.equal(s.players[0].board[0]!.maxHealth,3);
 s=effect(s,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1},values:{amount:1}},['source']);
 assert.equal(s.players[0].board[0]!.currentHealth,2);assert.equal(s.players[0].board.filter(c=>c?.definitionId===card('좀비').id).length,1);
});
test('Bull Grandpa no longer has printed armor; damage still caps at three per turn',()=>{
 let s=play(setup(),'황소할배');assert.equal(s.players[0].board[0]!.keywords.includes('ARMOR'),false);
 s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),currentAttack:1,currentHealth:20,maxHealth:20,boardSlot:0,enteredThisTurn:false};
 s=nextOwnTurn(s);s=action(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});
 assert.equal(s.players[0].board[0]!.currentHealth,4);
 s=effect(s,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1},values:{amount:5}},['source']);assert.equal(s.players[0].board[0]!.currentHealth,2);
 s=effect(s,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1},values:{amount:1}},['source']);assert.equal(s.players[0].board[0]!.currentHealth,2);
});
test('Luna starts with exactly 25 champion health',()=>{const s=setup();assert.equal(s.players[0].health,25);assert.equal(s.players[0].maxHealth,25);assert.equal(s.players[0].champion!.health,25);});
test('Minion A pays one gold and preserves full-random creation with a one-cost discount',()=>{
 const s=setup('챔피언 미니언 A');s.minionACardPool=[{...unit,id:'private-token',status:'DRAFT',isToken:true,isChampionToken:true,cost:3}];
 const before=s.players[0].currentGold;const n=ability(s);assert.equal(n.players[0].currentGold,before-1);assert.equal(n.players[0].hand.length,1);assert.equal(n.players[0].hand[0]!.definitionId,'private-token');assert.equal(n.players[0].hand[0]!.currentCost,2);
});
for(const [name,required] of [['챔피언 라 칼라베라',15],['챔피언 예거',10],['챔피언 판도라',5],['챔피언 퍼플레인',10]] as const)
 test(`${name} retains configured quest goal ${required}`,()=>{assert.equal(champion(name).quest!.requiredProgress,required);});

test('Calavera completes only at fifteenth allied retirement, ignores destruction and enemy retirement',()=>{
 let s=setup('챔피언 라 칼라베라');
 const remove=(owner:'SELF'|'ENEMY',kind:'RETIRE'|'DESTROY')=>{
  const p=s.players[owner==='SELF'?0:1];const id=`victim-${s.events.length}`;p.board[1]={...generateCardInstance(unit,{instanceId:id}),boardSlot:1};
  s=effect(s,{type:'STRUCTURED',action:kind,target:{zone:'BOARD',owner,selection:'PLAYER_CHOICE',count:1}},[id]);
 };
 remove('ENEMY','RETIRE');remove('SELF','DESTROY');assert.equal(s.players[0].champion!.questProgress,0);
 for(let i=1;i<=15;i++){remove('SELF','RETIRE');assert.equal(s.players[0].champion!.questProgress,i);assert.equal(s.players[0].champion!.questCompleted,i===15);}
 assert.equal(s.events.filter(e=>e.type==='CHAMPION_QUEST_COMPLETED'&&e.playerId==='player-1').length,1);
});
test('Jaeger generates via the actual champion ability and completes at tenth generation',()=>{
 let s=setup('챔피언 예거');
 for(let i=1;i<=10;i++){
  s=ability(s);assert.equal(s.players[0].champion!.questProgress,i);assert.equal(s.players[0].champion!.questCompleted,i===10);
  // Clear through actual retirement so the next generation has a real free slot.
  s=effect(s,{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'SELF',selection:'ALL',count:4}});
  if(i<10)s=nextOwnTurn(s);
 }
});
test('Pandora ability kills complete at five; ordinary card-effect kills do not count',()=>{
 let s=setup('챔피언 판도라');
 s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'not-ability'}),boardSlot:0};
 s=effect(s,{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'ENEMY',selection:'ALL',count:4}});assert.equal(s.players[0].champion!.questProgress,0);
 for(let i=1;i<=5;i++){
  const id=`target-${i}`;s.players[1].board[0]={...generateCardInstance(unit,{instanceId:id}),currentHealth:1,boardSlot:0};
  s=ability(s,id);assert.equal(s.players[0].champion!.questProgress,i);assert.equal(s.players[0].champion!.questCompleted,i===5);
  if(i<5)s=nextOwnTurn(s);
 }
});
test('Purple Rain completes on tenth real self-effect hit through champion targeting',()=>{
 let s=setup('챔피언 퍼플레인');
 for(let i=1;i<=10;i++){
  s=ability(s,'player-1');assert.equal(s.players[0].champion!.questProgress,i);assert.equal(s.players[0].champion!.questCompleted,i===10);
  if(i<10)s=nextOwnTurn(s);
 }
});

for(const name of ['다이아몬드 군주 루나','다이아몬드 군주 루나(반파)','다이아몬드 군주 루나(캐논)','룬스달라이트 군주 루나'])
 test(`${name} stays unpublished and keeps its actual effects`,()=>{const d=card(name);assert.equal(d.status,'DRAFT');assert.ok(d.abilities.length>0);});
test('Re-published Ruina generates another public Authority card with lifesteal, then counts its tagged hand',()=>{
 const s=setup();const ruina=card('루이나');assert.equal(ruina.status,'PUBLISHED');
 s.cardPool=[ruina,{...unit,id:'authority',tags:['디 어쏘리티']},{...unit,id:'hidden-authority',tags:['디 어쏘리티'],status:'DRAFT'}];
 const n=play(s,'루이나');assert.equal(n.players[0].hand.length,1);assert.equal(n.players[0].hand[0]!.definitionId,'authority');assert.ok(n.players[0].hand[0]!.keywords.includes('LIFESTEAL'));
 assert.equal(n.players[0].board[0]!.currentAttack,ruina.attack+1);assert.equal(n.players[0].board[0]!.maxHealth,ruina.health+1);
});
for(const required of [12,15,20])test(`Future authored Calavera retirement goals remain ${required}, never forced to ten`,()=>{
 const record=championRecords.find(c=>c.name==='챔피언 라 칼라베라')!;
 const d=championRecordToDefinition({...record,questProgressRequired:required,questCondition:{...record.questCondition,required}});
 assert.equal(d.quest!.requiredProgress,required);
});


for(const [name,number] of [['챔피언 라 칼라베라','15회'],['챔피언 예거','10번'],['챔피언 판도라','5번'],['챔피언 퍼플레인','10회']] as const)
 test(`${name} approved description matches the actual quest goal`,()=>{assert.ok(champion(name).quest!.description.includes(number));});

for(const mode of ['RETIRE','DAMAGE','COMBAT'] as const)test(`Milk Maid ${mode} exit buffs all remaining allies and champion exactly +2/+2 HP`,()=>{
 let s=play(setup(),'밀크 메이드');
 for(const slot of [1,2] as const)s.players[0].board[slot]={...generateCardInstance(unit,{instanceId:'ally-'+slot}),currentHealth:3,boardSlot:slot,enteredThisTurn:false};
 s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),boardSlot:0,enteredThisTurn:false};
 const hp=s.players[0].health,max=s.players[0].maxHealth;
 if(mode==='COMBAT'){
  s.players[1].board[0]!.currentAttack=9;s=action(s,{type:'END_TURN',playerId:'player-1'});
  s=action(s,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'source'}});
 }else s=effect(s,{type:'STRUCTURED',action:mode,target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1},values:{amount:99}},['source']);
 assert.equal(s.players[0].board[0],null);
 for(const slot of [1,2]){assert.equal(s.players[0].board[slot]!.currentHealth,5);assert.equal(s.players[0].board[slot]!.maxHealth,10);assert.equal(s.players[0].board[slot]!.currentAttack,4);}
 assert.equal(s.players[0].health,hp+2);assert.equal(s.players[0].maxHealth,max+2);
 assert.equal(s.players[1].maxHealth,25);assert.equal(s.targetingState?.active??false,false);
});
for(const mode of ['SILENCED','DISABLED','VANISH','DESTROY'] as const)test(`Milk Maid ${mode} suppresses its exit buff`,()=>{
 let s=play(setup(),'밀크 메이드');
 s.players[0].board[1]={...generateCardInstance(unit,{instanceId:'ally'}),boardSlot:1};
 if(mode==='SILENCED')s.players[0].board[0]!.isSilenced=true;
 if(mode==='DISABLED')s.players[0].board[0]!.isAbilityDisabled=true;
 const hp=s.players[0].health;s=effect(s,{type:'STRUCTURED',action:mode==='VANISH'?'VANISH':mode==='DESTROY'?'DESTROY':'RETIRE',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1}},['source']);
 assert.equal(s.players[0].health,hp);assert.equal(s.players[0].board[1]!.maxHealth,8);
});

test('Milk Maid no longer reduces an attacking enemy attack before combat',()=>{
 let s=play(setup(),'밀크 메이드');s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),currentAttack:1,boardSlot:0,enteredThisTurn:false};
 s=action(s,{type:'END_TURN',playerId:'player-1'});s=action(s,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'source'}});
 assert.equal(s.players[1].board[0]!.currentAttack,1);assert.equal(s.players[0].board[0]!.currentHealth,3);
});

function retireAlly(s:GameState,owner:'SELF'|'ENEMY'='SELF',kind:'RETIRE'|'DESTROY'='RETIRE'){
 const p=s.players[owner==='SELF'?0:1];const id='ally-'+s.events.length;p.board[3]={...generateCardInstance(unit,{instanceId:id}),boardSlot:3};
 return effect(s,{type:'STRUCTURED',action:kind,target:{zone:'BOARD',owner,selection:'PLAYER_CHOICE',count:1}},[id]);
}
function zombieState(){const s=setup('챔피언 라 칼라베라');s.players[0].board[0]={...generateCardInstance(card('좀비'),{instanceId:'zombie'}),boardSlot:0};return s;}
test('Zombie grows at most twice per turn, resets on opponent turn and again on own turn',()=>{
 let s=zombieState();
 for(let i=0;i<4;i++)s=retireAlly(s);
 assert.equal(s.players[0].board[0]!.currentAttack,3);assert.equal(s.players[0].board[0]!.maxHealth,3);
 s=action(s,{type:'END_TURN',playerId:'player-1'});for(let i=0;i<3;i++)s=retireAlly(s);
 assert.equal(s.players[0].board[0]!.currentAttack,5);
 s=action(s,{type:'END_TURN',playerId:'player-2'});s=retireAlly(s);assert.equal(s.players[0].board[0]!.currentAttack,6);
});
test('Zombie cap survives serialization and duplicated retirement listener dispatch',()=>{
 let s=zombieState();const victim={...generateCardInstance(unit,{instanceId:'victim'}),boardSlot:3 as const};s.players[0].board[3]=victim;
 s=effect(s,{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1}},['victim']);
 s=JSON.parse(JSON.stringify(s));s=resolveCardRetiredListeners(s,'player-1',victim);assert.equal(s.players[0].board[0]!.currentAttack,2);
 for(let i=0;i<3;i++)s=retireAlly(s);assert.equal(s.players[0].board[0]!.currentAttack,3);
});
test('Zombie ignored enemy retirement, destruction and suppression do not consume its two growth uses',()=>{
 let s=zombieState();s=retireAlly(s,'ENEMY');s=retireAlly(s,'SELF','DESTROY');assert.equal(s.players[0].board[0]!.currentAttack,1);
 s.players[0].board[0]!.isSilenced=true;s=retireAlly(s);s.players[0].board[0]!.isSilenced=false;
 s.players[0].board[0]!.isAbilityDisabled=true;s=retireAlly(s);s.players[0].board[0]!.isAbilityDisabled=false;
 s=retireAlly(retireAlly(s));assert.equal(s.players[0].board[0]!.currentAttack,3);
});
test('Two hand-played Zombies count their retirement growth limits independently',()=>{
 let s=zombieState();s.players[0].hand=[generateCardInstance(card('좀비'),{instanceId:'second'})];
 s=action(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'second',boardSlot:1});
 assert.equal(s.players[0].board.filter(Boolean).length,2);
 for(let i=0;i<3;i++)s=retireAlly(s);
 assert.equal(s.players[0].board[0]!.currentAttack,3);assert.equal(s.players[0].board[1]!.currentAttack,3);
});
test('Zombie summon absorption stays unlimited after two retirement growths',()=>{
 let s=retireAlly(retireAlly(zombieState()));
 for(let i=0;i<4;i++)s=effect(s,{type:'STRUCTURED',action:'SUMMON',values:{definitionRef:{id:card('좀비').id},count:1}});
 assert.equal(s.players[0].board.filter(Boolean).length,1);assert.equal(s.players[0].board[0]!.currentAttack,7);
 s=retireAlly(s);assert.equal(s.players[0].board[0]!.currentAttack,7);
});


const killCards=['데헌','리온','초보 검투사','좀비 데헌','하스이','힐빌','챔피언 판도라(폭주)'] as const;
for(const name of killCards)for(const method of ['ATTACK','COUNTERATTACK','EFFECT'] as const)
 test(`${name}: personal retirement effect ${method==='COUNTERATTACK'?'suppressed for counterattack':'retained for '+method}`,()=>{
  let s=play(setup(),name);s=nextOwnTurn(s);
  const source=s.players[0].board[0]!;
  source.currentAttack=4;source.currentHealth=2;source.maxHealth=20;source.keywords=[];source.dodgeAvailable=false;source.dodgeCharges=0;
  s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),currentAttack:3,currentHealth:1,boardSlot:0,enteredThisTurn:false};
  // One combat damage lets the source survive while its opponent retires.
  s.players[1].board[0]!.currentAttack=1;
  if(method==='COUNTERATTACK'){
   s=action(s,{type:'END_TURN',playerId:'player-1'});
   s=action(s,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'source'}});
  }else if(method==='ATTACK')s=action(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});
  else s=processChampionQuestEvents(s,applyEffect(s,'player-1',source,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:99}},['enemy']));
  const c=s.players[0].board[0]!;const active=method!=='COUNTERATTACK';
  const gain=name==='데헌'||name==='초보 검투사'||name==='챔피언 판도라(폭주)'?1:name==='리온'?2:0;
  assert.equal(c.currentAttack,4+(active?gain:0));
  assert.equal(c.maxHealth,20+(active&&name==='데헌'?1:0));
  if(name==='힐빌')assert.equal(c.currentHealth,active?20:1);
  if(name==='좀비 데헌')assert.equal(s.players[0].board.filter(c=>c?.definitionId===card('좀비').id).length,active?1:0);
  if(name==='하스이')assert.equal(c.keywords.includes('DODGE'),active);
  const idx=s.events.findIndex(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy');assert.ok(idx>=0);assert.equal(isCounterattackRetirement(s,idx),!active);
  if(method==='COUNTERATTACK'){
   const legacy=JSON.parse(JSON.stringify(s)) as GameState;
   for(const event of legacy.events)if(event.sourceContext)delete event.sourceContext.combatRole;
   assert.equal(isCounterattackRetirement(legacy,idx),true,'older saved combat events retain correct counterattack classification');
  }
 });

test('A counterattack retirement still grows the victim-side Zombie and advances its normal retirement quest',()=>{
 let s=setup('챔피언 라 칼라베라');s.players[1].champion=structuredClone(s.players[0].champion);
 s.players[0].board[0]={...generateCardInstance(card('힐빌'),{instanceId:'hilbil'}),currentHealth:2,maxHealth:20,boardSlot:0,enteredThisTurn:false};
 s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),currentHealth:1,currentAttack:1,boardSlot:0,enteredThisTurn:false};
 s.players[1].board[1]={...generateCardInstance(card('좀비'),{instanceId:'enemy-zombie'}),boardSlot:1};
 s=action(s,{type:'END_TURN',playerId:'player-1'});s=action(s,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'hilbil'}});
 assert.equal(s.players[0].board[0]!.currentHealth,1);assert.equal(s.players[1].board[1]!.currentAttack,2);assert.equal(s.players[1].champion!.questProgress,1);
});

test('A later explicit effect kill is not confused with an earlier nonlethal counterattack',()=>{
 let s=setup();s.players[0].board[0]={...generateCardInstance(card('힐빌'),{instanceId:'hilbil'}),currentHealth:2,maxHealth:20,boardSlot:0,enteredThisTurn:false};
 s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),currentHealth:8,currentAttack:1,boardSlot:0,enteredThisTurn:false};
 s=action(s,{type:'END_TURN',playerId:'player-1'});s=action(s,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'hilbil'}});
 assert.equal(s.players[0].board[0]!.currentHealth,1);
 s=applyEffect(s,'player-1',s.players[0].board[0]!,{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1}},['enemy']);
 assert.equal(s.players[0].board[0]!.currentHealth,20);
});

test('Luna can still summon its now-unpublished quest reward through an actual fusion',()=>{
 const luna=champion('챔피언 루나');
 let s=createInitialGameState([luna.id,luna.id],definitions.filter(d=>d.status==='PUBLISHED'),champions,undefined,{minionACardPool:definitions});
 s.status='IN_PROGRESS';s.activePlayerId='player-1';s.turn=3;s.events=[];
 for(const p of s.players){p.board=[null,null,null,null];p.hand=[];p.currentGold=10;p.deck=[];}
 s.players[0].champion!.questProgress=9;
 s.players[0].board[0]={...generateCardInstance(unit,{instanceId:'host'}),boardSlot:0};
 const material={...unit,id:'fusion-material',keywords:['FUSION' as const]};s.cardPool!.push(material);
 s.players[0].hand=[generateCardInstance(material,{instanceId:'material'})];
 s=action(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'material',boardSlot:1},'host');
 assert.equal(s.players[0].champion!.questCompleted,true);
 assert.equal(s.players[0].board.filter(c=>c?.definitionId===card('룬스달라이트 군주 루나').id).length,1);
 assert.equal(s.events.filter(e=>e.type==='CHAMPION_QUEST_COMPLETED'&&e.playerId==='player-1').length,1);
});

test('Milk Maid with no surviving allied wrestlers still grants champion health; simultaneous deaths are not revived',()=>{
 let s=play(setup(),'밀크 메이드');
 s.players[0].board[1]={...generateCardInstance(unit,{instanceId:'dying-ally'}),currentHealth:1,boardSlot:1};
 const hp=s.players[0].health;
 s=effect(s,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'SELF',selection:'ALL',count:4},values:{amount:99}});
 assert.equal(s.players[0].board.filter(Boolean).length,0);
 assert.equal(s.players[0].health,hp+2);assert.equal(s.players[0].graveyard.filter(c=>c.instanceId==='source'||c.instanceId==='dying-ally').length,2);
});
