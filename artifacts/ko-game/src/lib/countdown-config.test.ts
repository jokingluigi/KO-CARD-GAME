import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeGeneratedEffectDraft,keywordSettingsAfterTextEdit} from './admin-effect-config';
const hit={trigger:'COUNTDOWN',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},values:{amount:2}};
test('effect replacement and append preserve numeric settings and reject conflicting clocks',()=>{
  const draft={effectId:'STRUCTURED_EFFECTS_V1' as const,effects:[hit],scripts:[],effectConfig:{countdownTurns:3}};
  const existing={effects:[{...hit,trigger:'ENTER_FIELD'}],armor:2,dodgeCharges:3,countdownTurns:3};
  const merged=mergeGeneratedEffectDraft('STRUCTURED_EFFECTS_V1',existing,draft,'append');
  assert.equal(merged.effectConfig.effects!.length,2);assert.equal(merged.effectConfig.countdownTurns,3);assert.equal(merged.effectConfig.dodgeCharges,3);
  assert.throws(()=>mergeGeneratedEffectDraft('STRUCTURED_EFFECTS_V1',{effects:[hit],countdownTurns:2},draft,'append'),/같은 생존 턴 수/);
  assert.equal(mergeGeneratedEffectDraft('STRUCTURED_EFFECTS_V1',{effects:[hit],countdownTurns:2},draft,'replace').effectConfig.countdownTurns,3);
});


test('replacement retains countdown configuration and other keyword settings',()=>{
const draft={effectId:'STRUCTURED_EFFECTS_V1' as const,effects:[hit],scripts:[],effectConfig:{countdownTurns:4}};
const applied=mergeGeneratedEffectDraft('',{armor:2,dodgeCharges:3},draft,'replace');
const reloaded=JSON.parse(JSON.stringify(applied));assert.equal(reloaded.effectConfig.countdownTurns,4);assert.equal(reloaded.effectConfig.armor,2);assert.equal(reloaded.effectConfig.dodgeCharges,3);
});

test('editing effect text clears compiled actions while preserving numeric keywords',()=>{
  assert.deepEqual(keywordSettingsAfterTextEdit({effects:[hit],countdownTurns:3,armor:2,dodgeCharges:4}),{countdownTurns:3,armor:2,dodgeCharges:4});
});
