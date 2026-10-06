import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialGameState, startGame, executeAction, getLegalActions, chooseBestAction, type GameAction } from "@workspace/game-engine";
import { runAITurn } from "../../../ko-game/src/game/actions/ai-turn-scheduler";
import { replayAIMatch } from "./ai-match-quest-service";
import { canonicalCardCatalog, cardRecordToDefinition } from '@workspace/game-engine';
import { readFileSync } from 'node:fs';
import { generateCardInstance } from '../../../ko-game/src/game/cards/generation';

test('random card effects replay identically despite reversed database catalog order',()=>{
 const records=JSON.parse(readFileSync(new URL('../../../ko-game/src/game/qa/fixtures/card-audit-2026-10-05.json',import.meta.url),'utf8')).cards;
 const definitions=records.map(cardRecordToDefinition);
 const joker=definitions.find((d:any)=>d.name==='아르카나 조커');
 const initial=(pool:any[])=>{const s=startGame(createInitialGameState(),()=>0.5);s.cardPool=canonicalCardCatalog(pool);s.randomSeed=71;for(const p of s.players){p.mulliganUsed=true;p.board=[null,null,null,null];p.hand=[];p.deck=[];}s.players[0].currentGold=100;s.players[0].hand=[generateCardInstance(joker,{instanceId:'joker'})];return s;};
 const client=initial(definitions),server=initial([...definitions].reverse());
 const action:GameAction={type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'joker',boardSlot:0};
 const played=executeAction(client,action);assert.ok(played.success);
 const finished=executeAction(played.state,{type:'SURRENDER',playerId:'player-1'});assert.ok(finished.success);
 const replayed=replayAIMatch(server,[action,{type:'SURRENDER',playerId:'player-1'}],'player-1','player-2');
 assert.deepEqual(replayed,finished.state);
 assert.deepEqual(definitions.map((d:any)=>d.id),records.map((r:any)=>r.id));
});

function startedEmptyMatch() {
  return startGame(createInitialGameState());
}

test('legal recorded AI turn ending is not rejected for differing from a new AI decision',()=>{
 const started=startedEmptyMatch();const userId=started.players[0]!.id, aiId=started.players[1]!.id;
 const ended=executeAction(started,{type:'END_TURN',playerId:userId});assert.ok(ended.success);
 const before=ended.state;
 before.players[1]!.hand=[generateCardInstance({id:'replay-unit',name:'Replay unit',cost:0,attack:5,health:5,rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false},{instanceId:'ai-unit'})];
 const catalog=before.players[1]!.hand[0]!;
 assert.notEqual(chooseBestAction(before,getLegalActions(before,aiId),aiId).type,'END_TURN');
 const final=replayAIMatch(before,[{type:'END_TURN',actor:'AI'},{type:'SURRENDER'}],userId,aiId);
 assert.equal(final.status,'FINISHED');assert.equal(final.winnerId,aiId);
 assert.equal(final.players[1]!.hand.some(card=>card.instanceId===catalog.instanceId),true);
 assert.throws(()=>replayAIMatch(before,[{type:'PLAY_WRESTLER',cardInstanceId:'missing',boardSlot:0,actor:'AI'}],userId,aiId));
});

test("AI match replay binds surrender to the authenticated player, not client playerId", () => {
  const state = startedEmptyMatch();
  const userPlayerId = state.players[0]!.id;
  const aiPlayerId = state.players[1]!.id;
  const finished = replayAIMatch(
    state,
    [{ type: "SURRENDER", playerId: aiPlayerId }],
    userPlayerId,
    aiPlayerId,
  );

  assert.equal(finished.status, "FINISHED");
  assert.equal(finished.winnerId, aiPlayerId);
  assert.equal(finished.loserId, userPlayerId);
});

test("AI match replay keeps player emotes in the action transcript", () => {
  const state = startedEmptyMatch();
  const userPlayerId = state.players[0]!.id;
  const aiPlayerId = state.players[1]!.id;
  const finished = replayAIMatch(state, [
    { type: "EMOTE", emote: "HELLO", playerId: userPlayerId },
    { type: "SURRENDER", playerId: userPlayerId },
  ], userPlayerId, aiPlayerId);
  assert.equal(finished.status, "FINISHED");
  assert.equal(finished.events.some((event) => event.type === "CHAMPION_EMOTE" && event.playerId === userPlayerId), true);
});

test("AI match replay advances the server-controlled opponent between user actions", () => {
  const state = startedEmptyMatch();
  const userPlayerId = state.players[0]!.id;
  const aiPlayerId = state.players[1]!.id;
  const finished = replayAIMatch(
    state,
    [
      { type: "END_TURN", playerId: userPlayerId },
      { type: "END_TURN", playerId: userPlayerId },
      { type: "SURRENDER", playerId: userPlayerId },
    ],
    userPlayerId,
    aiPlayerId,
  );

  assert.equal(finished.status, "FINISHED");
  assert.equal(finished.winnerId, aiPlayerId);
});

test("AI match replay rejects an incomplete or illegal client action transcript", () => {
  const state = startedEmptyMatch();
  const userPlayerId = state.players[0]!.id;
  const aiPlayerId = state.players[1]!.id;

  assert.throws(
    () => replayAIMatch(state, [], userPlayerId, aiPlayerId),
    /완료된 AI 경기/,
  );
  assert.throws(
    () => replayAIMatch(
      state,
      [{ type: "PLAY_WRESTLER", cardInstanceId: "not-in-hand", boardSlot: 0 }],
      userPlayerId,
      aiPlayerId,
    ),
  );
});

test("AI match reward replay follows the AI actions actually shown to the player", async () => {
  const started = startedEmptyMatch();
  const userId = started.players[0]!.id;
  const aiId = started.players[1]!.id;
  const ended = executeAction(started, { type: "END_TURN", playerId: userId });
  assert.equal(ended.success, true);
  const transcript: Array<GameAction & { actor?: "AI" }> = [{ type: "END_TURN", playerId: userId }];
  const afterAI = await runAITurn(ended.state, aiId, {
    wait: async () => {}, waitForPresentationIdle: async () => {}, isCancelled: () => false,
    actionDelayMs: 0,
    onState: () => {}, onAction: (action) => { transcript.push({ ...action, actor: "AI" }); },
  });
  assert.equal(afterAI.activePlayerId, userId);
  transcript.push({ type: "SURRENDER", playerId: userId });
  const result = replayAIMatch(started, transcript, userId, aiId);
  assert.equal(result.winnerId, aiId);
  assert.equal(result.status, "FINISHED");
});

for (const difficulty of ['NORMAL', 'HARD', 'BOSS'] as const) {
  test(`AI match client scheduler and server replay agree at ${difficulty} difficulty`, async () => {
    const started = startedEmptyMatch();
    const userId = started.players[0]!.id;
    const aiId = started.players[1]!.id;
    const ended = executeAction(started, { type: 'END_TURN', playerId: userId });
    assert.equal(ended.success, true);
    const transcript: Array<GameAction & { actor?: 'AI' }> = [{ type: 'END_TURN', playerId: userId }];
    const after = await runAITurn(ended.state, aiId, {
      difficulty, wait: async () => {}, waitForPresentationIdle: async () => {}, isCancelled: () => false,
      actionDelayMs: 0, onState: () => {}, onAction: action => transcript.push({ ...action, actor: 'AI' }),
    });
    assert.equal(after.activePlayerId, userId);
    transcript.push({ type: 'SURRENDER', playerId: userId });
    assert.equal(replayAIMatch(started, transcript, userId, aiId, difficulty).winnerId, aiId);
  });
}
