import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCondition, parseRunCommand, parseReward, parseCharacter, parsePreset, parseRelic, parseScene } from './config';

test('client commands reject forged victory, extra engine state and invalid replacement indices', () => {
  for (const value of [{ type: 'BATTLE_RESULT', won: true }, { type: 'CHALLENGE', winnerId: 'player-1' },
    { type: 'REPLACE_CARD', deckIndex: -1 }, { type: 'REPLACE_CARD', deckIndex: 25 }, { type: 'REPLACE_CARD', deckIndex: 1.5 }, null])
    assert.throws(() => parseRunCommand(value));
  assert.deepEqual(parseRunCommand({ type: 'REPLACE_CARD', deckIndex: 24 }), { type: 'REPLACE_CARD', deckIndex: 24 });
  assert.deepEqual(parseRunCommand({ type: 'SELECT_CARD', cardId: 'real-card' }), { type: 'SELECT_CARD', cardId: 'real-card' });
});
test('condition builder bounds recursion and rejects unknown natural-language rules', () => {
  let deep: unknown = { type: 'UNDEFEATED' };
  for (let i = 0; i < 10; i++) deep = { type: 'ALL', conditions: [deep] };
  assert.throws(() => parseCondition(deep));
  assert.throws(() => parseCondition({ type: 'ALL', conditions: [] }));
  assert.throws(() => parseCondition({ type: 'AI', text: 'win' }));
  assert.deepEqual(parseCondition({ type: 'ANY', conditions: [{ type: 'CARD', id: 'card' }, { type: 'CLEAR_COUNT', count: 2 }] }),
    { type: 'ANY', conditions: [{ type: 'CARD', id: 'card' }, { type: 'CLEAR_COUNT', count: 2 }] });
});
test('reward configuration only accepts positive integral supported rewards', () => {
  for (const amount of [0, -1, 0.5, Infinity, NaN, 100001]) assert.throws(() => parseReward({ type: 'CURRENCY', amount }));
  assert.throws(() => parseReward({ type: 'CARD', amount: 1 }));
  assert.deepEqual(parseReward({ type: 'PACK', targetId: 'pack', amount: 1 }), { type: 'PACK', targetId: 'pack', amount: 1 });
});
test('story sprites reject external or executable resources and normalize dialogue order', () => {
  for (const url of ['javascript:alert(1)', 'https://example.com/fake.png', '//example.com/fake.png'])
    assert.throws(() => parseCharacter({ id: 'person', displayName: 'Person', sprites: { NEUTRAL: url } }));
  const scene = parseScene({ id: 's', name: 'Scene', lines: [{ speakerId: 'person', expression: 'SERIOUS', side: 'LEFT', text: 'Start', order: 99 }] });
  assert.equal(scene.lines[0]!.order, 0);
  assert.throws(() => parseScene({ id: 's', name: 'Scene', lines: [{ speakerId: 'person', expression: 'FAKE', side: 'LEFT', text: 'Start' }] }));
});
test('preset and relic values cannot bypass limits with malformed admin input', () => {
  const preset = { id: 'a', name: 'AI', championId: 'champion', cardIds: Array(25).fill('card'), acts: [1], difficulty: 'NORMAL', enabled: true, weight: 1 };
  assert.equal(parsePreset(preset).cardIds.length, 25);
  assert.throws(() => parsePreset({ ...preset, cardIds: Array(24).fill('card') }));
  assert.throws(() => parsePreset({ ...preset, acts: [5] }));
  const relic = { id: 'r', name: 'Relic', description: 'Effect', effectType: 'SOLO_BUFF', values: { attack: 3, health: 3 }, enabled: true, initiallyUnlocked: true };
  assert.equal(parseRelic(relic).values.attack, 3);
  assert.throws(() => parseRelic({ ...relic, values: { infiniteDraw: 1 } }));
  assert.throws(() => parseRelic({ ...relic, values: { attack: 0.5 } }));
});

test('relic configuration uses explicit V1 defaults and rejects unused numeric fields for its effect', () => {
  const base = { id: 'default', name: 'Default', description: 'Effect', enabled: true, initiallyUnlocked: true };
  assert.deepEqual(parseRelic({ ...base, effectType: 'MAX_FIELD_ONE', values: {} }).values, { attack: 4, health: 4 });
  assert.deepEqual(parseRelic({ ...base, effectType: 'SOLO_BUFF', values: { attack: 5 } }).values, { attack: 5, health: 3 });
  assert.throws(() => parseRelic({ ...base, effectType: 'MAX_FIELD_ONE', values: { amount: 4 } }));
  assert.throws(() => parseRelic({ ...base, effectType: 'FIRST_RETIRE_SURVIVE', values: { health: 20 } }));
  assert.deepEqual(parseRelic({ ...base, effectType: 'FIRST_RETIRE_SURVIVE', values: {} }).values, {});
});

test('dialogue placement and OST settings round-trip with bounded values and legacy defaults', () => {
  const scene = { id: 'scene', name: 'Story', music: { name: 'Dialogue OST', assetUrl: 'https://assets.example.invalid/story.mp3', volume: 65 }, lines: [{ speakerId: 'actor', expression: 'NEUTRAL', side: 'LEFT', text: 'Hello', order: 0, spriteScale: 1.2, spriteOffsetX: -10, spriteOffsetY: 8 }] };
  assert.deepEqual(parseScene(scene), scene);
  for (const invalid of [{ spriteScale: 2 }, { spriteOffsetX: -31 }, { spriteOffsetY: NaN }]) assert.throws(() => parseScene({ ...scene, lines: [{ ...scene.lines[0], ...invalid }] }));
  assert.throws(() => parseScene({ ...scene, music: { ...scene.music, volume: 101 } }));
  assert.throws(() => parseScene({ ...scene, music: { ...scene.music, assetUrl: 'javascript:alert(1)' } }));
});
