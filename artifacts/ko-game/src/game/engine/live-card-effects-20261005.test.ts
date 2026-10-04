import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardRecordToDefinition } from '../cards/published-cards';
import { generateCardInstance } from '../cards/generation';
import { createInitialGameState } from './create-initial-game-state';
import { attack } from './combat';
import { endTurn } from './turn-system';
import { executeAction } from '../actions/engine-actions';
import { healNewCardAware } from './new-card-rules';
const records=JSON.parse(readFileSync(new URL('../qa/fixtures/cards-2026-10-05-public.json',import.meta.url),'utf8'));
const definitions=records.map(cardRecordToDefinition);
const def=(name:string)=>definitions.find((d:any)=>d.name===name)!;
const unit={id:'live-target',name:'target',cardType:'WRESTLER' as const,cost:1,attack:1,health:10,rulesText:'',keywords:[],abilities:[],tags:['디 어쏘리티']};
function setup(name:string){const s=createInitialGameState();s.status='IN_PROGRESS';s.activePlayerId='player-1';s.turn=3;s.cardPool=[...definitions,unit];for(const p of s.players){p.health=30;p.maxHealth=30;p.deck=Array.from({length:10},(_,i)=>generateCardInstance(unit,{instanceId:p.id+'deck'+i}));}s.players[0].board[0]={...generateCardInstance(def(name),{instanceId:'source'}),boardSlot:0,enteredThisTurn:false};s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'attacker'}),boardSlot:0,enteredThisTurn:false};return s;}
test('live Zombie Bellona summons Zombie when attacked through actual combat',()=>{const s=setup('좀비 벨로나');s.activePlayerId='player-2';const r=attack(s,'player-2','attacker',{type:'WRESTLER',playerId:'player-1',cardInstanceId:'source'});assert.ok(r.success);assert.equal(r.state.players[0].board.filter(c=>c?.definitionId===def('좀비').id).length,1);});
test('live Helper uses overflow from own previous turn across opposing turn',()=>{let s=setup('헬퍼');s=healNewCardAware(s,'player-1',6);let r=endTurn(s,'player-1');assert.ok(r.success);r=endTurn(r.state,'player-2');assert.ok(r.success);assert.ok(r.state.players[0].hand.some(c=>c.definitionId===def('냥냥 펀치').id));});
test('live Cassandra heals field and champion through actual end turn',()=>{const s=setup('카산드라');s.players[0].health=20;s.players[0].board[1]={...generateCardInstance(unit,{instanceId:'ally'}),boardSlot:1,currentHealth:2};const r=endTurn(s,'player-1');assert.ok(r.success);assert.equal(r.state.players[0].health,21);assert.equal(r.state.players[0].board[1]!.currentHealth,3);});

test('live Zombie Bellona triggers on counter damage, silence and zero damage suppress it',()=>{for(const mode of ['counter','silent','zero'] as const){const s=setup('좀비 벨로나');s.players[0].board[0]!.currentAttack=1;if(mode==='silent')s.players[0].board[0]!.isSilenced=true;if(mode==='zero')s.players[1].board[0]!.currentAttack=0;const r=attack(s,'player-1','source',{type:'WRESTLER',playerId:'player-2',cardInstanceId:'attacker'});assert.ok(r.success);assert.equal(r.state.players[0].board.filter(c=>c?.definitionId===def('좀비').id).length,mode==='counter'?1:0);}});

for (const name of ['강제 침묵','만찬','밀쳐내기','생명의 교환','침묵의 장막','탈출','태그 체인지','냥냥 펀치','반으로 갈라져 죽어!','어셈블!!!']) test(`live technique ${name} casts, selects legal targets and changes actual state`,()=>{
 const s=setup(name);const spell=s.players[0].board[0]!;s.players[0].board[0]={...generateCardInstance(unit,{instanceId:'ally'}),boardSlot:0,currentHealth:2};s.players[1].board[0]!.currentHealth=7;s.players[0].hand=[spell,generateCardInstance(unit,{instanceId:'hand'})];s.players[0].currentGold=100;
 let r=executeAction(s,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'source'});assert.ok(r.success,name);
 for(let i=0;r.state.targetingState?.active&&i<8;i++){const targetId=r.state.targetingState.validTargetIds[0];assert.ok(targetId,name);r=executeAction(r.state,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId});assert.ok(r.success,name);}
 assert.ok(!r.state.targetingState?.active,name);assert.equal(r.state.players[0].currentGold,100-spell.currentCost);
 const a=r.state.players[0],b=r.state.players[1];
 if(name==='만찬')assert.deepEqual([a.board[0]!.currentHealth,a.board[0]!.maxHealth],[5,13]);
 if(['강제 침묵','침묵의 장막'].includes(name))assert.ok(b.board[0]!.isSilenced);
 if(name==='밀쳐내기')assert.ok(b.board[0]!.isStunned);
 if(name==='생명의 교환'){assert.deepEqual([a.board[0]!.currentHealth,b.board[0]!.currentHealth],[7,2]);assert.ok(a.board[0]!.isStunned&&b.board[0]!.isStunned);}
 if(name==='탈출'){assert.equal(a.board[0],null);assert.ok(a.hand.some(c=>c.instanceId==='ally'&&c.currentHealth===10));}
 if(name==='태그 체인지'){assert.equal(a.board[0]!.instanceId,'hand');assert.equal(a.board[0]!.currentAttack,2);}
 if(name==='냥냥 펀치')assert.equal(r.state.events.filter(e=>e.type==='DAMAGE_DEALT').reduce((sum,e)=>sum+(e.amount??0),0),5);
 if(name==='반으로 갈라져 죽어!')assert.equal(r.state.status,'FINISHED');
 if(name==='어셈블!!!')assert.equal(a.board.filter(Boolean).length,4);
});

test('live catalog normalization preserves all 85 original cost/ATK/HP specs',()=>{assert.equal(records.length,85);for(const record of records){const original=structuredClone(record);const d=cardRecordToDefinition(record);assert.deepEqual(record,original);assert.deepEqual([d.cost,d.attack,d.health],[record.cost,record.attack,record.health],record.name);}});
test('live Cassandra entrance via hand play buffs both tagged sides and grants regen',()=>{const s=setup('카산드라');const source=s.players[0].board[0]!;s.players[0].board[0]={...generateCardInstance(unit,{instanceId:'ally'}),boardSlot:0};s.players[0].hand=[source];s.players[0].currentGold=10;const r=executeAction(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'source',boardSlot:1});assert.ok(r.success);for(const c of [r.state.players[0].board[0]!,r.state.players[1].board[0]!]){assert.equal(c.maxHealth,11);assert.ok(c.keywords.includes('REGEN'));}});
