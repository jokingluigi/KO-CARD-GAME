import assert from "node:assert/strict";
import test from "node:test";

import { createAiMatchOpening, isAiMatchOpeningActive, MATCH_OPENING_DURATION_MS } from "./ai-match-opening";

const playerChampion = { name: "Player champion", imageUrl: "/player.png", introLineOne: "First!" };
const aiChampion = { name: "AI champion", imageUrl: "/ai.png", introLineOne: "Second!" };

test("AI opening uses the actual match, account, deck and champion details without changing game state", () => {
  const state = Object.freeze({ gameId: "ai-one", turn: 1, activePlayerId: "ai", hand: [1, 2, 3] });
  const opening = createAiMatchOpening(
    state.gameId, "Player nickname", "AI deck name", playerChampion, aiChampion, 1000,
  );
  assert.equal(opening.self.displayName, "Player nickname");
  assert.equal(opening.opponent.displayName, "AI deck name");
  assert.equal(opening.self.championName, playerChampion.name);
  assert.equal(opening.opponent.championName, aiChampion.name);
  assert.equal(opening.self.portraitUrl, playerChampion.imageUrl);
  assert.equal(opening.opponent.portraitUrl, aiChampion.imageUrl);
  assert.equal(opening.firstSpeaker, "self");
  assert.equal(opening.gameplayStartsAt, 1000 + MATCH_OPENING_DURATION_MS);
  assert.deepEqual(state, { gameId: "ai-one", turn: 1, activePlayerId: "ai", hand: [1, 2, 3] });
});

test("the opening deadline applies equally to AI-first and player-first matches, even when skipped", () => {
  for (const activePlayerId of ["player-1", "player-2"]) {
    const state = Object.freeze({ gameId: `ai-${activePlayerId}`, activePlayerId, turn: 1 });
    const opening = createAiMatchOpening(state.gameId, "P", "AI", playerChampion, aiChampion, 1000);
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, 1000), true);
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, opening.gameplayStartsAt - 1), true);
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, opening.gameplayStartsAt), false);
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, opening.gameplayStartsAt + 1), false);
    // Skip hides the animation but has no bearing on the readiness deadline.
    assert.equal(isAiMatchOpeningActive(opening, state.gameId, 2000), true);
    assert.equal(state.activePlayerId, activePlayerId);
    assert.equal(state.turn, 1);
  }
});

test("a fresh AI match gets its own opening, while rerenders of the old match cannot replay it", () => {
  const oldOpening = createAiMatchOpening("ai-one", "P", "AI 1", playerChampion, aiChampion, 1000);
  const newOpening = createAiMatchOpening("ai-two", "P", "AI 2", playerChampion, aiChampion, 9000);
  assert.equal(isAiMatchOpeningActive(oldOpening, "ai-one", 9000), false);
  assert.equal(isAiMatchOpeningActive(oldOpening, "ai-two", 2000), false);
  assert.equal(isAiMatchOpeningActive(newOpening, "ai-two", 9000), true);
});

test("speaker falls back to the AI only when the player has no intro line", () => {
  const opening = createAiMatchOpening(
    "ai-one", "P", "AI", { ...playerChampion, introLineOne: null }, aiChampion, 1000,
  );
  assert.equal(opening.firstSpeaker, "opponent");
  assert.equal(opening.self.dialogueLine, null);
});
test('server pair dialogue overrides defaults and preserves opponent-first ordering', () => {
 const opening=createAiMatchOpening('pair','P','AI',playerChampion,aiChampion,0,{playerOneLine:'Pair P',playerTwoLine:'Pair AI',firstSpeaker:'PLAYER_TWO'});
 assert.equal(opening.self.dialogueLine,'Pair P');
 assert.equal(opening.opponent.dialogueLine,'Pair AI');
 assert.equal(opening.firstSpeaker,'opponent');
 assert.equal(opening.self.portraitUrl,'/player.png');
 assert.equal(opening.opponent.portraitUrl,'/ai.png');
});
test('an intentionally empty published pair line does not leak the default line',()=>{
 const opening=createAiMatchOpening('pair','P','AI',playerChampion,aiChampion,0,{playerOneLine:null,playerTwoLine:'Pair AI',firstSpeaker:'PLAYER_TWO'});
 assert.equal(opening.self.dialogueLine,null);
 assert.equal(opening.opponent.dialogueLine,'Pair AI');
});

test('published PvP resolver output reaches AI opening unchanged for either seat order', async()=>{
 const {resolveChampionIntro,mapIntroToSeats}=await import('../../../api-server/src/online/intro');
 const first={...playerChampion,id:'a'},second={...aiChampion,id:'b'};
 const relations=[{championOneId:'a',championTwoId:'b',lineOne:'A special',lineTwo:'B special',firstSpeaker:'TWO',status:'PUBLISHED'}];
 for(const [p,o] of [[first,second],[second,first]]) {
  const mapped=mapIntroToSeats(p.id,o.id,resolveChampionIntro(p as any,o as any,relations));
  const opening=createAiMatchOpening('pair','P','AI',p,o,0,mapped);
  assert.equal(opening.self.dialogueLine,p.id==='a'?'A special':'B special');
  assert.equal(opening.opponent.dialogueLine,o.id==='a'?'A special':'B special');
  assert.equal(opening.firstSpeaker,p.id==='b'?'self':'opponent');
 }
});
