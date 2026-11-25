import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAction } from '../actions/engine-actions';
import { createInitialGameState } from './create-initial-game-state';
import { drawCard } from './draw-card';
import { cardRecordToDefinition, type PublishedCardRecord } from '../cards/published-cards';
import type { CardDefinition } from '../cards/types';
import type { GameState } from '../types/game-state';

// 운영 관리자 화면의 실제 카드 기록 (2026-11-25)
const base = { lore:'', rarity:'LEGENDARY', isStarterGrant:false, isChampionToken:false, imageUrl:null, imageAssetId:null, status:'DRAFT' } as unknown as PublishedCardRecord;
const starla = { ...base, id:'5a980204-0e83-446f-9660-f893b28d23af', name:'스타라', cardType:'WRESTLER', cost:4, attack:1, health:5,
  text:"카운트다운(3):'대망의 라스트 스테이지'를 발동합니다.", keywords:['REGEN','COUNTDOWN'], tags:['슈퍼스타'], isToken:false, effectId:null, effectConfig:{countdownTurns:3} } as PublishedCardRecord;
const stage = { ...base, id:'30900369-2bc3-43c0-8db1-e1f14909f9a8', name:'대망의 라스트 스테이지', cardType:'TECHNIQUE', cost:0, attack:0, health:0, rarity:'TOKEN',
  text:'모두에게 10 데미지를 줍니다. 이 효과로 양 측의 챔피언이 동시에 체력이 다 떨어지면 상대 챔피언의 승리입니다.', keywords:[], tags:[], isToken:true, effectId:null, effectConfig:{} } as PublishedCardRecord;
const filler: CardDefinition = { id:'filler', name:'튼튼이', cardType:'WRESTLER', cost:1, attack:1, health:30, rulesText:'', keywords:[], abilities:[], isToken:false, isChampionToken:false };
const small: CardDefinition = { ...filler, id:'small', name:'약골', health:4 };

function setup(myHp: number, foeHp: number): GameState {
  const s = cardRecordToDefinition(starla), t = cardRecordToDefinition(stage);
  let state = createInitialGameState(undefined, [s, t, filler, small], undefined, [[s.id, ...Array(24).fill(filler.id)], Array(25).fill(filler.id)]);
  state.status = 'IN_PROGRESS'; state.turn = 1; state.activePlayerId = 'player-1';
  for (const p of state.players) { p.currentGold = 100; p.mulliganUsed = true; }
  state = JSON.parse(JSON.stringify(drawCard(state, 'player-1')));
  const r = executeAction(state, { type:'PLAY_WRESTLER', playerId:'player-1', cardInstanceId: state.players[0].hand.find(c=>c.definitionId===s.id)!.instanceId, boardSlot:0 });
  assert.ok(r.success, r.message); state = r.state;
  // 상대 필드에 약한 선수와 튼튼한 선수 한 장씩
  const mk = (def: CardDefinition, id: string, slot: number) => ({ ...state.players[1].deck[0]!, instanceId:id, definitionId:def.id, currentAttack:1, currentHealth:def.health, maxHealth:def.health, baseHealth:def.health, boardSlot:slot });
  state.players[1].board[0] = mk(small, 'foe-small', 0) as never; state.players[1].board[1] = mk(filler, 'foe-tough', 1) as never;
  state.players[0].health = myHp; state.players[1].health = foeHp;
  if (state.players[0].champion) state.players[0].champion.health = myHp;
  if (state.players[1].champion) state.players[1].champion.health = foeHp;
  return state;
}
const end = (s: GameState) => { const r = executeAction(s, { type:'END_TURN', playerId:s.activePlayerId! }); assert.ok(r.success, r.message); return r.state; };
function runCountdown(state: GameState) { for (let i = 0; i < 8 && state.status === 'IN_PROGRESS'; i++) { const before = state.players[0].board[0]?.countdownResolved; state = end(state); if (!before && state.events.some(e=>e.type==='DAMAGE_DEALT' && 'amount' in e && e.amount===10)) break; } return state; }

test('스타라: 카드 효과가 연결된다 (카운트다운 3)', () => {
  const def = cardRecordToDefinition(starla);
  assert.ok(def.abilities.some(a => a.trigger === 'COUNTDOWN'), '카운트다운 효과가 없다');
  assert.ok(cardRecordToDefinition(stage).abilities.some(a => a.trigger === 'ACTIVE'), '라스트 스테이지 효과가 없다');
});

test('카운트다운 끝: 모두에게 10 데미지 (선수 + 양쪽 챔피언)', () => {
  const state = runCountdown(setup(25, 25));
  assert.equal(state.status, 'IN_PROGRESS');
  assert.equal(state.players[0].health, 15);
  assert.equal(state.players[1].health, 15);
  assert.equal(state.players[1].board.find(c=>c?.instanceId==='foe-small'), undefined, '체력 4 선수는 쓰러져야 함');
  assert.equal(state.players[1].board.find(c=>c?.instanceId==='foe-tough')?.currentHealth, 20);
  assert.equal(state.players[0].board.find(c=>c?.definitionId===starla.id), undefined, '스타라 자신도 10 데미지로 쓰러짐');
});

test('양쪽 챔피언이 동시에 쓰러지면 상대(발동 안 한 쪽) 승리', () => {
  const state = runCountdown(setup(8, 8));
  assert.equal(state.status, 'FINISHED');
  assert.equal(state.winnerId, 'player-2');
});

test('상대만 쓰러지면 스타라 주인 승리', () => {
  const state = runCountdown(setup(25, 9));
  assert.equal(state.status, 'FINISHED');
  assert.equal(state.winnerId, 'player-1');
});

test('스타라 주인만 쓰러지면 상대 승리', () => {
  const state = runCountdown(setup(7, 25));
  assert.equal(state.status, 'FINISHED');
  assert.equal(state.winnerId, 'player-2');
});

// ── 2026-11-25 추가 글: "이 카드는 손패에 들어온 즉시 효과가 발동됩니다."
import { applyEffect } from '../effects/effect-engine';
import { normalizeCardRarityForType } from '../cards/types';
import { generateCardInstance } from '../cards/generation';
import { setRuntimeCardDefinitions } from '../cards/test-cards';
const stageLatest = { ...stage, text: stage.text + ' 이 카드는 손패에 들어온 즉시 효과가 발동됩니다.' } as PublishedCardRecord;
function handSetup(myHp: number, foeHp: number, inDeck: boolean): GameState {
  const t = cardRecordToDefinition(stageLatest);
  setRuntimeCardDefinitions([t, filler]);
  let state = createInitialGameState(undefined, [t, filler], undefined, [Array(25).fill(filler.id), Array(25).fill(filler.id)]);
  if (inDeck) state.players[0].deck.unshift(generateCardInstance(t, { instanceId: 'stage-in-deck', isGenerated: false }));
  state.status = 'IN_PROGRESS'; state.turn = 1; state.activePlayerId = 'player-1';
  for (const p of state.players) { p.currentGold = 100; p.mulliganUsed = true; }
  state.players[0].health = myHp; state.players[1].health = foeHp;
  if (state.players[0].champion) state.players[0].champion.health = myHp;
  if (state.players[1].champion) state.players[1].champion.health = foeHp;
  return state;
}

test('라스트 스테이지(최신 글): 드로우하는 즉시 발동하고 손패에서 사라진다', () => {
  let state = handSetup(25, 25, true);
  state = drawCard(state, 'player-1');
  assert.equal(state.players[0].health, 15);
  assert.equal(state.players[1].health, 15);
  assert.equal(state.players[0].hand.some(c => c.definitionId === stage.id), false, '발동 후 손패에 남으면 안 됨');
});

test('라스트 스테이지(최신 글): 손패에 새로 생성되는 즉시 발동한다', () => {
  let state = handSetup(25, 25, false);
  const source = state.players[0].deck[0]!;
  state = applyEffect(state, 'player-1', source, { type: 'STRUCTURED', action: 'GENERATE', values: { definitionRef: { name: '대망의 라스트 스테이지' }, resolveByName: true, count: 1 } } as never);
  assert.equal(state.players[0].health, 15);
  assert.equal(state.players[1].health, 15);
  assert.equal(state.players[0].hand.some(c => c.definitionId === stage.id), false);
});

test('라스트 스테이지(최신 글): 생성되어 양쪽이 동시에 쓰러지면 상대 승리', () => {
  let state = handSetup(6, 6, true);
  state = drawCard(state, 'player-1');
  assert.equal(state.status, 'FINISHED');
  assert.equal(state.winnerId, 'player-2');
});

test('토큰 기술은 레전더리 등급을 유지, 일반 기술은 에픽까지', () => {
  assert.equal(normalizeCardRarityForType('TECHNIQUE', 'LEGENDARY', { isToken: true }), 'LEGENDARY');
  assert.equal(normalizeCardRarityForType('TECHNIQUE', 'LEGENDARY', {}), 'EPIC');
  assert.equal(normalizeCardRarityForType('TECHNIQUE', 'TOKEN', { isToken: true }), 'TOKEN');
  assert.equal(normalizeCardRarityForType('WRESTLER', 'LEGENDARY', { isToken: true }), 'LEGENDARY');
});
