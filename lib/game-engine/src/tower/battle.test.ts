import assert from 'node:assert/strict';
import test from 'node:test';
import { createTowerBattle, type TowerSnapshot } from './battle';
import { newTowerRun } from './domain';
import { TEST_CARD_DEFINITIONS } from '../../../../artifacts/ko-game/src/game/cards/test-cards';
import { TEST_CHAMPIONS } from '../../../../artifacts/ko-game/src/game/champions/test-champions';
import { executeAction, getLegalActions } from '../../../../artifacts/ko-game/src/game/actions/engine-actions';
import { chooseBestAction } from '../../../../artifacts/ko-game/src/game/actions/ai-evaluator';

function setup() {
  const cards = TEST_CARD_DEFINITIONS.map((card, index) => ({ ...card, id: `qa-card-${index}` }));
  const champions = TEST_CHAMPIONS;
  const deck = Array.from({ length: 25 }, (_, index) => cards[index % cards.length]!.id);
  const reward = { type: 'CURRENCY' as const, amount: 1 };
  const boss = { presetId: 'enemy', firstReward: reward, repeatReward: reward };
  const snapshot: TowerSnapshot = { cards, champions, catalog: {
    season: { id: 'qa-season', name: 'QA', description: '', protagonistChampionId: champions[0]!.id,
      bosses: { boss1: boss, boss2: boss, boss3: boss, finalBoss: boss }, synergyWeights: { deckTag: 1, supportTag: 1, championTag: 1 } },
    cards: cards.map(card => ({ id: card.id, cost: card.cost, status: 'PUBLISHED', cardType: 'WRESTLER', rarity: 'NORMAL', isToken: false, isChampionToken: false, synergyTags: [], supportsTags: [] })),
    starters: [{ id: 'qa-starter', name: 'QA', championId: champions[0]!.id, cardIds: deck, enabled: true, isDefault: true, initiallyUnlocked: true }],
    presets: [{ id: 'enemy', name: 'Enemy', championId: champions[1]!.id, cardIds: deck, acts: [1, 2, 3, 4], difficulty: 'NORMAL', enabled: true, weight: 1 }],
    relics: [], scenes: [], characters: [], preferredTags: {},
  } };
  const run = newTowerRun({ id: 'qa-run', seed: 'qa-seed', championId: champions[0]!.id, starterId: 'qa-starter', ownedChampionIds: [champions[0]!.id] },
    snapshot.catalog, { clearCount: 0, normalEnding: false, bossSlots: [], unlockedRelicIds: [], unlockedStarterIds: [] });
  return { run, snapshot };
}
test('Tower starts the existing engine with identical hands and deck ordering on reconnect', () => {
  const { run, snapshot } = setup();
  const original = createTowerBattle(run, snapshot);
  assert.deepEqual(createTowerBattle(JSON.parse(JSON.stringify(run)), JSON.parse(JSON.stringify(snapshot))), original);
  assert.equal(original.openingMulligan, true);
  for (const player of original.players) assert.equal(player.hand.length + player.deck.length, 25);
  assert.ok(getLegalActions(original, 'player-1').every(action => action.type === 'MULLIGAN'));
});
test('Tower battle completes through real shared legal actions, with reproducible outcome', () => {
  const { run, snapshot } = setup();
  function play() {
    let state = createTowerBattle(run, snapshot);
    for (const playerId of ['player-1', 'player-2']) {
      const result = executeAction(state, { type: 'MULLIGAN', playerId, cardInstanceIds: [] });
      assert.equal(result.success, true); state = result.state;
    }
    assert.equal(state.openingMulligan, false);
    let steps = 0;
    while (state.status === 'IN_PROGRESS' && steps++ < 600) {
      const actions = getLegalActions(state, state.activePlayerId);
      assert.ok(actions.length > 0);
      const result = executeAction(state, chooseBestAction(state, actions, state.activePlayerId));
      assert.equal(result.success, true); state = result.state;
    }
    assert.equal(state.status, 'FINISHED');
    assert.ok(state.winnerId);
    return state;
  }
  assert.deepEqual(play(), play());
});

test('ordinary Tower floors force vanilla HP30; four bosses and hidden boss preserve their champion',()=>{
 const {run,snapshot}=setup();const template={...snapshot.champions[0],id:'champion-tower-vanilla',name:'초상화 설정 상대',imageUrl:'/portrait.png',maxHealth:99};snapshot.champions=[...snapshot.champions,template];
 for(let floor=1;floor<=16;floor++){
  const bossSlot=floor%4===0?(['boss1','boss2','boss3','finalBoss'] as const)[floor/4-1]:undefined;
  const state=createTowerBattle({...run,floor,encounter:{...run.encounter,bossSlot}},snapshot);const enemy=state.players[1].champion!;
  assert.equal(state.players[0].champion?.id,run.championId);
  if(bossSlot){assert.equal(enemy.id,snapshot.champions[1].id);assert.equal(enemy.maxHealth,snapshot.champions[1].maxHealth);assert.deepEqual(enemy.ability,snapshot.champions[1].ability);}
  else{assert.equal(enemy.id,'champion-tower-vanilla');assert.equal(enemy.health,30);assert.equal(enemy.maxHealth,30);assert.equal(enemy.imageUrl,'/portrait.png');assert.deepEqual(enemy.ability.effects,[]);assert.equal(enemy.quest,null);assert.equal(enemy.upgradedAbility,null);
   const active={...state,openingMulligan:false,activePlayerId:'player-2',players:state.players.map(p=>p.id==='player-2'?{...p,currentGold:10}:p)};
   assert.ok(getLegalActions(active,'player-2').every(action=>action.type!=='USE_CHAMPION_ABILITY'));
   assert.equal(executeAction(active,{type:'USE_CHAMPION_ABILITY',playerId:'player-2'}).success,false);
  }
 }
 const hidden=createTowerBattle({...run,encounter:{...run.encounter,bossSlot:'hiddenBoss'}},snapshot);assert.equal(hidden.players[1].champion?.id,snapshot.champions[1].id);
});

test('Tower boss preserves an AI match deck with draft definitions and flexible size',()=>{
 const {run,snapshot}=setup();const preset=snapshot.catalog.presets[0];preset.id='ai-deck:qa';preset.cardIds=preset.cardIds.slice(0,9);preset.acts=[];preset.weight=0;
 const aiCard={...snapshot.cards[0],id:'ai-draft-card'};snapshot.cards.push(aiCard);snapshot.catalog.cards.push({...snapshot.catalog.cards[0],id:aiCard.id,status:'DRAFT'});preset.cardIds[0]=aiCard.id;
 const state=createTowerBattle({...run,floor:4,encounter:{...run.encounter,presetId:preset.id,bossSlot:'boss1'}},snapshot);
 assert.equal(state.players[1].hand.length+state.players[1].deck.length,9);
 assert.equal(state.players[1].champion?.id,preset.championId);
 assert.equal(state.players[0].hand.length+state.players[0].deck.length,25);
});
