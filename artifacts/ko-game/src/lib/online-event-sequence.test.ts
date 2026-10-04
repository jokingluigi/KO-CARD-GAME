import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceOnlineEventSequence} from './online-event-sequence';
import {sequencedEventsForViewer} from '../../../api-server/src/online/sanitizer';
import {createInitialGameState} from '../game/engine/create-initial-game-state';
test('actual server multi-event action is contiguous and must not force RESYNC',()=>{
 const state=createInitialGameState();const events=[{type:'TURN_ENDED' as const,playerId:'player-1'},{type:'GOLD_CHANGED' as const,playerId:'player-1'},{type:'TURN_STARTED' as const,playerId:'player-2'},{type:'CARD_DRAWN' as const,playerId:'player-2'}];
 const batch=sequencedEventsForViewer(state,'player-1',events,10) as {sequenceNumber:number}[];
 assert.equal(batch.some(e=>e.sequenceNumber>9+1),true); // Previous client reproduced false gap.
 assert.deepEqual(advanceOnlineEventSequence(9,batch),{gap:false,lastSequence:13});
});
test('duplicate/empty batches do not regress sequence and true missing events still require resync',()=>{
 assert.deepEqual(advanceOnlineEventSequence(13,[{sequenceNumber:11},{sequenceNumber:12}]),{gap:false,lastSequence:13});
 assert.deepEqual(advanceOnlineEventSequence(13,[]),{gap:false,lastSequence:13});
 assert.deepEqual(advanceOnlineEventSequence(13,[{sequenceNumber:14},{sequenceNumber:16}]),{gap:true,lastSequence:13});
 assert.deepEqual(advanceOnlineEventSequence(-1,[{sequenceNumber:0},{sequenceNumber:1}]),{gap:false,lastSequence:1});
});
