import test from 'node:test';
import assert from 'node:assert/strict';
import { checksum, decodeDeck, encodeDeck, deckShareLink, deckEntityRevision, type SharedDeck } from './deck-share-code';
import { createDeckSnapshot, inspectSharedDeck } from './deck-share-validation';
const champion = { id: '11111111-1111-4111-8111-111111111111', name: '공개 챔피언', status: 'PUBLISHED' } as any;
const cards = Array.from({length: 9}, (_, i) => ({id: `${String(i).padStart(8, '0')}-1234-4123-8123-123456789abc`, name: '선수 '+i, status: 'PUBLISHED', rarity: 'NORMAL', isToken: false, isChampionToken: false, cardType: 'WRESTLER', cost: 1, attack: 1, health: 2, text: '효과 없음', quantity: 3})) as any[];
const ids = cards.flatMap((c, i) => Array(i < 8 ? 3 : 1).fill(c.id));
const snapshot = () => createDeckSnapshot('우리 덱 🌙', champion, ids, new Map(cards.map(c => [c.id,c])));
test('compact UTF-8 UUID snapshot round-trips identically through a URL without I/O', () => {
  const deck = snapshot(), code = encodeDeck(deck), restored = decodeDeck(code);
  assert.deepEqual(restored, {...deck,cards:[...deck.cards].sort((a,b)=>a.id.localeCompare(b.id))});
  assert.deepEqual(decodeDeck(deckShareLink(code,'https://game.invalid')),restored);
  assert.deepEqual(decodeDeck(deckShareLink(code,'https://game.invalid','/nested/')),restored);
  assert.equal(restored.cards.reduce((s,c)=>s+c.count,0),25);
  assert.ok(code.length < 400); assert.match(code,/^KO1\.[A-Za-z0-9_-]+$/);
});
test('original edits cannot mutate an encoded snapshot; stable ID remains and revisions warn of current changes', () => {
  const deck = snapshot(), code = encodeDeck(deck);
  const edited = {...cards[0],name:'새 이름',text:'다른 효과'};
  const check = inspectSharedDeck(decodeDeck(code),{cards:[edited,...cards.slice(1)],champions:[champion]},[champion]);
  assert.equal(check.rows[0]!.id,cards[0].id); assert.deepEqual(check.changed,['새 이름']); assert.equal(decodeDeck(code).name,'우리 덱 🌙');
  deck.name = '수정한 원본';deck.cards[0]!.count=1; assert.equal(decodeDeck(code).cards[0]!.count,3);
});
test('damaged, oversized, unknown-version, malformed and hostile inputs are rejected', () => {
  const code=encodeDeck(snapshot());
  for(const value of ['',code.slice(0,-5),code.slice(0,20)+'A'+code.slice(21),'KO2.'+code.slice(4),'KO1.'+'a'.repeat(6000),'x'.repeat(7001),'https://game.invalid/decks?deck='+code,code+'=']) assert.throws(()=>decodeDeck(value));
  for(const edit of [ {name:''},{name:'x'.repeat(31)},{name:'x\ny'},{championId:''},{championRevision:-1},{cards:[{id:'x',count:25,revision:NaN}]},{cards:[{id:'x',count:24,revision:0}]},{cards:[{id:'x',count:24,revision:0},{id:'x',count:1,revision:0}]} ]) assert.throws(()=>encodeDeck({...snapshot(),...edit} as SharedDeck));
});
test('malicious valid-checksum duplicate records are rejected by the decoder',()=>{
  const deck:SharedDeck={name:'덱',championId:'champ',championRevision:0,cards:[{id:'a',count:24,revision:0},{id:'b',count:1,revision:0}]};
  const bytes=Uint8Array.from(atob(encodeDeck(deck).slice(4).replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  const at=bytes.lastIndexOf('b'.charCodeAt(0)); assert.ok(at>0); bytes[at]='a'.charCodeAt(0);
  new DataView(bytes.buffer).setUint32(bytes.length-4,checksum(bytes.slice(0,-4)),true);
  assert.throws(()=>decodeDeck('KO1.'+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')));
});
test('public catalog only; hidden cards, tokens, missing cards, copy/legendary limits cannot be exported',()=>{
  for(const changed of [{status:'DRAFT'},{status:'DISABLED'},{isToken:true},{isChampionToken:true},{rarity:'LEGENDARY'},{rarity:'EPIC'}]) {
    const catalog=[{...cards[0],...changed},...cards.slice(1)]; assert.throws(()=>createDeckSnapshot('덱',champion,ids,new Map(catalog.map(c=>[c.id,c]))));
  }
  assert.throws(()=>createDeckSnapshot('덱',{...champion,status:'DRAFT'},ids,new Map(cards.map(c=>[c.id,c]))));
  assert.throws(()=>createDeckSnapshot('덱',champion,ids,new Map()));
});
test('recipient uses their own quantities/champion ownership; missing and disabled items remain previewable but unsavable',()=>{
  const deck=snapshot(), recipient={cards:cards.map(c=>({...c,quantity:0})),champions:[]};
  let check=inspectSharedDeck(deck,recipient,[champion]); assert.equal(check.ownershipIssues.length,10);assert.equal(check.ruleIssues.length,0);assert.equal(check.rows.length,9);
  check=inspectSharedDeck(deck,{cards:cards.slice(1),champions:[]},[]); assert.equal(check.champion,undefined);assert.ok(check.ruleIssues.length>=2);
  check=inspectSharedDeck(deck,{cards,champions:[champion]},[champion]);assert.deepEqual(check.ownershipIssues,[]);assert.deepEqual(check.ruleIssues,[]);
  assert.equal(deckEntityRevision({...cards[0],quantity:200,userId:'private'}),deckEntityRevision(cards[0]));
});
