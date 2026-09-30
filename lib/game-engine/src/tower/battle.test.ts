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
