import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cardRecordToDefinition, type PublishedCardRecord } from '../cards/published-cards';
import { generateCardInstance } from '../cards/generation';
import type { CardInstance } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { executeAction } from '../actions/engine-actions';
import type { GameAction } from '../actions/types';
import { applyEffect, resolveTriggeredAbilities } from '../effects/effect-engine';
import { enterField } from '../engine/enter-field';
import { endTurn } from '../engine/turn-system';
import { drawCard } from '../engine/draw-card';
import type { GameState } from '../types/game-state';

// Actual 2026-10-02 production definitions. Published API plus read-only admin
// dialogs for the ten unpublished wrestlers; media and account data omitted.
const records = JSON.parse(readFileSync(new URL('./fixtures/wrestlers-2026-10-02.json', import.meta.url), 'utf8')) as PublishedCardRecord[];
const definitions = records.map(cardRecordToDefinition);
const def = (name: string) => { const d=definitions.find(x=>x.name===name); assert.ok(d,name); return d; };
const instance = (name: string, id=name, patch: Partial<CardInstance>={}) => ({...generateCardInstance(def(name),{instanceId:id,isGenerated:false}),...patch});
function setup(): GameState {
 const s=createInitialGameState(); s.cardPool=definitions; s.randomSeed=40123; s.status='IN_PROGRESS'; s.activePlayerId='player-1'; s.turn=3;
 for(const p of s.players){p.currentGold=120;p.health=20;p.hand=[];p.deck=[instance('리버덩크',`${p.id}-draw`)];p.graveyard=[];p.board=[null,null,null,null];}
 return s;
}
const onBoard=(s:GameState,name:string,slot=0,owner=0,patch:Partial<CardInstance>={})=>{const c=instance(name,`${owner}-${name}-${slot}`,{boardSlot:slot as 0|1|2|3,enteredThisTurn:false,...patch});s.players[owner].board[slot]=c;return c;};
function action(s:GameState,a:GameAction,preferred?:string): GameState {
 let r=executeAction(s,a);assert.equal(r.success,true,JSON.stringify(r.success?'':r)); let n=r.state;
 for(let i=0;n.targetingState?.active;i++){assert.ok(i<20,'target loop'); const t=n.targetingState;const id=preferred&&t.validTargetIds.includes(preferred)?preferred:t.validTargetIds.find(id=>!t.selectedTargetIds.includes(id));assert.ok(id,'valid target');r=executeAction(n,{type:'SELECT_EFFECT_TARGET',playerId:t.playerId,targetId:id});assert.equal(r.success,true);n=r.state;}
 return n;
}
function play(s:GameState,name:string,slot=0,target?:string):GameState {const id=s.players[0].board.some(c=>c?.instanceId==='source')?`source-${s.events.length}`:'source';s.players[0].hand.unshift(instance(name,id));return action(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:id,boardSlot:slot as 0|1|2|3},target);}
const source=(s:GameState)=>s.players[0].board.find(c=>c?.instanceId==='source')!;
const buff=(s:GameState,c:CardInstance,attack=0,health=0)=>applyEffect(s,'player-1',c,{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{attack,health}});
const retire=(s:GameState,c:CardInstance,owner='player-1')=>applyEffect(s,owner,c,{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});

for(const record of records.filter(r=>r.cardType==='WRESTLER'))test(`current wrestler legal play/serialization: ${record.name}`,()=>{
 const s=setup();onBoard(s,'리버덩크',0,1);s.players[0].graveyard=[instance('리버덩크','grave')];
 const n=play(s,record.name,1);assert.ok(n.events.some(e=>e.type==='CARD_PLAYED'&&e.cardInstanceId==='source'));assert.ok(!n.players[0].hand.some(c=>c.instanceId==='source'));assert.ok(JSON.stringify(n));
});

test('current RM doubles actual stats; Origin counts groups of two even with null effectId',()=>{
 let n=play(setup(),'RM우디르');assert.deepEqual([source(n).currentAttack,source(n).currentHealth],[def('RM우디르').attack*2,def('RM우디르').health*2]);
 for(const count of [0,2,3,6]){const s=setup();s.players[0].graveyard=Array.from({length:count},(_,i)=>instance('리버덩크',`g${i}`));n=play(s,'디 오리진');assert.deepEqual([source(n).currentAttack,source(n).currentHealth],[2+Math.floor(count/2),2+Math.floor(count/2)]);}
});
test('current Pi Star buffs other allies as described; Black Macaron uses remaining hand count',()=>{
 const s=setup();onBoard(s,'리버덩크',1);let n=play(s,'피 스타 세븐');assert.deepEqual([source(n).currentAttack,source(n).currentHealth],[def('피 스타 세븐').attack,def('피 스타 세븐').health]);const hpBonus=def('피 스타 세븐').rulesText.includes('+2/+2')?2:0;assert.deepEqual([n.players[0].board[1]?.currentAttack,n.players[0].board[1]?.currentHealth],[def('리버덩크').attack+2,def('리버덩크').health+hpBonus]);
 const b=setup();b.players[0].hand=[instance('리버덩크','h1'),instance('리버덩크','h2')];n=play(b,'블랙 마카롱');assert.equal(source(n).currentAttack,4);assert.equal(source(n).currentHealth,5);
});
test('current Doqung copies attack delta to health; Mandrill only triggers attack; Frankenstein only health',()=>{
 const s=setup();const c=onBoard(s,'도쿵');let n=buff(s,c,3,0);assert.deepEqual([n.players[0].board[0]?.currentAttack,n.players[0].board[0]?.currentHealth],[6,7]);
 const m=setup();const mc=onBoard(m,'만드릴쿤');n=buff(m,mc,0,2);assert.equal(n.players[0].board[0]?.currentAttack,2);n=buff(n,n.players[0].board[0]!,2,0);assert.equal(n.players[0].board[0]?.currentAttack,5);
 const f=setup();const fc=onBoard(f,'프랑켄슈타인 만드릴쿤');n=buff(f,fc,2,0);assert.equal(n.players[0].board[0]?.currentHealth,fc.currentHealth);n=buff(n,n.players[0].board[0]!,0,2);assert.equal(n.players[0].board[0]?.currentHealth,fc.currentHealth+3);
});
test('current Deheon first field attack gain grants dodge once; health gain does not retrigger',()=>{
 const s=setup();const c=onBoard(s,'데헌');let n=buff(s,c,1,0);assert.equal(n.players[0].board[0]?.dodgeCharges,1);
 n.players[0].board[0]={...n.players[0].board[0]!,dodgeCharges:0};n=buff(n,n.players[0].board[0]!,0,1);assert.equal(n.players[0].board[0]?.dodgeCharges,0);n=buff(n,n.players[0].board[0]!,1,0);assert.equal(n.players[0].board[0]?.dodgeCharges,0);
});
test('current anywhere tag buffs affect hand/deck/board but exclude graveyard and nonmatching cards',()=>{
 for(const [name,tag,atk,hp] of [['아비터','기계',0,1],['아포스틸','실험체',0,1],['팬텀워커','스트리트',1,0],['매드 사이언티스트 퍼플레인','실험체',1,1]] as const){
 const s=setup();const targetName=definitions.find(d=>d.tags?.includes(tag)&&d.name!==name)!.name;const base=def(targetName);const c=instance(targetName,'tagged',{isGenerated:true});s.players[0].hand=[{...c,instanceId:'hand'}];s.players[0].deck=[{...c,instanceId:'deck'},instance('리버덩크','untagged')];s.players[0].graveyard=[{...c,instanceId:'grave'}];onBoard(s,targetName,1);const n=play(s,name);
 for(const got of [n.players[0].hand[0],n.players[0].deck[0],n.players[0].board[1]])assert.deepEqual([got?.currentAttack,got?.currentHealth],[base.attack+atk,Math.max(1,base.health)+hp],name);
 assert.equal(n.players[0].deck[1]?.currentAttack,def('리버덩크').attack);assert.equal(n.players[0].graveyard[0]?.maxHealth,Math.max(1,base.health));
 }
});
test('current generated buffs and cost-one Question work across zones without affecting other cards',()=>{
 for(const name of ['독세아','퀘스쳔']){const s=setup();s.players[0].hand=[instance('리버덩크','g',{isGenerated:true}),instance('로드','no')];s.players[0].deck=[instance('리버덩크','d',{isGenerated:true})];onBoard(s,'리버덩크',1,0,{isGenerated:true});const n=play(s,name);for(const c of [n.players[0].hand[0],n.players[0].deck[0],n.players[0].board[1]])assert.deepEqual([c?.currentAttack,c?.currentHealth],[def('리버덩크').attack+1,def('리버덩크').health+1]);assert.equal(n.players[0].hand[1]?.currentAttack,2);}
});
test('current Platinum spends remaining gold for twice its amount; Red Range hurts opponent; Lord draws one',()=>{
 const s=setup();s.players[0].currentGold=5;let n=play(s,'플래티넘 구슬 마스터');assert.equal(n.players[0].currentGold,0);assert.deepEqual([source(n).currentAttack,source(n).currentHealth],[9,9]);
 n=play(setup(),'레드 렌지');assert.equal(n.players[1].health,19);
 n=play(setup(),'로드');assert.equal(n.players[0].hand.length,1);assert.equal(n.players[0].deck.length,0);
});
test('current WarThunder makes a full-stat wrestler under its revised rule; Joker destroys top and replaces it',()=>{
 let n=play(setup(),'워썬더');assert.equal(n.players[0].hand.length,1);const c=n.players[0].hand[0];const d=definitions.find(x=>x.id===c.definitionId)!;assert.equal(c.isGenerated,true);assert.equal(c.currentCost,d.cost);assert.equal(c.currentAttack,d.attack);assert.equal(c.currentHealth,Math.max(1,d.health));
 n=play(setup(),'아르카나 조커');assert.equal(n.players[0].deck.length,1);assert.equal(n.players[0].deck[0].isGenerated,true);assert.equal(n.players[0].graveyard.length,0);assert.ok(n.events.some(e=>e.type==='CARD_REMOVED'&&e.cardInstanceId==='player-1-draw'));
});
test('current Calavera revives cost <=3 without obsolete Taunt; Baldan copies grave stats into Zombie',()=>{
 const s=setup();s.players[0].graveyard=[instance('리버덩크','g'),instance('도쿵','too-high')];let n=play(s,'라 칼라베라');const revived=n.players[0].board.find(c=>c?.instanceId==='g');assert.ok(revived);assert.ok(!revived.keywords.includes('TAUNT'));assert.ok(n.players[0].graveyard.some(c=>c.instanceId==='too-high'));
 const b=setup();b.players[0].graveyard=[instance('리버덩크','b',{currentAttack:4,currentHealth:6,maxHealth:6})];n=play(b,'발단');const z=n.players[0].board.find(c=>c?.definitionId===def('좀비').id);assert.deepEqual([z?.currentAttack,z?.currentHealth],def('발단').rulesText.includes('파괴')?[1,1]:[4,6]);
});
test('current targeted destruction, cat reduction, heal and move-to-deck use actual selections',()=>{
 let s=setup();onBoard(s,'리버덩크',0,1);let n=play(s,'흑구슬마스터',0,'1-리버덩크-0');assert.equal(n.players[1].board[0],null);assert.ok(n.events.some(e=>e.type==='CARD_DESTROYED'&&e.cardInstanceId==='1-리버덩크-0'));assert.equal(n.players[1].graveyard.length,0);
 s=setup();onBoard(s,'로드',0,1,{currentAttack:5,currentHealth:8,maxHealth:8});n=play(s,'떼껄룩',0,'1-로드-0');assert.equal(n.players[1].board[0]?.currentAttack,1);assert.equal(n.players[1].board[0]?.isStunned,true);assert.equal(source(n).currentHealth,def('떼껄룩').health+4);
 s=setup();s.players[0].health=15;n=play(s,'휴먼쿠커',0,'player-1');assert.equal(n.players[0].health,15+Number(def('휴먼쿠커').rulesText.match(/(?:체력|HP).*?(\d+)/)?.[1]));
 s=setup();onBoard(s,'로드',0,1);n=play(s,'작은 하마',0,'1-로드-0');assert.equal(n.players[1].board[0],null);assert.equal(n.players[1].deck[0].instanceId,'1-로드-0');
});
test('current Pandora gains +2/+2 only when target ends at exactly one health; Pumpkin returns and discounts this turn',()=>{
 for(const hp of [2,3]){const s=setup();onBoard(s,'로드',0,1,{currentHealth:hp,maxHealth:hp});const n=play(s,'판도라',0,'1-로드-0');assert.equal(source(n).currentAttack,def('판도라').attack+(hp===2?2:0));}
 const s=setup();onBoard(s,'로드',1);let n=play(s,'매드 펌킨',0,'0-로드-1');assert.equal(n.players[0].board[1],null);assert.equal(n.players[0].hand[0].currentCost,2);n=endTurn(n,'player-1').state;assert.equal(n.players[0].hand[0].currentCost,3);
});
test('current Mandang summons one copy; Luigi buffs only its adjacent summoned cards; cleanup queue buffs next play',()=>{
 let n=play(setup(),'만당');assert.equal(n.players[0].board.filter(c=>c?.definitionId===def('만당').id).length,2);
 n=play(setup(),'조킹루이지',1);assert.equal(n.players[0].board.filter(Boolean).length,3);assert.ok(n.players[0].board[0]?.keywords.includes('TAUNT'));assert.ok(n.players[0].board[2]?.keywords.includes('TAUNT'));assert.ok(!source(n).keywords.includes('TAUNT'));
 n=play(setup(),'뒷정리맨');n=play(n,'리버덩크',1);assert.equal(n.players[0].board[1]?.currentHealth,4);n=play(n,'리버덩크',2);assert.equal(n.players[0].board[2]?.currentHealth,2);
});
test('current Wiri creates equal-stat female then summons her on retire; Maros silence does not run on destroy',()=>{
 let n=play(setup(),'위리놈');assert.deepEqual([n.players[0].hand[0].currentAttack,n.players[0].hand[0].currentHealth],[4,4]);n=retire(n,source(n));assert.ok(n.players[0].board.some(c=>c?.definitionId===def('위리녀').id));assert.equal(n.players[0].hand.length,0);
 for(const mode of ['RETIRE','DESTROY'] as const){const s=setup();const m=onBoard(s,'마로쓰 2세');onBoard(s,'로드',0,1);n=applyEffect(s,'player-1',m,{type:'STRUCTURED',action:mode,target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});assert.equal(n.players[1].board[0]?.isSilenced,mode==='RETIRE');}
});
test('current Sea Monster discounts only in hand on allied RETIRE; Destroy and opposing retire excluded',()=>{
 for(const owner of [0,1])for(const mode of ['RETIRE','DESTROY'] as const){const s=setup();s.players[0].hand=[instance('씨 몬스터','sea')];const c=onBoard(s,'리버덩크',0,owner);const n=applyEffect(s,s.players[owner].id,c,{type:'STRUCTURED',action:mode,target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});assert.equal(n.players[0].hand[0].currentCost,owner===0&&mode==='RETIRE'?9:10);}
});
test('current Yeager buffs allied Soldier on play/summon; Yeoul turn-start gold; Great Chan swaps stats',()=>{
 const s=setup();onBoard(s,'예거');const n=play(s,'용병',1);assert.deepEqual([n.players[0].board[1]?.currentAttack,n.players[0].board[1]?.currentHealth],[2,2]);
 let y=play(setup(),'여울');const before=y.players[0].currentGold;y=resolveTriggeredAbilities(y,'player-1',source(y),'TURN_START');assert.equal(y.players[0].currentGold,before+1);
 let g=play(setup(),'그레이트 챤');g=action(g,{type:'END_TURN',playerId:'player-1'});g=action(g,{type:'END_TURN',playerId:'player-2'});g=action(g,{type:'USE_ACTIVE',playerId:'player-1',cardInstanceId:'source'});assert.deepEqual([source(g).currentAttack,source(g).currentHealth],[4,2]);
});
test('current Purple Rain reduces all enemy attack and stuns/silences zero attack',()=>{
 const s=setup();onBoard(s,'로드',0,1,{currentAttack:2});onBoard(s,'루나',1,1,{currentAttack:5});const n=play(s,'퍼플레인');assert.deepEqual([n.players[1].board[0]?.currentAttack,n.players[1].board[0]?.isStunned,n.players[1].board[0]?.isSilenced],[0,true,true]);assert.equal(n.players[1].board[1]?.currentAttack,3);
});
test('current Ozen selects cost-one nonchampion only; Gilded discounts every qualifying hand card, not deck',()=>{
 const s=setup();onBoard(s,'리버덩크',0,1);onBoard(s,'로드',1,1);let n=play(s,'오젠');assert.equal(n.players[1].board[0],null);assert.ok(n.players[1].board[1]);
 const g=setup();g.players[0].hand=[instance('씨 몬스터','g1'),instance('디 오리진','g2'),instance('로드','g3')];g.players[0].deck=[instance('씨 몬스터','gd')];n=play(g,'도금구슬 마스터');assert.deepEqual(n.players[0].hand.map(c=>c.currentCost),[9,5,3]);assert.equal(n.players[0].deck[0].currentCost,10);
});
test('current Bullocks summons from hand on own turn end, but cannot enter a full board',()=>{
 for(const full of [false,true]){const s=setup();s.players[0].hand=[instance('불록스','bull')];if(full)for(let i=0;i<4;i++)onBoard(s,'리버덩크',i);const r=endTurn(s,'player-1');assert.equal(r.success,true);assert.equal(r.state.players[0].hand.length,full?1:0);assert.equal(r.state.players[0].board.filter(Boolean).length,full?4:1);}
});
test('current zombie Bellona damage summons/merges a zombie; zombie Deheon retirement adds max HP across both owners',()=>{
 let s=setup();let b=onBoard(s,'좀비 벨로나');let n=applyEffect(s,'player-1',b,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{amount:1}});let z=n.players[0].board.find(c=>c?.definitionId===def('좀비').id);assert.deepEqual([z?.currentAttack,z?.currentHealth],[1,1]);
 n=applyEffect(n,'player-1',n.players[0].board[0]!,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{amount:1}});assert.equal(n.players[0].board.filter(c=>c?.definitionId===def('좀비').id).length,1);z=n.players[0].board.find(c=>c?.definitionId===def('좀비').id);assert.deepEqual([z?.currentAttack,z?.currentHealth],[2,2]);
 s=setup();const d=onBoard(s,'좀비 데헌');for(const p of s.players){p.hand=[instance('좀비 벨로나','zh')];p.deck=[instance('좀비 벨로나','zd')];p.graveyard=[instance('좀비 벨로나','zg')];}onBoard(s,'좀비 벨로나',1,1);n=retire(s,d);for(const p of n.players)for(const c of [...p.hand,...p.deck]){assert.equal(c.maxHealth,5);assert.equal(c.currentHealth,3);}assert.equal(n.players[1].board[1]?.maxHealth,5);for(const p of n.players)assert.equal(p.graveyard.find(c=>c.instanceId==='zg')?.maxHealth,3);
});
test('current zombie Platinum absorbs strongest zombie or creates 2/2 when absent',()=>{
 let n=play(setup(),'좀비 플래티넘구슬 마스터');assert.deepEqual([source(n).currentAttack,source(n).currentHealth],[5,5]);assert.ok(n.players[0].board.some(c=>c?.definitionId===def('좀비').id&&c.currentAttack===2));
 const s=setup();onBoard(s,'좀비',1,0,{currentAttack:4,currentHealth:5,maxHealth:5});n=play(s,'좀비 플래티넘구슬 마스터');assert.deepEqual([source(n).currentAttack,source(n).currentHealth],[7,8]);
});
test('current Maid Pandora transforms only after her own damage retires selected card',()=>{
 for(const hp of [1,3]){const s=setup();onBoard(s,'리버덩크',0,1,{currentHealth:hp,maxHealth:hp});const n=play(s,'하녀 판도라',0,'1-리버덩크-0');assert.equal(source(n).definitionId,def(hp===1?'늑대인간 판도라':'하녀 판도라').id);}
});
test('current wolf turn start absorbs retired ally attack and health',()=>{
 const s=setup();const w=onBoard(s,'늑대인간 판도라');const victim=onBoard(s,'로드',1,0,{currentAttack:4,currentHealth:7,maxHealth:7});let n=resolveTriggeredAbilities(s,'player-1',w,'TURN_START');n=action(n,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:victim.instanceId});assert.deepEqual([n.players[0].board[0]?.currentAttack,n.players[0].board[0]?.currentHealth],[6,13]);assert.equal(n.players[0].board[1],null);
});
test('current Natoma combo adds attacking ally attack and own turn end sets attack to zero',()=>{
 const s=setup();onBoard(s,'나토마토');const a=onBoard(s,'로드',1);onBoard(s,'루나',0,1,{currentHealth:30,maxHealth:30,isAbilityDisabled:true});let n=action(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:a.instanceId,target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'1-루나-0'}});assert.equal(n.players[0].board[0]?.currentAttack,2);n=endTurn(n,'player-1').state;assert.equal(n.players[0].board[0]?.currentAttack,0);
});
test('current Luna silences its first attacker and herself; Kamisator steals one actual enemy deck card per attack',()=>{
 let s=setup();const a=onBoard(s,'로드');onBoard(s,'루나',0,1);let n=action(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:a.instanceId,target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'1-루나-0'}});assert.equal(n.players[0].board[0]?.isSilenced,true);assert.equal(n.players[1].board[0]?.isSilenced,true);assert.equal(Boolean(n.players[1].board[0]?.isAbilityDisabled),false);
 s=setup();const k=onBoard(s,'카미사토르');onBoard(s,'리버덩크',0,1,{currentHealth:20,maxHealth:20});n=action(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:k.instanceId,target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'1-리버덩크-0'}});assert.equal(n.players[1].deck.length,0);assert.equal(n.players[0].hand[0]?.instanceId,'player-2-draw');
});
test('current Pandora champion token quest deployment destroys target and absorbs its attack; later combat also absorbs',()=>{
 const s=setup();onBoard(s,'로드',0,1,{currentAttack:4});let n=enterField(s,'player-1',instance('챔피언 판도라(폭주)','rampage',{isDirectDeployedChampion:true}),0,undefined,undefined,'CHAMPION_DEPLOY');n=action(n,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:'1-로드-0'});assert.equal(n.players[0].board[0]?.currentAttack,10);
 onBoard(n,'로드',0,1,{currentAttack:3,currentHealth:1,maxHealth:1});n=action(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'rampage',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'1-로드-0'}});assert.equal(n.players[0].board[0]?.currentAttack,13);
});
test('current Zombie grows on other retirements, merges summons, and ignores destroy',()=>{
 for(const mode of ['RETIRE','DESTROY'] as const){const s=setup();onBoard(s,'좀비');const c=onBoard(s,'리버덩크',1,1);const n=applyEffect(s,'player-2',c,{type:'STRUCTURED',action:mode,target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});assert.equal(n.players[0].board[0]?.currentAttack,mode === 'RETIRE' ? 2 : 1)
;}
});
for(const name of ['레이븐','스카드','엘리트 용병','용병','위리녀','하스이','벨로나','황소할배','여울의 보디가드','리버덩크','보드바'])test(`current vanilla/keyword rules: ${name}`,()=>{
 let n=play(setup(),name);const c=source(n);assert.ok(c);for(const keyword of def(name).keywords)assert.ok(c.keywords.includes(keyword));
 if(c.keywords.includes('RUSH')||c.keywords.includes('SURPRISE')){onBoard(n,'로드',0,1,{currentAttack:0,currentHealth:30,maxHealth:30});const r=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'1-로드-0'}});assert.equal(r.success,true,name);}
 else if(!c.isChampionToken){const r=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'source',target:{type:'PLAYER',playerId:'player-2'}});assert.equal(r.success,false,'summoning restriction');}
 if(c.keywords.includes('IMMUNE')){const before=c.currentHealth;n=applyEffect(n,'player-2',instance('로드','caster'),{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:2}});assert.ok(!n.targetingState?.validTargetIds.includes('source'));assert.equal(source(n).currentHealth,before);}
});
test('current targeted entrance cancel returns exact card and refunds cost; no-target entrance still plays',()=>{
 const s=setup();onBoard(s,'로드',0,1);s.players[0].hand=[instance('흑구슬마스터','cancel')];const r=executeAction(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'cancel',boardSlot:0});assert.equal(r.success,true);assert.ok(r.state.targetingState?.active);const c=executeAction(r.state,{type:'CANCEL_EFFECT_TARGET',playerId:'player-1'});assert.equal(c.success,true);assert.equal(c.state.players[0].currentGold,120);assert.ok(c.state.players[0].hand.some(x=>x.instanceId==='cancel'));assert.equal(c.state.players[0].board[0],null);assert.ok(c.state.players[1].board[0]);const n=play(setup(),'흑구슬마스터');assert.ok(source(n));
});

// Draw preserves deck modifiers; explicit zone returns reset stats, and graveyard cannot be buffed.
test('drawing preserves buffs and cost changes applied in the deck',()=>{
 const s=setup();s.players[0].deck=[instance('로드','draw-reset',{currentAttack:8,currentHealth:9,maxHealth:9,currentCost:1})];
 const n=drawCard(s,'player-1');const c=n.players[0].hand[0];
 assert.deepEqual([c.currentAttack,c.currentHealth,c.maxHealth,c.currentCost],[8,9,9,1]);
});
test('zone reset: buffed hand card sent to deck resets stats/cost',()=>{
 const s=setup();const caster=onBoard(s,'리버덩크');s.players[0].hand=[instance('로드','return-reset',{currentAttack:8,currentHealth:9,maxHealth:9,currentCost:1})];
 const n=applyEffect(s,'player-1',caster,{type:'STRUCTURED',action:'MOVE_TO_DECK',target:{zone:'HAND',owner:'SELF',selection:'ALL',count:1},values:{deckPosition:'TOP'}});
 const c=n.players[0].deck[0];assert.deepEqual([c.currentAttack,c.currentHealth,c.maxHealth,c.currentCost],[2,3,3,3]);assert.equal(n.players[0].hand.length,0);
});
test('zone reset: retirement clears buffs and graveyard rejects later stat buffs',()=>{
 const s=setup();const c=onBoard(s,'로드',0,0,{currentAttack:8,currentHealth:9,maxHealth:9,currentCost:1});let n=retire(s,c);
 let g=n.players[0].graveyard[0];assert.deepEqual([g.currentAttack,g.currentHealth,g.maxHealth,g.currentCost],[2,3,3,3]);
 n=applyEffect(n,'player-1',instance('아포스틸','caster'),{type:'STRUCTURED',action:'BUFF',target:{zones:['HAND','DECK','BOARD','GRAVEYARD'],owner:'SELF',selection:'ALL',count:100},values:{attack:2,health:2}});
 g=n.players[0].graveyard[0];assert.deepEqual([g.currentAttack,g.currentHealth,g.maxHealth],[2,3,3]);
});

test('zombie grows from allied and enemy RETIRE, never DESTROY', () => {
 for (const owner of [0, 1]) for (const mode of ['RETIRE', 'DESTROY'] as const) {
  const s = setup(); onBoard(s, '좀비', 0, 0); const victim = onBoard(s, '리버덩크', 1, owner);
  const n = applyEffect(s, s.players[owner].id, victim, { type: 'STRUCTURED', action: mode, target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 } });
  const expected = mode === 'RETIRE' ? 2 : 1;
  assert.deepEqual([n.players[0].board[0]?.currentAttack, n.players[0].board[0]?.maxHealth], [expected, expected]);
 }
});

test('Maid Pandora transforms even when its stored form id is stale', () => {
 const s = setup();
 const maid = def('하녀 판도라');
 const broken = { ...maid, abilities: maid.abilities.map(ability => ({ ...ability, effects: ability.effects.map(effect => effect.type === 'STRUCTURED' && effect.action === 'TRANSFORM_SOURCE' ? { ...effect, values: { ...effect.values, definitionRef: { id: 'obsolete-form-id' } } } : effect) })) };
 s.cardPool = definitions.map(d => d.id === maid.id ? broken : d);
 const victim = onBoard(s, '리버덩크', 0, 1, {currentHealth:1,maxHealth:1});
 s.players[0].hand = [generateCardInstance(broken, {instanceId:'source',isGenerated:false})];
 const n = action(s, {type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'source',boardSlot:0}, victim.instanceId);
 assert.equal(source(n).definitionId, def('늑대인간 판도라').id);
});
