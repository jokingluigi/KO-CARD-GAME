import assert from 'node:assert/strict';
import test from 'node:test';
import { towerMusicFor } from './tower-music';
const track = (name: string) => ({ name, assetUrl: `https://assets.example.invalid/${name}.mp3`, volume: 70 });
const music = { normal: track('normal'), midBoss: track('middle'), boss: track('final'), hiddenBoss: track('hidden') };
test('Tower OST follows normal, intermediate, final and hidden battles without leaking into other phases', () => {
  assert.equal(towerMusicFor('BATTLE', undefined, music), music.normal);
  for (const slot of ['boss1', 'boss2', 'boss3'] as const) assert.equal(towerMusicFor('BATTLE', slot, music), music.midBoss);
  assert.equal(towerMusicFor('BATTLE', 'finalBoss', music), music.boss);
  assert.equal(towerMusicFor('BATTLE', 'hiddenBoss', music), music.hiddenBoss);
  for (const phase of ['HUB', 'CARD_REWARD', 'RELIC_REWARD', 'RESULT'] as const) assert.equal(towerMusicFor(phase, undefined, music), undefined);
});
test('dialogue OST overrides encounter music, unset tracks stay silent and battle resumes its selected category', () => {
  const scene = { id: 'scene', name: 'Story', lines: [], music: track('dialogue') };
  assert.equal(towerMusicFor('DIALOGUE', 'hiddenBoss', music, scene), scene.music);
  assert.equal(towerMusicFor('BATTLE', 'hiddenBoss', music, scene), music.hiddenBoss);
  assert.equal(towerMusicFor('DIALOGUE', 'finalBoss', music), undefined);
  assert.equal(towerMusicFor('BATTLE', undefined, undefined), undefined);
});
