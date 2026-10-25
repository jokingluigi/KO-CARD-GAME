import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from '../game/engine/create-initial-game-state';
import { championRecordToDefinition } from '../game/champions/published-champions';
import { createChampionState } from '../game/champions/test-champions';
import { readFileSync } from 'node:fs';
import { questOwner, questMusic, questPortrait } from './quest-media';

function mirror() {
  const state = createInitialGameState(); state.status = 'IN_PROGRESS';
  for (const p of state.players) p.champion = {...p.champion!, id:'mirror', questCompleted:false,
    imageUrl:'/normal.png', questCompleteAudioEnabled:true, questCompleteAudioUrl:'/awakened.mp3', questCompleteAudioVolume:72,
    questCompletedPortraitEnabled:true,questCompletedPortraitUrl:'/awakened.png'};
  state.latestQuestCompletedChampionId='mirror';
  state.players[1].champion!.questCompleted=true;
  state.events=[{type:'CHAMPION_QUEST_COMPLETED',playerId:'player-2',championId:'mirror'}];
  return state;
}
test('mirror match selects completed opponent rather than first identical champion',()=>{
  const state=mirror();
  assert.equal(questOwner(state,'player-2','mirror'),state.players[1]);
  assert.deepEqual(questMusic(state),{assetUrl:'/awakened.mp3',volume:72});
  assert.equal(questPortrait(state.players[0].champion),'/normal.png');
  assert.equal(questPortrait(state.players[1].champion),'/awakened.png');
});
test('new completion without music preserves earlier awakened track; reconnect and defeat',()=>{
  const state=mirror();
  state.players[0].champion!.questCompleted=true;
  state.players[0].champion!.questCompleteAudioEnabled=false;
  state.events.push({type:'CHAMPION_QUEST_COMPLETED',playerId:'player-1',championId:'mirror'});
  assert.equal(questMusic(state)?.volume,72);
  state.events=[];assert.equal(questMusic(state)?.volume,72);
  state.status='FINISHED';assert.equal(questMusic(state),null);
});
test('published awakening portrait and music survive definition and runtime state creation',()=>{
  const records=JSON.parse(readFileSync('docs/qa/snapshots/20261024-admin/champions.json','utf8'));
  for(const record of records.filter((c:any)=>c.questCompletedPortraitEnabled)) {
    const definition=championRecordToDefinition(record), champion=createChampionState(definition.id,[definition]);
    assert.equal(questPortrait(champion),record.imageUrl);
    champion.questCompleted=true;
    assert.equal(questPortrait(champion),record.questCompletedPortraitUrl);
    const state=mirror();state.players[1].champion=champion;
    state.latestQuestCompletedChampionId=champion.id;state.events=[];
    if(record.questCompleteAudioEnabled) assert.equal(questMusic(state)?.assetUrl,record.questCompleteAudioUrl);
    champion.questCompletedPortraitEnabled=false;
    assert.equal(questPortrait(champion),record.imageUrl);
  }
});
