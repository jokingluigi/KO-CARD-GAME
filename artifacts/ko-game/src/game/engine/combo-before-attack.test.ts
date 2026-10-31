import test from 'node:test';import assert from 'node:assert/strict';
import {createInitialGameState,generateCardInstance,executeAction,getLegalActions,type CardDefinition,type CardEffect,type GameState,type GameAction} from '../index';
const definition:CardDefinition={id:'combo-order',name:'콤보 순서 검증',cardType:'WRESTLER',cost:1,attack:2,health:5,rulesText:'',isToken:false,isChampionToken:false,keywords:[],abilities:[]};
const last={zone:'BOARD',owner:'SELF',selection:'LAST_ATTACKER',count:1} as const;
const buff=(attack=3,health=0):CardEffect=>({type:'STRUCTURED',action:'BUFF',target:last,values:{attack,health}});
function setup(effects:CardEffect[]=[buff()]){
 const s=createInitialGameState();s.status='IN_PROGRESS';s.activePlayerId=s.players[0].id;s.events=[];s.openingMulligan=undefined;
 for(const p of s.players){p.board=[null,null,null,null];p.hand=[];p.health=20;p.champion!.health=20;p.champion!.quest=null;}
 s.players[0].board[0]={...generateCardInstance(definition,{instanceId:'attacker'}),boardSlot:0,enteredThisTurn:false};
 s.players[0].board[1]={...generateCardInstance({...definition,abilities:[{trigger:'OTHER_ALLY_ATTACK',effects}]},{instanceId:'combo'}),boardSlot:1,enteredThisTurn:false};
 s.players[1].board[0]={...generateCardInstance({...definition,attack:1,health:12},{instanceId:'defender'}),boardSlot:0,enteredThisTurn:false};return s;
}
function fire(s:GameState,champion=false){const r=executeAction(s,{type:'ATTACK',playerId:s.players[0].id,attackerInstanceId:'attacker',target:champion?{type:'PLAYER',playerId:s.players[1].id}:{type:'WRESTLER',playerId:s.players[1].id,cardInstanceId:'defender'}});assert.ok(r.success,r.message);return r.state;}
for(const champion of [false,true])test(`combo buffs the current attack before ${champion?'champion':'unit'} damage, once only`,()=>{
 const s=setup();if(champion)s.players[1].board=[null,null,null,null];const before=JSON.stringify(s),n=fire(s,champion);assert.equal(JSON.stringify(s),before);
 assert.equal(n.players[0].board[0]!.currentAttack,5);assert.equal(n.players[0].board[0]!.attacksUsedThisTurn,1);
 assert.equal(champion?n.players[1].health:n.players[1].board[0]!.currentHealth,champion?15:7);
 const changed=n.events.findIndex(e=>e.type==='STAT_CHANGED'&&e.cardInstanceId==='attacker');const hit=n.events.findIndex(e=>e.type==='DAMAGE_DEALT'&&e.source?.type==='CARD'&&e.source.cardInstanceId==='attacker');assert.ok(changed>=0&&changed<hit);
 assert.equal(n.events.filter(e=>e.type==='ATTACK_DECLARED').length,1);
});
test('pre-attack health buff prevents a lethal counterattack rather than trying to recover after it',()=>{
 const s=setup([buff(0,3)]);s.players[0].board[0]!.currentHealth=1;s.players[1].board[0]!.currentAttack=3;const n=fire(s);assert.equal(n.players[0].board[0]!.currentHealth,1);assert.equal(n.players[0].board[0]!.maxHealth,8);
});
for(const mode of ['not-turn','stunned','entry','used','taunt','missing-target','protected-champion'] as const)test(`invalid ${mode} attack cannot fire combo or spend an attack`,()=>{
 const s=setup();let target:Extract<GameAction,{type:'ATTACK'}>['target']={type:'WRESTLER',playerId:s.players[1].id,cardInstanceId:'defender'};
 if(mode==='not-turn')s.activePlayerId=s.players[1].id;
 if(mode==='stunned')s.players[0].board[0]!.isStunned=true;
 if(mode==='entry')s.players[0].board[0]!.enteredThisTurn=true;
 if(mode==='used')s.players[0].board[0]!.attacksUsedThisTurn=1;
 if(mode==='taunt'){s.players[1].board[1]={...generateCardInstance({...definition,keywords:['TAUNT']},{instanceId:'taunt'}),boardSlot:1};}
 if(mode==='missing-target')target={...target,cardInstanceId:'missing'};
 if(mode==='protected-champion'){s.players[1].board[0]!.isChampionToken=true;target={type:'PLAYER',playerId:s.players[1].id};}
 const before=JSON.stringify(s),r=executeAction(s,{type:'ATTACK',playerId:s.players[0].id,attackerInstanceId:'attacker',target});assert.equal(r.success,false);assert.equal(JSON.stringify(s),before);assert.equal(JSON.stringify(r.state),before);
});
for(const flag of ['isSilenced','isAbilityDisabled'] as const)test(`${flag} combo source cannot buff the attack`,()=>{const s=setup();s.players[0].board[1]![flag]=true;assert.equal(fire(s).players[1].board[0]!.currentHealth,10);});
test('two allied combo sources run before the same attack; opponent sources and attacker own combo do not',()=>{
 const s=setup();s.players[0].board[2]={...s.players[0].board[1]!,instanceId:'second',boardSlot:2};s.players[1].board[1]={...s.players[0].board[1]!,instanceId:'opponent',boardSlot:1};s.players[0].board[0]!.abilities=s.players[0].board[1]!.abilities;const n=fire(s);assert.equal(n.players[0].board[0]!.currentAttack,8);assert.equal(n.players[1].board[0]!.currentHealth,4);
});
test('multi-strike and additional unit attacks consume one use each and do not double combo',()=>{
 let s=setup();s.players[0].board[0]!.keywords=['MULTI_STRIKE'];s.players[1].board[0]!.currentHealth=30;s.players[1].board[0]!.maxHealth=30;s=fire(s);s=fire(s);assert.equal(s.players[0].board[0]!.attacksUsedThisTurn,2);assert.equal(s.players[0].board[0]!.currentAttack,8);assert.equal(s.players[1].board[0]!.currentHealth,17);
 s.players[0].board[0]!.extraWrestlerAttacksThisTurn=1;s=fire(s);assert.equal(s.players[0].board[0]!.attacksUsedThisTurn,2);assert.equal(s.players[0].board[0]!.extraWrestlerAttacksThisTurn,0);assert.equal(s.players[0].board[0]!.currentAttack,11);
});
test('immune targeting rules and dodge retain their existing combat behavior after pre-attack combo',()=>{
 for(const keyword of ['IMMUNE','DODGE'] as const){const s=setup();s.players[1].board[0]!.keywords=[keyword];s.players[1].board[0]!.dodgeAvailable=keyword==='DODGE';s.players[1].board[0]!.dodgeCharges=keyword==='DODGE'?1:0;const n=fire(s);assert.equal(n.players[0].board[0]!.currentAttack,5);assert.equal(n.players[1].board[0]!.currentHealth,keyword==='DODGE'?12:7);}
});
test('combo removing the selected target resolves its effects without a ghost hit or a free repeat',()=>{
 const s=setup([{type:'STRUCTURED',action:'DESTROY',target:{zone:'BOARD',owner:'ENEMY',selection:'ALL',count:4}}]);const n=fire(s);assert.equal(n.players[1].board[0],null);assert.equal(n.players[0].board[0]!.attacksUsedThisTurn,1);assert.equal(n.events.filter(e=>e.type==='DAMAGE_DEALT').length,0);
});
test('a combo that removes a later listener cannot activate the removed listener snapshot',()=>{
 const s=setup([{type:'STRUCTURED',action:'DESTROY',target:{zone:'BOARD',owner:'SELF',selection:'ALL',count:4}}]);s.players[0].board[2]={...generateCardInstance({...definition,abilities:[{trigger:'OTHER_ALLY_ATTACK',effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},values:{amount:10}}]}]},{instanceId:'later'}),boardSlot:2};const n=fire(s);assert.equal(n.players[1].health,20);assert.equal(n.events.filter(e=>e.type==='DAMAGE_DEALT').length,0);
});
test('targeted combo completes after JSON round-trip before exactly one hit, with no repeated buff/use',()=>{
 const s=setup([buff(),{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1},values:{attack:2,health:0}}]);let n=fire(s);assert.ok(n.targetingState?.active);assert.ok(n.pendingComboAttack);assert.equal(n.events.filter(e=>e.type==='DAMAGE_DEALT').length,0);assert.equal(n.players[0].board[0]!.attacksUsedThisTurn,1);
 n=JSON.parse(JSON.stringify(n));const original=JSON.stringify(n);assert.ok(getLegalActions(n,n.players[0].id).some(a=>a.type==='SELECT_EFFECT_TARGET'));assert.equal(JSON.stringify(n),original);
 const r=executeAction(n,{type:'SELECT_EFFECT_TARGET',playerId:n.players[0].id,targetId:'attacker'});assert.ok(r.success,r.message);n=r.state;assert.equal(n.pendingComboAttack,undefined);assert.equal(n.players[0].board[0]!.currentAttack,7);assert.equal(n.players[1].board[0]!.currentHealth,5);assert.equal(n.players[0].board[0]!.attacksUsedThisTurn,1);assert.equal(n.events.filter(e=>e.type==='ATTACK_DECLARED').length,1);
 assert.equal(executeAction(n,{type:'SELECT_EFFECT_TARGET',playerId:n.players[0].id,targetId:'attacker'}).success,false);
});
test('pre-attack combo lethal damage ends the match without a second physical attack',()=>{
 const s=setup([{type:'STRUCTURED',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'ALL',count:1},values:{amount:30}}]);const n=fire(s);assert.equal(n.status,'FINISHED');assert.equal(n.events.filter(e=>e.type==='ATTACK_DECLARED').length,0);assert.equal(n.pendingComboAttack,undefined);
});

test('optional combo choice cancellation continues the accepted attack once',()=>{
 const s=setup([buff(),{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1,optionalTarget:true},values:{attack:2}}]);const pending=fire(s);assert.ok(pending.targetingState?.cancelable);
 const result=executeAction(JSON.parse(JSON.stringify(pending)),{type:'CANCEL_EFFECT_TARGET',playerId:s.players[0].id});assert.ok(result.success,result.message);assert.equal(result.state.players[1].board[0]!.currentHealth,7);assert.equal(result.state.players[0].board[0]!.attacksUsedThisTurn,1);assert.equal(result.state.pendingComboAttack,undefined);
});
test('choosing to destroy the original target never resumes a hit against its old snapshot',()=>{
 const s=setup([{type:'STRUCTURED',action:'DESTROY',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1}}]);const pending=fire(s);
 const result=executeAction(JSON.parse(JSON.stringify(pending)),{type:'SELECT_EFFECT_TARGET',playerId:s.players[0].id,targetId:'defender'});assert.ok(result.success,result.message);assert.equal(result.state.players[1].board[0],null);assert.equal(result.state.events.filter(e=>e.type==='DAMAGE_DEALT').length,0);assert.equal(result.state.pendingComboAttack,undefined);
});
