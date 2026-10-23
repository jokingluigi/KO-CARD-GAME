/** Fresh authenticated administrator hash checked again at 2026-10-21T13:25Z. */
import {resolveCardRetiredListeners,resolveStateBasedDeaths} from '../effects/effect-engine';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {cardRecordToDefinition,createInitialGameState,generateCardInstance,executeAction,applyEffect,type GameState} from '../index';
const definitions=JSON.parse(readFileSync('docs/qa/snapshots/20261021-admin/cards.json','utf8')).map(cardRecordToDefinition);
const definition=(name:string)=>{const d=definitions.find(d=>d.name===name);assert.ok(d,name);return d;};
function setup(healerName:string,maxHealth:number,regeneration=false){
 const s=createInitialGameState(undefined,definitions);s.cardPool=definitions;s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';s.events=[];
 for(const p of s.players){p.board=[null,null,null,null];p.hand=[];p.health=20;p.currentGold=10;p.champion!.quest=null;p.deck=Array.from({length:4},(_,i)=>generateCardInstance(definition('힐빌'),{instanceId:p.id+'-deck-'+i}));}
 s.players[0].board[0]={...generateCardInstance(definition('힐빌'),{instanceId:'hilbil'}),currentHealth:2,maxHealth,boardSlot:0,enteredThisTurn:false,...(regeneration?{keywords:['REGEN' as const]}:{})};
 s.players[0].board[1]={...generateCardInstance(definition(healerName),{instanceId:'healer'}),boardSlot:1,enteredThisTurn:false};
 s.players[1].board[0]={...generateCardInstance(definition('힐빌'),{instanceId:'enemy'}),currentAttack:1,currentHealth:1,boardSlot:0,enteredThisTurn:false};return s;
}
function action(s:GameState,a:Parameters<typeof executeAction>[1]){const r=executeAction(s,a);assert.ok(r.success,r.message);return r.state;}
function attack(s:GameState){return action(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'hilbil',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});}
for(const healer of ['카산드라','위마리(각성)','헬퍼','카스토'])for(const max of [4,20])test(`Hilbil recovers fully after prior healing with ${healer}, maximum HP ${max}`,()=>{
 let s=setup(healer,max);const h=s.players[0].board[1]!;
 s=applyEffect(s,'player-1',h,{type:'STRUCTURED',action:'HEAL',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1},values:{amount:1}},['hilbil']);
 s=attack(s);assert.equal(s.players[1].board[0],null);assert.equal(s.players[0].board[0]!.currentHealth,max);assert.equal(s.players[0].board[0]!.maxHealth,max);assert.equal(s.players[0].health,20);
});
for(const healer of ['카산드라','위마리(각성)'])test(`Hilbil survives real healing turn effects and regeneration before its next combat: ${healer}`,()=>{
 let s=setup(healer,20,true);s=action(s,{type:'END_TURN',playerId:'player-1'});s=action(s,{type:'END_TURN',playerId:'player-2'});assert.ok(s.players[0].board[0]!.currentHealth>2);s=attack(s);assert.equal(s.players[0].board[0]!.currentHealth,20);assert.equal(s.players[1].board[0],null);
});
test('external healing preserves Hilbil ability, but a nonlethal hit does not count as retiring an opponent',()=>{
 const s=setup('카산드라',20);s.players[1].board[0]!.currentHealth=10;const n=attack(s);assert.ok(n.players[1].board[0]);assert.equal(n.players[0].board[0]!.currentHealth,1);
});
for(const maximum of [4,20])test(`reported normal Wimari combo preserves Hilbil's combat retirement and fully heals its increased maximum ${maximum}`,()=>{
 let s=setup('위마리',maximum);s.players[0].board[1]=null;s.players[0].hand=[generateCardInstance(definition('위마리'),{instanceId:'wimari-from-hand'})];
 s=action(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'wimari-from-hand',boardSlot:1});s=attack(s);
 assert.equal(s.players[1].board[0],null);assert.equal(s.players[0].board[0]!.maxHealth,maximum+1);assert.equal(s.players[0].board[0]!.currentHealth,maximum+1);
 const retirement=s.events.find(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy');assert.equal(retirement?.source?.type,'CARD');assert.equal((retirement?.source as any).cardInstanceId,'hilbil');
});
test('Wimari combo on a nonlethal attack increases health once without granting Hilbil a kill heal',()=>{
 const s=setup('위마리',20);s.players[1].board[0]!.currentHealth=10;const n=attack(s);assert.equal(n.players[0].board[0]!.currentHealth,2);assert.equal(n.players[0].board[0]!.maxHealth,21);assert.ok(n.players[1].board[0]);
});
test('two Hilbils with Wimari only heal the actual attacker who retired the enemy',()=>{
 const s=setup('위마리',20);s.players[0].board[2]={...generateCardInstance(definition('힐빌'),{instanceId:'other-hilbil'}),currentHealth:2,maxHealth:20,boardSlot:2,enteredThisTurn:false};const n=attack(s);assert.equal(n.players[0].board[0]!.currentHealth,21);assert.equal(n.players[0].board[2]!.currentHealth,2);
});

// Damage reactions may resolve state-based deaths before Wimari's combo runs.
// Use the real current opponent abilities, rather than plain target fixtures.
for (const opponent of ['블랙 아웃', '좀비 벨로나', '뒷정리맨'])
 for (const wimaris of [0, 1, 2])
  for (const owner of [0, 1])
   test(`Hilbil kill attribution survives ${opponent}'s damage reaction, ${wimaris} Wimari(s), player ${owner+1}`, () => {
    const s=setup('위마리',20);
    if(owner===1){const [a,b]=s.players;s.players=[{...a,board:b.board},{...b,board:a.board}];s.activePlayerId='player-2';}
    const player=s.players[owner]!, enemy=s.players[1-owner]!;
    player.board[1]=null;
    for(let i=0;i<wimaris;i++)player.board[i+1]={...generateCardInstance(definition('위마리'),{instanceId:'wimari-'+i}),boardSlot:(i+1) as 1|2,enteredThisTurn:false};
    enemy.board[0]={...generateCardInstance(definition(opponent),{instanceId:'enemy'}),currentAttack:1,currentHealth:1,boardSlot:0,enteredThisTurn:false};
    const r=executeAction(JSON.parse(JSON.stringify(s)),{type:'ATTACK',playerId:player.id,attackerInstanceId:'hilbil',target:{type:'WRESTLER',playerId:enemy.id,cardInstanceId:'enemy'}});
    assert.ok(r.success,r.message);
    const hilbil=r.state.players[owner]!.board[0]!;
    assert.equal(hilbil.maxHealth,20+wimaris);
    assert.equal(hilbil.currentHealth,hilbil.maxHealth);
    assert.equal(r.state.players[owner]!.health,20+wimaris);
    const retirements=r.state.events.filter(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy');
    assert.equal(retirements.length,1);
    assert.deepEqual(retirements[0]!.source,{type:'CARD',cardInstanceId:'hilbil'});
    assert.equal(retirements[0]!.sourceContext?.sourcePlayerId,player.id);
    assert.equal(r.state.players[1-owner]!.graveyard.filter(c=>c.instanceId==='enemy').length,1);
    assert.equal(r.state.targetingState?.active??false,false);
   });

for(const opponent of ['블랙 아웃','좀비 벨로나','뒷정리맨'])
 test(`Hilbil counterattack kill heals with Wimari present against ${opponent}`,()=>{
  const s=setup('위마리',20);s.activePlayerId='player-2';
  s.players[1].board[0]={...generateCardInstance(definition(opponent),{instanceId:'enemy'}),currentAttack:1,currentHealth:1,boardSlot:0,enteredThisTurn:false};
  const n=action(s,{type:'ATTACK',playerId:'player-2',attackerInstanceId:'enemy',target:{type:'WRESTLER',playerId:'player-1',cardInstanceId:'hilbil'}});
  assert.equal(n.players[0].board[0]!.currentHealth,20);
  assert.equal(n.players[0].board[0]!.maxHealth,20); // Wimari only combos on an allied attack.
  assert.equal(n.players[0].health,20);
  assert.deepEqual(n.events.find(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy')!.source,{type:'CARD',cardInstanceId:'hilbil'});
 });

for(const trigger of ['FIRST_ATTACKED','EXACT_ZERO_DAMAGE','ATTACK_SURVIVED','SELF_ATTACK'] as const)
 test(`Automatic ${trigger} stat effect cannot erase Hilbil's lethal combat cause`,()=>{
  const s=setup('위마리',20);
  const owner=trigger==='FIRST_ATTACKED'?s.players[1]:s.players[0];
  const c=owner.board[0]!;
  c.abilities=[...c.abilities,{trigger,effects:[{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{attack:1,health:0}}]}];
  // Exactly-zero requires the initial enemy health to equal Hilbil's attack.
  s.players[1].board[0]!.currentHealth=s.players[0].board[0]!.currentAttack;
  const n=attack(s);
  assert.equal(n.players[0].board[0]!.currentHealth,21);
  assert.equal(n.events.filter(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy').length,1);
  assert.deepEqual(n.events.find(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy')!.source,{type:'CARD',cardInstanceId:'hilbil'});
 });

for(const kind of ['nonlethal','other-killer','silenced','disabled','simultaneous-death'] as const)
 test(`Hilbil/Wimari damage-reaction guard: ${kind} never awards an invalid heal`,()=>{
  const s=setup('위마리',20);
  s.players[1].board[0]={...generateCardInstance(definition('블랙 아웃'),{instanceId:'enemy'}),currentAttack:1,currentHealth:1,boardSlot:0,enteredThisTurn:false};
  if(kind==='nonlethal')s.players[1].board[0]!.currentHealth=10;
  if(kind==='silenced')s.players[0].board[0]!.isSilenced=true;
  if(kind==='disabled')s.players[0].board[0]!.isAbilityDisabled=true;
  if(kind==='simultaneous-death'){s.players[0].board[0]!.currentHealth=1;s.players[1].board[0]!.currentAttack=3;}
  if(kind==='other-killer')s.players[0].board[2]={...generateCardInstance(definition('위마리'),{instanceId:'other'}),boardSlot:2,enteredThisTurn:false};
  const n=kind==='other-killer'?action(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'other',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}}):attack(s);
  if(kind==='simultaneous-death'){
   assert.equal(n.players[0].board[0],null);
   assert.equal(n.players[0].graveyard.filter(c=>c.instanceId==='hilbil').length,1);
  }else assert.equal(n.players[0].board[0]!.currentHealth,2);
  assert.equal(n.targetingState?.active??false,false);
 });

for(const opponent of ['블랙 아웃','좀비 벨로나','뒷정리맨'])
 test(`Hilbil effect damage retains retirement healing with Wimari and ${opponent}`,()=>{
  const s=setup('위마리',20);
  s.players[1].board[0]={...generateCardInstance(definition(opponent),{instanceId:'enemy'}),currentAttack:1,currentHealth:1,boardSlot:0,enteredThisTurn:false};
  const n=applyEffect(s,'player-1',s.players[0].board[0]!,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:2}},['enemy']);
  assert.equal(n.players[0].board[0]!.currentHealth,20);
  assert.equal(n.players[0].board[0]!.maxHealth,20);
  assert.equal(n.players[0].health,20);
  assert.deepEqual(n.events.find(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy')!.source,{type:'CARD',cardInstanceId:'hilbil'});
 });


test('A serialized already-consumed Hilbil retirement cannot heal again when listeners are retried',()=>{
 const s=setup('위마리',20);const retired=s.players[1].board[0]!;
 let n=JSON.parse(JSON.stringify(attack(s))) as GameState;
 n.players[0].board[0]!.currentHealth=1;
 n=resolveCardRetiredListeners(n,'player-2',retired,n.events.find(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy')!.sourceContext);
 assert.equal(n.players[0].board[0]!.currentHealth,1);
 assert.equal(n.events.filter(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy').length,1);
 n=resolveStateBasedDeaths(n);
 assert.equal(n.players[0].board[0]!.currentHealth,1);
});

test('A defending damage reaction retains its own actor while sharing the combat root',()=>{
 const s=setup('위마리',20);const enemy=s.players[1].board[0]!;
 enemy.currentHealth=10;
 enemy.abilities=[{trigger:'SELF_DAMAGED',effects:[{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'ALL',count:4},values:{amount:1}}]}];
 const n=attack(s);
 const basic=n.events.find(e=>e.type==='DAMAGE_DEALT'&&e.reason==='COMBAT')!;
 const reaction=n.events.find(e=>e.type==='DAMAGE_DEALT'&&e.reason==='CARD_EFFECT'&&e.source?.type==='CARD'&&e.source.cardInstanceId==='enemy')!;
 assert.ok(reaction);
 assert.equal(reaction.sourceContext?.sourcePlayerId,'player-2');
 assert.equal(reaction.sourceContext?.sourceActionType,'CARD_EFFECT');
 assert.equal(reaction.sourceContext?.rootSourceEventId,basic.sourceContext?.rootSourceEventId);
});
