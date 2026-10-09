import assert from 'node:assert/strict';
import test from 'node:test';
import { cardRewardOptions, conditionMatches, eligibleRewardCard, newTowerRun, synergyWeight, transitionRun } from './domain';
import { RELIC_TYPES, type Condition, type History, type RunCommand, type TowerCatalog, type TowerRun } from './types';

const history: History = { clearCount: 2, normalEnding: true, bossSlots: [], unlockedRelicIds: [], unlockedStarterIds: [] };
function fixture(): TowerCatalog {
  const cards = Array.from({ length: 12 }, (_, i) => ({ id: `card-${i}`, status: 'PUBLISHED', cost: i % 7,
    cardType: 'WRESTLER' as const, rarity: 'NORMAL', isToken: false, isChampionToken: false,
    synergyTags: i < 5 ? ['ZOMBIE'] : [], supportsTags: i === 5 ? ['ZOMBIE'] : [] }));
  const deck = Array.from({ length: 25 }, (_, i) => cards[i % 12]!.id);
  const reward = { type: 'PACK' as const, targetId: 'pack', amount: 1 };
  const bosses = Object.fromEntries(['boss1', 'boss2', 'boss3', 'finalBoss', 'hiddenBoss'].map(slot => [slot,
    { presetId: 'boss', commonSceneId: 'common', protagonistSceneId: 'hero', firstReward: reward, repeatReward: reward }])) as TowerCatalog['season']['bosses'];
  return {
    season: { id: 'season', name: 'Season', description: '', protagonistChampionId: 'champion', bosses,
      hiddenCondition: { type: 'SEASON_PROTAGONIST' }, synergyWeights: { deckTag: 2, supportTag: 4, championTag: 3 } },
    cards, preferredTags: { champion: ['ZOMBIE'] },
    presets: ['a', 'b', 'boss'].map(id => ({ id, name: id, championId: 'enemy', cardIds: deck, acts: [1, 2, 3, 4], difficulty: id === 'boss' ? 'BOSS' : 'NORMAL', enabled: true, weight: 1 })),
    starters: [{ id: 'starter', name: 'Starter', championId: 'champion', cardIds: deck, enabled: true, isDefault: true, initiallyUnlocked: true }],
    relics: RELIC_TYPES.map((effectType, i) => ({ id: `relic-${i}`, name: effectType, description: effectType, effectType, values: {}, enabled: true, initiallyUnlocked: true })),
    scenes: ['common', 'hero'].map(id => ({ id, name: id, lines: [{ speakerId: 'speaker', side: 'LEFT', expression: 'NEUTRAL', text: 'Battle', order: 0 }] })),
    characters: [{ id: 'speaker', displayName: 'Speaker', sprites: {} }],
  };
}
function newRun(catalog = fixture()) { return newTowerRun({ id: 'run', seed: 'stable', championId: 'champion', starterId: 'starter', ownedChampionIds: ['champion'] }, catalog, history); }
function apply(run: TowerRun, command: RunCommand, catalog: TowerCatalog) { return transitionRun(run, command, catalog, history, run.version); }

test('run requires actual champion ownership and isolated eligible 25-card starter', () => {
  const catalog = fixture();
  assert.throws(() => newTowerRun({ id: 'x', seed: 's', championId: 'champion', starterId: 'starter', ownedChampionIds: [] }, catalog, history), /보유/);
  const run = newRun(catalog); run.deck[0] = 'other';
  assert.equal(catalog.starters[0]!.cardIds[0], 'card-0');
  catalog.starters[0]!.cardIds.pop(); assert.throws(() => newRun(catalog), /25장/);
});
test('reward eligibility excludes token, champion, disabled, internal and out-of-range cost', () => {
  const card = fixture().cards[0]!;
  assert.equal(eligibleRewardCard(card), true);
  assert.equal(eligibleRewardCard({ ...card, status: 'DRAFT' }), true);
  for (const patch of [{ isToken: true }, { isChampionToken: true }, { status: 'DISABLED' },
    { id: 'test-card' }, { excluded: true }, { cost: 7 }, { cost: -1 }, { rarity: 'CHAMPION' }]) assert.equal(eligibleRewardCard({ ...card, ...patch }), false);
});
test('seeded encounter and three distinct reward choices survive serializing and repeated generation', () => {
  const catalog = fixture(); const first = newRun(catalog); const second = newRun(catalog);
  assert.deepEqual(first.encounter, second.encounter);
  assert.deepEqual(cardRewardOptions(first, catalog), cardRewardOptions(JSON.parse(JSON.stringify(first)), catalog));
  assert.equal(new Set(cardRewardOptions(first, catalog)).size, 3);
  assert.ok(synergyWeight(catalog.cards[5]!, first, catalog) > synergyWeight(catalog.cards[11]!, first, catalog));
});
test('replacement preserves exactly 25 cards and stale requests cannot apply twice', () => {
  const catalog = fixture(); let run = apply(newRun(catalog), { type: 'CHALLENGE' }, catalog);
  run = apply(run, { type: 'BATTLE_RESULT', won: true }, catalog);
  run = apply(run, { type: 'SELECT_CARD', cardId: run.cardOptions[0]! }, catalog);
  const oldVersion = run.version; const reward = run.selectedCardId;
  const next = apply(run, { type: 'REPLACE_CARD', deckIndex: 24 }, catalog);
  assert.equal(next.deck.length, 25); assert.equal(next.deck[24], reward); assert.equal(next.floor, 2);
  assert.notEqual(next.encounter.presetId, run.encounter.presetId);
  assert.throws(() => transitionRun(next, { type: 'REPLACE_CARD', deckIndex: 24 }, catalog, history, oldVersion), /변경/);
  assert.throws(() => apply(run, { type: 'REPLACE_CARD', deckIndex: 25 }, catalog), /교체/);
});
test('16 floors include four bosses, three unique relic choices and hidden defeat preserves regular clear', () => {
  const catalog = fixture(); let run = newRun(catalog);
  for (let floor = 1; floor <= 16; floor++) {
    assert.equal(run.floor, floor); run = apply(run, { type: 'CHALLENGE' }, catalog);
    if (floor % 4 === 0) { assert.equal(run.phase, 'DIALOGUE'); assert.equal(run.encounter.sceneId, 'hero'); run = apply(run, { type: 'DIALOGUE_SKIP' }, catalog); }
    run = apply(run, { type: 'BATTLE_RESULT', won: true }, catalog);
    if (floor % 4 !== 0) run = apply(run, { type: 'SKIP_CARD' }, catalog);
    else if (floor < 16) run = apply(run, { type: 'SELECT_RELIC', relicId: run.relicOptions[0]! }, catalog);
  }
  assert.equal(run.regularClear, true); assert.equal(run.encounter.bossSlot, 'hiddenBoss');
  assert.equal(run.relicIds.length, 3); assert.equal(new Set(run.offeredRelicIds).size, 9);
  run = apply(run, { type: 'CHALLENGE' }, catalog); run = apply(run, { type: 'DIALOGUE_SKIP' }, catalog);
  run = apply(run, { type: 'BATTLE_RESULT', won: false }, catalog);
  assert.equal(run.regularClear, true); assert.equal(run.hiddenClear, false); assert.equal(run.ended, true);
});
test('hidden win and ordinary defeat produce distinct results', () => {
  const catalog = fixture(); let run = newRun(catalog);
  run = { ...run, floor: 16, phase: 'BATTLE', regularClear: true, encounter: { ...run.encounter, bossSlot: 'hiddenBoss' } };
  const won = apply(run, { type: 'BATTLE_RESULT', won: true }, catalog);
  assert.equal(won.hiddenClear, true); assert.equal(won.regularClear, true);
  const lost = apply({ ...newRun(catalog), phase: 'BATTLE' }, { type: 'BATTLE_RESULT', won: false }, catalog);
  assert.equal(lost.regularClear, false); assert.equal(lost.ended, true);
});
test('each supported hidden condition has true and false cases, with ALL/ANY composition', () => {
  const catalog = fixture(); const run = { ...newRun(catalog), relicIds: ['relic-1'], defeatedBossSlots: ['boss1' as const] };
  const pairs: [Condition, Condition][] = [
    [{ type: 'CHAMPION', id: 'champion' }, { type: 'CHAMPION', id: 'other' }],
    [{ type: 'RELIC', id: 'relic-1' }, { type: 'RELIC', id: 'other' }],
    [{ type: 'STARTER', id: 'starter' }, { type: 'STARTER', id: 'other' }],
    [{ type: 'BOSS_CLEARED', id: 'boss1' }, { type: 'BOSS_CLEARED', id: 'boss3' }],
    [{ type: 'CARD', id: 'card-1' }, { type: 'CARD', id: 'other' }],
    [{ type: 'CLEAR_COUNT', count: 2 }, { type: 'CLEAR_COUNT', count: 3 }],
    [{ type: 'SYNERGY_COUNT', tag: 'ZOMBIE', count: 3 }, { type: 'SYNERGY_COUNT', tag: 'NONE', count: 1 }],
  ];
  for (const [yes, no] of pairs) {
    assert.equal(conditionMatches(yes, run, catalog, history), true);
    assert.equal(conditionMatches(no, run, catalog, history), false);
    assert.equal(conditionMatches({ type: 'ALL', conditions: [yes, no] }, run, catalog, history), false);
    assert.equal(conditionMatches({ type: 'ANY', conditions: [yes, no] }, run, catalog, history), true);
  }
  assert.equal(conditionMatches({ type: 'SEASON_PROTAGONIST' }, run, catalog, history), true);
  assert.equal(conditionMatches({ type: 'SEASON_PROTAGONIST' }, { ...run, championId: 'other' }, catalog, history), false);
  assert.equal(conditionMatches({ type: 'UNDEFEATED' }, run, catalog, history), true);
  assert.equal(conditionMatches({ type: 'UNDEFEATED' }, { ...run, losses: 1 }, catalog, history), false);
  assert.equal(conditionMatches({ type: 'NORMAL_ENDING' }, run, catalog, history), true);
  assert.equal(conditionMatches({ type: 'NORMAL_ENDING' }, run, catalog, { ...history, normalEnding: false }), false);
});
