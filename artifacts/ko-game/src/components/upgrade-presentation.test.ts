import assert from "node:assert/strict";
import { test } from "node:test";
import {
  presentationCueDrafts,
  presentationBlocksActions,
} from "./presentation-feedback-utils";
import { eventTitle } from "./action-history-utils";
import { KEYWORD_LABELS, KEYWORD_DESCRIPTIONS } from "./alt-inspector-utils";
import { createInitialGameState } from "../game/engine/create-initial-game-state";
test("upgrade tooltip, log and short highlight share the new display name", () => {
  const state = createInitialGameState();
  const event = {
    type: "PROGRAM_ACTIVATED" as const,
    playerId: "player-1",
    cardInstanceId: "source",
    amount: 2,
    target: { type: "CARD" as const, cardInstanceId: "source" },
  };
  assert.equal(KEYWORD_LABELS.PROGRAM, "업그레이드");
  assert.match(KEYWORD_DESCRIPTIONS.PROGRAM, /업그레이드\(X\).*자동으로 소비/);
  assert.match(eventTitle(state, event), /업그레이드\(2\) 자동 발동/);
  const cues = presentationCueDrafts([event], 0);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].label, "업그레이드(2)");
  assert.equal(cues[0].kind, "EFFECT");
  assert.equal(cues[0].cardInstanceId, "source");
  assert.equal(cues[0].duration, 450);
  assert.equal(presentationBlocksActions(cues), false);
  assert.deepEqual(presentationCueDrafts([], 0), []);
});
