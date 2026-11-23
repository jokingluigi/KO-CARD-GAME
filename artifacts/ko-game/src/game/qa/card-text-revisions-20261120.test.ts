import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cardRecordToDefinition,type PublishedCardRecord} from '../cards/published-cards';
import {CARD_TEXT_REVISIONS_20261120} from '../cards/card-text-revisions-20261120';
import {createInitialGameState} from '../engine/create-initial-game-state';
import {generateCardInstance} from '../cards/generation';
import {destroyCard} from '../engine/destroy-card';
import {fieldInvulnerable} from '../engine/balance-effects';
import type {CardDefinition} from '../cards/types';
const records:PublishedCardRecord[]=JSON.parse(readFileSync('docs/qa/snapshots/20261118-admin/cards.json','utf8'));
const strip=(d:unknown)=>JSON.stringify(d,(k,v)=>k==='rulesText'||k==='text'?undefined:v);
const stub=(id:string,text:string):PublishedCardRecord=>({...(records.find(r=>r.id===id)??{id,name:id,cardType:'WRESTLER',cost:1,attack:1,health:1,keywords:[],tags:[],effectId:null,effectConfig:{},rarity:'NORMAL',isToken:false,isChampionToken:false,lore:''}),text} as PublishedCardRecord);

test('every reworded card text resolves exactly the same effects and shows the new wording',()=>{
 for(const [id,{from,to}] of Object.entries(CARD_TEXT_REVISIONS_20261120)){
  const before=cardRecordToDefinition(stub(id,from)),after=cardRecordToDefinition(stub(id,to));
  assert.equal(strip(after),strip(before),id);
  assert.equal(after.rulesText,to,id);
 }
});
test('a later administrator wording is not mapped back to the old text',()=>{
 const [id,{to}]=Object.entries(CARD_TEXT_REVISIONS_20261120)[0]!;
 assert.equal(cardRecordToDefinition(stub(id,to+' 추가')).rulesText,to+' 추가');
});
test("'무적' cards cannot be destroyed while the condition holds",()=>{
 const joker=cardRecordToDefinition(records.find(r=>r.name==='조킹루이지')!);
 const ally:CardDefinition={id:'authority',name:'동료',cardType:'WRESTLER',cost:1,attack:1,health:3,keywords:[],abilities:[],tags:['디 어쏘리티'],rulesText:'',isToken:false,isChampionToken:false};
 const s=createInitialGameState();s.status='IN_PROGRESS';s.events=[];s.cardPool=[joker,ally];
 const j={...generateCardInstance(joker,{instanceId:'joker'}),boardSlot:0,enteredThisTurn:false};
 const a={...generateCardInstance(ally,{instanceId:'ally'}),boardSlot:1,enteredThisTurn:false};
 s.players[0].board=[j,a,null,null];
 assert.ok(fieldInvulnerable(s,j));
 assert.equal(destroyCard(s,s.players[0].id,'joker').success,false);
 s.players[0].board=[j,null,null,null];
 assert.equal(destroyCard(s,s.players[0].id,'joker').success,true);
});

test('a card reworded in the admin studio keeps the effects of its saved effect wording',()=>{
 const rec=records.find(r=>r.name==='고통 연주자')??records[0]!;
 const base=cardRecordToDefinition(rec);
 const reworded=cardRecordToDefinition({...rec,text:'완전히 다른 설명 문장',effectConfig:{...rec.effectConfig,effectText:rec.text}});
 assert.equal(strip(reworded).replace(/,?"effectText":"[^"]*"/,''),strip(base));
 assert.equal(reworded.rulesText,'완전히 다른 설명 문장');
});
